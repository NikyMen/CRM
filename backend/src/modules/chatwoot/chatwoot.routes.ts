import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../core/auth/auth.service'
import { requireRole } from '../../core/auth/require-role'
import { ChatwootService } from './chatwoot.service'

const channelSchema = z.enum(['all', 'messenger', 'instagram']).default('all')
const statusSchema = z.enum(['all', 'open', 'resolved', 'pending', 'snoozed']).default('open')

export async function chatwootRoutes(app: FastifyInstance) {
  const service = new ChatwootService()

  app.addHook('onRequest', async (req) => {
    await authenticate(req)
  })

  app.get('/status', {
    preHandler: requireRole('owner', 'admin', 'member'),
  }, async (_req, reply) => {
    const status = await service.getStatus()
    return reply.send(status)
  })

  app.get('/inboxes', {
    preHandler: requireRole('owner', 'admin', 'member'),
  }, async (_req, reply) => {
    const inboxes = await service.listInboxes()
    return reply.send(inboxes)
  })

  app.get('/conversations', {
    preHandler: requireRole('owner', 'admin', 'member'),
  }, async (req, reply) => {
    const filters = z.object({
      channel: channelSchema,
      status: statusSchema,
      q: z.string().max(120).optional(),
      page: z.coerce.number().min(0).default(0),
      limit: z.coerce.number().min(1).max(100).default(50),
    }).parse(req.query)

    const conversations = await service.listConversations(filters)
    return reply.send(conversations)
  })

  app.get<{ Params: { id: string } }>('/conversations/:id/messages', {
    preHandler: requireRole('owner', 'admin', 'member'),
  }, async (req, reply) => {
    const conversationId = z.coerce.number().int().positive().parse(req.params.id)
    const filters = z.object({
      before: z.coerce.number().int().positive().optional(),
      after: z.coerce.number().int().positive().optional(),
    }).parse(req.query)

    const messages = await service.listMessages(conversationId, filters)
    return reply.send(messages)
  })

  app.post<{ Params: { id: string } }>('/conversations/:id/messages', {
    preHandler: requireRole('owner', 'admin', 'member'),
  }, async (req, reply) => {
    const conversationId = z.coerce.number().int().positive().parse(req.params.id)
    const body = z.object({
      content: z.string().min(1).max(4096),
    }).parse(req.body)

    const message = await service.sendMessage(conversationId, body.content)
    return reply.status(201).send(message)
  })
}
