import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { config } from '../../core/config'
import { db } from '../../core/database'
import { AppError, NotFoundError, ValidationError, type WorkspaceContext } from '../../types'
import { dealVisibilityWhere } from '../deals/deal-access'
import { assertAssignAllowed, assertAssignableMember, assignmentVisibility, listAssignableMembers, syncLeadOwner } from './chat-assignment'
import type { InboxService } from '../inbox/inbox.service'
import { NETWORK_CHANNEL, networkOfChannel, type SocialNetwork } from './social-lead'

/** Instagram sólo acepta JPEG en la API de publicación; el frontend convierte antes de subir. */
export const SOCIAL_POST_IMAGE_MAX_BYTES = 8 * 1024 * 1024
const GRAPH_BASE_URL = 'https://graph.facebook.com'
const GRAPH_API_VERSION = 'v23.0'

const postSelect = {
  id: true, network: true, caption: true, imageMimeType: true, imageFileName: true, status: true, externalPostId: true,
  permalink: true, errorMessage: true, publishedAt: true, createdAt: true, updatedAt: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.SocialPostSelect

function conversationVisibility(ctx: WorkspaceContext): Prisma.ConversationWhereInput {
  // Igual que los tickets: owner/admin ven todo; member, lo propio y lo libre; viewer, lo propio.
  return assignmentVisibility(ctx)
}

function isLocalUrl(value: string) {
  try {
    const host = new URL(value).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost') || host.endsWith('.test')
  } catch {
    return true
  }
}

export function signPostImage(postId: string) {
  return createHmac('sha256', config.JWT_SECRET).update(`social-post-image:${postId}`).digest('hex')
}

export function verifyPostImageSignature(postId: string, signature: string | undefined) {
  if (!signature) return false
  const expected = Buffer.from(signPostImage(postId))
  const received = Buffer.from(signature)
  return expected.length === received.length && timingSafeEqual(expected, received)
}

export class SocialService {
  constructor(private readonly inbox: InboxService) {}

  /** Estado de la conexión de cada red, sin credenciales. */
  async getStatus(ctx: WorkspaceContext) {
    const networks = Object.keys(NETWORK_CHANNEL) as SocialNetwork[]
    const connections = await db.channelConnection.findMany({
      where: { workspaceId: ctx.workspaceId, provider: 'meta', channel: { in: networks.map((network) => NETWORK_CHANNEL[network]) } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, channel: true, name: true, status: true, externalAccountId: true, externalAccountLabel: true, lastSyncedAt: true },
    })
    const unread = await db.conversation.groupBy({
      by: ['channel'],
      where: { workspaceId: ctx.workspaceId, ...conversationVisibility(ctx), unreadCount: { gt: 0 } },
      _count: { _all: true },
    })
    return {
      // Meta sólo entrega mensajes (webhook) y descarga imágenes para publicar si la API es pública.
      publicApiReady: Boolean(config.PUBLIC_API_URL) && !isLocalUrl(config.PUBLIC_API_URL ?? ''),
      webhookEnabled: config.ENABLE_LEGACY_CHANNELS,
      networks: networks.map((network) => {
        const connection = connections.find((item) => item.channel === NETWORK_CHANNEL[network]) ?? null
        return {
          network,
          connection: connection ? { ...connection, channel: undefined } : null,
          unreadConversations: unread.find((item) => item.channel === NETWORK_CHANNEL[network])?._count._all ?? 0,
        }
      }),
    }
  }

  async connect(ctx: WorkspaceContext, input: { network: SocialNetwork; accountId: string; accessToken: string; name?: string }) {
    const channel = NETWORK_CHANNEL[input.network]
    const existing = await db.channelConnection.findFirst({ where: { workspaceId: ctx.workspaceId, provider: 'meta', channel }, select: { id: true, status: true } })
    if (existing?.status === 'connected') throw new AppError(409, 'Esta red ya tiene una cuenta conectada. Desconectala antes de vincular otra.', 'SOCIAL_ALREADY_CONNECTED')
    if (existing) {
      // Reconexión: se reutiliza la misma conexión para no perder sus conversaciones.
      await db.channelConnection.update({ where: { id: existing.id }, data: { externalAccountId: input.accountId.trim(), credentials: { accessToken: input.accessToken.trim() }, ...(input.name?.trim() ? { name: input.name.trim() } : {}) } })
      try {
        await this.inbox.testConnection(ctx.workspaceId, existing.id)
      } catch (error) {
        await db.channelConnection.update({ where: { id: existing.id }, data: { status: 'disconnected', credentials: {} } }).catch(() => {})
        throw new ValidationError(`Meta rechazó la conexión: ${error instanceof Error ? error.message : 'error desconocido'}`)
      }
      return this.getStatus(ctx)
    }
    const created = await this.inbox.createConnection(ctx.workspaceId, {
      provider: 'meta',
      channel: channel as 'instagram' | 'messenger',
      name: input.name?.trim() || (input.network === 'instagram' ? 'Instagram' : 'Facebook'),
      externalAccountId: input.accountId.trim(),
      credentials: { accessToken: input.accessToken.trim() },
    }) as { id: string }
    try {
      // Consulta la cuenta en Meta: si el token o el ID están mal, no queda una conexión a medias.
      await this.inbox.testConnection(ctx.workspaceId, created.id)
    } catch (error) {
      await db.channelConnection.delete({ where: { id: created.id } }).catch(() => {})
      throw new ValidationError(`Meta rechazó la conexión: ${error instanceof Error ? error.message : 'error desconocido'}`)
    }
    return this.getStatus(ctx)
  }

  async disconnect(ctx: WorkspaceContext, network: SocialNetwork) {
    // Sólo se quitan las credenciales: las conversaciones y los leads se conservan.
    const connection = await db.channelConnection.findFirst({ where: { workspaceId: ctx.workspaceId, provider: 'meta', channel: NETWORK_CHANNEL[network] } })
    if (!connection) throw new NotFoundError('Conexión')
    await db.channelConnection.update({ where: { id: connection.id }, data: { status: 'disconnected', credentials: {} } })
    return this.getStatus(ctx)
  }

  async listConversations(ctx: WorkspaceContext, network?: SocialNetwork) {
    const channels = network ? [NETWORK_CHANNEL[network]] : Object.values(NETWORK_CHANNEL)
    const conversations = await db.conversation.findMany({
      where: { workspaceId: ctx.workspaceId, channel: { in: channels }, ...conversationVisibility(ctx) },
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
      take: 200,
      select: {
        id: true, channel: true, unreadCount: true, lastMessageAt: true, assignedToUserId: true, externalUserId: true,
        contact: { select: { id: true, firstName: true, lastName: true, avatar: true, identities: { select: { channel: true, externalUsername: true } } } },
        messages: { take: 1, orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }], select: { text: true, type: true, direction: true } },
      },
    })
    return conversations.map((conversation) => this.serializeConversation(conversation))
  }

  async getConversation(ctx: WorkspaceContext, conversationId: string) {
    const conversation = await db.conversation.findFirst({
      where: { id: conversationId, workspaceId: ctx.workspaceId, channel: { in: Object.values(NETWORK_CHANNEL) }, ...conversationVisibility(ctx) },
      select: {
        id: true, channel: true, unreadCount: true, lastMessageAt: true, assignedToUserId: true, externalUserId: true,
        connection: { select: { status: true } },
        contact: { select: { id: true, firstName: true, lastName: true, avatar: true, identities: { select: { channel: true, externalUsername: true } } } },
        messages: { take: 1, orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }], select: { text: true, type: true, direction: true } },
      },
    })
    if (!conversation) throw new NotFoundError('Conversación', conversationId)
    const messages = await db.message.findMany({
      where: { workspaceId: ctx.workspaceId, conversationId },
      orderBy: [{ sentAt: 'asc' }, { createdAt: 'asc' }],
      take: 300,
      select: { id: true, direction: true, type: true, status: true, text: true, sentAt: true, createdAt: true, attachments: { select: { type: true, url: true, fileName: true } } },
    })
    const lead = await db.deal.findFirst({
      where: { workspaceId: ctx.workspaceId, isArchived: false, customData: { path: ['socialConversationId'], equals: conversationId }, ...dealVisibilityWhere(ctx) },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, leadNumber: true, title: true, stageId: true,
        pipeline: { select: { stages: { orderBy: { position: 'asc' }, select: { id: true, name: true, position: true, color: true, isWon: true, isLost: true } } } },
      },
    })
    return {
      conversation: { ...this.serializeConversation(conversation), canReply: conversation.connection.status === 'connected' },
      messages: messages.map((message) => ({ ...message, sentAt: message.sentAt ?? message.createdAt })),
      lead: lead ? { id: lead.id, leadNumber: lead.leadNumber, title: lead.title, stageId: lead.stageId, stages: lead.pipeline.stages, canMove: ctx.role !== 'viewer' } : null,
    }
  }

  async markRead(ctx: WorkspaceContext, conversationId: string) {
    const result = await db.conversation.updateMany({ where: { id: conversationId, workspaceId: ctx.workspaceId, ...conversationVisibility(ctx) }, data: { unreadCount: 0 } })
    if (!result.count) throw new NotFoundError('Conversación', conversationId)
  }

  async sendMessage(ctx: WorkspaceContext, conversationId: string, text: string) {
    const conversation = await db.conversation.findFirst({
      where: { id: conversationId, workspaceId: ctx.workspaceId, ...conversationVisibility(ctx) },
      select: { id: true, assignedToUserId: true, connection: { select: { status: true } } },
    })
    if (!conversation) throw new NotFoundError('Conversación', conversationId)
    if (conversation.connection.status !== 'connected') {
      throw new AppError(409, 'La cuenta de esta red no está conectada: no se puede responder desde acá todavía.', 'SOCIAL_NOT_CONNECTED')
    }
    await this.inbox.sendConversationMessage(ctx.workspaceId, conversationId, { text })
    // Quien responde una conversación libre se la queda, como al tomar un ticket.
    if (!conversation.assignedToUserId) {
      const taken = await db.conversation.updateMany({ where: { id: conversationId, assignedToUserId: null }, data: { assignedToUserId: ctx.userId } })
      if (taken.count) await syncLeadOwner(ctx.workspaceId, 'socialConversationId', conversationId, ctx.userId)
    }
    return this.getConversation(ctx, conversationId)
  }

  /** Cambia el responsable de la conversación (compare-and-set) y el del lead que la sigue. */
  async assign(ctx: WorkspaceContext, conversationId: string, assignedToUserId: string | null) {
    const conversation = await db.conversation.findFirst({
      where: { id: conversationId, workspaceId: ctx.workspaceId, channel: { in: Object.values(NETWORK_CHANNEL) }, ...conversationVisibility(ctx) },
      select: { id: true, assignedToUserId: true },
    })
    if (!conversation) throw new NotFoundError('Conversación', conversationId)
    assertAssignAllowed(ctx, conversation.assignedToUserId, assignedToUserId)
    await assertAssignableMember(ctx.workspaceId, assignedToUserId)
    const result = await db.conversation.updateMany({ where: { id: conversationId, assignedToUserId: conversation.assignedToUserId }, data: { assignedToUserId } })
    if (!result.count) throw new AppError(409, 'Otra persona cambió el responsable de esta conversación. Actualizá y volvé a intentar.', 'CHAT_ASSIGNEE_CHANGED')
    await syncLeadOwner(ctx.workspaceId, 'socialConversationId', conversationId, assignedToUserId)
    // Si quien la liberó ya no puede verla (viewer), no hay detalle para devolver.
    return assignedToUserId === ctx.userId || ctx.role === 'owner' || ctx.role === 'admin' || ctx.role === 'member' ? this.getConversation(ctx, conversationId) : null
  }

  team(ctx: WorkspaceContext) {
    return listAssignableMembers(ctx.workspaceId)
  }

  // ─── Publicaciones de Instagram ───────────────────────────────────

  listPosts(ctx: WorkspaceContext) {
    return db.socialPost.findMany({ where: { workspaceId: ctx.workspaceId, network: 'instagram' }, orderBy: { createdAt: 'desc' }, take: 100, select: postSelect })
  }

  async createPost(ctx: WorkspaceContext, input: { caption: string; image: { buffer: Buffer; fileName: string } }) {
    const { buffer } = input.image
    if (buffer.length > SOCIAL_POST_IMAGE_MAX_BYTES) throw new ValidationError('La imagen supera el límite de 8 MB.')
    if (!(buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)) throw new ValidationError('La imagen tiene que ser JPG: es el único formato que Instagram acepta para publicar.')
    return db.socialPost.create({
      data: {
        workspaceId: ctx.workspaceId, network: 'instagram', caption: input.caption, image: buffer, imageMimeType: 'image/jpeg',
        imageFileName: input.image.fileName.slice(0, 255), createdByUserId: ctx.userId,
      },
      select: postSelect,
    })
  }

  async updatePost(ctx: WorkspaceContext, postId: string, caption: string) {
    const post = await this.requirePost(ctx, postId)
    if (post.status === 'published' || post.status === 'publishing') throw new AppError(409, 'Una publicación ya enviada a Instagram no se puede editar desde acá.', 'SOCIAL_POST_LOCKED')
    return db.socialPost.update({ where: { id: postId }, data: { caption }, select: postSelect })
  }

  async deletePost(ctx: WorkspaceContext, postId: string) {
    // Borra el registro del CRM; si ya salió, la publicación sigue en Instagram.
    await this.requirePost(ctx, postId)
    await db.socialPost.delete({ where: { id: postId } })
  }

  async getPostImage(workspaceId: string | null, postId: string) {
    const post = await db.socialPost.findFirst({ where: { id: postId, ...(workspaceId ? { workspaceId } : {}) }, select: { image: true, imageMimeType: true } })
    if (!post) throw new NotFoundError('Publicación', postId)
    return { buffer: Buffer.from(post.image), mimeType: post.imageMimeType }
  }

  /**
   * Publica en Instagram con la API de contenido de Meta: crea el contenedor con la URL
   * pública de la imagen y después lo publica. Meta descarga la imagen, así que la API
   * del CRM tiene que ser accesible desde internet (PUBLIC_API_URL).
   */
  async publishPost(ctx: WorkspaceContext, postId: string) {
    const post = await this.requirePost(ctx, postId)
    if (post.status === 'published') throw new AppError(409, 'Esta publicación ya está en Instagram.', 'SOCIAL_POST_PUBLISHED')
    if (post.status === 'publishing') throw new AppError(409, 'Esta publicación ya se está enviando.', 'SOCIAL_POST_PUBLISHING')

    const connection = await db.channelConnection.findFirst({ where: { workspaceId: ctx.workspaceId, provider: 'meta', channel: 'instagram' } })
    const accessToken = (connection?.credentials as Record<string, unknown> | null)?.accessToken
    if (!connection || connection.status !== 'connected' || typeof accessToken !== 'string' || !accessToken) {
      throw new AppError(409, 'Falta conectar la cuenta de Instagram (pestaña Conexión).', 'SOCIAL_NOT_CONNECTED')
    }
    if (!config.PUBLIC_API_URL || isLocalUrl(config.PUBLIC_API_URL)) {
      throw new AppError(409, 'Instagram necesita descargar la imagen desde una dirección pública. En esta instalación local no se puede publicar: falta PUBLIC_API_URL.', 'SOCIAL_PUBLIC_URL_MISSING')
    }

    const claimed = await db.socialPost.updateMany({ where: { id: postId, status: { in: ['draft', 'failed'] } }, data: { status: 'publishing', errorMessage: null } })
    if (!claimed.count) throw new AppError(409, 'Esta publicación ya se está enviando.', 'SOCIAL_POST_PUBLISHING')

    const imageUrl = `${config.PUBLIC_API_URL.replace(/\/$/, '')}/api/v1/social/public/posts/${postId}/image.jpg?sig=${signPostImage(postId)}`
    const base = `${GRAPH_BASE_URL}/${GRAPH_API_VERSION}`
    try {
      const container = await this.graph('POST', `${base}/${connection.externalAccountId}/media`, accessToken, { image_url: imageUrl, caption: post.caption })
      const published = await this.graph('POST', `${base}/${connection.externalAccountId}/media_publish`, accessToken, { creation_id: String(container.id) })
      const mediaId = String(published.id)
      const details = await this.graph('GET', `${base}/${mediaId}?fields=permalink`, accessToken).catch(() => ({} as Record<string, unknown>))
      return await db.socialPost.update({
        where: { id: postId },
        data: { status: 'published', externalPostId: mediaId, permalink: typeof details.permalink === 'string' ? details.permalink : null, publishedAt: new Date(), errorMessage: null },
        select: postSelect,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido al publicar'
      await db.socialPost.update({ where: { id: postId }, data: { status: 'failed', errorMessage: message.slice(0, 500) } })
      throw new AppError(502, `Instagram no aceptó la publicación: ${message}`, 'SOCIAL_PUBLISH_FAILED')
    }
  }

  private async graph(method: 'GET' | 'POST', url: string, accessToken: string, body?: Record<string, string>): Promise<Record<string, unknown>> {
    const response = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${accessToken}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60_000),
    })
    const data = await response.json().catch(() => ({})) as Record<string, any>
    if (!response.ok || data.error) throw new Error(data.error?.message ?? `Meta respondió ${response.status}`)
    return data
  }

  private async requirePost(ctx: WorkspaceContext, postId: string) {
    const post = await db.socialPost.findFirst({ where: { id: postId, workspaceId: ctx.workspaceId }, select: { id: true, status: true, caption: true } })
    if (!post) throw new NotFoundError('Publicación', postId)
    return post
  }

  private serializeConversation(conversation: {
    id: string; channel: string; unreadCount: number; lastMessageAt: Date | null; assignedToUserId: string | null; externalUserId: string | null
    contact: { id: string; firstName: string; lastName: string | null; avatar: string | null; identities: { channel: string; externalUsername: string | null }[] }
    messages: { text: string | null; type: string; direction: string }[]
  }) {
    const last = conversation.messages[0]
    const username = conversation.contact.identities.find((identity) => identity.channel === conversation.channel)?.externalUsername ?? null
    return {
      id: conversation.id,
      network: networkOfChannel(conversation.channel) ?? 'instagram',
      name: [conversation.contact.firstName, conversation.contact.lastName].filter(Boolean).join(' ').trim() || username || 'Sin nombre',
      username,
      avatar: conversation.contact.avatar,
      contactId: conversation.contact.id,
      unreadCount: conversation.unreadCount,
      lastMessageAt: conversation.lastMessageAt,
      lastMessagePreview: last ? (last.text?.trim() || (last.type === 'image' ? '📷 Foto' : 'Adjunto')) : null,
      lastMessageFromMe: last ? last.direction === 'outbound' : null,
      assignedToUserId: conversation.assignedToUserId,
    }
  }
}
