import { db } from '../../core/database'
import { EventBus } from '../../core/event-bus'
import { whatsAppManager } from '../whatsapp/whatsapp.manager'
import {
  NotFoundError,
  paginate,
  ActivityType,
  type PaginationQuery,
  type PaginatedResult,
} from '../../types'
import { type Prisma } from '@prisma/client'

type Deal = Prisma.DealGetPayload<object>

function normalizePhoneNumber(value?: string | null) {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  return digits.length >= 10 ? digits : null
}

function extractPhoneNumberFromJid(jid?: string | null) {
  if (!jid) return null
  const match = jid.match(/^(\d+)(?=@s\.whatsapp\.net$)/)
  return match?.[1] ?? null
}

function normalizeLabel(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function splitContactName(value?: string | null) {
  const normalized = normalizeLabel(value)
  if (!normalized) {
    return { firstName: 'Chat WhatsApp', lastName: null as string | null }
  }

  const parts = normalized.split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] ?? 'Chat WhatsApp',
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : null,
  }
}

function padLeadPart(value: number | string, size: number) {
  return String(value).padStart(size, '0')
}

function buildLeadNumberBase(phoneNumber: string | null, createdAt: Date) {
  const fallback = String(createdAt.getTime()).slice(-6)
  const lastDigits = (phoneNumber ?? fallback).slice(-6).padStart(6, '0')
  return [
    padLeadPart(createdAt.getFullYear() % 100, 2),
    padLeadPart(createdAt.getMonth() + 1, 2),
    padLeadPart(createdAt.getDate(), 2),
    padLeadPart(createdAt.getHours(), 2),
    padLeadPart(createdAt.getMinutes(), 2),
    padLeadPart(createdAt.getSeconds(), 2),
    lastDigits,
  ].join('')
}

// ─── DTOs ─────────────────────────────────────────────────────────

export interface CreateDealDto {
  title: string
  value?: number
  currency?: string
  probability?: number
  pipelineId: string
  stageId: string
  companyId?: string
  ownerId?: string
  contactIds?: string[]
  expectedCloseDate?: Date
  customData?: Record<string, unknown>
}

export interface UpdateDealDto extends Partial<Omit<CreateDealDto, 'pipelineId' | 'stageId'>> {}

export interface MoveDealDto {
  stageId: string
  position?: number
}

export interface DealFilters extends PaginationQuery {
  pipelineId?: string
  stageId?: string
  status?: string
  ownerId?: string
  companyId?: string
}

// La respuesta completa del Kanban
export interface KanbanBoard {
  pipeline: { id: string; name: string }
  columns: KanbanColumn[]
}

export interface KanbanColumn {
  stage: {
    id: string
    name: string
    position: number
    color: string
    probability: number | null
    isWon: boolean
    isLost: boolean
    rottenAfterDays: number | null
  }
  deals: KanbanCard[]
  totalValue: number
  count: number
}

export interface KanbanCard {
  id: string
  leadNumber: string
  title: string
  value: number | null
  currency: string
  probability: number | null
  position: number
  status: string
  contactIds: string[]
  companyId: string | null
  ownerId: string | null
  expectedCloseDate: Date | null
  daysInStage: number
  isRotten: boolean
  chat: {
    id: string
    jid: string
    displayName: string | null
    phoneNumber: string | null
    profileImageUrl: string | null
    unreadCount: number
    lastMessageAt: Date | null
    lastMessagePreview: string | null
    lastMessageFromMe: boolean | null
    contactName: string | null
  }
  createdAt: Date
  updatedAt: Date
}

// ─── Servicio ─────────────────────────────────────────────────────

export class DealService {
  constructor(private readonly eventBus: EventBus) {}

