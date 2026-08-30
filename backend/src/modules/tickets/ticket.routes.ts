import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { EventBus } from '../../core/event-bus'
import { authenticate } from '../../core/auth/auth.service'
import { requireRole } from '../../core/auth/require-role'
import { whatsAppManager } from '../whatsapp/whatsapp.manager'
import { configureTicketEvents } from './ticket.events'
import { TicketService, type TicketActor } from './ticket.service'

const listSchema = z.object({
  inbox: z.enum(['free', 'mine', 'all']).default('all'),
  search: z.string().trim().max(120).optional(),
  status: z.enum(['NEW', 'OPEN', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  page: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

const assignSchema = z.object({
  assignedToUserId: z.string().nullable(),
})

const statusSchema = z.object({
  status: z.enum(['NEW', 'OPEN', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED']),
})

const updateSchema = z.object({
  subject: z.string().trim().min(1).max(200).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  category: z.string().trim().max(80).nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
}).refine((value) => Object.values(value).some((item) => item !== undefined), {
  message: 'Debes indicar al menos un campo para actualizar.',
})

const replySchema = z.object({
  text: z.string().trim().min(1).max(4096),
})

const commentSchema = z.object({
  body: z.string().trim().min(1).max(5000),
})

export async function ticketRoutes(
  app: FastifyInstance,
  options: { eventBus: EventBus }
) {
  configureTicketEvents(options.eventBus)
  const service = new TicketService()

  app.addHook('onRequest', async (req) => {
    await authenticate(req)
  })

  app.get('/', async (req, reply) => {
    const actor = req.user as TicketActor
    const filters = listSchema.parse(req.query)
    return reply.send(await service.list(actor, filters))
  })

  app.get<{ Params: { id: string } }>('/:id/comments', async (req, reply) => {
    const actor = req.user as TicketActor
    return reply.send(await service.listComments(actor, req.params.id))
  })

  app.get<{ Params: { id: string } }>('/:id/messages', async (req, reply) => {
    const actor = req.user as TicketActor
    const query = z.object({
      page: z.coerce.number().int().min(0).default(0),
      limit: z.coerce.number().int().min(1).max(100).default(100),
    }).parse(req.query)
    return reply.send(await service.listMessages(actor, req.params.id, query.page, query.limit))
  })

  app.post<{ Params: { id: string } }>(
    '/:id/comments',
    { preHandler: requireRole('owner', 'admin', 'member') },
    async (req, reply) => {
      const actor = req.user as TicketActor
      const body = commentSchema.parse(req.body)
      return reply.status(201).send(await service.addComment(actor, req.params.id, body.body))
    }
  )

  app.patch<{ Params: { id: string } }>(
    '/:id/assign',
    { preHandler: requireRole('owner', 'admin', 'member') },
    async (req, reply) => {
      const actor = req.user as TicketActor
      const body = assignSchema.parse(req.body)
      return reply.send(await service.assign(actor, req.params.id, body.assignedToUserId))
    }
  )

  app.patch<{ Params: { id: string } }>(
    '/:id/status',
    { preHandler: requireRole('owner', 'admin', 'member') },
    async (req, reply) => {
      const actor = req.user as TicketActor
      const body = statusSchema.parse(req.body)
      return reply.send(await service.updateStatus(actor, req.params.id, body.status))
    }
  )

  app.patch<{ Params: { id: string } }>(
    '/:id',
    { preHandler: requireRole('owner', 'admin', 'member') },
    async (req, reply) => {
      const actor = req.user as TicketActor
      const body = updateSchema.parse(req.body)
      return reply.send(await service.updateDetails(actor, req.params.id, body))
    }
  )

  app.post<{ Params: { id: string } }>(
    '/:id/reply',
    { preHandler: requireRole('owner', 'admin', 'member') },
    async (req, reply) => {
      const actor = req.user as TicketActor
      const body = replySchema.parse(req.body)
      const { ticket, operationId } = await service.prepareReply(actor, req.params.id, body.text)
      let message
      try {
        message = await whatsAppManager.sendChatMessage(
          actor.workspaceId,
          ticket.whatsappChat!.jid,
          actor,
          { text: body.text, ticketId: ticket.id }
        )
      } catch (error) {
        await service.markReplyFailed(
          actor,
          ticket.id,
          operationId,
          error instanceof Error ? error.message : 'Error desconocido'
        )
        throw error
      }
      return reply.status(201).send(await service.recordReply(actor, ticket, message, operationId))
    }
  )

  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const actor = req.user as TicketActor
    return reply.send(await service.findById(actor, req.params.id))
  })
}
