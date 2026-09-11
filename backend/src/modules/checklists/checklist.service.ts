import { ChecklistPeriodicity, ChecklistStatus, Prisma } from '@prisma/client'
import { db } from '../../core/database'
import { EventBus } from '../../core/event-bus'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  paginate,
  type WorkspaceContext,
} from '../../types'
import {
  canManageAllClients,
  clientVisibilityWhere,
  ensureClientAccess,
  ensureWorkspaceUser,
} from '../clients/client-access'
import { startOfParaguayDay } from '../collections/collection-calculations'
import { deriveChecklistStatus } from './checklist-status'

export interface ChecklistTemplateInput {
  name: string
  description?: string | null
  periodicity?: ChecklistPeriodicity
  isActive?: boolean
  items?: Array<{ title: string; description?: string | null; isRequired?: boolean }>
}

export interface CreateClientChecklistInput {
  templateId: string
  periodKey: string
  dueDate?: Date | null
  assignedToUserId?: string | null
}

export class ChecklistService {
  constructor(private readonly eventBus?: EventBus) {}

  async listTemplates(workspaceId: string, page: number, limit: number, includeInactive: boolean) {
    const where = { workspaceId, ...(!includeInactive ? { isActive: true } : {}) }
    const [items, total] = await Promise.all([
      db.checklistTemplate.findMany({
        where,
        include: { items: { orderBy: { position: 'asc' } }, _count: { select: { checklists: true } } },
        orderBy: { name: 'asc' },
        skip: page * limit,
        take: limit,
      }),
      db.checklistTemplate.count({ where }),
    ])
    return paginate(items, total, page, limit)
  }

