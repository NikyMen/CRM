import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../core/auth/auth.service'
import { requireRole } from '../../core/auth/require-role'
import { config } from '../../core/config'
import type { EventBus } from '../../core/event-bus'
import { requireModule } from '../../core/modules/require-module'
import { AppError, type WorkspaceContext } from '../../types'
import { InboxService } from '../inbox/inbox.service'
import { MetaWebhookAdapter } from '../inbox/meta.adapter'
import { decodeOutboundFile, outboundFileSchema } from '../whatsapp/whatsapp.outbound-file'
import { ensureSocialLead, networkOfChannel } from './social-lead'
import { SOCIAL_POST_IMAGE_MAX_BYTES, SocialService, verifyPostImageSignature } from './social.service'

const networkSchema = z.enum(['instagram', 'facebook'])
const captionSchema = z.string().trim().min(1, 'Escribí el texto de la publicación.').max(2200, 'Instagram admite hasta 2.200 caracteres.')

/**
 * Redes sociales de la bandeja de Mensajes: conversaciones de Instagram y de Facebook
 * (Messenger) y publicaciones de Instagram. Reutiliza el módulo de bandeja de Meta
 * (`modules/inbox`); el webhook que recibe los mensajes sigue siendo el de ese módulo
 * y sólo se registra con ENABLE_LEGACY_CHANNELS=true.
 */
export async function socialRoutes(app: FastifyInstance, options: { eventBus: EventBus }) {
  const inbox = new InboxService(options.eventBus, { meta: new MetaWebhookAdapter(config.META_WEBHOOK_VERIFY_TOKEN) })
  const service = new SocialService(inbox)

  // Cada conversación nueva de Instagram o Facebook entra al tablero como lead.
  options.eventBus.on('message.received', (payload) => {
    const event = payload as { workspaceId?: string; conversationId?: string; channel?: string }
    if (!event.workspaceId || !event.conversationId || !networkOfChannel(event.channel ?? '')) return
    ensureSocialLead(event.workspaceId, event.conversationId).catch((error) => app.log.error({ err: error }, 'No se pudo crear el lead de la conversación social'))
  })

  // Imagen de una publicación para que Meta la descargue al publicar. Sin sesión: va firmada.
  app.get<{ Params: { id: string }; Querystring: { sig?: string } }>('/public/posts/:id/image.jpg', async (req, reply) => {
    if (!verifyPostImageSignature(req.params.id, req.query.sig)) throw new AppError(404, 'Imagen no encontrada', 'NOT_FOUND')
    const image = await service.getPostImage(null, req.params.id)
    return reply.header('content-type', image.mimeType).header('cache-control', 'public, max-age=300').send(image.buffer)
  })

  app.register(async (privateApp) => {
    privateApp.addHook('onRequest', async (req) => authenticate(req))
    privateApp.addHook('preHandler', requireModule('messages', 'instagram', 'facebook'))
    const manage = { preHandler: requireRole('owner', 'admin') }
    const write = { preHandler: requireRole('owner', 'admin', 'member') }

    privateApp.get('/status', async (req, reply) => reply.send(await service.getStatus(req.user as WorkspaceContext)))

    privateApp.post('/connections', manage, async (req, reply) => {
      const body = z.object({
        network: networkSchema,
        accountId: z.string().trim().regex(/^\d{5,30}$/, 'El ID de la cuenta son sólo números.'),
        accessToken: z.string().trim().min(20, 'Pegá el token de acceso completo.').max(1000),
        name: z.string().trim().max(100).optional(),
      }).parse(req.body)
      return reply.status(201).send(await service.connect(req.user as WorkspaceContext, body as Parameters<typeof service.connect>[1]))
    })

    privateApp.delete<{ Params: { network: string } }>('/connections/:network', manage, async (req, reply) =>
      reply.send(await service.disconnect(req.user as WorkspaceContext, networkSchema.parse(req.params.network))))

    privateApp.get('/conversations', async (req, reply) => {
      const { network } = z.object({ network: networkSchema.optional() }).parse(req.query)
      return reply.send({ conversations: await service.listConversations(req.user as WorkspaceContext, network) })
    })

    privateApp.get<{ Params: { id: string } }>('/conversations/:id', async (req, reply) =>
      reply.send(await service.getConversation(req.user as WorkspaceContext, req.params.id)))

    privateApp.post<{ Params: { id: string } }>('/conversations/:id/read', async (req, reply) => {
      await service.markRead(req.user as WorkspaceContext, req.params.id)
      return reply.code(204).send()
    })

    privateApp.post<{ Params: { id: string } }>('/conversations/:id/messages', write, async (req, reply) => {
      const { text } = z.object({ text: z.string().trim().min(1, 'Escribí un mensaje.').max(1000) }).parse(req.body)
      return reply.status(201).send(await service.sendMessage(req.user as WorkspaceContext, req.params.id, text))
    })

    privateApp.put<{ Params: { id: string } }>('/conversations/:id/assignee', write, async (req, reply) => {
      const { assignedToUserId } = z.object({ assignedToUserId: z.string().min(1).nullable() }).parse(req.body)
      return reply.send(await service.assign(req.user as WorkspaceContext, req.params.id, assignedToUserId))
    })

    // Personas que pueden ser responsables: selector de los chats y filtro del tablero.
    privateApp.get('/team', async (req, reply) => reply.send({ members: await service.team(req.user as WorkspaceContext) }))

    privateApp.get('/posts', async (req, reply) => reply.send({ posts: await service.listPosts(req.user as WorkspaceContext) }))

    privateApp.post('/posts', { ...write, bodyLimit: Math.ceil(SOCIAL_POST_IMAGE_MAX_BYTES * 1.5) }, async (req, reply) => {
      const body = z.object({ caption: captionSchema, image: outboundFileSchema }).parse(req.body)
      const image = decodeOutboundFile(body.image as z.infer<typeof outboundFileSchema>)
      return reply.status(201).send(await service.createPost(req.user as WorkspaceContext, { caption: body.caption as string, image }))
    })

    privateApp.patch<{ Params: { id: string } }>('/posts/:id', write, async (req, reply) => {
      const { caption } = z.object({ caption: captionSchema }).parse(req.body)
      return reply.send(await service.updatePost(req.user as WorkspaceContext, req.params.id, caption))
    })

    privateApp.get<{ Params: { id: string } }>('/posts/:id/image', async (req, reply) => {
      const image = await service.getPostImage((req.user as WorkspaceContext).workspaceId, req.params.id)
      return reply.header('content-type', image.mimeType).header('cache-control', 'private, max-age=300').send(image.buffer)
    })

    privateApp.post<{ Params: { id: string } }>('/posts/:id/publish', write, async (req, reply) =>
      reply.send(await service.publishPost(req.user as WorkspaceContext, req.params.id)))

    privateApp.delete<{ Params: { id: string } }>('/posts/:id', write, async (req, reply) => {
      await service.deletePost(req.user as WorkspaceContext, req.params.id)
      return reply.code(204).send()
    })
  })
}
