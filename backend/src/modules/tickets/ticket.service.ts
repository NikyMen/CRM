import { Prisma } from '@prisma/client'
import { db } from '../../core/database'
import { AppError, NotFoundError, paginate } from '../../types'
import {
  assignChatAndRelatedRecords,
  assertAssignmentAllowed,
  isManagerRole,
  validateAssignee,
} from './ticket.assignment'
import { emitTicketEvent } from './ticket.events'
import { ticketActiveKey } from './ticket.inbound'
import { whatsAppRealtime } from '../whatsapp/whatsapp.events'
import {
  createReplyReservationMetadata,
  mergeReplyEventMetadata,
  readReplyReservationSnapshot,
  replyCompletionPatch,
} from './ticket.reply-state'

export type TicketActor = {
  workspaceId: string
  userId: string
  role: string
}

export type TicketFilters = {
  inbox?: 'free' | 'mine' | 'all'
  search?: string
  status?: string
  priority?: string
  page?: number
  limit?: number
}

const ticketInclude = {
  contact: {
    select: { id: true, firstName: true, lastName: true, phone: true, avatar: true },
  },
  company: {
    select: { id: true, name: true, legalName: true, tradeName: true, ruc: true, dv: true },
  },
  whatsappChat: {
    select: { id: true, jid: true, displayName: true, phoneNumber: true, lastMessagePreview: true },
  },
  assignedTo: {
    select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
  },
  _count: { select: { messages: true, comments: true } },
} as const

