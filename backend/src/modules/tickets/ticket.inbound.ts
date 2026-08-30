import { db } from '../../core/database'
import { emitTicketEvent } from './ticket.events'
import { whatsAppRealtime } from '../whatsapp/whatsapp.events'

const prisma = db as any

export function ticketActiveKey(workspaceId: string, chatId: string) {
  return `whatsapp:${workspaceId}:${chatId}`
}

function ticketSubject(displayName?: string | null, phoneNumber?: string | null) {
  const identity = displayName?.trim() || phoneNumber?.trim() || 'Sin identificar'
  return `WhatsApp · ${identity}`
}

async function appendInboundMessage(
  tx: any,
  current: any,
  chat: any,
  input: { workspaceId: string; messageId: string; sentAt: Date }
) {
  const reopens = current.status === 'WAITING_CUSTOMER' || current.status === 'RESOLVED'
  const nextStatus = reopens ? 'OPEN' : current.status
  const updated = await tx.ticket.update({
    where: { id: current.id },
    data: {
      status: nextStatus,
      resolvedAt: current.status === 'RESOLVED' ? null : current.resolvedAt,
      lastMessageAt: input.sentAt,
      contactId: chat.contactId ?? current.contactId,
      companyId: chat.contact?.companyId ?? current.companyId,
    },
  })
  const linkedMessage = await tx.whatsAppMessage.updateMany({
    where: { id: input.messageId, workspaceId: input.workspaceId, ticketId: null },
    data: { ticketId: current.id },
  })
  if (linkedMessage.count !== 1) return updated
  await tx.ticketEvent.create({
    data: {
      workspaceId: input.workspaceId,
      ticketId: current.id,
      type: 'MESSAGE_RECEIVED',
      metadata: { messageId: input.messageId, jid: chat.jid },
    },
  })
  if (nextStatus !== current.status) {
    await tx.ticketEvent.create({
      data: {
        workspaceId: input.workspaceId,
        ticketId: current.id,
        type: 'STATUS_CHANGED',
        fromValue: current.status,
        toValue: nextStatus,
      },
    })
  }
  return updated
}

export async function ensureTicketForInboundMessage(input: {
  workspaceId: string
  chatId: string
  messageId: string
  sentAt: Date
}, database: any = prisma) {
  const existingMessage = await database.whatsAppMessage.findFirst({
    where: { id: input.messageId, workspaceId: input.workspaceId },
    select: { ticketId: true },
  })
  if (existingMessage?.ticketId) {
    return database.ticket.findFirst({
      where: { id: existingMessage.ticketId, workspaceId: input.workspaceId },
    })
  }

  let created = false
  const ticket = await database.$transaction(async (tx: any) => {
    const chat = await tx.whatsAppChat.findFirst({
      where: { id: input.chatId, workspaceId: input.workspaceId, isGroup: false },
      select: {
        id: true,
        jid: true,
        displayName: true,
        phoneNumber: true,
        contactId: true,
        assignedToUserId: true,
        contact: {
          select: {
            ownerId: true,
            companyId: true,
            company: { select: { ownerId: true } },
          },
        },
      },
    })
    if (!chat) return null

    const key = ticketActiveKey(input.workspaceId, chat.id)
    const current = await tx.ticket.findUnique({ where: { activeKey: key } })
    if (current) {
      return appendInboundMessage(tx, current, chat, input)
    }

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ticket:${input.workspaceId}`}))`
    const racedTicket = await tx.ticket.findUnique({ where: { activeKey: key } })
    if (racedTicket) {
      return appendInboundMessage(tx, racedTicket, chat, input)
    }
    const aggregate = await tx.ticket.aggregate({
      where: { workspaceId: input.workspaceId },
      _max: { number: true },
    })
    const assignmentCandidates = [
      chat.assignedToUserId,
      chat.contact?.ownerId,
      chat.contact?.company?.ownerId,
    ].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)
    const activeMemberships = assignmentCandidates.length
      ? await tx.workspaceUser.findMany({
          where: {
            workspaceId: input.workspaceId,
            userId: { in: assignmentCandidates },
            role: { in: ['owner', 'admin', 'member'] },
          },
          select: { userId: true },
        })
      : []
    const activeUserIds = new Set(activeMemberships.map((membership: { userId: string }) => membership.userId))
    const assignedToUserId = assignmentCandidates.find((userId) => activeUserIds.has(userId)) ?? null

    const newTicket = await tx.ticket.create({
      data: {
        workspaceId: input.workspaceId,
        number: (aggregate._max.number ?? 0) + 1,
        subject: ticketSubject(chat.displayName, chat.phoneNumber),
        status: 'NEW',
        priority: 'NORMAL',
        category: 'CONSULTA',
        source: 'WHATSAPP',
        activeKey: key,
        companyId: chat.contact?.companyId ?? null,
        contactId: chat.contactId,
        whatsappChatId: chat.id,
        assignedToUserId,
        openedAt: input.sentAt,
        lastMessageAt: input.sentAt,
      },
    })
    created = true

    await tx.whatsAppMessage.updateMany({
      where: { id: input.messageId, workspaceId: input.workspaceId, ticketId: null },
      data: { ticketId: newTicket.id },
    })
    await tx.ticketEvent.create({
      data: {
        workspaceId: input.workspaceId,
        ticketId: newTicket.id,
        type: 'CREATED',
        metadata: { messageId: input.messageId, jid: chat.jid, source: 'WHATSAPP' },
      },
    })

    if (assignedToUserId !== chat.assignedToUserId) {
      await tx.whatsAppChat.update({
        where: { id: chat.id },
        data: { assignedToUserId },
      })
    }
    if (chat.contactId && assignedToUserId !== chat.contact?.ownerId) {
      await tx.contact.updateMany({
        where: { id: chat.contactId, workspaceId: input.workspaceId },
        data: { ownerId: assignedToUserId },
      })
    }
    if (chat.contact?.companyId && assignedToUserId !== chat.contact?.company?.ownerId) {
      await tx.company.updateMany({
        where: { id: chat.contact.companyId, workspaceId: input.workspaceId },
        data: { ownerId: assignedToUserId },
      })
    }
    if (chat.contactId || chat.contact?.companyId) {
      await tx.deal.updateMany({
        where: {
          workspaceId: input.workspaceId,
          status: 'OPEN',
          isArchived: false,
          OR: [
            ...(chat.contact?.companyId ? [{ companyId: chat.contact.companyId }] : []),
            ...(chat.contactId ? [{ contacts: { some: { contactId: chat.contactId } } }] : []),
          ],
        },
        data: { ownerId: assignedToUserId },
      })
    }

    return newTicket
  })

  if (!ticket) return null

  whatsAppRealtime.publish(input.workspaceId, {
    type: created ? 'ticket.created' : 'ticket.updated',
    jid: undefined,
  })
  await emitTicketEvent(created ? 'ticket.created' : 'ticket.updated', {
    workspaceId: input.workspaceId,
    ticketId: ticket.id,
    ticketNumber: ticket.number,
    source: 'WHATSAPP',
  })
  return ticket
}
