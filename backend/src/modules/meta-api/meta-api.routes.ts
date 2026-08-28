import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { config } from '../../core/config'
import { authenticate } from '../../core/auth/auth.service'
import { requireRole } from '../../core/auth/require-role'
import type { EventBus } from '../../core/event-bus'
import { NotFoundError } from '../../types'
import { InboxService } from '../inbox/inbox.service'
import type {
  ChannelConnectionInput,
  CompleteWhatsAppEmbeddedSignupCodeInput,
  CompleteWhatsAppEmbeddedSignupInput,
  RegisterWhatsAppPhoneInput,
} from '../inbox/inbox.service'
import { MetaWebhookAdapter } from '../inbox/meta.adapter'

const metaChannelSchema = z.enum(['whatsapp', 'instagram', 'messenger'])
const connectionStatusSchema = z.enum(['disconnected', 'connected', 'error'])
const jsonRecordSchema = z.record(z.unknown())

const createConnectionSchema = z.object({
  channel: metaChannelSchema,
  name: z.string().min(1).max(100),
  status: connectionStatusSchema.optional(),
  externalAccountId: z.string().min(1).max(120),
  externalAccountLabel: z.string().min(1).max(120).optional(),
  credentials: jsonRecordSchema.optional(),
  settings: jsonRecordSchema.optional(),
})

const updateConnectionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  status: connectionStatusSchema.optional(),
  externalAccountLabel: z.union([z.string().min(1).max(120), z.null()]).optional(),
  credentials: jsonRecordSchema.optional(),
  settings: jsonRecordSchema.optional(),
  lastSyncedAt: z.union([z.coerce.date(), z.null()]).optional(),
})

const registerPhoneSchema = z.object({
  pin: z.string().regex(/^\d{6}$/, 'El PIN debe tener 6 digitos'),
})

const embeddedSignupSchema = z.object({
  phoneNumberId: z.string().min(1),
  accessToken: z.string().min(1),
  businessId: z.string().optional(),
  wabaId: z.string().optional(),
  displayPhoneNumber: z.string().optional(),
  verifiedName: z.string().optional(),
  qualityRating: z.string().optional(),
  name: z.string().optional(),
})

const embeddedSignupCodeSchema = embeddedSignupSchema.omit({ accessToken: true }).extend({
  code: z.string().min(1),
  redirectUri: z.string().url().optional(),
})

