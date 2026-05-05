import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../core/auth/auth.service'
import { requireRole } from '../../core/auth/require-role'
import { config } from '../../core/config'
import { ValidationError } from '../../types'
import { WHATSAPP_OUTBOUND_FILE_MAX_BYTES, whatsAppManager } from './whatsapp.manager'

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

const outboundFileSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(160),
  dataBase64: z.string().min(1).max(Math.ceil(WHATSAPP_OUTBOUND_FILE_MAX_BYTES * 1.4)),
})

const sendMessageSchema = z.object({
  text: z.string().trim().max(4096).optional(),
  file: outboundFileSchema.optional(),
}).superRefine((value, ctx) => {
  if (!value.text?.trim() && !value.file) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Debes enviar texto o un archivo',
      path: ['text'],
    })
  }
})

const updateChatSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
})

const maintenanceQuerySchema = z.object({
  days: z.coerce.number().min(1).max(30).default(2),
})

function isLocalRequest(ip?: string | null) {
  if (!ip) return false
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)
}

function decodeOutboundFile(file: z.infer<typeof outboundFileSchema>) {
  const normalizedBase64 = file.dataBase64
    .replace(/^data:[^;]+;base64,/i, '')
    .replace(/\s/g, '')

  if (!/^[a-zA-Z0-9+/]+={0,2}$/.test(normalizedBase64)) {
    throw new ValidationError('Archivo invalido: base64 no valido')
  }

  const buffer = Buffer.from(normalizedBase64, 'base64')
  if (!buffer.length) {
    throw new ValidationError('Archivo invalido: contenido vacio')
  }

  if (buffer.length > WHATSAPP_OUTBOUND_FILE_MAX_BYTES) {
    throw new ValidationError('El archivo supera el limite de 8 MB')
  }

  return {
    fileName: file.fileName,
    mimeType: file.mimeType,
    buffer,
    sizeBytes: buffer.length,
  }
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

  app.patch<{ Params: { jid: string } }>('/chats/:jid', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const jid = decodeURIComponent(req.params.jid)
    const body = updateChatSchema.parse(req.body) as { displayName: string }
    return reply.send(await whatsAppManager.updateChat(ctx.workspaceId, jid, body))
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

  app.post<{ Params: { jid: string } }>('/chats/:jid/messages', {
    preHandler: requireRole('owner', 'admin', 'member'),
    bodyLimit: Math.ceil(WHATSAPP_OUTBOUND_FILE_MAX_BYTES * 1.5),
  }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const jid = decodeURIComponent(req.params.jid)
    const body = sendMessageSchema.parse(req.body)
    return reply.status(201).send(await whatsAppManager.sendChatMessage(ctx.workspaceId, jid, {
      text: body.text,
      file: body.file ? decodeOutboundFile(body.file) : undefined,
    }))
  })
}
