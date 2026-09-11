import { InternalConversationType, Prisma } from '@prisma/client'
import { db } from '../../core/database'
import { ForbiddenError, NotFoundError, ValidationError } from '../../types'

const memberSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  avatar: true,
} satisfies Prisma.UserSelect

type ChatContext = { workspaceId: string; userId: string }

export function directConversationKey(firstUserId: string, secondUserId: string) {
  return `direct:${[firstUserId, secondUserId].sort().join(':')}`
}

export function canAccessInternalConversation(
  type: InternalConversationType,
  participantUserIds: string[],
  userId: string,
) {
  return type === InternalConversationType.GENERAL || participantUserIds.includes(userId)
}

export class InternalChatService {
  async listMembers(ctx: ChatContext) {
    const members = await db.workspaceUser.findMany({
      where: { workspaceId: ctx.workspaceId },
      select: {
        role: true,
        createdAt: true,
        user: { select: memberSelect },
      },
      orderBy: [{ user: { firstName: 'asc' } }, { user: { lastName: 'asc' } }],
    })

    return members.map((member) => ({
      ...member.user,
      role: member.role,
      joinedAt: member.createdAt,
      isCurrentUser: member.user.id === ctx.userId,
    }))
  }

  async listConversations(ctx: ChatContext) {
    await this.ensureGeneralConversation(ctx)

    const conversations = await db.internalConversation.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        OR: [
          { type: InternalConversationType.GENERAL },
          { participants: { some: { userId: ctx.userId } } },
        ],
      },
      include: {
        participants: {
          select: {
            userId: true,
            lastReadAt: true,
            joinedAt: true,
            user: { select: memberSelect },
          },
        },
        messages: {
          take: 1,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            conversationId: true,
            body: true,
            createdAt: true,
            updatedAt: true,
            senderId: true,
            sender: { select: memberSelect },
          },
        },
      },
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'asc' }],
    })

    const generalMemberCount = await db.workspaceUser.count({ where: { workspaceId: ctx.workspaceId } })
    const results = await Promise.all(conversations.map(async (conversation) => {
      const currentParticipant = conversation.participants.find((participant) => participant.userId === ctx.userId)
      const unreadSince = currentParticipant?.lastReadAt ?? currentParticipant?.joinedAt ?? new Date()
      const unreadCount = await db.internalChatMessage.count({
        where: {
          workspaceId: ctx.workspaceId,
          conversationId: conversation.id,
          senderId: { not: ctx.userId },
          createdAt: { gt: unreadSince },
        },
      })
      const otherParticipant = conversation.type === InternalConversationType.DIRECT
        ? conversation.participants.find((participant) => participant.userId !== ctx.userId)?.user ?? null
        : null

      return {
        id: conversation.id,
        type: conversation.type,
        title: conversation.type === InternalConversationType.GENERAL ? 'Equipo ROMEZ' : null,
        otherParticipant,
        participantCount: conversation.type === InternalConversationType.GENERAL
          ? generalMemberCount
          : conversation.participants.length,
        lastMessageAt: conversation.lastMessageAt,
        lastMessage: conversation.messages[0] ?? null,
        unreadCount,
      }
    }))

    return results.sort((left, right) => {
      if (left.type !== right.type) return left.type === InternalConversationType.GENERAL ? -1 : 1
      return (right.lastMessageAt?.getTime() ?? 0) - (left.lastMessageAt?.getTime() ?? 0)
    })
  }

  async createDirectConversation(ctx: ChatContext, otherUserId: string) {
    if (otherUserId === ctx.userId) {
      throw new ValidationError('Seleccioná a otro miembro para iniciar un mensaje privado')
    }

    const target = await db.workspaceUser.findUnique({
      where: { workspaceId_userId: { workspaceId: ctx.workspaceId, userId: otherUserId } },
      select: { userId: true },
    })
    if (!target) throw new NotFoundError('Miembro', otherUserId)

    const key = directConversationKey(ctx.userId, otherUserId)
    const conversation = await db.internalConversation.upsert({
      where: { workspaceId_key: { workspaceId: ctx.workspaceId, key } },
      update: {},
      create: {
        workspaceId: ctx.workspaceId,
        type: InternalConversationType.DIRECT,
        key,
        participants: {
          create: [{ userId: ctx.userId }, { userId: otherUserId }],
        },
      },
      select: { id: true },
    })

    return { id: conversation.id }
  }

  async listMessages(ctx: ChatContext, conversationId: string, limit: number, cursor?: string) {
    await this.assertAccess(ctx, conversationId)
    const messages = await db.internalChatMessage.findMany({
      where: { workspaceId: ctx.workspaceId, conversationId },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        conversationId: true,
        senderId: true,
        body: true,
        createdAt: true,
        updatedAt: true,
        sender: { select: memberSelect },
      },
    })
    const hasMore = messages.length > limit
    const page = hasMore ? messages.slice(0, limit) : messages
    const nextCursor = hasMore ? page.at(-1)?.id ?? null : null

    return {
      items: page.reverse(),
      nextCursor,
    }
  }

  async markRead(ctx: ChatContext, conversationId: string, messageId?: string) {
    const conversation = await this.assertAccess(ctx, conversationId)
    if (conversation.type === InternalConversationType.GENERAL) {
      await this.ensureParticipant(conversation.id, ctx.userId)
    }
    const message = messageId ? await db.internalChatMessage.findFirst({
      where: { id: messageId, workspaceId: ctx.workspaceId, conversationId },
      select: { createdAt: true },
    }) : null
    await db.internalConversationParticipant.updateMany({
      where: { conversationId, userId: ctx.userId },
      data: { lastReadAt: message?.createdAt ?? new Date() },
    })
  }

  async sendMessage(ctx: ChatContext, conversationId: string, body: string) {
    const conversation = await this.assertAccess(ctx, conversationId)
    if (conversation.type === InternalConversationType.GENERAL) {
      await this.ensureParticipant(conversation.id, ctx.userId)
    }

    const message = await db.$transaction(async (tx) => {
      const message = await tx.internalChatMessage.create({
        data: {
          workspaceId: ctx.workspaceId,
          conversationId,
          senderId: ctx.userId,
          body,
        },
        select: {
          id: true,
          conversationId: true,
          senderId: true,
          body: true,
          createdAt: true,
          updatedAt: true,
          sender: { select: memberSelect },
        },
      })
      await Promise.all([
        tx.internalConversation.update({
          where: { id: conversationId },
          data: { lastMessageAt: message.createdAt },
        }),
        tx.internalConversationParticipant.updateMany({
          where: { conversationId, userId: ctx.userId },
          data: { lastReadAt: message.createdAt },
        }),
      ])
      return message
    })
    return {
      message,
      audienceUserIds: conversation.type === InternalConversationType.DIRECT
        ? conversation.participants.map((participant) => participant.userId)
        : undefined,
    }
  }

  private async ensureGeneralConversation(ctx: ChatContext) {
    const conversation = await db.internalConversation.upsert({
      where: { workspaceId_key: { workspaceId: ctx.workspaceId, key: 'general' } },
      update: {},
      create: {
        workspaceId: ctx.workspaceId,
        type: InternalConversationType.GENERAL,
        key: 'general',
        title: 'Equipo ROMEZ',
      },
      select: { id: true },
    })
    await this.ensureParticipant(conversation.id, ctx.userId)
    return conversation
  }

  private async ensureParticipant(conversationId: string, userId: string) {
    return db.internalConversationParticipant.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      update: {},
      create: { conversationId, userId },
    })
  }

  private async assertAccess(ctx: ChatContext, conversationId: string) {
    const conversation = await db.internalConversation.findFirst({
      where: { id: conversationId, workspaceId: ctx.workspaceId },
      select: {
        id: true,
        type: true,
        participants: { select: { userId: true } },
      },
    })
    if (!conversation) throw new NotFoundError('Conversación', conversationId)
    if (!canAccessInternalConversation(
      conversation.type,
      conversation.participants.map((participant) => participant.userId),
      ctx.userId,
    )) {
      throw new ForbiddenError('No tenés acceso a esta conversación')
    }
    return conversation
  }
}
