import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { config } from '../../core/config'
import { authenticate } from '../../core/auth/auth.service'
import { requireRole } from '../../core/auth/require-role'
import type { EventBus } from '../../core/event-bus'
import { InboxService } from './inbox.service'
import { MetaWebhookAdapter } from './meta.adapter'

const providerSchema = z.enum(['meta', 'tiktok'])
const channelSchema = z.enum(['whatsapp', 'instagram', 'messenger', 'tiktok'])
const connectionStatusSchema = z.enum(['disconnected', 'connected', 'error'])
const jsonRecordSchema = z.record(z.unknown())

const createConnectionSchema = z.object({
  provider: providerSchema,
  channel: channelSchema,
  name: z.string().min(1).max(100),
  status: connectionStatusSchema.optional(),
  externalAccountId: z.string().min(1).max(120),
  externalAccountLabel: z.string().min(1).max(120).optional(),
  credentials: jsonRecordSchema.optional(),
  settings: jsonRecordSchema.optional(),
}).superRefine((value, ctx) => {
  if (value.provider === 'meta' && value.channel === 'tiktok') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Meta no puede usar el canal tiktok',
      path: ['channel'],
    })
  }

  if (value.provider === 'tiktok' && value.channel !== 'tiktok') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'TikTok solo puede usar el canal tiktok',
      path: ['channel'],
    })
  }
})

const updateConnectionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  status: connectionStatusSchema.optional(),
  externalAccountLabel: z.union([z.string().min(1).max(120), z.null()]).optional(),
  credentials: jsonRecordSchema.optional(),
  settings: jsonRecordSchema.optional(),
  lastSyncedAt: z.union([z.coerce.date(), z.null()]).optional(),
})

const outboundAttachmentSchema = z.object({
  type: z.enum(['image', 'audio', 'video', 'file']),
  url: z.string().url().optional(),
  externalAssetId: z.string().min(1).max(255).optional(),
  mimeType: z.string().min(1).max(160).optional(),
  fileName: z.string().min(1).max(255).optional(),
}).superRefine((value, ctx) => {
  if (!value.url && !value.externalAssetId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'El adjunto necesita url o externalAssetId',
      path: ['url'],
    })
  }
})

const sendConversationMessageSchema = z.object({
  text: z.string().min(1).max(4096).optional(),
  replyToMessageId: z.string().min(1).optional(),
  previewUrl: z.boolean().optional(),
  attachment: outboundAttachmentSchema.optional(),
}).superRefine((value, ctx) => {
  if (!value.text?.trim() && !value.attachment) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Debes enviar texto o un adjunto',
      path: ['text'],
    })
  }
})

