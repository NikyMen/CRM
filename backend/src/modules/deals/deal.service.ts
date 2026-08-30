import { db } from '../../core/database'
import { EventBus } from '../../core/event-bus'
import { whatsAppManager } from '../whatsapp/whatsapp.manager'
import { KANBAN_DEAL_STATUSES } from './deal-kanban'
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ValidationError,
  paginate,
  ActivityType,
  type PaginationQuery,
  type PaginatedResult,
  customDataSchema,
  type WorkspaceContext,
} from '../../types'
import { type Prisma } from '@prisma/client'
import { createWithUniqueLeadNumber } from './lead-number'
import {
  assertDealWriteAccess,
  dealVisibilityWhere,
  dealWriteVisibilityWhere,
  isDealManager,
} from './deal-access'
import { clientVisibilityWhere } from '../clients/client-visibility'
import { contactAssignmentVisibilityWhere } from '../../core/auth/portfolio-visibility'
import { convertWonDealToClient } from './deal-conversion'

type Deal = Prisma.DealGetPayload<object>

function extractPhoneNumberFromJid(jid?: string | null) {
  if (!jid) return null
  const match = jid.match(/^(\d+)(?=@s\.whatsapp\.net$)/)
  return match?.[1] ?? null
}

// ─── DTOs ─────────────────────────────────────────────────────────

export interface CreateDealDto {
  title: string
  value?: number
  currency?: string
  probability?: number
  pipelineId: string
  stageId: string
  companyId?: string | null
  ownerId?: string | null
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
    lidJid: string | null
    assignedToUserId: string | null
    assignee: {
      id: string
      firstName: string
      lastName: string | null
      email: string
      avatar: string | null
    } | null
    profileImageUrl: string | null
    unreadCount: number
    lastMessageAt: Date | null
    lastMessagePreview: string | null
    lastMessageFromMe: boolean | null
    contactName: string | null
  } | null
  createdAt: Date
  updatedAt: Date
}

// ─── Servicio ─────────────────────────────────────────────────────

export class DealService {
  constructor(private readonly eventBus: EventBus) {}