function metaStatusPayload() {
  const appConfigured = Boolean(config.META_APP_ID)
  const webhookVerifyTokenConfigured = Boolean(config.META_WEBHOOK_VERIFY_TOKEN)
  const embeddedSignupConfigured = Boolean(
    config.META_APP_ID && config.META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID
  )
  const codeExchangeReady = Boolean(config.META_APP_ID && config.META_APP_SECRET)

  return {
    provider: 'meta',
    graphApiVersion: 'v23.0',
    graphBaseUrl: 'https://graph.facebook.com',
    configured: {
      appConfigured,
      webhookVerifyTokenConfigured,
      embeddedSignupConfigured,
      codeExchangeReady,
    },
    missing: [
      !config.META_WEBHOOK_VERIFY_TOKEN && 'META_WEBHOOK_VERIFY_TOKEN',
      !config.META_APP_ID && 'META_APP_ID',
      !config.META_APP_SECRET && 'META_APP_SECRET',
      !config.META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID && 'META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID',
    ].filter(Boolean),
    webhook: {
      verifyMethod: 'GET',
      receiveMethod: 'POST',
      path: '/api/v1/meta-api/webhook',
      legacyPath: '/api/v1/inbox/meta/webhook',
    },
    embeddedSignup: {
      enabled: embeddedSignupConfigured,
      codeExchangeReady,
      appId: config.META_APP_ID,
      configurationId: config.META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID,
      provider: 'meta',
      channel: 'whatsapp',
    },
    supportedChannels: [
      {
        channel: 'whatsapp',
        externalAccountId: 'Phone Number ID',
        token: 'System User Access Token o token devuelto por Embedded Signup',
        capabilities: ['webhooks', 'test_connection', 'send_text', 'send_media', 'delivery_statuses', 'phone_register'],
      },
      {
        channel: 'messenger',
        externalAccountId: 'Page ID',
        token: 'Page Access Token',
        capabilities: ['webhooks', 'test_connection', 'send_text', 'send_media'],
      },
      {
        channel: 'instagram',
        externalAccountId: 'Instagram Business Account ID',
        token: 'Page Access Token con permisos de Instagram Messaging',
        capabilities: ['webhooks', 'test_connection', 'send_text', 'send_media'],
      },
    ],
    endpoints: [
      { method: 'GET', path: '/api/v1/meta-api/status', auth: 'JWT owner/admin/member', description: 'Estado de configuracion Meta sin exponer secretos.' },
      { method: 'GET', path: '/api/v1/meta-api/connections', auth: 'JWT owner/admin', description: 'Lista conexiones Meta sanitizadas.' },
      { method: 'POST', path: '/api/v1/meta-api/connections', auth: 'JWT owner/admin', description: 'Crea una conexion Meta para WhatsApp, Messenger o Instagram.' },
      { method: 'PATCH', path: '/api/v1/meta-api/connections/:id', auth: 'JWT owner/admin', description: 'Actualiza una conexion Meta.' },
      { method: 'DELETE', path: '/api/v1/meta-api/connections/:id', auth: 'JWT owner/admin', description: 'Elimina una conexion Meta.' },
      { method: 'POST', path: '/api/v1/meta-api/connections/:id/test', auth: 'JWT owner/admin', description: 'Valida la cuenta contra Graph API.' },
      { method: 'POST', path: '/api/v1/meta-api/connections/:id/whatsapp/register', auth: 'JWT owner/admin', description: 'Registra un Phone Number ID de WhatsApp Cloud API con PIN de 6 digitos.' },
      { method: 'GET', path: '/api/v1/meta-api/embedded-signup/config', auth: 'JWT owner/admin', description: 'Devuelve la configuracion publica necesaria para Embedded Signup.' },
      { method: 'POST', path: '/api/v1/meta-api/embedded-signup/complete', auth: 'JWT owner/admin', description: 'Completa Embedded Signup cuando el frontend ya recibio accessToken.' },
      { method: 'POST', path: '/api/v1/meta-api/embedded-signup/complete-code', auth: 'JWT owner/admin', description: 'Intercambia code por accessToken en backend y crea/actualiza la conexion.' },
      { method: 'GET', path: '/api/v1/meta-api/webhook', auth: 'Publico con verify token Meta', description: 'Verificacion del webhook desde Meta.' },
      { method: 'POST', path: '/api/v1/meta-api/webhook', auth: 'Publico', description: 'Recepcion de webhooks oficiales Meta.' },
      { method: 'GET', path: '/api/v1/inbox/conversations?channel=whatsapp|messenger|instagram', auth: 'JWT owner/admin/member', description: 'Lee conversaciones normalizadas por canal.' },
      { method: 'POST', path: '/api/v1/inbox/conversations/:id/messages', auth: 'JWT owner/admin/member', description: 'Envia mensajes por la conexion Meta asociada.' },
    ],
  }
}

async function assertMetaConnection(
  service: InboxService,
  workspaceId: string,
  connectionId: string
) {
  const connections = await service.listConnections(workspaceId) as any[]
  const connection = connections.find((item) => item.id === connectionId)

  if (!connection || connection.provider !== 'meta') {
    throw new NotFoundError('Meta connection', connectionId)
  }
}