  async summary(ctx: WorkspaceContext) {
    await db.clientChecklist.updateMany({
      where: {
        workspaceId: ctx.workspaceId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        dueDate: { lt: startOfParaguayDay() },
      },
      data: { status: 'OVERDUE' },
    })
    const company = clientVisibilityWhere(ctx)
    const [grouped, upcoming] = await Promise.all([
      db.clientChecklist.groupBy({
        by: ['status'],
        where: { workspaceId: ctx.workspaceId, company },
        _count: true,
      }),
      db.clientChecklist.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          company,
          status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] },
          dueDate: { not: null },
        },
        include: {
          company: { select: { id: true, name: true, ruc: true, dv: true } },
          template: { select: { id: true, name: true, periodicity: true } },
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { dueDate: 'asc' },
        take: 20,
      }),
    ])
    const counts = new Map(grouped.map((row) => [row.status, row._count]))
    return {
      pending: counts.get('PENDING') ?? 0,
      inProgress: counts.get('IN_PROGRESS') ?? 0,
      overdue: counts.get('OVERDUE') ?? 0,
      completed: counts.get('COMPLETED') ?? 0,
      upcoming,
    }
  }

  async createTemplate(workspaceId: string, input: ChecklistTemplateInput) {
    return db.checklistTemplate.create({
      data: {
        workspaceId,
        name: input.name,
        description: input.description,
        periodicity: input.periodicity ?? 'MONTHLY',
        isActive: input.isActive ?? true,
        items: {
          create: (input.items ?? []).map((item, position) => ({ ...item, position, isRequired: item.isRequired ?? true })),
        },
      },
      include: { items: { orderBy: { position: 'asc' } } },
    })
  }

  async updateTemplate(workspaceId: string, id: string, input: Partial<ChecklistTemplateInput>) {
    const existing = await db.checklistTemplate.findFirst({ where: { id, workspaceId } })
    if (!existing) throw new NotFoundError('Plantilla de checklist', id)
    return db.checklistTemplate.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.periodicity !== undefined ? { periodicity: input.periodicity } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.items !== undefined ? {
          items: {
            deleteMany: {},
            create: input.items.map((item, position) => ({ ...item, position, isRequired: item.isRequired ?? true })),
          },
        } : {}),
      },
      include: { items: { orderBy: { position: 'asc' } } },
    })
  }

  async archiveTemplate(workspaceId: string, id: string) {
    const result = await db.checklistTemplate.updateMany({ where: { id, workspaceId }, data: { isActive: false } })
    if (result.count === 0) throw new NotFoundError('Plantilla de checklist', id)
  }

  async listClientChecklists(
    ctx: WorkspaceContext,
    companyId: string,
    filters: { status?: ChecklistStatus; periodKey?: string; page: number; limit: number }
  ) {
    await ensureClientAccess(ctx, companyId)
    const where: Prisma.ClientChecklistWhereInput = {
      workspaceId: ctx.workspaceId,
      companyId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.periodKey ? { periodKey: filters.periodKey } : {}),
    }
    const [items, total] = await Promise.all([
      db.clientChecklist.findMany({
        where,
        include: {
          template: true,
          assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
          items: {
            include: { completedBy: { select: { id: true, firstName: true, lastName: true } } },
            orderBy: { position: 'asc' },
          },
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        skip: filters.page * filters.limit,
        take: filters.limit,
      }),
      db.clientChecklist.count({ where }),
    ])
    return paginate(items, total, filters.page, filters.limit)
  }

  async createClientChecklist(ctx: WorkspaceContext, companyId: string, input: CreateClientChecklistInput) {
    const client = await ensureClientAccess(ctx, companyId, 'write')
    const template = await db.checklistTemplate.findFirst({
      where: { id: input.templateId, workspaceId: ctx.workspaceId, isActive: true },
      include: { items: { orderBy: { position: 'asc' } } },
    })
    if (!template) throw new NotFoundError('Plantilla de checklist', input.templateId)

    let assignedToUserId = input.assignedToUserId ?? client.ownerId ?? ctx.userId
    if (!canManageAllClients(ctx)) assignedToUserId = ctx.userId
    if (assignedToUserId) await ensureWorkspaceUser(ctx.workspaceId, assignedToUserId)

    try {
      const checklist = await db.clientChecklist.create({
        data: {
          workspaceId: ctx.workspaceId,
          companyId,
          templateId: template.id,
          periodKey: input.periodKey,
          dueDate: input.dueDate,
          assignedToUserId,
          items: {
            create: template.items.map((item) => ({
              templateItemId: item.id,
              title: item.title,
              description: item.description,
              position: item.position,
              isRequired: item.isRequired,
            })),
          },
        },
        include: { template: true, items: { orderBy: { position: 'asc' } } },
      })
      await this.emitUpdate(ctx.workspaceId, companyId, checklist.id, 'created')
      return checklist
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('Ya existe este checklist para el cliente y período')
      }
      throw error
    }
  }

  async updateClientChecklist(
    ctx: WorkspaceContext,
    companyId: string,
    checklistId: string,
    input: { dueDate?: Date | null; assignedToUserId?: string | null }
  ) {
    await ensureClientAccess(ctx, companyId, 'write')
    const checklist = await db.clientChecklist.findFirst({
      where: { id: checklistId, workspaceId: ctx.workspaceId, companyId },
      include: { items: true },
    })
    if (!checklist) throw new NotFoundError('Checklist', checklistId)
    if (!canManageAllClients(ctx) && checklist.assignedToUserId !== ctx.userId) {
      throw new ForbiddenError('Solo la persona asignada o un administrador puede modificar este checklist')
    }
    if (input.assignedToUserId !== undefined) {
      if (!canManageAllClients(ctx) && input.assignedToUserId !== ctx.userId) {
        throw new ForbiddenError('Solo owner o admin pueden asignar el checklist a otra persona')
      }
      if (input.assignedToUserId) await ensureWorkspaceUser(ctx.workspaceId, input.assignedToUserId)
    }
    const dueDate = input.dueDate !== undefined ? input.dueDate : checklist.dueDate
    const status = deriveChecklistStatus(checklist.items, dueDate)
    const updated = await db.clientChecklist.update({
      where: { id: checklist.id },
      data: {
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
        ...(input.assignedToUserId !== undefined ? { assignedToUserId: input.assignedToUserId } : {}),
        status,
        completedAt: status === 'COMPLETED' ? checklist.completedAt ?? new Date() : null,
      },
      include: { template: true, items: { orderBy: { position: 'asc' } } },
    })
    await this.emitUpdate(ctx.workspaceId, companyId, checklistId, 'updated')
    return updated
  }

  async updateItem(
    ctx: WorkspaceContext,
    companyId: string,
    checklistId: string,
    itemId: string,
    input: { isCompleted?: boolean; notes?: string | null }
  ) {
    await ensureClientAccess(ctx, companyId, 'write')
    const updated = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "client_checklists" WHERE id = ${checklistId} FOR UPDATE`
      const checklist = await tx.clientChecklist.findFirst({
        where: { id: checklistId, workspaceId: ctx.workspaceId, companyId },
      })
      if (!checklist) throw new NotFoundError('Checklist', checklistId)
      if (!canManageAllClients(ctx) && checklist.assignedToUserId !== ctx.userId) {
        throw new ForbiddenError('Solo la persona asignada o un administrador puede modificar este checklist')
      }

      const item = await tx.clientChecklistItem.findFirst({ where: { id: itemId, checklistId } })
      if (!item) throw new NotFoundError('Ítem de checklist', itemId)

      await tx.clientChecklistItem.update({
        where: { id: item.id },
        data: {
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.isCompleted !== undefined ? {
            isCompleted: input.isCompleted,
            completedAt: input.isCompleted ? new Date() : null,
            completedByUserId: input.isCompleted ? ctx.userId : null,
          } : {}),
        },
      })

      const items = await tx.clientChecklistItem.findMany({ where: { checklistId } })
      const status = deriveChecklistStatus(items, checklist.dueDate)
      const completed = status === 'COMPLETED'

      return tx.clientChecklist.update({
        where: { id: checklistId },
        data: { status, completedAt: completed ? checklist.completedAt ?? new Date() : null },
        include: { template: true, items: { orderBy: { position: 'asc' } } },
      })
    })
    await this.emitUpdate(ctx.workspaceId, companyId, checklistId, 'item.updated')
    return updated
  }

  private async findChecklist(workspaceId: string, companyId: string, checklistId: string) {
    const checklist = await db.clientChecklist.findFirst({ where: { id: checklistId, workspaceId, companyId } })
    if (!checklist) throw new NotFoundError('Checklist', checklistId)
    return checklist
  }

  private async emitUpdate(workspaceId: string, companyId: string, checklistId: string, action: string) {
    await this.eventBus?.emit('checklist.updated', { workspaceId, companyId, checklistId, action })
  }
}