export async function inboxRoutes(
  app: FastifyInstance,
  options: { eventBus: EventBus }
) {
  const metaAdapter = new MetaWebhookAdapter(config.META_WEBHOOK_VERIFY_TOKEN)
  const service = new InboxService(options.eventBus, {
    meta: metaAdapter,
  })

  // Webhook publico para Meta. No lleva auth del CRM.
  app.get('/meta/webhook', async (req, reply) => {
    const result = await metaAdapter.verifyWebhook({
      headers: req.headers,
      query: req.query as Record<string, unknown>,
      body: null,
    })

    if (!result.ok || !result.challenge) {
      return reply.status(403).send({ error: 'WEBHOOK_VERIFICATION_FAILED' })
    }

    return reply.type('text/plain').send(result.challenge)
  })

  app.post('/meta/webhook', async (req, reply) => {
    const envelope = {
      headers: req.headers,
      query: req.query as Record<string, unknown>,
      body: req.body,
    }

    const [messages, deliveryEvents] = await Promise.all([
      metaAdapter.parseInbound(envelope),
      metaAdapter.parseDeliveryEvents(envelope),
    ])

    const [messageResults, deliveryResults] = await Promise.all([
      Promise.all(messages.map((message) => service.ingestInboundMessage(message))),
      Promise.all(deliveryEvents.map((event) => service.applyDeliveryEvent(event))),
    ])

    const processedMessages = messageResults.filter((result) => result.status === 'created').length
    const duplicateMessages = messageResults.filter((result) => result.status === 'duplicate').length
    const ignoredMessages = messageResults.filter((result) => result.status === 'ignored').length

    const processedStatuses = deliveryResults.filter((result) => result.status === 'updated').length
    const duplicateStatuses = deliveryResults.filter((result) => result.status === 'duplicate').length
    const ignoredStatuses = deliveryResults.filter((result) => result.status === 'ignored').length

    return reply.send({
      received: true,
      processed: processedMessages,
      duplicates: duplicateMessages,
      ignored: ignoredMessages,
      processedMessages,
      duplicateMessages,
      ignoredMessages,
      processedStatuses,
      duplicateStatuses,
      ignoredStatuses,
    })
  })

  app.register(async function privateInboxRoutes(privateApp) {
    privateApp.addHook('onRequest', async (req) => {
      await authenticate(req)
    })

    privateApp.get('/connections', {
      preHandler: requireRole('owner', 'admin'),
    }, async (req, reply) => {
      const ctx = req.user as { workspaceId: string }
      const connections = await service.listConnections(ctx.workspaceId)
      return reply.send(connections)
    })

    privateApp.post('/connections', {
      preHandler: requireRole('owner', 'admin'),
    }, async (req, reply) => {
      const ctx = req.user as { workspaceId: string }
      const body = createConnectionSchema.parse(req.body) as Parameters<typeof service.createConnection>[1]
      const connection = await service.createConnection(ctx.workspaceId, body)
      return reply.status(201).send(connection)
    })

    privateApp.patch<{ Params: { id: string } }>('/connections/:id', {
      preHandler: requireRole('owner', 'admin'),
    }, async (req, reply) => {
      const ctx = req.user as { workspaceId: string }
      const body = updateConnectionSchema.parse(req.body)
      const connection = await service.updateConnection(ctx.workspaceId, req.params.id, body)
      return reply.send(connection)
    })

    privateApp.post<{ Params: { id: string } }>('/connections/:id/test', {
      preHandler: requireRole('owner', 'admin'),
    }, async (req, reply) => {
      const ctx = req.user as { workspaceId: string }
      const result = await service.testConnection(ctx.workspaceId, req.params.id)
      return reply.send(result)
    })

    privateApp.delete<{ Params: { id: string } }>('/connections/:id', {
      preHandler: requireRole('owner', 'admin'),
    }, async (req, reply) => {
      const ctx = req.user as { workspaceId: string }
      await service.deleteConnection(ctx.workspaceId, req.params.id)
      return reply.code(204).send()
    })

    privateApp.get('/conversations', {
      preHandler: requireRole('owner', 'admin', 'member'),
    }, async (req, reply) => {
      const ctx = req.user as { workspaceId: string }
      const filters = z.object({
        channel: channelSchema.optional(),
        status: z.string().optional(),
        page: z.coerce.number().min(0).default(0),
        limit: z.coerce.number().min(1).max(100).default(25),
      }).parse(req.query)

      const conversations = await service.listConversations(ctx.workspaceId, filters)
      return reply.send(conversations)
    })

    privateApp.get<{ Params: { id: string } }>('/conversations/:id/messages', {
      preHandler: requireRole('owner', 'admin', 'member'),
    }, async (req, reply) => {
      const ctx = req.user as { workspaceId: string }
      const filters = z.object({
        page: z.coerce.number().min(0).default(0),
        limit: z.coerce.number().min(1).max(100).default(50),
      }).parse(req.query)

      const messages = await service.listMessages(ctx.workspaceId, req.params.id, filters)
      return reply.send(messages)
    })

    privateApp.post<{ Params: { id: string } }>('/conversations/:id/read', {
      preHandler: requireRole('owner', 'admin', 'member'),
    }, async (req, reply) => {
      const ctx = req.user as { workspaceId: string }
      await service.markConversationAsRead(ctx.workspaceId, req.params.id)
      return reply.code(204).send()
    })

    privateApp.post<{ Params: { id: string } }>('/conversations/:id/messages', {
      preHandler: requireRole('owner', 'admin', 'member'),
    }, async (req, reply) => {
      const ctx = req.user as { workspaceId: string }
      const body = sendConversationMessageSchema.parse(req.body) as Parameters<typeof service.sendConversationMessage>[2]
      const message = await service.sendConversationMessage(ctx.workspaceId, req.params.id, body)
      return reply.status(201).send(message)
    })
  })
}