  // ─── Crear Deal ──────────────────────────────────────────────────
  async create(
    ctx: WorkspaceContext,
    data: CreateDealDto
  ): Promise<Deal> {
    const { workspaceId, userId } = ctx
    if (ctx.role === 'viewer') {
      throw new ForbiddenError('El rol viewer solo puede consultar oportunidades')
    }
    // 0. Validar datos JSON
    if (data.customData !== undefined) {
      const result = customDataSchema.safeParse(data.customData)
      if (!result.success) {
        throw new ValidationError(`customData inválido: ${result.error.message}`)
      }
    }

    const ownerId = await this.resolveCreateOwner(ctx, data.ownerId, data.companyId)
    await this.validateLinkedRecords(ctx, data.companyId, data.contactIds)

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
    const deal = await createWithUniqueLeadNumber(workspaceId, (leadNumber) => db.$transaction(async (tx) => {
      const newDeal = await tx.deal.create({
        data: {
          workspaceId,
          leadNumber,
          title: data.title,
          value: data.value,
          currency: data.currency ?? 'PYG',
          probability: data.probability ?? stage.probability,
          pipelineId: data.pipelineId,
          stageId: data.stageId,
          position,
          companyId: data.companyId,
          ownerId,
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
    }))

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
  async getKanban(
    workspaceId: string,
    pipelineId: string,
    actor: WorkspaceContext
  ): Promise<KanbanBoard> {
    const pipeline = await db.pipeline.findFirst({
      where: { id: pipelineId, workspaceId },
      include: {
        stages: { orderBy: { position: 'asc' } },
      },
    })
    if (!pipeline) throw new NotFoundError('Pipeline', pipelineId)
    const assignmentScope = isDealManager(actor)
      ? undefined
      : { OR: [{ assignedToUserId: null }, { assignedToUserId: actor.userId }] }

    // Mantener también ganadas y perdidas en sus columnas: desde allí se
    // convierte una oportunidad ganada en cliente o se consulta su cierre.
    const deals = await db.deal.findMany({
      where: {
        workspaceId,
        pipelineId,
        status: { in: [...KANBAN_DEAL_STATUSES] },
        isArchived: false,
        ...dealVisibilityWhere(actor),
      },
      select: {
        id: true,
        leadNumber: true,
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
                  where: { workspaceId, ...(assignmentScope ?? {}) },
                  orderBy: { lastMessageAt: 'desc' },
                  select: {
                    id: true,
                    jid: true,
                    lidJid: true,
                    displayName: true,
                    phoneNumber: true,
                    assignedToUserId: true,
                    assignedTo: {
                      select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
                    },
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
        // Calcular días en la stage actual
        const daysInStage = Math.floor(
          (now.getTime() - d.stageEnteredAt.getTime()) / (1000 * 60 * 60 * 24)
        )

        // Un deal es "podrido" si lleva más días que el límite de la stage
        const isRotten = stage.rottenAfterDays != null
          ? daysInStage >= stage.rottenAfterDays
          : false

        const contactName = linkedContact
          ? [linkedContact.contact.firstName, linkedContact.contact.lastName].filter(Boolean).join(' ') || null
          : null

        return {
          id: d.id,
          leadNumber: d.leadNumber,
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
          chat: chat ? {
            id: chat.id,
            jid: chat.jid,
            lidJid: chat.lidJid,
            displayName: chat.displayName,
            phoneNumber: chat.phoneNumber ?? extractPhoneNumberFromJid(chat.jid),
            assignedToUserId: chat.assignedToUserId,
            assignee: chat.assignedTo,
            profileImageUrl: await whatsAppManager.getChatProfileImageUrl(workspaceId, chat.jid),
            unreadCount: chat.unreadCount,
            lastMessageAt: chat.lastMessageAt,
            lastMessagePreview: chat.lastMessagePreview,
            lastMessageFromMe: chat.lastMessageFromMe,
            contactName,
          } : null,
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
    ctx: WorkspaceContext,
    dealId: string,
    dto: MoveDealDto
  ): Promise<Deal> {
    const { workspaceId, userId } = ctx
    if (ctx.role === 'viewer') {
      throw new ForbiddenError('El rol viewer solo puede consultar oportunidades')
    }
    const deal = await db.deal.findFirst({
      where: {
        id: dealId,
        workspaceId,
        ...dealWriteVisibilityWhere(ctx),
      },
    })
    if (!deal) throw new NotFoundError('Deal', dealId)

    const prevStageId = deal.stageId
    const newStageId = dto.stageId
    const stageChanged = prevStageId !== newStageId

    // Verificar que la nueva stage existe en el workspace
    const newStage = await db.stage.findFirst({
      where: { id: newStageId, pipeline: { id: deal.pipelineId, workspaceId } },
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
          // Al volver a una etapa abierta, limpiar el cierre anterior.
          closedAt: newStage.isWon || newStage.isLost ? new Date() : null,
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

  // ─── Buscar por ID ───────────────────────────────────────────────
  async findById(ctx: WorkspaceContext, id: string): Promise<Deal> {
    const deal = await db.deal.findFirst({
      where: {
        id,
        workspaceId: ctx.workspaceId,
        isArchived: false,
        ...dealVisibilityWhere(ctx),
      },
    })
    if (!deal) throw new NotFoundError('Deal', id)
    return deal
  }

  // ─── Buscar con filtros ──────────────────────────────────────────
  async search(
    ctx: WorkspaceContext,
    filters: DealFilters
  ): Promise<PaginatedResult<Deal>> {
    const page = filters.page ?? 0
    const limit = Math.min(filters.limit ?? 25, 100)

    const where: Prisma.DealWhereInput = {
      workspaceId: ctx.workspaceId,
      isArchived: false,
      ...dealVisibilityWhere(ctx),
    }
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
    ctx: WorkspaceContext,
    id: string,
    data: UpdateDealDto
  ): Promise<Deal> {
    const { workspaceId, userId } = ctx
    const current = await db.deal.findFirst({ where: { id, workspaceId, isArchived: false } })
    if (!current) throw new NotFoundError('Oportunidad', id)

    const clientAssignment = current.companyId && !isDealManager(ctx)
      ? await db.clientAssignment.findFirst({
          where: { workspaceId, companyId: current.companyId, userId: ctx.userId },
          select: { id: true },
        })
      : null

    const changedFields = Object.keys(data).filter((key) => data[key as keyof UpdateDealDto] !== undefined)
    const changesOnlyOwner = changedFields.length === 1 && changedFields[0] === 'ownerId'
    assertDealWriteAccess(ctx, current.ownerId, data.ownerId, changesOnlyOwner, Boolean(clientAssignment))

    // 0. Validar datos JSON
    if (data.customData !== undefined) {
      const result = customDataSchema.safeParse(data.customData)
      if (!result.success) {
        throw new ValidationError(`customData inválido: ${result.error.message}`)
      }
    }

    if (data.ownerId) await this.ensureWorkspaceOwner(workspaceId, data.ownerId)
    const nextCompanyId = data.companyId !== undefined ? data.companyId : current.companyId
    const nextOwnerId = data.ownerId !== undefined ? data.ownerId : current.ownerId
    const linkedCompany = await this.validateLinkedRecords(ctx, nextCompanyId)
    if (linkedCompany?.ownerId && linkedCompany.ownerId !== nextOwnerId) {
      throw new ValidationError('Reasigná el responsable desde Clientes para mantener la cartera sincronizada')
    }

    if (!isDealManager(ctx) && current.ownerId === null && !clientAssignment) {
      const claimed = await db.deal.updateMany({
        where: { id, workspaceId, ownerId: null, isArchived: false },
        data: { ownerId: ctx.userId },
      })
      if (claimed.count !== 1) {
        throw new ConflictError('Otra persona tomó la oportunidad antes')
      }
      const deal = await db.deal.findUniqueOrThrow({ where: { id } })
      await this.logActivity(workspaceId, id, ActivityType.DEAL_UPDATED, userId)
      await this.eventBus.emit('deal.updated', { workspaceId, deal: this.sanitize(deal) })
      return deal
    }

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

  async convertToClient(ctx: WorkspaceContext, id: string, clientId?: string) {
    const result = await convertWonDealToClient({ ...ctx, dealId: id, clientId })
    if (result.changed) {
      await this.logActivity(ctx.workspaceId, id, ActivityType.DEAL_UPDATED, ctx.userId, {
        action: 'converted_to_client',
        clientId: result.client.id,
        created: result.created,
      })
      await this.eventBus.emit('deal.updated', {
        workspaceId: ctx.workspaceId,
        deal: this.sanitize(result.deal),
      })
    }
    return result
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
  private async resolveCreateOwner(
    ctx: WorkspaceContext,
    requestedOwnerId?: string | null,
    companyId?: string | null
  ) {
    if (!isDealManager(ctx) && requestedOwnerId && requestedOwnerId !== ctx.userId) {
      throw new ForbiddenError('Solo podés crear oportunidades bajo tu responsabilidad')
    }

    let ownerId = ctx.role === 'member' ? ctx.userId : requestedOwnerId ?? null
    if (companyId) {
      const company = await db.company.findFirst({
        where: {
          id: companyId,
          workspaceId: ctx.workspaceId,
          isArchived: false,
          ...clientVisibilityWhere(ctx),
        },
        select: { ownerId: true },
      })
      if (!company) throw new NotFoundError('Cliente', companyId)
      if (company.ownerId && requestedOwnerId !== undefined && company.ownerId !== requestedOwnerId) {
        throw new ValidationError('La oportunidad debe conservar el responsable del cliente')
      }
      ownerId = company.ownerId ?? ownerId
    }

    if (ownerId) await this.ensureWorkspaceOwner(ctx.workspaceId, ownerId)
    return ownerId
  }

  private async ensureWorkspaceOwner(workspaceId: string, ownerId: string) {
    const membership = await db.workspaceUser.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: ownerId } },
      select: { userId: true },
    })
    if (!membership) {
      throw new ValidationError('El responsable no pertenece a este espacio de trabajo')
    }
  }

  private async validateLinkedRecords(
    ctx: WorkspaceContext,
    companyId?: string | null,
    contactIds?: string[]
  ) {
    let linkedCompany: { id: string; ownerId: string | null } | null = null
    if (companyId) {
      linkedCompany = await db.company.findFirst({
        where: {
          id: companyId,
          workspaceId: ctx.workspaceId,
          isArchived: false,
          ...clientVisibilityWhere(ctx),
        },
        select: { id: true, ownerId: true },
      })
      if (!linkedCompany) throw new NotFoundError('Cliente', companyId)
    }

    const uniqueContactIds = [...new Set(contactIds ?? [])]
    if (!uniqueContactIds.length) return linkedCompany
    const contacts = await db.contact.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        id: { in: uniqueContactIds },
        isArchived: false,
        ...contactAssignmentVisibilityWhere(ctx),
      },
      select: { id: true, companyId: true },
    })
    if (contacts.length !== uniqueContactIds.length) {
      throw new ValidationError('Uno o más contactos no pertenecen a tu cartera')
    }
    if (companyId && contacts.some((contact) => contact.companyId && contact.companyId !== companyId)) {
      throw new ValidationError('Un contacto ya pertenece a otro cliente')
    }
    return linkedCompany
  }

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

  private readWhatsAppChatJid(customData: Prisma.JsonValue | null | undefined) {
    if (!customData || typeof customData !== 'object' || Array.isArray(customData)) return null
    const value = (customData as Record<string, unknown>).whatsAppChatJid
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }

  private sanitize(deal: Deal) {
    return {
      id: deal.id,
      leadNumber: deal.leadNumber,
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
