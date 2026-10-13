import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../core/auth/auth.service'
import { requireRole } from '../../core/auth/require-role'
import { requireModule } from '../../core/modules/require-module'
import type { WorkspaceContext } from '../../types'
import { ensureClientAccess } from '../clients/client-access'
import { WHATSAPP_OUTBOUND_FILE_MAX_BYTES } from '../whatsapp/whatsapp.manager'
import { decodeOutboundFile, outboundFileSchema } from '../whatsapp/whatsapp.outbound-file'
import { collectionWhatsAppManager } from './collection-whatsapp.manager'

const sendSchema = z.object({
  text: z.string().trim().max(4096).optional(),
  file: outboundFileSchema.optional(),
}).refine((value) => Boolean(value.text) || Boolean(value.file), {
  message: 'Escribí un mensaje o adjuntá un archivo.',
  path: ['text'],
})

const INLINE_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/mp4', 'video/mp4', 'video/webm'])

/** WhatsApp propio de Cobranzas: lo usa quien tenga el módulo; vincular el número es de owner/admin. */
export async function collectionWhatsAppRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req) => authenticate(req))
  app.addHook('preHandler', requireModule('collections'))

  app.get('/session', async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    return reply.send(await collectionWhatsAppManager.getSessionSnapshot(ctx.workspaceId))
  })

  app.post('/connect', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    return reply.send(await collectionWhatsAppManager.connect(ctx.workspaceId))
  })

  app.post('/disconnect', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    await collectionWhatsAppManager.disconnect(ctx.workspaceId)
    return reply.send(await collectionWhatsAppManager.getSessionSnapshot(ctx.workspaceId))
  })

  app.get('/chats', async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { search } = z.object({ search: z.string().trim().max(120).optional() }).parse(req.query)
    return reply.send(await collectionWhatsAppManager.listChats(ctx.workspaceId, search))
  })

  app.get<{ Params: { id: string } }>('/chats/:id/messages', async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    return reply.send(await collectionWhatsAppManager.listMessages(ctx.workspaceId, req.params.id))
  })

  app.post<{ Params: { id: string } }>('/chats/:id/read', async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    await collectionWhatsAppManager.markRead(ctx.workspaceId, req.params.id)
    return reply.status(204).send()
  })

  app.delete<{ Params: { id: string } }>('/chats/:id', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    await collectionWhatsAppManager.deleteChat(ctx.workspaceId, req.params.id)
    return reply.status(204).send()
  })

  app.post<{ Params: { id: string } }>('/chats/:id/messages', {
    preHandler: requireRole('owner', 'admin', 'member'),
    bodyLimit: Math.ceil(WHATSAPP_OUTBOUND_FILE_MAX_BYTES * 1.5),
  }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const body = sendSchema.parse(req.body)
    const file = body.file ? decodeOutboundFile(body.file) : undefined
    return reply.status(201).send(await collectionWhatsAppManager.sendMessage(ctx.workspaceId, req.params.id, ctx.userId, { text: body.text, file }))
  })

  app.post('/start', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { companyId } = z.object({ companyId: z.string().min(1) }).parse(req.body)
    const client = await ensureClientAccess(ctx, companyId)
    return reply.send(await collectionWhatsAppManager.startChatForClient(ctx.workspaceId, client))
  })

  app.get<{ Params: { id: string } }>('/messages/:id/media', async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const media = await collectionWhatsAppManager.getMessageMedia(ctx.workspaceId, req.params.id)
    const mediaType = media.mimeType.toLowerCase().split(';', 1)[0].trim()
    const inline = INLINE_MEDIA_TYPES.has(mediaType)
    const fileName = media.fileName.replace(/[\\\r\n"]/g, '').trim() || 'archivo'
    reply.header('Cache-Control', 'private, max-age=300')
    reply.header('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${fileName}"`)
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('Content-Security-Policy', "sandbox; default-src 'none'")
    return reply.type(inline ? mediaType : 'application/octet-stream').send(media.buffer)
  })
}
