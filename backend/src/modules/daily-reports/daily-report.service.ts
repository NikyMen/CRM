import { DailyReportStatus, Prisma } from '@prisma/client'
import { db } from '../../core/database'
import { readMemberModuleState } from '../../core/modules/registry'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError, type WorkspaceContext } from '../../types'
import { clientVisibilityWhere } from '../clients/client-access'
import { paraguayToday, parseReportDate, reportDateKey, summarizeReportItems } from './daily-report-calculations'

export interface DailyReportItemInput {
  companyId?: string | null
  description: string
  minutes?: number | null
  isDone?: boolean
}

export interface DailyReportInput {
  notes?: string | null
  physicalCount?: number | null
  migratedCount?: number | null
  items: DailyReportItemInput[]
}

const PERSON = { select: { id: true, firstName: true, lastName: true, email: true } } as const

const REPORT_INCLUDE = {
  user: PERSON,
  reopenedBy: PERSON,
  items: {
    orderBy: { position: 'asc' },
    include: { company: { select: { id: true, name: true, ruc: true } } },
  },
} satisfies Prisma.DailyReportInclude

type ReportWithItems = Prisma.DailyReportGetPayload<{ include: typeof REPORT_INCLUDE }>

const STATE_ORDER = { SUBMITTED: 0, DRAFT: 1, MISSING: 2 } as const

function serialize(report: ReportWithItems) {
  return { ...report, date: reportDateKey(report.date), summary: summarizeReportItems(report.items) }
}

function canManage(ctx: WorkspaceContext) {
  return ctx.role === 'owner' || ctx.role === 'admin'
}

export class DailyReportService {
  private findOwn(ctx: WorkspaceContext, date: Date) {
    return db.dailyReport.findUnique({
      where: { workspaceId_userId_date: { workspaceId: ctx.workspaceId, userId: ctx.userId, date } },
      include: REPORT_INCLUDE,
    })
  }

  /** Los clientes vinculados tienen que existir en el workspace y ser visibles para quien carga. */
  private async ensureClients(ctx: WorkspaceContext, items: DailyReportItemInput[]) {
    const ids = [...new Set(items.map((item) => item.companyId).filter((id): id is string => Boolean(id)))]
    if (!ids.length) return
    const visible = await db.company.count({
      where: { id: { in: ids }, workspaceId: ctx.workspaceId, isArchived: false, ...clientVisibilityWhere(ctx) },
    })
    if (visible !== ids.length) throw new ValidationError('Uno de los clientes elegidos no existe o no está en tu cartera')
  }

  async getMine(ctx: WorkspaceContext, dateKey: string) {
    const report = await this.findOwn(ctx, parseReportDate(dateKey))
    return { date: dateKey, today: paraguayToday(), report: report ? serialize(report) : null }
  }