export async function metaApiRoutes(
  app: FastifyInstance,
  options: { eventBus: EventBus }
) {
  const metaAdapter = new MetaWebhookAdapter(config.META_WEBHOOK_VERIFY_TOKEN)
  const service = new InboxService(options.eventBus, {
    meta: metaAdapter,
  })

  app.get('/webhook', async (req, reply) => {
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

  app.post('/webhook', async (req, reply) => {
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

    return reply.send({
      received: true,
      processedMessages: messageResults.filter((result) => result.status === 'created').length,
      duplicateMessages: messageResults.filter((result) => result.status === 'duplicate').length,
      ignoredMessages: messageResults.filter((result) => result.status === 'ignored').length,
      processedStatuses: deliveryResults.filter((result) => result.status === 'updated').length,
      duplicateStatuses: deliveryResults.filter((result) => result.status === 'duplicate').length,
      ignoredStatuses: deliveryResults.filter((result) => result.status === 'ignored').length,
    })
  })

  app.register(async function privateMetaApiRoutes(privateApp) {
    privateApp.addHook('onRequest', async (req) => {
      await authenticate(req)
    })

    privateApp.get('/status', {
      preHandler: requireRole('owner', 'admin', 'member'),
    }, async (_req, reply) => reply.send(metaStatusPayload()))

    privateApp.get('/embedded-signup/config', {
      preHandler: requireRole('owner', 'admin'),
    }, async (_req, reply) => reply.send(metaStatusPayload().embeddedSignup))

    privateApp.get('/connections', {
      preHandler: requireRole('owner', 'admin'),
    }, async (req, reply) => {
      const ctx = req.user as { workspaceId: string }
      const connections = await service.listConnections(ctx.workspaceId)
      return reply.send((connections as any[]).filter((connection) => connection.provider === 'meta'))
    })

    privateApp.post('/connections', {
      preHandler: requireRole('owner', 'admin'),
    }, async (req, reply) => {
      const ctx = req.user as { workspaceId: string }
      const body = createConnectionSchema.parse(req.body) as Omit<ChannelConnectionInput, 'provider'>
      const connection = await service.createConnection(ctx.workspaceId, {
        ...body,
        provider: 'meta',
      })
      return reply.status(201).send(connection)
    })

    privateApp.patch<{ Params: { id: string } }>('/connections/:id', {
      preHandler: requireRole('owner', 'admin'),
    }, async (req, reply) => {
      const ctx = req.user as { workspaceId: string }
      const body = updateConnectionSchema.parse(req.body)
      await assertMetaConnection(service, ctx.workspaceId, req.params.id)
      const connection = await service.updateConnection(ctx.workspaceId, req.params.id, body)
      return reply.send(connection)
    })

    privateApp.delete<{ Params: { id: string } }>('/connections/:id', {
      preHandler: requireRole('owner', 'admin'),
    }, async (req, reply) => {
      const ctx = req.user as { workspaceId: string }
      await assertMetaConnection(service, ctx.workspaceId, req.params.id)
      await service.deleteConnection(ctx.workspaceId, req.params.id)
      return reply.code(204).send()
    })

    privateApp.post<{ Params: { id: string } }>('/connections/:id/test', {
      preHandler: requireRole('owner', 'admin'),
    }, async (req, reply) => {
      const ctx = req.user as { workspaceId: string }
      await assertMetaConnection(service, ctx.workspaceId, req.params.id)
      const result = await service.testConnection(ctx.workspaceId, req.params.id)
      return reply.send(result)
    })

    privateApp.post<{ Params: { id: string } }>('/connections/:id/whatsapp/register', {
      preHandler: requireRole('owner', 'admin'),
    }, async (req, reply) => {
      const ctx = req.user as { workspaceId: string }
      const body = registerPhoneSchema.parse(req.body) as RegisterWhatsAppPhoneInput
      await assertMetaConnection(service, ctx.workspaceId, req.params.id)
      const result = await service.registerWhatsAppPhone(ctx.workspaceId, req.params.id, body)
      return reply.send(result)
    })

    privateApp.post('/embedded-signup/complete', {
      preHandler: requireRole('owner', 'admin'),
    }, async (req, reply) => {
      const ctx = req.user as { workspaceId: string }
      const body = embeddedSignupSchema.parse(req.body) as CompleteWhatsAppEmbeddedSignupInput
      const result = await service.completeWhatsAppEmbeddedSignup(ctx.workspaceId, body)
      return reply.send(result)
    })

    privateApp.post('/embedded-signup/complete-code', {
      preHandler: requireRole('owner', 'admin'),
    }, async (req, reply) => {
      const ctx = req.user as { workspaceId: string }
      const body = embeddedSignupCodeSchema.parse(req.body) as CompleteWhatsAppEmbeddedSignupCodeInput
      const result = await service.completeWhatsAppEmbeddedSignupFromCode(ctx.workspaceId, body, {
        appId: config.META_APP_ID,
        appSecret: config.META_APP_SECRET,
      })
      return reply.send(result)
    })
  })
}
