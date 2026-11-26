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
import { findCommercialLeadByChat } from '../deals/commercial-lead-stage'
import { dealVisibilityWhere } from '../deals/deal-access'
import { forceAssistantReply, setAssistantPaused } from './commercial-assistant'
import { db } from '../../core/database'
import { NotFoundError } from '../../types'
import { assertAssignAllowed, assertAssignableMember, assignmentVisibility, canSeeAssignee, lineAssignmentEnabled, syncLeadOwner } from '../social/chat-assignment'

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
function lineWhatsAppRoutes(manager: CollectionWhatsAppManager, ...modules: ModuleKey[]) {
  return async (app: FastifyInstance) => {
    app.addHook('onRequest', async (req) => authenticate(req))
    app.addHook('preHandler', requireModule(...modules))

    // Con responsables (bandeja de Mensajes) cada persona sólo abre los chats que puede ver.
    const assignment = manager.line === 'commercial'
    const assignmentOn = async (ctx: WorkspaceContext) => assignment && await lineAssignmentEnabled(ctx)
    app.addHook('preHandler', async (req) => {
      const chatId = (req.params as { id?: string } | undefined)?.id
      if (!chatId || !req.routeOptions.url?.includes('/chats/:id')) return
      const ctx = req.user as WorkspaceContext
      if (!(await assignmentOn(ctx))) return
      const chat = await db.collectionWhatsAppChat.findFirst({ where: { id: chatId, workspaceId: ctx.workspaceId, line: manager.line }, select: { assignedToUserId: true } })
      if (!chat || !canSeeAssignee(ctx, chat.assignedToUserId)) throw new NotFoundError('Chat', chatId)
    })

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
      return reply.send(await manager.listChats(ctx.workspaceId, search, await assignmentOn(ctx) ? assignmentVisibility(ctx) : {}))
    })

    app.get<{ Params: { id: string } }>('/chats/:id/messages', async (req, reply) => {
      const ctx = req.user as WorkspaceContext
      return reply.send(await manager.listMessages(ctx.workspaceId, req.params.id))
    })

    // Lead del tablero vinculado al chat comercial: etapa actual y columnas, para cambiarla
    // desde el chat (el cambio en sí usa PATCH /deals/:id/move, con sus permisos).
    if (manager.line === 'commercial') {
      app.get<{ Params: { id: string } }>('/chats/:id/lead', async (req, reply) => {
        const ctx = req.user as WorkspaceContext
        const lead = await findCommercialLeadByChat(ctx.workspaceId, req.params.id, dealVisibilityWhere(ctx))
        if (!lead) return reply.send({ lead: null })
        return reply.send({
          lead: {
            id: lead.id,
            leadNumber: lead.leadNumber,
            title: lead.title,
            stageId: lead.stageId,
            stages: lead.pipeline.stages,
            appointmentAt: lead.appointment?.startsAt ?? null,
            canMove: ctx.role !== 'viewer',
          },
        })
      })

      // «Atiende una persona» / «Atiende el asistente»: el asistente de n8n no responde mientras
      // una persona tenga el chat.
      app.put<{ Params: { id: string } }>('/chats/:id/assistant', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
        const ctx = req.user as WorkspaceContext
        const { paused } = z.object({ paused: z.boolean() }).parse(req.body)
        return reply.send(await setAssistantPaused(ctx.workspaceId, req.params.id, paused))
      })

      // «Forzar IA»: el asistente contesta ya lo que el cliente escribió sin respuesta.
      app.post<{ Params: { id: string } }>('/chats/:id/assistant/force', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
        const ctx = req.user as WorkspaceContext
        return reply.send(await forceAssistantReply(ctx.workspaceId, req.params.id))
      })
    }

    if (assignment) {
      // Responsable del chat: el lead del tablero lo sigue.
      app.put<{ Params: { id: string } }>('/chats/:id/assignee', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
        const ctx = req.user as WorkspaceContext
        const { assignedToUserId } = z.object({ assignedToUserId: z.string().min(1).nullable() }).parse(req.body)
        const chat = await manager.getChat(ctx.workspaceId, req.params.id)
        assertAssignAllowed(ctx, chat.assignedToUserId, assignedToUserId)
        await assertAssignableMember(ctx.workspaceId, assignedToUserId)
        const updated = await manager.assignChat(ctx.workspaceId, chat.id, chat.assignedToUserId, assignedToUserId)
        await syncLeadOwner(ctx.workspaceId, 'commercialChatId', chat.id, assignedToUserId)
        return reply.send(updated)
      })
    }

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
      const sent = await manager.sendMessage(ctx.workspaceId, req.params.id, ctx.userId, { text: body.text, file })
      // Quien responde un chat libre se lo queda, como al tomar un ticket.
      if (await assignmentOn(ctx)) {
        const taken = await db.collectionWhatsAppChat.updateMany({ where: { id: req.params.id, workspaceId: ctx.workspaceId, assignedToUserId: null }, data: { assignedToUserId: ctx.userId, assignedAt: new Date() } })
        if (taken.count) await syncLeadOwner(ctx.workspaceId, 'commercialChatId', req.params.id, ctx.userId)
      }
      return reply.status(201).send(sent)
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
export const commercialWhatsAppRoutes = lineWhatsAppRoutes(commercialWhatsAppManager, 'commercial', 'messages', 'whatsapp')