  // ─── Crear Deal ──────────────────────────────────────────────────
  async create(
    workspaceId: string,
    data: CreateDealDto,
    userId?: string
  ): Promise<Deal> {
    // Verificar que la stage pertenece al pipeline y al workspace
    const stage = await db.stage.findFirst({
      where: {
        id: data.stageId,
        pipeline: { id: data.pipelineId, workspaceId },
      },
    })
    if (!stage) throw new NotFoundError('Stage', data.stageId)

    // Posición: al final de la columna
    const lastDeal = await db.deal.findFirst({
      where: { workspaceId, stageId: data.stageId, status: 'OPEN' },
      orderBy: { position: 'desc' },
    })
    const position = (lastDeal?.position ?? -1) + 1

    const deal = await db.$transaction(async (tx) => {
      const newDeal = await tx.deal.create({
        data: {
          workspaceId,
          title: data.title,
          value: data.value,
          currency: data.currency ?? 'USD',
          probability: data.probability ?? stage.probability,
          pipelineId: data.pipelineId,
          stageId: data.stageId,
          position,
          companyId: data.companyId,
          ownerId: data.ownerId,
          expectedCloseDate: data.expectedCloseDate,
          customData: (data.customData ?? {}) as Prisma.InputJsonValue,
        },
      })

      // Asociar contactos al deal
      if (data.contactIds?.length) {
        await tx.dealContact.createMany({
          data: data.contactIds.map((contactId) => ({
            dealId: newDeal.id,
            contactId,
          })),
          skipDuplicates: true,
        })
      }

      return newDeal
    })

    await this.logActivity(workspaceId, deal.id, ActivityType.DEAL_CREATED, userId)

    await this.eventBus.emit('deal.created', {
      workspaceId,
      deal: this.sanitize(deal),
      createdBy: userId ?? 'system',
    })

    return deal
  }