const ticketDetailInclude = {
  ...ticketInclude,
  comments: {
    include: {
      author: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  events: {
    include: {
      actor: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  messages: {
    select: {
      id: true,
      messageId: true,
      fromMe: true,
      pushName: true,
      messageType: true,
      text: true,
      status: true,
      mediaMimeType: true,
      mediaFileName: true,
      mediaSizeBytes: true,
      mediaDurationSeconds: true,
      quotedMessageId: true,
      quotedText: true,
      quotedMessageType: true,
      sentAt: true,
    },
    orderBy: { sentAt: 'desc' as const },
    take: 200,
  },
} as const

export function buildTicketVisibilityScope(actor: TicketActor, inbox: TicketFilters['inbox'] = 'all') {
  if (isManagerRole(actor.role)) {
    if (inbox === 'free') return { assignedToUserId: null }
    if (inbox === 'mine') return { assignedToUserId: actor.userId }
    return {}
  }

  if (actor.role === 'viewer') return { assignedToUserId: actor.userId }
  if (inbox === 'free') return { assignedToUserId: null }
  if (inbox === 'mine') return { assignedToUserId: actor.userId }
  return { AND: [{ OR: [{ assignedToUserId: null }, { assignedToUserId: actor.userId }] }] }
}

function ticketWhere(actor: TicketActor, filters: TicketFilters = {}): Prisma.TicketWhereInput {
  const search = filters.search?.trim()
  const numericSearch = search && /^\d+$/.test(search) ? Number(search) : null
  return {
    workspaceId: actor.workspaceId,
    ...buildTicketVisibilityScope(actor, filters.inbox),
    ...(filters.status ? { status: filters.status as any } : {}),
    ...(filters.priority ? { priority: filters.priority as any } : {}),
    ...(search
      ? {
          OR: [
            ...(numericSearch !== null ? [{ number: numericSearch }] : []),
            { subject: { contains: search, mode: 'insensitive' } },
            { contact: { is: { firstName: { contains: search, mode: 'insensitive' } } } },
            { contact: { is: { lastName: { contains: search, mode: 'insensitive' } } } },
            { contact: { is: { phone: { contains: search } } } },
            { company: { is: { name: { contains: search, mode: 'insensitive' } } } },
            { company: { is: { ruc: { contains: search } } } },
            { whatsappChat: { is: { displayName: { contains: search, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  }
}

export class TicketService {
  constructor(private readonly database: any = db) {}

  async list(actor: TicketActor, filters: TicketFilters) {
    const page = filters.page ?? 0
    const limit = Math.min(filters.limit ?? 25, 100)
    const where = ticketWhere(actor, filters)
    const [items, total] = await Promise.all([
      db.ticket.findMany({
        where,
        include: ticketInclude,
        orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
        skip: page * limit,
        take: limit,
      }),
      db.ticket.count({ where }),
    ])
    return paginate(items, total, page, limit)
  }

  async findById(actor: TicketActor, id: string) {
    const ticket = await this.database.ticket.findFirst({
      where: { id, ...ticketWhere(actor) },
      include: ticketDetailInclude,
    })
    if (!ticket) throw new NotFoundError('Ticket', id)
    return { ...ticket, messages: [...ticket.messages].reverse() }
  }

  async listMessages(actor: TicketActor, id: string, page: number, limit: number) {
    await this.findVisibleRecord(actor, id)
    const where = { workspaceId: actor.workspaceId, ticketId: id }
    const [items, total] = await Promise.all([
      db.whatsAppMessage.findMany({
        where,
        orderBy: { sentAt: 'desc' },
        skip: page * limit,
        take: limit,
      }),
      db.whatsAppMessage.count({ where }),
    ])
    return paginate([...items].reverse(), total, page, limit)
  }

  async assign(actor: TicketActor, id: string, assignedToUserId: string | null) {
    const ticket = await this.findVisibleRecord(actor, id)
    assertAssignmentAllowed(actor, ticket.assignedToUserId, assignedToUserId)
    await validateAssignee(actor.workspaceId, assignedToUserId)

    if (ticket.whatsappChatId && ticket.activeKey) {
      await assignChatAndRelatedRecords({
        workspaceId: actor.workspaceId,
        chatId: ticket.whatsappChatId,
        expectedAssignedToUserId: ticket.assignedToUserId,
        assignedToUserId,
        expectedTicketId: ticket.id,
      })
    } else {
      const result = await db.ticket.updateMany({
        where: {
          id: ticket.id,
          workspaceId: actor.workspaceId,
          assignedToUserId: ticket.assignedToUserId,
        },
        data: { assignedToUserId },
      })
      if (result.count !== 1) {
        throw new AppError(409, 'Otro usuario modifico el ticket antes.', 'ASSIGNMENT_CONFLICT')
      }
    }

    await db.ticketEvent.create({
      data: {
        workspaceId: actor.workspaceId,
        ticketId: ticket.id,
        actorUserId: actor.userId,
        type: assignedToUserId ? 'ASSIGNED' : 'RELEASED',
        fromValue: ticket.assignedToUserId,
        toValue: assignedToUserId,
      },
    })
    await this.publishUpdated(actor.workspaceId, ticket.id, ticket.whatsappChat?.jid)
    return this.findById(actor, id)
  }

  async updateStatus(actor: TicketActor, id: string, status: string) {
    const ticket = await this.findOperableRecord(actor, id)
    const closesConversation = status === 'CLOSED'
    const wasClosed = ticket.status === 'CLOSED'
    const nextActiveKey = closesConversation
      ? null
      : ticket.whatsappChatId
        ? ticketActiveKey(actor.workspaceId, ticket.whatsappChatId)
        : null

    try {
      await db.$transaction([
        db.ticket.update({
          where: { id: ticket.id },
          data: {
            status: status as any,
            activeKey: nextActiveKey,
            resolvedAt: status === 'RESOLVED'
              ? ticket.resolvedAt ?? new Date()
              : status === 'CLOSED'
                ? ticket.resolvedAt
                : null,
            closedAt: status === 'CLOSED'
              ? ticket.closedAt ?? new Date()
              : wasClosed
                ? null
                : ticket.closedAt,
          },
        }),
        db.ticketEvent.create({
          data: {
            workspaceId: actor.workspaceId,
            ticketId: ticket.id,
            actorUserId: actor.userId,
            type: 'STATUS_CHANGED',
            fromValue: ticket.status,
            toValue: status,
          },
        }),
      ])
    } catch (error: any) {
      if (error?.code === 'P2002' && !closesConversation) {
        throw new AppError(409, 'Ya existe otro ticket activo para esta conversacion.', 'ACTIVE_TICKET_EXISTS')
      }
      throw error
    }

    await this.publishUpdated(actor.workspaceId, ticket.id, ticket.whatsappChat?.jid)
    return this.findById(actor, id)
  }

  async updateDetails(
    actor: TicketActor,
    id: string,
    data: { subject?: string; priority?: string; category?: string | null; dueAt?: Date | null }
  ) {
    const ticket = await this.findOperableRecord(actor, id)
    await db.$transaction([
      db.ticket.update({
        where: { id: ticket.id },
        data: {
          ...(data.subject !== undefined && { subject: data.subject }),
          ...(data.priority !== undefined && { priority: data.priority as any }),
          ...(data.category !== undefined && { category: data.category }),
          ...(data.dueAt !== undefined && { dueAt: data.dueAt }),
        },
      }),
      db.ticketEvent.create({
        data: {
          workspaceId: actor.workspaceId,
          ticketId: ticket.id,
          actorUserId: actor.userId,
          type: 'UPDATED',
          metadata: { fields: Object.keys(data) },
        },
      }),
    ])
    await this.publishUpdated(actor.workspaceId, ticket.id, ticket.whatsappChat?.jid)
    return this.findById(actor, id)
  }

  async addComment(actor: TicketActor, id: string, body: string) {
    const ticket = await this.findOperableRecord(actor, id)
    const comment = await db.$transaction(async (tx) => {
      const created = await tx.ticketComment.create({
        data: {
          workspaceId: actor.workspaceId,
          ticketId: ticket.id,
          authorUserId: actor.userId,
          body,
          internal: true,
        },
        include: {
          author: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } },
        },
      })
      await tx.ticketEvent.create({
        data: {
          workspaceId: actor.workspaceId,
          ticketId: ticket.id,
          actorUserId: actor.userId,
          type: 'COMMENT_ADDED',
          metadata: { commentId: created.id },
        },
      })
      return created
    })
    await this.publishUpdated(actor.workspaceId, ticket.id, ticket.whatsappChat?.jid)
    return comment
  }

  async listComments(actor: TicketActor, id: string) {
    await this.findVisibleRecord(actor, id)
    return db.ticketComment.findMany({
      where: { workspaceId: actor.workspaceId, ticketId: id },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
  }

  async prepareReply(actor: TicketActor, id: string, text: string) {
    return this.database.$transaction(async (tx: any) => {
      if (typeof tx.$queryRaw === 'function') {
        await tx.$queryRaw`
          SELECT "id" FROM "tickets"
          WHERE "id" = ${id} AND "workspaceId" = ${actor.workspaceId}
          FOR UPDATE
        `
      }

      const ticket = await tx.ticket.findFirst({
        where: { id, ...ticketWhere(actor) },
        include: ticketDetailInclude,
      })
      if (!ticket) throw new NotFoundError('Ticket', id)
      if (!isManagerRole(actor.role) && ticket.assignedToUserId !== actor.userId) {
        throw new AppError(403, 'Primero debes tomar el ticket para operarlo.', 'TICKET_NOT_ASSIGNED')
      }
      if (!ticket.whatsappChat || !ticket.activeKey || ticket.status === 'CLOSED') {
        throw new AppError(409, 'El ticket no tiene una conversacion de WhatsApp vinculada.', 'NO_WHATSAPP_CHAT')
      }

      const pending = await tx.ticketEvent.findFirst({
        where: {
          workspaceId: actor.workspaceId,
          ticketId: ticket.id,
          type: 'MESSAGE_SEND_REQUESTED',
          createdAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
        },
        select: { id: true },
      })
      if (pending) {
        throw new AppError(409, 'Ya hay una respuesta en proceso para este ticket.', 'TICKET_REPLY_IN_PROGRESS')
      }

      const reservedAt = new Date()
      const reserved = await tx.ticket.updateMany({
        where: {
          id: ticket.id,
          workspaceId: actor.workspaceId,
          status: ticket.status,
          assignedToUserId: ticket.assignedToUserId,
          activeKey: ticket.activeKey,
        },
        data: { updatedAt: reservedAt },
      })
      if (reserved.count !== 1) {
        throw new AppError(409, 'El ticket cambió antes de iniciar el envío.', 'TICKET_REPLY_CONFLICT')
      }

      const operation = await tx.ticketEvent.create({
        data: {
          workspaceId: actor.workspaceId,
          ticketId: ticket.id,
          actorUserId: actor.userId,
          type: 'MESSAGE_SEND_REQUESTED',
          metadata: createReplyReservationMetadata(text, {
            status: ticket.status,
            assignedToUserId: ticket.assignedToUserId,
            activeKey: ticket.activeKey,
          }),
        },
        select: { id: true },
      })
      return { ticket: { ...ticket, updatedAt: reservedAt }, operationId: operation.id }
    })
  }

  async markReplyFailed(actor: TicketActor, ticketId: string, operationId: string, reason: string) {
    await this.database.ticketEvent.updateMany({
      where: {
        id: operationId,
        workspaceId: actor.workspaceId,
        ticketId,
        actorUserId: actor.userId,
        type: 'MESSAGE_SEND_REQUESTED',
      },
      data: { type: 'MESSAGE_SEND_FAILED', metadata: { reason: reason.slice(0, 300) } },
    })
  }

  async recordReply(actor: TicketActor, ticket: any, message: any, operationId: string) {
    const now = message?.sentAt ? new Date(message.sentAt) : new Date()
    const finalState = await this.database.$transaction(async (tx: any) => {
      if (typeof tx.$queryRaw === 'function') {
        await tx.$queryRaw`
          SELECT "id" FROM "tickets"
          WHERE "id" = ${ticket.id} AND "workspaceId" = ${actor.workspaceId}
          FOR UPDATE
        `
      }
      const operation = await tx.ticketEvent.findFirst({
        where: {
          id: operationId,
          workspaceId: actor.workspaceId,
          ticketId: ticket.id,
          actorUserId: actor.userId,
          type: { in: ['MESSAGE_SEND_REQUESTED', 'MESSAGE_SENT', 'MESSAGE_SENT_RECOVERED'] },
        },
      })
      if (!operation) {
        throw new AppError(409, 'La reserva de respuesta ya no es válida.', 'TICKET_REPLY_CONFLICT')
      }

      const current = await tx.ticket.findFirst({
        where: { id: ticket.id, workspaceId: actor.workspaceId },
        select: {
          id: true,
          status: true,
          assignedToUserId: true,
          activeKey: true,
          firstResponseAt: true,
          lastMessageAt: true,
          resolvedAt: true,
        },
      })
      if (!current) throw new NotFoundError('Ticket', ticket.id)

      if (operation.type !== 'MESSAGE_SEND_REQUESTED') return current

      if (message?.id) {
        await tx.whatsAppMessage.updateMany({
          where: {
            id: message.id,
            workspaceId: actor.workspaceId,
            OR: [{ ticketId: null }, { ticketId: ticket.id }],
          },
          data: { ticketId: ticket.id },
        })
      }
      const patch = replyCompletionPatch(
        readReplyReservationSnapshot(operation.metadata),
        current,
        now
      )
      const ticketUpdate = await tx.ticket.updateMany({
        where: { id: ticket.id, workspaceId: actor.workspaceId },
        data: patch,
      })
      if (ticketUpdate.count !== 1) throw new NotFoundError('Ticket', ticket.id)
      const eventUpdate = await tx.ticketEvent.updateMany({
        where: {
          id: operationId,
          workspaceId: actor.workspaceId,
          ticketId: ticket.id,
          actorUserId: actor.userId,
          type: 'MESSAGE_SEND_REQUESTED',
        },
        data: {
          type: 'MESSAGE_SENT',
          metadata: mergeReplyEventMetadata(operation.metadata, message?.id),
        },
      })
      if (eventUpdate.count !== 1) {
        throw new AppError(409, 'La respuesta fue reconciliada por otro proceso.', 'TICKET_REPLY_CONFLICT')
      }
      return { ...current, ...patch }
    })
    await this.publishUpdated(actor.workspaceId, ticket.id, ticket.whatsappChat.jid)
    try {
      return await this.findById(actor, ticket.id)
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error
      return { ...ticket, ...finalState }
    }
  }

  private async findVisibleRecord(actor: TicketActor, id: string) {
    const ticket = await this.database.ticket.findFirst({
      where: { id, ...ticketWhere(actor) },
      include: {
        whatsappChat: { select: { id: true, jid: true, assignedToUserId: true } },
      },
    })
    if (!ticket) throw new NotFoundError('Ticket', id)
    return ticket
  }

  private async findOperableRecord(actor: TicketActor, id: string) {
    const ticket = await this.findVisibleRecord(actor, id)
    if (!isManagerRole(actor.role) && ticket.assignedToUserId !== actor.userId) {
      throw new AppError(403, 'Primero debes tomar el ticket para operarlo.', 'TICKET_NOT_ASSIGNED')
    }
    return ticket
  }

  private async publishUpdated(workspaceId: string, ticketId: string, jid?: string | null) {
    whatsAppRealtime.publish(workspaceId, { type: 'ticket.updated', jid: jid ?? undefined })
    await emitTicketEvent('ticket.updated', { workspaceId, ticketId })
  }
}
