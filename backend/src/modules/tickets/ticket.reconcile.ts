import { db } from '../../core/database'
import { ensureTicketForInboundMessage } from './ticket.inbound'
import {
  mergeReplyEventMetadata,
  readReplyReservationSnapshot,
  replyCompletionPatch,
  ticketReplyTextHash,
} from './ticket.reply-state'

export { ticketReplyTextHash } from './ticket.reply-state'

function objectValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export async function reconcilePendingTicketState() {
  const [inboundLogs, outboundEvents] = await Promise.all([
    db.eventLog.findMany({
      where: { event: 'ticket.inbound_pending' },
      orderBy: { createdAt: 'asc' },
      take: 100,
    }),
    db.ticketEvent.findMany({
      where: {
        type: 'MESSAGE_SEND_REQUESTED',
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          lte: new Date(Date.now() - 30_000),
        },
      },
      include: { ticket: { select: { id: true, workspaceId: true, whatsappChatId: true, status: true, firstResponseAt: true } } },
      orderBy: { createdAt: 'asc' },
      take: 100,
    }),
  ])

  let inboundReconciled = 0
  for (const log of inboundLogs) {
    const payload = objectValue(log.payload)
    const chatId = typeof payload.chatId === 'string' ? payload.chatId : null
    const messageId = typeof payload.messageId === 'string' ? payload.messageId : null
    const sentAt = typeof payload.sentAt === 'string' ? new Date(payload.sentAt) : null
    if (!chatId || !messageId || !sentAt || Number.isNaN(sentAt.getTime())) {
      await db.eventLog.delete({ where: { id: log.id } })
      continue
    }
    try {
      const ticket = await ensureTicketForInboundMessage({
        workspaceId: log.workspaceId,
        chatId,
        messageId,
        sentAt,
      })
      if (ticket) {
        await db.eventLog.delete({ where: { id: log.id } })
        inboundReconciled += 1
      }
    } catch (error) {
      console.error('[tickets] reintento inbound pendiente:', error)
    }
  }

  let outboundReconciled = 0
  for (const event of outboundEvents) {
    const metadata = objectValue(event.metadata)
    const textHash = typeof metadata.textHash === 'string' ? metadata.textHash : null
    if (!textHash || !event.ticket.whatsappChatId) continue

    const candidates = await db.whatsAppMessage.findMany({
      where: {
        workspaceId: event.workspaceId,
        chatId: event.ticket.whatsappChatId,
        fromMe: true,
        ticketId: { in: [null, event.ticketId] },
        sentAt: { gte: new Date(event.createdAt.getTime() - 5_000) },
        text: { not: null },
      },
      orderBy: { sentAt: 'asc' },
      take: 30,
    })
    const message = candidates.find((candidate) =>
      candidate.text && ticketReplyTextHash(candidate.text) === textHash
    )
    if (!message) continue

    const reconciled = await db.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "tickets"
        WHERE "id" = ${event.ticketId} AND "workspaceId" = ${event.workspaceId}
        FOR UPDATE
      `
      const pending = await tx.ticketEvent.findFirst({
        where: {
          id: event.id,
          workspaceId: event.workspaceId,
          ticketId: event.ticketId,
          type: 'MESSAGE_SEND_REQUESTED',
        },
      })
      if (!pending) return false
      const current = await tx.ticket.findFirst({
        where: { id: event.ticketId, workspaceId: event.workspaceId },
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
      if (!current) return false
      await tx.whatsAppMessage.updateMany({
        where: {
          id: message.id,
          workspaceId: event.workspaceId,
          OR: [{ ticketId: null }, { ticketId: event.ticketId }],
        },
        data: { ticketId: event.ticketId },
      })
      const patch = replyCompletionPatch(
        readReplyReservationSnapshot(pending.metadata),
        current,
        message.sentAt
      )
      const ticketUpdate = await tx.ticket.updateMany({
        where: { id: event.ticketId, workspaceId: event.workspaceId },
        data: patch,
      })
      if (ticketUpdate.count !== 1) return false
      const eventUpdate = await tx.ticketEvent.updateMany({
        where: {
          id: event.id,
          workspaceId: event.workspaceId,
          ticketId: event.ticketId,
          type: 'MESSAGE_SEND_REQUESTED',
        },
        data: {
          type: 'MESSAGE_SENT_RECOVERED',
          metadata: mergeReplyEventMetadata(pending.metadata, message.id),
        },
      })
      return eventUpdate.count === 1
    })
    if (reconciled) outboundReconciled += 1
  }

  return { inboundReconciled, outboundReconciled }
}