  // ─── Obtener Kanban completo ─────────────────────────────────────
  // Este es el endpoint principal del frontend
  // Devuelve todas las columnas con sus deals ordenados
  async getKanban(workspaceId: string, pipelineId: string): Promise<KanbanBoard> {
    const pipeline = await db.pipeline.findFirst({
      where: { id: pipelineId, workspaceId },
      include: {
        stages: { orderBy: { position: 'asc' } },
      },
    })
    if (!pipeline) throw new NotFoundError('Pipeline', pipelineId)
    await this.ensureWhatsappChatsHaveLeads(workspaceId, pipeline)
    await this.ensurePipelineDealsHaveLeadNumbers(workspaceId, pipelineId)

    // Traer todos los deals abiertos del pipeline de una sola consulta
    const deals = await db.deal.findMany({
      where: { workspaceId, pipelineId, status: 'OPEN', isArchived: false},
      select: {
        id: true,
        title: true,
        value: true,
        currency: true,
        probability: true,
        position: true,
        status: true,
        companyId: true,
        ownerId: true,
        expectedCloseDate: true,
        stageEnteredAt: true,
        stageId: true,
        customData: true,
        createdAt: true,
        updatedAt: true,
        contacts: {
          select: {
            contactId: true,
            contact: {
              select: {
                firstName: true,
                lastName: true,
                whatsappChats: {
                  where: { workspaceId },
                  orderBy: { lastMessageAt: 'desc' },
                  select: {
                    id: true,
                    jid: true,
                    displayName: true,
                    phoneNumber: true,
                    unreadCount: true,
                    lastMessageAt: true,
                    lastMessagePreview: true,
                    lastMessageFromMe: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { position: 'asc' },
    })

    const now = new Date()

    // Agrupar deals por stage
    const columns: KanbanColumn[] = await Promise.all(pipeline.stages.map(async (stage) => {
      const stageDeals = deals.filter((d) => d.stageId === stage.id)

      const cards = await Promise.all(stageDeals.map(async (d) => {
        const linkedChatJid = this.readWhatsAppChatJid(d.customData)
        const linkedContact =
          d.contacts.find((link) => link.contact.whatsappChats.some((chat) => chat.jid === linkedChatJid)) ??
          d.contacts.find((link) => link.contact.whatsappChats[0])
        const chat =
          linkedContact?.contact.whatsappChats.find((item) => item.jid === linkedChatJid) ??
          linkedContact?.contact.whatsappChats[0]
        if (!linkedContact || !chat) return null
        // Calcular días en la stage actual
        const daysInStage = Math.floor(
          (now.getTime() - d.stageEnteredAt.getTime()) / (1000 * 60 * 60 * 24)
        )

        // Un deal es "podrido" si lleva más días que el límite de la stage
        const isRotten = stage.rottenAfterDays != null
          ? daysInStage >= stage.rottenAfterDays
          : false

        const contactName = [
          linkedContact.contact.firstName,
          linkedContact.contact.lastName,
        ].filter(Boolean).join(' ') || null

        return {
          id: d.id,
          leadNumber: this.readLeadNumber(d.customData) ?? d.id.slice(-8),
          title: d.title,
          value: d.value ? Number(d.value) : null,
          currency: d.currency,
          probability: d.probability,
          position: d.position,
          status: d.status,
          contactIds: d.contacts.map((c) => c.contactId),
          companyId: d.companyId,
          ownerId: d.ownerId,
          expectedCloseDate: d.expectedCloseDate,
          daysInStage,
          isRotten,
          chat: {
            id: chat.id,
            jid: chat.jid,
            displayName: chat.displayName,
            phoneNumber: chat.phoneNumber ?? extractPhoneNumberFromJid(chat.jid),
            profileImageUrl: await whatsAppManager.getChatProfileImageUrl(workspaceId, chat.jid),
            unreadCount: chat.unreadCount,
            lastMessageAt: chat.lastMessageAt,
            lastMessagePreview: chat.lastMessagePreview,
            lastMessageFromMe: chat.lastMessageFromMe,
            contactName,
          },
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        } satisfies KanbanCard
      }))

      const visibleCards: KanbanCard[] = cards.filter((card): card is KanbanCard => Boolean(card))
      const totalValue = visibleCards.reduce((sum, d) => sum + (d.value ?? 0), 0)

      return {
        stage: {
          id: stage.id,
          name: stage.name,
          position: stage.position,
          color: stage.color,
          probability: stage.probability,
          isWon: stage.isWon,
          isLost: stage.isLost,
          rottenAfterDays: stage.rottenAfterDays,
        },
        deals: visibleCards,
        totalValue,
        count: visibleCards.length,
      }
    }))

    return {
      pipeline: { id: pipeline.id, name: pipeline.name },
      columns,
    }
  }

  // ─── Mover Deal (Drag & Drop) ────────────────────────────────────
  // Este es el método más complejo — maneja el reordenamiento del Kanban
  async move(
    workspaceId: string,
    dealId: string,
    dto: MoveDealDto,
    userId?: string
  ): Promise<Deal> {
    const deal = await db.deal.findFirst({ where: { id: dealId, workspaceId } })
    if (!deal) throw new NotFoundError('Deal', dealId)

    const prevStageId = deal.stageId
    const newStageId = dto.stageId
    const stageChanged = prevStageId !== newStageId

    // Verificar que la nueva stage existe en el workspace
    const newStage = await db.stage.findFirst({
      where: { id: newStageId, pipeline: { workspaceId } },
    })
    if (!newStage) throw new NotFoundError('Stage', newStageId)

    await db.$transaction(async (tx) => {
      const targetPosition = dto.position ?? 9999

      // Hacer hueco en la columna destino
      // Si insertamos en posición 2, los deals con position >= 2 suben uno
      await tx.deal.updateMany({
        where: {
          workspaceId,
          stageId: newStageId,
          position: { gte: targetPosition },
          id: { not: dealId },
        },
        data: { position: { increment: 1 } },
      })

      // Determinar el nuevo status según el tipo de stage
      let newStatus = deal.status
      if (newStage.isWon) newStatus = 'WON'
      else if (newStage.isLost) newStatus = 'LOST'
      else newStatus = 'OPEN'

      // Mover el deal a la nueva posición
      await tx.deal.update({
        where: { id: dealId, workspaceId },
        data: {
          stageId: newStageId,
          position: targetPosition,
          probability: newStage.probability ?? deal.probability,
          status: newStatus,
          stageEnteredAt: new Date(),
          // Si se cierra, registrar la fecha
          ...(newStage.isWon && { closedAt: new Date() }),
          ...(newStage.isLost && { closedAt: new Date() }),
        },
      })

      // Compactar posiciones para que siempre sean 0, 1, 2, 3…
      // Se compacta SIEMPRE (no solo al cambiar columna) para evitar que
      // los movimientos dentro de la misma columna acumulen huecos y
      // duplicados que desincronicen el orden del Kanban.
      if (stageChanged) {
        // Si cambió de columna: compactar la columna ORIGEN (quedó con un hueco)
        const remainingInOrigin = await tx.deal.findMany({
          where: { workspaceId, stageId: prevStageId },
          orderBy: { position: 'asc' },
        })
        await Promise.all(
          remainingInOrigin.map((d, i) =>
            tx.deal.update({ where: { id: d.id, workspaceId}, data: { position: i } })
          )
        )
      }

      // Compactar siempre la columna DESTINO (misma o distinta)
      const remainingInDest = await tx.deal.findMany({
        where: { workspaceId, stageId: newStageId },
        orderBy: { position: 'asc' },
      })
      await Promise.all(
        remainingInDest.map((d, i) =>
          tx.deal.update({ where: { id: d.id }, data: { position: i } })
        )
      )
    })

    const updated = await db.deal.findUniqueOrThrow({ where: { id: dealId } })

    // Emitir eventos específicos según lo que pasó
    if (stageChanged) {
      await this.logActivity(
        workspaceId, dealId, ActivityType.DEAL_STAGE_CHANGED, userId,
        { fromStageId: prevStageId, toStageId: newStageId }
      )
      await this.eventBus.emit('deal.stage_changed', {
        workspaceId,
        deal: this.sanitize(updated),
        previousStageId: prevStageId,
        newStageId,
        movedBy: userId ?? 'system',
      })
    }

    if (newStage.isWon) {
      await this.logActivity(workspaceId, dealId, ActivityType.DEAL_WON, userId)
      await this.eventBus.emit('deal.won', {
        workspaceId,
        deal: this.sanitize(updated),
      })
    } else if (newStage.isLost) {
      await this.logActivity(workspaceId, dealId, ActivityType.DEAL_LOST, userId)
      await this.eventBus.emit('deal.lost', {
        workspaceId,
        deal: this.sanitize(updated),
      })
    }

    return updated
  }

  // ─── Buscar con filtros ──────────────────────────────────────────
  async search(
    workspaceId: string,
    filters: DealFilters
  ): Promise<PaginatedResult<Deal>> {
    const page = filters.page ?? 0
    const limit = Math.min(filters.limit ?? 25, 100)

    const where: Prisma.DealWhereInput = { workspaceId, isArchived: false}
    if (filters.pipelineId) where.pipelineId = filters.pipelineId
    if (filters.stageId)    where.stageId    = filters.stageId
    if (filters.status)     where.status     = filters.status
    if (filters.ownerId)    where.ownerId    = filters.ownerId
    if (filters.companyId)  where.companyId  = filters.companyId

    const [items, total] = await Promise.all([
      db.deal.findMany({
        where,
        take: limit,
        skip: page * limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.deal.count({ where }),
    ])

    return paginate(items, total, page, limit)
  }

  // ─── Actualizar ──────────────────────────────────────────────────
  async update(
    workspaceId: string,
    id: string,
    data: UpdateDealDto,
    userId?: string
  ): Promise<Deal> {
    await db.deal.findFirstOrThrow({ where: { id, workspaceId } })

    const deal = await db.deal.update({
      where: { id, workspaceId },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.value !== undefined && { value: data.value }),
        ...(data.currency !== undefined && { currency: data.currency }),
        ...(data.probability !== undefined && { probability: data.probability }),
        ...(data.companyId !== undefined && { companyId: data.companyId }),
        ...(data.ownerId !== undefined && { ownerId: data.ownerId }),
        ...(data.expectedCloseDate !== undefined && {
          expectedCloseDate: data.expectedCloseDate,
        }),
        ...(data.customData !== undefined && {
          customData: data.customData as Prisma.InputJsonValue,
        }),
      },
    })

    await this.logActivity(workspaceId, id, ActivityType.DEAL_UPDATED, userId)
    await this.eventBus.emit('deal.updated', {
      workspaceId,
      deal: this.sanitize(deal),
    })

    return deal
  }

  // ─── Eliminar ────────────────────────────────────────────────────
  async delete(workspaceId: string, id: string, userId?: string): Promise<void> {
    await db.deal.findFirstOrThrow({ where: { id, workspaceId } })

    // Soft delete — igual que contacts, preserva el historial
    await db.deal.update({
      where: { id, workspaceId },
      data: { isArchived: true },
    })

    await this.eventBus.emit('deal.deleted', {
      workspaceId,
      dealId: id,
      deletedBy: userId ?? 'system',
    })
  }

  // ─── Helpers privados ────────────────────────────────────────────
  private async logActivity(
    workspaceId: string,
    dealId: string,
    type: ActivityType,
    userId?: string,
    metadata?: Record<string, unknown>
  ) {
    const titles: Record<string, string> = {
      [ActivityType.DEAL_CREATED]:       'Deal creado',
      [ActivityType.DEAL_UPDATED]:       'Deal actualizado',
      [ActivityType.DEAL_STAGE_CHANGED]: 'Stage cambiada',
      [ActivityType.DEAL_WON]:           '🎉 Deal ganado',
      [ActivityType.DEAL_LOST]:          'Deal perdido',
    }

    await db.activity.create({
      data: {
        workspaceId,
        type,
        entityType: 'deal',
        entityId: dealId,
        dealId,
        userId,
        source: 'manual',
        title: titles[type] ?? type,
        metadata: (metadata ?? null) as Prisma.InputJsonValue,
      },
    })
  }

  private async ensureWhatsappChatsHaveLeads(
    workspaceId: string,
    pipeline: {
      id: string
      stages: Array<{
        id: string
        name: string
        position: number
        probability: number | null
        isWon: boolean
        isLost: boolean
      }>
    }
  ) {
    const targetStage =
      pipeline.stages.find((stage) => stage.name.trim().toLowerCase() === 'nuevo lead') ??
      pipeline.stages.find((stage) => !stage.isWon && !stage.isLost) ??
      pipeline.stages[0]

    if (!targetStage) return

    const chats = await db.whatsAppChat.findMany({
      where: {
        workspaceId,
        isGroup: false,
        messages: { some: {} },
      },
      select: {
        id: true,
        jid: true,
        displayName: true,
        phoneNumber: true,
        contactId: true,
        lastMessageAt: true,
      },
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
      take: 500,
    })

    for (const chat of chats) {
      const phoneNumber = normalizePhoneNumber(chat.phoneNumber) ?? extractPhoneNumberFromJid(chat.jid)
      let contactId = chat.contactId

      if (!contactId && phoneNumber) {
        const existing = await this.findContactByPhone(workspaceId, phoneNumber)
        contactId = existing?.id ?? null
      }

      if (!contactId) {
        const { firstName, lastName } = splitContactName(chat.displayName ?? phoneNumber ?? chat.jid)
        const created = await db.contact.create({
          data: {
            workspaceId,
            firstName,
            lastName,
            phone: phoneNumber,
            status: 'LEAD',
            source: 'WHATSAPP',
            tags: ['whatsapp'],
            channels: [
              {
                type: 'whatsapp',
                identifier: phoneNumber ?? chat.jid,
                metadata: { jid: chat.jid },
              },
            ] as Prisma.InputJsonValue,
            lastContactedAt: chat.lastMessageAt,
          },
          select: { id: true },
        })
        contactId = created.id
      }

      await db.whatsAppChat.update({
        where: { id: chat.id },
        data: {
          contactId,
          ...(phoneNumber && !chat.phoneNumber ? { phoneNumber } : {}),
        },
      })

      const existingLead = await db.deal.findFirst({
        where: {
          workspaceId,
          status: 'OPEN',
          isArchived: false,
          contacts: { some: { contactId } },
        },
        select: { id: true, customData: true },
      })

      if (existingLead) {
        const currentData =
          existingLead.customData && typeof existingLead.customData === 'object' && !Array.isArray(existingLead.customData)
            ? existingLead.customData as Record<string, unknown>
            : {}

        if (currentData.whatsAppChatJid !== chat.jid) {
          await db.deal.update({
            where: { id: existingLead.id, workspaceId },
            data: {
              customData: {
                ...currentData,
                whatsAppChatJid: chat.jid,
                sourceChannel: currentData.sourceChannel ?? 'whatsapp',
              } as Prisma.InputJsonValue,
            },
          })
        }
        continue
      }

      const lastDeal = await db.deal.findFirst({
        where: {
          workspaceId,
          stageId: targetStage.id,
          status: 'OPEN',
          isArchived: false,
        },
        orderBy: { position: 'desc' },
        select: { position: true },
      })

      const title = normalizeLabel(chat.displayName) ?? phoneNumber ?? chat.jid
      const leadNumber = await this.generateUniqueLeadNumber(workspaceId, phoneNumber, chat.lastMessageAt ?? new Date())
      await db.$transaction(async (tx) => {
        const lead = await tx.deal.create({
          data: {
            workspaceId,
            title,
            pipelineId: pipeline.id,
            stageId: targetStage.id,
            position: (lastDeal?.position ?? -1) + 1,
            probability: targetStage.probability,
            status: 'OPEN',
            customData: {
              leadNumber,
              sourceChannel: 'whatsapp',
              autoCreated: true,
              whatsAppChatJid: chat.jid,
            } as Prisma.InputJsonValue,
          },
        })

        await tx.dealContact.create({
          data: {
            dealId: lead.id,
            contactId,
          },
        })
      })
    }
  }

  private async findContactByPhone(workspaceId: string, phoneNumber: string) {
    const contacts = await db.contact.findMany({
      where: {
        workspaceId,
        isArchived: false,
        phone: { not: null },
      },
      select: { id: true, phone: true },
      take: 5000,
    })

    return contacts.find((contact) => {
      const normalized = normalizePhoneNumber(contact.phone)
      return normalized === phoneNumber || Boolean(normalized && (normalized.endsWith(phoneNumber) || phoneNumber.endsWith(normalized)))
    }) ?? null
  }

  private readLeadNumber(customData: Prisma.JsonValue | null | undefined) {
    if (!customData || typeof customData !== 'object' || Array.isArray(customData)) return null
    const value = (customData as Record<string, unknown>).leadNumber
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }

  private readWhatsAppChatJid(customData: Prisma.JsonValue | null | undefined) {
    if (!customData || typeof customData !== 'object' || Array.isArray(customData)) return null
    const value = (customData as Record<string, unknown>).whatsAppChatJid
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }

  private async ensurePipelineDealsHaveLeadNumbers(workspaceId: string, pipelineId: string) {
    const deals = await db.deal.findMany({
      where: {
        workspaceId,
        pipelineId,
        isArchived: false,
      },
      select: {
        id: true,
        customData: true,
        createdAt: true,
        contacts: {
          select: {
            contact: {
              select: { phone: true },
            },
          },
          take: 1,
        },
      },
    })

    for (const deal of deals) {
      if (this.readLeadNumber(deal.customData)) continue

      const phoneNumber = normalizePhoneNumber(deal.contacts[0]?.contact.phone)
      const leadNumber = await this.generateUniqueLeadNumber(workspaceId, phoneNumber, deal.createdAt)
      const currentData =
        deal.customData && typeof deal.customData === 'object' && !Array.isArray(deal.customData)
          ? deal.customData as Record<string, unknown>
          : {}

      await db.deal.update({
        where: { id: deal.id, workspaceId },
        data: {
          customData: {
            ...currentData,
            leadNumber,
          } as Prisma.InputJsonValue,
        },
      })
    }
  }

  private async generateUniqueLeadNumber(workspaceId: string, phoneNumber: string | null, createdAt: Date) {
    const base = buildLeadNumberBase(phoneNumber, createdAt)

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}${attempt}`
      const existing = await db.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM deals
        WHERE "workspaceId" = ${workspaceId}
          AND "customData"->>'leadNumber' = ${candidate}
        LIMIT 1
      `

      if (existing.length === 0) return candidate
    }

    return `${base}${Date.now().toString().slice(-5)}`
  }

  private sanitize(deal: Deal) {
    return {
      id: deal.id,
      workspaceId: deal.workspaceId,
      title: deal.title,
      value: deal.value,
      currency: deal.currency,
      pipelineId: deal.pipelineId,
      stageId: deal.stageId,
      position: deal.position,
      status: deal.status,
      ownerId: deal.ownerId,
      companyId: deal.companyId,
      probability: deal.probability,
      expectedCloseDate: deal.expectedCloseDate,
      closedAt: deal.closedAt,
      createdAt: deal.createdAt,
      updatedAt: deal.updatedAt,
    }
  }
}
