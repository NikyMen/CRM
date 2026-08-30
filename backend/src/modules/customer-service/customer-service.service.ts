import { db } from '../../core/database'
import { isManagerRole } from '../tickets/ticket.assignment'
import type { TicketActor } from '../tickets/ticket.service'

function visibleScope(actor: TicketActor) {
  if (isManagerRole(actor.role)) return {}
  if (actor.role === 'viewer') return { AND: [{ assignedToUserId: actor.userId }] }
  return { OR: [{ assignedToUserId: null }, { assignedToUserId: actor.userId }] }
}

function timeZoneOffset(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  )
  return asUtc - date.getTime()
}

function startOfTodayInAsuncion(now = new Date()) {
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Asuncion',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(dateParts.map((part) => [part.type, part.value]))
  const utcGuess = new Date(Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day)
  ))
  const firstPass = new Date(utcGuess.getTime() - timeZoneOffset(utcGuess, 'America/Asuncion'))
  return new Date(utcGuess.getTime() - timeZoneOffset(firstPass, 'America/Asuncion'))
}

export class CustomerServiceService {
  async summary(actor: TicketActor) {
    const scope = visibleScope(actor)
    const openStatuses = ['NEW', 'OPEN', 'WAITING_CUSTOMER'] as const
    const today = startOfTodayInAsuncion()
    const responseWindow = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const [openTotal, unassigned, mine, waitingCustomer, resolvedToday, responseTickets, grouped, session] =
      await Promise.all([
        db.ticket.count({
          where: { workspaceId: actor.workspaceId, ...scope, status: { in: [...openStatuses] } },
        }),
        db.ticket.count({
          where: {
            workspaceId: actor.workspaceId,
            ...scope,
            assignedToUserId: null,
            status: { in: [...openStatuses] },
          },
        }),
        db.ticket.count({
          where: {
            workspaceId: actor.workspaceId,
            assignedToUserId: actor.userId,
            status: { in: [...openStatuses] },
          },
        }),
        db.ticket.count({
          where: { workspaceId: actor.workspaceId, ...scope, status: 'WAITING_CUSTOMER' },
        }),
        db.ticket.count({
          where: {
            workspaceId: actor.workspaceId,
            ...scope,
            resolvedAt: { gte: today },
          },
        }),
        db.ticket.findMany({
          where: {
            workspaceId: actor.workspaceId,
            ...scope,
            firstResponseAt: { not: null },
            openedAt: { gte: responseWindow },
          },
          select: { openedAt: true, firstResponseAt: true },
          take: 10_000,
        }),
        db.ticket.groupBy({
          by: ['assignedToUserId'],
          where: {
            workspaceId: actor.workspaceId,
            ...scope,
            status: { in: [...openStatuses] },
          },
          _count: { _all: true },
        }),
        db.whatsAppSession.findUnique({
          where: { workspaceId: actor.workspaceId },
          select: { status: true, phoneNumber: true, pushName: true, lastConnectedAt: true, lastError: true },
        }),
      ])

    const userIds = grouped
      .map((row) => row.assignedToUserId)
      .filter((id): id is string => Boolean(id))
    const users = userIds.length
      ? await db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, avatar: true },
        })
      : []
    const usersById = new Map(users.map((user) => [user.id, user]))

    const responseMinutes = responseTickets
      .filter((ticket) => ticket.firstResponseAt)
      .map((ticket) => (ticket.firstResponseAt!.getTime() - ticket.openedAt.getTime()) / 60_000)
      .filter((minutes) => minutes >= 0)
    const avgFirstResponseMinutes = responseMinutes.length
      ? Math.round(responseMinutes.reduce((sum, value) => sum + value, 0) / responseMinutes.length)
      : null

    return {
      openTotal,
      unassigned,
      mine,
      waitingCustomer,
      resolvedToday,
      avgFirstResponseMinutes,
      byAssignee: grouped.map((row) => ({
        userId: row.assignedToUserId,
        user: row.assignedToUserId ? usersById.get(row.assignedToUserId) ?? null : null,
        count: row._count._all,
      })),
      whatsapp: session ?? {
        status: 'DISCONNECTED',
        phoneNumber: null,
        pushName: null,
        lastConnectedAt: null,
        lastError: null,
      },
    }
  }
}