  /** Guarda el borrador completo del día: reemplaza las tareas en el orden recibido. */
  async saveMine(ctx: WorkspaceContext, dateKey: string, input: DailyReportInput) {
    if (ctx.role === 'viewer') throw new ForbiddenError('El rol viewer no carga planillas')
    const date = parseReportDate(dateKey)
    await this.ensureClients(ctx, input.items)
    const fields = {
      notes: input.notes?.trim() || null,
      physicalCount: input.physicalCount ?? null,
      migratedCount: input.migratedCount ?? null,
    }

    try {
      const report = await db.$transaction(async (tx) => {
        const existing = await tx.dailyReport.findUnique({
          where: { workspaceId_userId_date: { workspaceId: ctx.workspaceId, userId: ctx.userId, date } },
          select: { id: true },
        })
        let reportId: string
        if (existing) {
          // El update condicional bloquea la fila: un envío simultáneo no puede colarse entre medio.
          const updated = await tx.dailyReport.updateMany({
            where: { id: existing.id, status: DailyReportStatus.DRAFT },
            data: fields,
          })
          if (updated.count !== 1) throw new ConflictError('La planilla ya fue enviada. Pedile a un administrador que la reabra para corregirla.')
          reportId = existing.id
        } else {
          reportId = (await tx.dailyReport.create({ data: { workspaceId: ctx.workspaceId, userId: ctx.userId, date, ...fields } })).id
        }
        await tx.dailyReportItem.deleteMany({ where: { reportId } })
        if (input.items.length) {
          await tx.dailyReportItem.createMany({
            data: input.items.map((item, position) => ({
              workspaceId: ctx.workspaceId,
              reportId,
              companyId: item.companyId || null,
              description: item.description.trim(),
              minutes: item.minutes ?? null,
              isDone: item.isDone ?? true,
              position,
            })),
          })
        }
        return tx.dailyReport.findUniqueOrThrow({ where: { id: reportId }, include: REPORT_INCLUDE })
      })
      return serialize(report)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('La planilla de ese día se guardó desde otra pestaña. Recargá antes de volver a guardar.')
      }
      throw error
    }
  }

  async submitMine(ctx: WorkspaceContext, dateKey: string) {
    if (ctx.role === 'viewer') throw new ForbiddenError('El rol viewer no carga planillas')
    const date = parseReportDate(dateKey)
    const report = await this.findOwn(ctx, date)
    if (!report || !report.items.length) throw new ValidationError('Cargá al menos una tarea antes de enviar la planilla')
    if (report.status === DailyReportStatus.SUBMITTED) return serialize(report)

    await db.dailyReport.updateMany({
      where: { id: report.id, status: DailyReportStatus.DRAFT },
      data: { status: DailyReportStatus.SUBMITTED, submittedAt: new Date() },
    })
    return serialize(await db.dailyReport.findUniqueOrThrow({ where: { id: report.id }, include: REPORT_INCLUDE }))
  }

  /** owner/admin devuelven una planilla enviada a borrador para que su autor la corrija. */
  async reopen(ctx: WorkspaceContext, id: string) {
    if (!canManage(ctx)) throw new ForbiddenError('Solo owner o admin pueden reabrir planillas')
    const report = await db.dailyReport.findFirst({ where: { id, workspaceId: ctx.workspaceId }, select: { id: true, status: true } })
    if (!report) throw new NotFoundError('Planilla', id)
    if (report.status !== DailyReportStatus.SUBMITTED) throw new ValidationError('La planilla todavía no fue enviada')
    const updated = await db.dailyReport.update({
      where: { id: report.id },
      data: { status: DailyReportStatus.DRAFT, reopenedAt: new Date(), reopenedByUserId: ctx.userId },
      include: REPORT_INCLUDE,
    })
    return serialize(updated)
  }

  /** Resumen del día para owner/admin: quién envió, quién dejó borrador y quién no cargó nada. */
  async teamDay(ctx: WorkspaceContext, dateKey: string) {
    if (!canManage(ctx)) throw new ForbiddenError('Solo owner o admin ven el resumen del equipo')
    const date = parseReportDate(dateKey)
    const [workspace, members, reports] = await Promise.all([
      db.workspace.findUnique({ where: { id: ctx.workspaceId }, select: { settings: true } }),
      db.workspaceUser.findMany({
        where: { workspaceId: ctx.workspaceId, role: { in: ['owner', 'admin', 'member'] } },
        select: { role: true, moduleAccess: true, user: PERSON },
      }),
      db.dailyReport.findMany({ where: { workspaceId: ctx.workspaceId, date }, include: REPORT_INCLUDE }),
    ])

    const byUser = new Map(reports.map((report) => [report.userId, report]))
    const rows = members
      // Quien tiene el módulo apagado no debería figurar como "sin cargar".
      .filter((member) => byUser.has(member.user.id) || readMemberModuleState(workspace?.settings, member.moduleAccess, member.role)['daily-reports'])
      .map((member) => {
        const report = byUser.get(member.user.id)
        return {
          user: member.user,
          role: member.role,
          state: (report?.status ?? 'MISSING') as keyof typeof STATE_ORDER,
          report: report ? serialize(report) : null,
        }
      })
      .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]
        || `${a.user.firstName} ${a.user.lastName ?? ''}`.localeCompare(`${b.user.firstName} ${b.user.lastName ?? ''}`, 'es'))

    const totals = rows.reduce((acc, row) => {
      acc[row.state === 'SUBMITTED' ? 'submitted' : row.state === 'DRAFT' ? 'draft' : 'missing'] += 1
      if (row.report) {
        acc.tasks += row.report.summary.tasks
        acc.pending += row.report.summary.pending
        acc.minutes += row.report.summary.minutes
        acc.physical += row.report.physicalCount ?? 0
        acc.migrated += row.report.migratedCount ?? 0
      }
      return acc
    }, { members: rows.length, submitted: 0, draft: 0, missing: 0, tasks: 0, pending: 0, minutes: 0, physical: 0, migrated: 0 })

    return { date: dateKey, today: paraguayToday(), totals, members: rows }
  }
}
