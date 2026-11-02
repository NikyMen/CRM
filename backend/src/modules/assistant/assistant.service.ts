import { Prisma } from '@prisma/client'
import { db } from '../../core/database'
import { ConflictError, NotFoundError, ValidationError, type WorkspaceContext } from '../../types'
import { DEFAULT_FALLBACK_MESSAGE, DEFAULT_FOLLOW_UP_MESSAGE, DEFAULT_HANDOFF_TOPICS, DEFAULT_SERVICES } from './assistant.defaults'
import {
  bodyUsesPrice, buildFlowConfig, computeInsights, normalizePhoneList, normalizeTextList, renderServiceBody,
  type ServiceRow, type SettingsRow,
} from './assistant.logic'

export type SettingsInput = {
  enabled: boolean
  testOnlyPhones: string[]
  excludedPhones: string[]
  notifyTo: string | null
  pauseHours: number
  waitSeconds: number
  maxAudioSeconds: number
  maxRepliesPerHour: number
  timezone: string
  officeDays: number[]
  officeFrom: string
  officeTo: string
  followUpEnabled: boolean
  followUpHours: number
  followUpFrom: string
  followUpTo: string
  followUpMessage: string
  fallbackMessage: string
  extraInstructions: string
  handoffTopics: string[]
  crmSyncEnabled: boolean
}

export type ServiceInput = {
  title: string
  description: string
  body: string
  /** Guaraníes sin decimales como texto, o null. */
  amount: string | null
  active: boolean
}

const serviceSelect = {
  id: true, code: true, title: true, description: true, body: true, amount: true, active: true, sortOrder: true, updatedAt: true,
} as const

type ServiceRecord = Prisma.AssistantServiceGetPayload<{ select: typeof serviceSelect }>

/** Fila lista para la API: el monto viaja como texto y se incluye el mensaje tal como lo recibe el cliente. */
function presentService(record: ServiceRecord) {
  const amount = record.amount ? record.amount.toFixed(0) : null
  let rendered: string | null = null
  try { rendered = renderServiceBody(record.body, amount) } catch { rendered = null }
  return { ...record, amount, rendered }
}

function toServiceRow(record: ServiceRecord): ServiceRow {
  return { code: record.code, title: record.title, description: record.description, body: record.body, amount: record.amount ? record.amount.toFixed(0) : null, active: record.active, sortOrder: record.sortOrder }
}

function assertServiceInput(input: ServiceInput) {
  if (bodyUsesPrice(input.body) && !input.amount) {
    throw new ValidationError('El texto usa {{precio}}: cargá el precio o sacá ese marcador del texto.')
  }
}

