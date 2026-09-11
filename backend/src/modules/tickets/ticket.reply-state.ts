import { createHash } from 'node:crypto'

type ReplyTicketState = {
  status: string
  assignedToUserId: string | null
  activeKey: string | null
  firstResponseAt: Date | null
  lastMessageAt: Date
  resolvedAt: Date | null
}

export type ReplyReservationSnapshot = {
  reservedStatus: string
  reservedAssignedToUserId: string | null
  reservedActiveKey: string
}

function record(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function ticketReplyTextHash(text: string) {
  return createHash('sha256').update(text).digest('hex')
}

export function createReplyReservationMetadata(text: string, ticket: {
  status: string
  assignedToUserId: string | null
  activeKey: string
}) {
  return {
    textHash: ticketReplyTextHash(text),
    reservedStatus: ticket.status,
    reservedAssignedToUserId: ticket.assignedToUserId,
    reservedActiveKey: ticket.activeKey,
  }
}

export function readReplyReservationSnapshot(metadata: unknown): ReplyReservationSnapshot | null {
  const value = record(metadata)
  if (
    typeof value.reservedStatus !== 'string'
    || (typeof value.reservedAssignedToUserId !== 'string' && value.reservedAssignedToUserId !== null)
    || typeof value.reservedActiveKey !== 'string'
  ) {
    return null
  }
  return {
    reservedStatus: value.reservedStatus,
    reservedAssignedToUserId: value.reservedAssignedToUserId as string | null,
    reservedActiveKey: value.reservedActiveKey,
  }
}

export function replyCompletionPatch(
  reservation: ReplyReservationSnapshot | null,
  current: ReplyTicketState,
  sentAt: Date
) {
  const unchanged = Boolean(
    reservation
    && current.status === reservation.reservedStatus
    && current.assignedToUserId === reservation.reservedAssignedToUserId
    && current.activeKey === reservation.reservedActiveKey
  )
  const canOpen = unchanged
    && current.status !== 'CLOSED'
    && (current.status === 'NEW' || current.status === 'RESOLVED')

  return {
    firstResponseAt: current.firstResponseAt ?? sentAt,
    lastMessageAt: current.lastMessageAt > sentAt ? current.lastMessageAt : sentAt,
    ...(canOpen ? {
      status: 'OPEN' as const,
      ...(current.status === 'RESOLVED' ? { resolvedAt: null } : {}),
    } : {}),
  }
}

export function mergeReplyEventMetadata(metadata: unknown, messageId?: string) {
  return { ...record(metadata), ...(messageId ? { messageId } : {}) }
}
