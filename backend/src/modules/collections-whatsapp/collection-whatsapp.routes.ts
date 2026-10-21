import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../core/auth/auth.service'
import { requireRole } from '../../core/auth/require-role'
import { requireModule } from '../../core/modules/require-module'
import type { ModuleKey } from '../../core/modules/registry'
import type { WorkspaceContext } from '../../types'
import { ensureClientAccess } from '../clients/client-access'
import { WHATSAPP_OUTBOUND_FILE_MAX_BYTES } from '../whatsapp/whatsapp.manager'
import { sendWhatsAppMedia } from '../whatsapp/whatsapp.media-reply'
import { decodeOutboundFile, outboundFileSchema } from '../whatsapp/whatsapp.outbound-file'
import { reactionSchema } from '../whatsapp/whatsapp.reactions'
import { collectionWhatsAppManager, commercialWhatsAppManager, type CollectionWhatsAppManager } from './collection-whatsapp.manager'

const sendSchema = z.object({
  text: z.string().trim().max(4096).optional(),
  file: outboundFileSchema.optional(),
}).refine((value) => Boolean(value.text) || Boolean(value.file), {
  message: 'Escribí un mensaje o adjuntá un archivo.',
  path: ['text'],
})

/**
 * Rutas de un número de WhatsApp propio de un módulo: lo usa quien tenga el
 * módulo; vincular o desvincular el número es de owner/admin.
 */
function lineWhatsAppRoutes(manager: CollectionWhatsAppManager, module: ModuleKey) {
  return async (app: FastifyInstance) => {
    app.addHook('onRequest', async (req) => authenticate(req))
    app.addHook('preHandler', requireModule(module))

    app.get('/session', async (req, reply) => {
      const ctx = req.user as WorkspaceContext
      return reply.send(await manager.getSessionSnapshot(ctx.workspaceId))
    })

    app.post('/connect', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
      const ctx = req.user as WorkspaceContext
      return reply.send(await manager.connect(ctx.workspaceId))
    })

    app.post('/disconnect', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
      const ctx = req.user as WorkspaceContext
      await manager.disconnect(ctx.workspaceId)
      return reply.send(await manager.getSessionSnapshot(ctx.workspaceId))
    })

    app.get('/chats', async (req, reply) => {
      const ctx = req.user as WorkspaceContext
      const { search } = z.object({ search: z.string().trim().max(120).optional() }).parse(req.query)
      return reply.send(await manager.listChats(ctx.workspaceId, search))
    })

    app.get<{ Params: { id: string } }>('/chats/:id/messages', async (req, reply) => {
      const ctx = req.user as WorkspaceContext
      return reply.send(await manager.listMessages(ctx.workspaceId, req.params.id))
    })

    app.post<{ Params: { id: string } }>('/chats/:id/read', async (req, reply) => {
      const ctx = req.user as WorkspaceContext
      await manager.markRead(ctx.workspaceId, req.params.id)
      return reply.status(204).send()
    })

    app.patch<{ Params: { id: string } }>('/chats/:id', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
      const ctx = req.user as WorkspaceContext
      const { displayName } = z.object({ displayName: z.string().trim().min(1).max(120) }).parse(req.body)
      return reply.send(await manager.renameChat(ctx.workspaceId, req.params.id, displayName))
    })

    app.delete<{ Params: { id: string } }>('/chats/:id', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
      const ctx = req.user as WorkspaceContext
      await manager.deleteChat(ctx.workspaceId, req.params.id)
      return reply.status(204).send()
    })

    app.post<{ Params: { id: string } }>('/chats/:id/messages', {
      preHandler: requireRole('owner', 'admin', 'member'),
      bodyLimit: Math.ceil(WHATSAPP_OUTBOUND_FILE_MAX_BYTES * 1.5),
    }, async (req, reply) => {
      const ctx = req.user as WorkspaceContext
      const body = sendSchema.parse(req.body)
      const file = body.file ? decodeOutboundFile(body.file) : undefined
      return reply.status(201).send(await manager.sendMessage(ctx.workspaceId, req.params.id, ctx.userId, { text: body.text, file }))
    })

    app.put<{ Params: { id: string; messageId: string } }>('/chats/:id/messages/:messageId/reaction', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
      const ctx = req.user as WorkspaceContext
      const { emoji } = reactionSchema.parse(req.body)
      return reply.send(await manager.sendReaction(ctx.workspaceId, req.params.id, req.params.messageId, emoji))
    })

    app.post('/start', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
      const ctx = req.user as WorkspaceContext
      const { companyId } = z.object({ companyId: z.string().min(1) }).parse(req.body)
      const client = await ensureClientAccess(ctx, companyId)
      return reply.send(await manager.startChatForClient(ctx.workspaceId, client))
    })

    app.get<{ Params: { id: string } }>('/messages/:id/media', async (req, reply) => {
      const ctx = req.user as WorkspaceContext
      return sendWhatsAppMedia(reply, await manager.getMessageMedia(ctx.workspaceId, req.params.id))
    })
  }
}

/** WhatsApp propio de Cobranzas. */
export const collectionWhatsAppRoutes = lineWhatsAppRoutes(collectionWhatsAppManager, 'collections')

/** WhatsApp propio de Gestión comercial. */
export const commercialWhatsAppRoutes = lineWhatsAppRoutes(commercialWhatsAppManager, 'commercial')
