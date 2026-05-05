import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../core/auth/auth.service'
import { requireRole } from '../../core/auth/require-role'
import { config } from '../../core/config'
import { whatsAppManager } from './whatsapp.manager'

const connectSchema = z.object({
  mode: z.literal('qr').optional().default('qr'),
})

const chatQuerySchema = z.object({
  search: z.string().optional(),
})

const messagesQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(120).default(60),
})

const historyQuerySchema = z.object({
  count: z.coerce.number().min(10).max(120).default(40),
})

const sendMessageSchema = z.object({
  text: z.string().trim().min(1).max(4096),
})

const maintenanceQuerySchema = z.object({
  days: z.coerce.number().min(1).max(30).default(2),
})

function isLocalRequest(ip?: string | null) {
  if (!ip) return false
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)
}

export async function whatsappRoutes(app: FastifyInstance) {
  const maintenancePath = '/maintenance/repair-and-prune'

  if (config.NODE_ENV === 'development') {
    app.get(maintenancePath, async (req, reply) => {
      if (!isLocalRequest(req.ip)) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'Esta ruta de mantenimiento solo acepta llamadas locales en desarrollo.',
        })
      }

      const query = maintenanceQuerySchema.parse(req.query)
      return reply.send(await whatsAppManager.repairSchemaAndPruneOldMessages(query.days))
    })
  }

  app.addHook('onRequest', async (req) => {
    if (config.NODE_ENV === 'development' && req.url.includes(maintenancePath)) {
      return
    }
    await authenticate(req)
  })

  app.get('/session', async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    return reply.send(await whatsAppManager.getSessionSnapshot(ctx.workspaceId))
  })

  app.post('/connect', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const body = connectSchema.parse(req.body)
    return reply.send(await whatsAppManager.connect(ctx.workspaceId, {
      mode: body.mode,
    }))
  })

  app.post('/disconnect', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    await whatsAppManager.disconnect(ctx.workspaceId)
    return reply.status(204).send()
  })

  app.get('/chats', async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const query = chatQuerySchema.parse(req.query)
    return reply.send(await whatsAppManager.listChats(ctx.workspaceId, query.search))
  })

  app.get<{ Params: { jid: string } }>('/chats/:jid/messages', async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const query = messagesQuerySchema.parse(req.query)
    const jid = decodeURIComponent(req.params.jid)
    return reply.send(await whatsAppManager.listMessages(ctx.workspaceId, jid, query.limit))
  })

  app.delete<{ Params: { jid: string } }>('/chats/:jid', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const jid = decodeURIComponent(req.params.jid)
    await whatsAppManager.deleteChat(ctx.workspaceId, jid)
    return reply.status(204).send()
  })

  app.get<{ Params: { messageId: string } }>('/messages/:messageId/media', async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const media = await whatsAppManager.getMessageMedia(ctx.workspaceId, req.params.messageId)
    reply.header('Cache-Control', 'private, max-age=300')
    reply.header('Content-Disposition', `inline; filename="${media.fileName.replace(/"/g, '')}"`)
    return reply.type(media.mimeType).send(media.buffer)
  })

  app.post<{ Params: { jid: string } }>('/chats/:jid/history', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const query = historyQuerySchema.parse(req.query)
    const jid = decodeURIComponent(req.params.jid)
    return reply.status(202).send(await whatsAppManager.requestHistorySync(ctx.workspaceId, jid, query.count))
  })

  app.post<{ Params: { jid: string } }>('/chats/:jid/messages', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const jid = decodeURIComponent(req.params.jid)
    const body = sendMessageSchema.parse(req.body)
    return reply.status(201).send(await whatsAppManager.sendTextMessage(ctx.workspaceId, jid, body.text))
  })
}
