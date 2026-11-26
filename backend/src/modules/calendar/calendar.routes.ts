import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../core/auth/auth.service'
import { requireRole } from '../../core/auth/require-role'
import { db } from '../../core/database'
import { requireModule } from '../../core/modules/require-module'
import { NotFoundError, type WorkspaceContext } from '../../types'
import { dealVisibilityWhere } from '../deals/deal-access'
import { readCommercialChatId } from '../deals/commercial-lead'
import { readSocialConversationId, networkOfChannel } from '../social/social-lead'
import { isAssignmentManager } from '../social/chat-assignment'

const MAX_RANGE_DAYS = 120

/**
 * Calendario: una fecha agendada por lead (visita, llamada…). Se elige desde el chat o el lead
 * y se ve en la sección Calendario. Cada persona ve las fechas de los leads que puede ver.
 */
export async function calendarRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req) => authenticate(req))
  // La fecha se elige desde Mensajes (chats y leads) y se ve en Calendario.
  app.addHook('preHandler', requireModule('calendar', 'messages', 'commercial'))

  app.get('/', async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const q = z.object({ from: z.coerce.date(), to: z.coerce.date(), assignee: z.string().min(1).optional() }).parse(req.query)
    const to = new Date(Math.min(q.to.getTime(), q.from.getTime() + MAX_RANGE_DAYS * 86_400_000))
    const appointments = await db.appointment.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        startsAt: { gte: q.from, lt: to },
        deal: { isArchived: false, ...dealVisibilityWhere(ctx) },
        ...(q.assignee ? { assignedToUserId: q.assignee === 'free' ? null : q.assignee } : {}),
      },
      orderBy: { startsAt: 'asc' },
      select: {
        id: true, startsAt: true, note: true, assignedToUserId: true,
        assignedTo: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        deal: { select: { id: true, title: true, leadNumber: true, customData: true, stage: { select: { name: true, color: true } } } },
      },
    })
    // De qué red viene cada lead, para el ícono y para abrir el chat correcto.
    const socialIds = appointments.map((a) => readSocialConversationId(a.deal.customData)).filter((id): id is string => Boolean(id))
    const channels = new Map((socialIds.length ? await db.conversation.findMany({ where: { id: { in: socialIds } }, select: { id: true, channel: true } }) : []).map((c) => [c.id, c.channel]))
    return reply.send({
      appointments: appointments.map(({ deal, ...appointment }) => {
        const socialId = readSocialConversationId(deal.customData)
        const commercialChatId = readCommercialChatId(deal.customData)
        return {
          ...appointment,
          deal: { id: deal.id, title: deal.title, leadNumber: deal.leadNumber, stage: deal.stage },
          network: socialId ? networkOfChannel(channels.get(socialId) ?? '') : commercialChatId ? 'whatsapp' : null,
          chatId: socialId ?? commercialChatId,
        }
      }),
    })
  })

  app.put<{ Params: { dealId: string } }>('/deals/:dealId', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const body = z.object({ startsAt: z.coerce.date(), note: z.string().trim().max(200).nullish() }).parse(req.body)
    const deal = await db.deal.findFirst({ where: { id: req.params.dealId, workspaceId: ctx.workspaceId, isArchived: false, ...dealVisibilityWhere(ctx) }, select: { id: true, ownerId: true } })
    if (!deal) throw new NotFoundError('Lead', req.params.dealId)
    // Un vendedor no agenda leads de otra persona (sólo libres o propios: los que ve).
    const assignedToUserId = deal.ownerId ?? (isAssignmentManager(ctx) ? null : ctx.userId)
    const appointment = await db.appointment.upsert({
      where: { dealId: deal.id },
      create: { workspaceId: ctx.workspaceId, dealId: deal.id, startsAt: body.startsAt, note: body.note || null, assignedToUserId, createdByUserId: ctx.userId },
      update: { startsAt: body.startsAt, note: body.note === undefined ? undefined : body.note || null, assignedToUserId },
      select: { id: true, dealId: true, startsAt: true, note: true, assignedToUserId: true },
    })
    return reply.send(appointment)
  })

  app.delete<{ Params: { dealId: string } }>('/deals/:dealId', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const deal = await db.deal.findFirst({ where: { id: req.params.dealId, workspaceId: ctx.workspaceId, ...dealVisibilityWhere(ctx) }, select: { id: true } })
    if (!deal) throw new NotFoundError('Lead', req.params.dealId)
    await db.appointment.deleteMany({ where: { dealId: deal.id } })
    return reply.code(204).send()
  })
}