export class AssistantService {
  /** Ajustes del workspace; los crea con valores iniciales la primera vez. */
  async getSettings(ctx: WorkspaceContext) {
    const existing = await db.assistantSettings.findUnique({ where: { workspaceId: ctx.workspaceId } })
    if (existing) return this.ensureSeeded(ctx, existing)
    try {
      const created = await db.assistantSettings.create({
        data: {
          workspaceId: ctx.workspaceId,
          handoffTopics: DEFAULT_HANDOFF_TOPICS,
          fallbackMessage: DEFAULT_FALLBACK_MESSAGE,
          followUpMessage: DEFAULT_FOLLOW_UP_MESSAGE,
        },
      })
      return this.ensureSeeded(ctx, created)
    } catch (error) {
      // Dos pedidos simultáneos pueden intentar crearlo a la vez.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.ensureSeeded(ctx, await db.assistantSettings.findUniqueOrThrow({ where: { workspaceId: ctx.workspaceId } }))
      }
      throw error
    }
  }

  async updateSettings(ctx: WorkspaceContext, input: SettingsInput) {
    await this.getSettings(ctx)
    return db.assistantSettings.update({
      where: { workspaceId: ctx.workspaceId },
      data: {
        ...input,
        testOnlyPhones: normalizePhoneList(input.testOnlyPhones),
        excludedPhones: normalizePhoneList(input.excludedPhones),
        notifyTo: input.notifyTo ? normalizePhoneList([input.notifyTo])[0] ?? null : null,
        officeDays: [...new Set(input.officeDays)].sort((a, b) => a - b),
        handoffTopics: normalizeTextList(input.handoffTopics, 200),
      },
    })
  }

  async listServices(ctx: WorkspaceContext) {
    await this.getSettings(ctx)
    const records = await db.assistantService.findMany({
      where: { workspaceId: ctx.workspaceId },
      select: serviceSelect,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })
    return records.map(presentService)
  }

  async createService(ctx: WorkspaceContext, code: string, input: ServiceInput) {
    assertServiceInput(input)
    await this.getSettings(ctx)
    const last = await db.assistantService.aggregate({ where: { workspaceId: ctx.workspaceId }, _max: { sortOrder: true } })
    try {
      const record = await db.assistantService.create({
        data: {
          workspaceId: ctx.workspaceId,
          code,
          title: input.title,
          description: input.description,
          body: input.body,
          amount: input.amount === null ? null : new Prisma.Decimal(input.amount),
          active: input.active,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
        },
        select: serviceSelect,
      })
      return presentService(record)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError(`Ya existe un servicio con el código ${code}.`)
      }
      throw error
    }
  }

  /** El código no se cambia: el flujo de n8n lo usa como identificador. */
  async updateService(ctx: WorkspaceContext, id: string, input: ServiceInput) {
    assertServiceInput(input)
    await this.findService(ctx, id)
    const record = await db.assistantService.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        body: input.body,
        amount: input.amount === null ? null : new Prisma.Decimal(input.amount),
        active: input.active,
      },
      select: serviceSelect,
    })
    return presentService(record)
  }

  async removeService(ctx: WorkspaceContext, id: string) {
    await this.findService(ctx, id)
    await db.assistantService.delete({ where: { id } })
  }

  /** Guarda el orden de los servicios (el primero de la lista es el de menor sortOrder). */
  async reorderServices(ctx: WorkspaceContext, ids: string[]) {
    const owned = await db.assistantService.findMany({ where: { workspaceId: ctx.workspaceId, id: { in: ids } }, select: { id: true } })
    if (owned.length !== new Set(ids).size) throw new ValidationError('Hay servicios que no pertenecen a este espacio de trabajo.')
    await db.$transaction(ids.map((id, index) => db.assistantService.update({ where: { id }, data: { sortOrder: index } })))
    return this.listServices(ctx)
  }

  /** Vuelve a crear los servicios iniciales que falten, sin tocar los que ya existen. */
  async restoreDefaults(ctx: WorkspaceContext) {
    await this.getSettings(ctx)
    const existing = new Set((await db.assistantService.findMany({ where: { workspaceId: ctx.workspaceId }, select: { code: true } })).map((s) => s.code))
    const missing = DEFAULT_SERVICES.filter((service) => !existing.has(service.code))
    if (missing.length) {
      const last = await db.assistantService.aggregate({ where: { workspaceId: ctx.workspaceId }, _max: { sortOrder: true } })
      let order = (last._max.sortOrder ?? -1) + 1
      await db.assistantService.createMany({
        data: missing.map((service) => ({
          workspaceId: ctx.workspaceId,
          code: service.code,
          title: service.title,
          description: service.description,
          body: service.body,
          amount: service.amount === null ? null : new Prisma.Decimal(service.amount),
          sortOrder: order++,
        })),
        skipDuplicates: true,
      })
    }
    return { restored: missing.map((service) => service.code), services: await this.listServices(ctx) }
  }

  /** Lo que lee n8n (también sirve de vista previa en el panel). */
  async flowConfig(workspaceId: string) {
    const ctx = { workspaceId } as WorkspaceContext
    const settings = await this.getSettings(ctx)
    const records = await db.assistantService.findMany({ where: { workspaceId }, select: serviceSelect, orderBy: { sortOrder: 'asc' } })
    return buildFlowConfig(settings as SettingsRow, records.map(toServiceRow))
  }

  /** Métricas de los chats nuevos de la línea comercial en los últimos `days` días. */
  async insights(ctx: WorkspaceContext, days: number) {
    const settings = await this.getSettings(ctx)
    const now = new Date()
    const since = new Date(now.getTime() - days * 86_400_000)
    const chats = await db.collectionWhatsAppChat.findMany({
      where: { workspaceId: ctx.workspaceId, line: 'commercial', createdAt: { gte: since } },
      select: {
        id: true, displayName: true, phoneNumber: true,
        messages: { select: { fromMe: true, sentAt: true, messageType: true, text: true, sentByUserId: true } },
      },
    })
    const insights = computeInsights(chats, now, {
      timezone: settings.timezone, days: settings.officeDays, from: settings.officeFrom, to: settings.officeTo,
    })
    return { days, since: since.toISOString(), generatedAt: now.toISOString(), ...insights }
  }

  private async ensureSeeded<T extends { servicesSeeded: boolean }>(ctx: WorkspaceContext, settings: T): Promise<T> {
    if (settings.servicesSeeded) return settings
    // Idempotente: si dos pedidos llegan juntos, `skipDuplicates` evita repetir servicios y la bandera queda igual.
    await db.$transaction([
      db.assistantService.createMany({
        data: DEFAULT_SERVICES.map((service, index) => ({
          workspaceId: ctx.workspaceId,
          code: service.code,
          title: service.title,
          description: service.description,
          body: service.body,
          amount: service.amount === null ? null : new Prisma.Decimal(service.amount),
          sortOrder: index,
        })),
        skipDuplicates: true,
      }),
      db.assistantSettings.update({ where: { workspaceId: ctx.workspaceId }, data: { servicesSeeded: true } }),
    ])
    return { ...settings, servicesSeeded: true }
  }

  private async findService(ctx: WorkspaceContext, id: string) {
    const record = await db.assistantService.findFirst({ where: { id, workspaceId: ctx.workspaceId }, select: { id: true } })
    if (!record) throw new NotFoundError('Servicio del asistente', id)
    return record
  }
}
