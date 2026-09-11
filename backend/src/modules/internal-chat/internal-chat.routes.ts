import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../core/auth/auth.service'
import { config } from '../../core/config'
import { sseCorsHeaders } from '../../core/cors'
import { internalChatRealtime } from './internal-chat.events'
import { InternalChatService } from './internal-chat.service'

const messageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
})

const messagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(60),
  cursor: z.string().min(1).optional(),
})

export async function internalChatRoutes(app: FastifyInstance) {
  const service = new InternalChatService()
  app.addHook('onRequest', authenticate)

  app.get('/members', async (req, reply) => {
    const ctx = req.user as { workspaceId: string; userId: string }
    return reply.send(await service.listMembers(ctx))
  })

  app.get('/conversations', async (req, reply) => {
    const ctx = req.user as { workspaceId: string; userId: string }
    return reply.send(await service.listConversations(ctx))
  })

  app.post('/conversations/direct', async (req, reply) => {
    const ctx = req.user as { workspaceId: string; userId: string }
    const { userId } = z.object({ userId: z.string().min(1) }).parse(req.body)
    return reply.status(201).send(await service.createDirectConversation(ctx, userId))
  })

  app.get<{ Params: { id: string } }>('/conversations/:id/messages', async (req, reply) => {
    const ctx = req.user as { workspaceId: string; userId: string }
    const query = messagesQuerySchema.parse(req.query)
    return reply.send(await service.listMessages(ctx, req.params.id, query.limit, query.cursor))
  })

  app.post<{ Params: { id: string } }>('/conversations/:id/messages', async (req, reply) => {
    const ctx = req.user as { workspaceId: string; userId: string }
    const { body } = messageSchema.parse(req.body)
    const { message, audienceUserIds } = await service.sendMessage(ctx, req.params.id, body)
    internalChatRealtime.publish(ctx.workspaceId, {
      type: 'internal-chat.updated',
      conversationId: req.params.id,
      senderId: ctx.userId,
      audienceUserIds,
    })
    return reply.status(201).send(message)
  })

  app.post<{ Params: { id: string } }>('/conversations/:id/read', async (req, reply) => {
    const ctx = req.user as { workspaceId: string; userId: string }
    const { messageId } = z.object({ messageId: z.string().min(1).optional() }).parse(req.body ?? {})
    await service.markRead(ctx, req.params.id, messageId)
    return reply.status(204).send()
  })

  app.get('/events', async (req, reply) => {
    const ctx = req.user as { workspaceId: string; userId: string }
    reply.hijack()
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...sseCorsHeaders(req.headers.origin, config.FRONTEND_URL),
    })
    reply.raw.write(': connected\n\n')

    const unsubscribe = internalChatRealtime.subscribe(ctx.workspaceId, (event) => {
      if (!reply.raw.destroyed && (!event.audienceUserIds || event.audienceUserIds.includes(ctx.userId))) {
        const { audienceUserIds: _audience, ...visibleEvent } = event
        reply.raw.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(visibleEvent)}\n\n`)
      }
    })
    const heartbeat = setInterval(() => {
      if (!reply.raw.destroyed) reply.raw.write(': heartbeat\n\n')
    }, 20_000)
    req.raw.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
    })
    return reply
  })
}
