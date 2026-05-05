import { Prisma } from '@prisma/client'
import { db } from '../../core/database'
import { EventBus } from '../../core/event-bus'
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  paginate,
  type PaginatedResult,
  type PaginationQuery,
} from '../../types'
import type { ChannelProviderAdapter } from './provider'
import type {
  ConnectionInspectionResult,
  NormalizedAttachment,
  NormalizedDeliveryEvent,
  NormalizedInboundMessage,
  OutboundMessageDraft,
  PhoneRegistrationResult,
} from './types'

const inboxDb = db as any

export interface ChannelConnectionInput {
  provider: 'meta' | 'tiktok'
  channel: 'whatsapp' | 'instagram' | 'messenger' | 'tiktok'
  name: string
  status?: 'disconnected' | 'connected' | 'error'
  externalAccountId: string
  externalAccountLabel?: string
  credentials?: Record<string, unknown>
  settings?: Record<string, unknown>
}

export interface ChannelConnectionUpdateInput {
  name?: string
  status?: 'disconnected' | 'connected' | 'error'
  externalAccountLabel?: string | null
  credentials?: Record<string, unknown>
  settings?: Record<string, unknown>
  lastSyncedAt?: Date | null
}

export interface SendConversationMessageInput {
  text?: string
  replyToMessageId?: string
  previewUrl?: boolean
  attachment?: {
    type: 'image' | 'audio' | 'video' | 'file'
    url?: string
    externalAssetId?: string
    mimeType?: string
    fileName?: string
  }
}

export interface ConversationFilters extends PaginationQuery {
  channel?: string
  status?: string
}

export interface IngestResult {
  status: 'created' | 'duplicate' | 'ignored'
  reason?: string
  workspaceId?: string
  conversationId?: string
  messageId?: string
}

export interface DeliveryEventResult {
  status: 'updated' | 'duplicate' | 'ignored'
  reason?: string
  workspaceId?: string
  conversationId?: string
  messageId?: string
}

export interface ConnectionTestResult {
  connection: unknown
  inspection: ConnectionInspectionResult
}

export interface RegisterWhatsAppPhoneInput {
  pin: string
}

export interface RegisterWhatsAppPhoneResult extends ConnectionTestResult {
  registration: PhoneRegistrationResult
}

export interface CompleteWhatsAppEmbeddedSignupInput {
  phoneNumberId: string
  accessToken: string
  businessId?: string
  wabaId?: string
  displayPhoneNumber?: string
  verifiedName?: string
  qualityRating?: string
  name?: string
}

export interface CompleteWhatsAppEmbeddedSignupCodeInput {
  code: string
  phoneNumberId: string
  businessId?: string
  wabaId?: string
  displayPhoneNumber?: string
  verifiedName?: string
  qualityRating?: string
  name?: string
  redirectUri?: string
}

export interface EmbeddedSignupCompletionResult extends ConnectionTestResult {
  mode: 'created' | 'updated'
}

export interface EmbeddedSignupCodeCompletionResult extends EmbeddedSignupCompletionResult {
  exchange: {
    tokenType?: string
    expiresIn?: number
  }
}

export class InboxService {
  constructor(
    private readonly eventBus: EventBus,
    private readonly adapters: Record<string, ChannelProviderAdapter> = {}
  ) {}

  async listConnections(workspaceId: string): Promise<unknown[]> {
    const connections = await inboxDb.channelConnection.findMany({
      where: { workspaceId },
      orderBy: [
        { channel: 'asc' },
        { createdAt: 'desc' },
      ],
    })

    return connections.map((connection: any) => this.sanitizeConnection(connection))
  }

  async createConnection(
    workspaceId: string,
    data: ChannelConnectionInput
  ): Promise<unknown> {
    try {
      const connection = await inboxDb.channelConnection.create({
        data: {
          workspaceId,
          provider: data.provider,
          channel: data.channel,
          name: data.name,
          status: data.status ?? 'disconnected',
          externalAccountId: data.externalAccountId,
          externalAccountLabel: data.externalAccountLabel,
          credentials: (data.credentials ?? {}) as Prisma.InputJsonValue,
          settings: (data.settings ?? {}) as Prisma.InputJsonValue,
        },
      })

      return this.sanitizeConnection(connection)
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictError('Ya existe una conexion para esa cuenta externa en este workspace')
      }

      throw error
    }
  }

  async updateConnection(
    workspaceId: string,
    connectionId: string,
    data: ChannelConnectionUpdateInput
  ): Promise<unknown> {
    await this.requireConnection(workspaceId, connectionId)

    const connection = await inboxDb.channelConnection.update({
      where: { id: connectionId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.externalAccountLabel !== undefined && {
          externalAccountLabel: data.externalAccountLabel,
        }),
        ...(data.credentials !== undefined && {
          credentials: data.credentials as Prisma.InputJsonValue,
        }),
        ...(data.settings !== undefined && {
          settings: data.settings as Prisma.InputJsonValue,
        }),
        ...(data.lastSyncedAt !== undefined && { lastSyncedAt: data.lastSyncedAt }),
      },
    })

    return this.sanitizeConnection(connection)
  }

  async deleteConnection(workspaceId: string, connectionId: string): Promise<void> {
    await this.requireConnection(workspaceId, connectionId)
    await inboxDb.channelConnection.delete({
      where: { id: connectionId },
    })
  }

  async testConnection(
    workspaceId: string,
    connectionId: string
  ): Promise<ConnectionTestResult> {
    const connection = await this.requireConnection(workspaceId, connectionId)
    const adapter = this.requireAdapter(connection.provider)
    const testedAt = new Date()

    try {
      const inspection = await adapter.inspectConnection({
        provider: connection.provider,
        channel: connection.channel,
        externalAccountId: connection.externalAccountId,
        credentials: this.asJsonRecord(connection.credentials),
        settings: this.asJsonRecord(connection.settings),
      })

      const updatedConnection = await inboxDb.channelConnection.update({
        where: { id: connectionId },
        data: {
          status: inspection.status,
          externalAccountLabel: inspection.externalAccountLabel ?? connection.externalAccountLabel,
          lastSyncedAt: testedAt,
        },
      })

      return {
        connection: this.sanitizeConnection(updatedConnection),
        inspection,
      }
    } catch (error) {
      await inboxDb.channelConnection.update({
        where: { id: connectionId },
        data: {
          status: 'error',
          lastSyncedAt: testedAt,
        },
      }).catch(() => {})

      throw error
    }
  }

  async registerWhatsAppPhone(
    workspaceId: string,
    connectionId: string,
    input: RegisterWhatsAppPhoneInput
  ): Promise<RegisterWhatsAppPhoneResult> {
    const connection = await this.requireConnection(workspaceId, connectionId)

    if (connection.provider !== 'meta' || connection.channel !== 'whatsapp') {
      throw new ValidationError('El registro con PIN solo aplica a conexiones de Meta WhatsApp')
    }

    const pin = input.pin?.trim()
    if (!pin || !/^\d{6}$/.test(pin)) {
      throw new ValidationError('El PIN de registro debe tener 6 digitos')
    }

    const adapter = this.requireAdapter(connection.provider)
    if (!adapter.registerPhoneNumber) {
      throw new ValidationError('El adapter actual no implementa registro de numero')
    }

    const attemptedAt = new Date()
    const currentSettings = this.asJsonRecord(connection.settings) ?? {}
    const currentRegistration = this.asJsonRecord(currentSettings.registration) ?? {}

    try {
      const registration = await adapter.registerPhoneNumber({
        provider: connection.provider,
        channel: connection.channel,
        externalAccountId: connection.externalAccountId,
        pin,
        credentials: this.asJsonRecord(connection.credentials),
        settings: currentSettings,
      })

      const nextRegistration: Record<string, unknown> = {
        ...currentRegistration,
        mode: 'cloud_api',
        phoneNumberId: connection.externalAccountId,
        lastAttemptAt: attemptedAt.toISOString(),
        lastRegisteredAt: registration.registeredAt.toISOString(),
      }
      delete nextRegistration.lastError

      await inboxDb.channelConnection.update({
        where: { id: connection.id },
        data: {
          settings: {
            ...currentSettings,
            registration: nextRegistration,
          } as Prisma.InputJsonValue,
          lastSyncedAt: attemptedAt,
        },
      })

      const result = await this.testConnection(workspaceId, connection.id)
      return {
        ...result,
        registration,
      }
    } catch (error) {
      await inboxDb.channelConnection.update({
        where: { id: connection.id },
        data: {
          status: 'error',
          settings: {
            ...currentSettings,
            registration: {
              ...currentRegistration,
              mode: 'cloud_api',
              phoneNumberId: connection.externalAccountId,
              lastAttemptAt: attemptedAt.toISOString(),
              lastError: this.serializeError(error),
            },
          } as Prisma.InputJsonValue,
          lastSyncedAt: attemptedAt,
        },
      }).catch(() => {})

      throw error
    }
  }

  async completeWhatsAppEmbeddedSignup(
    workspaceId: string,
    input: CompleteWhatsAppEmbeddedSignupInput
  ): Promise<EmbeddedSignupCompletionResult> {
    const phoneNumberId = input.phoneNumberId.trim()
    const accessToken = input.accessToken.trim()

    if (!phoneNumberId) {
      throw new ValidationError('phoneNumberId es obligatorio para completar Embedded Signup')
    }

    if (!accessToken) {
      throw new ValidationError('accessToken es obligatorio para completar Embedded Signup')
    }

    const existing = await inboxDb.channelConnection.findFirst({
      where: {
        workspaceId,
        provider: 'meta',
        channel: 'whatsapp',
        externalAccountId: phoneNumberId,
      },
    })

    const connectionName = input.name?.trim()
      || this.buildEmbeddedSignupLabel(input)
      || `WhatsApp ${phoneNumberId}`

    const mergedCredentials = {
      ...(this.asJsonRecord(existing?.credentials) ?? {}),
      accessToken,
    }

    const mergedSettings = {
      ...(this.asJsonRecord(existing?.settings) ?? {}),
      onboardingSource: 'embedded_signup',
      ...(input.businessId?.trim() && { metaBusinessId: input.businessId.trim() }),
      ...(input.wabaId?.trim() && { metaWabaId: input.wabaId.trim() }),
      ...(input.displayPhoneNumber?.trim() && { metaDisplayPhoneNumber: input.displayPhoneNumber.trim() }),
      ...(input.verifiedName?.trim() && { metaVerifiedName: input.verifiedName.trim() }),
      ...(input.qualityRating?.trim() && { metaQualityRating: input.qualityRating.trim() }),
    }

    const connection = existing
      ? await inboxDb.channelConnection.update({
          where: { id: existing.id },
          data: {
            name: connectionName,
            status: 'disconnected',
            externalAccountLabel: this.buildEmbeddedSignupLabel(input) ?? existing.externalAccountLabel,
            credentials: mergedCredentials as Prisma.InputJsonValue,
            settings: mergedSettings as Prisma.InputJsonValue,
          },
        })
      : await inboxDb.channelConnection.create({
          data: {
            workspaceId,
            provider: 'meta',
            channel: 'whatsapp',
            name: connectionName,
            status: 'disconnected',
            externalAccountId: phoneNumberId,
            externalAccountLabel: this.buildEmbeddedSignupLabel(input),
            credentials: mergedCredentials as Prisma.InputJsonValue,
            settings: mergedSettings as Prisma.InputJsonValue,
          },
        })

    const result = await this.testConnection(workspaceId, connection.id)

    return {
      mode: existing ? 'updated' : 'created',
      ...result,
    }
  }


  async completeWhatsAppEmbeddedSignupFromCode(
    workspaceId: string,
    input: CompleteWhatsAppEmbeddedSignupCodeInput,
    metaAuth: { appId?: string; appSecret?: string }
  ): Promise<EmbeddedSignupCodeCompletionResult> {
    const code = input.code?.trim()
    const appId = metaAuth.appId?.trim()
    const appSecret = metaAuth.appSecret?.trim()

    if (!code) {
      throw new ValidationError('code es obligatorio para completar Embedded Signup via popup')
    }

    if (!appId || !appSecret) {
      throw new ValidationError('Faltan META_APP_ID o META_APP_SECRET para completar Embedded Signup via popup')
    }

    const adapter = this.requireAdapter('meta')
    if (!adapter.exchangeEmbeddedSignupCode) {
      throw new ValidationError('El adapter de Meta no implementa code exchange de Embedded Signup')
    }

    const exchange = await adapter.exchangeEmbeddedSignupCode({
      provider: 'meta',
      channel: 'whatsapp',
      appId,
      appSecret,
      code,
      redirectUri: input.redirectUri?.trim() || undefined,
    })

    const completion = await this.completeWhatsAppEmbeddedSignup(workspaceId, {
      phoneNumberId: input.phoneNumberId,
      accessToken: exchange.accessToken,
      businessId: input.businessId,
      wabaId: input.wabaId,
      displayPhoneNumber: input.displayPhoneNumber,
      verifiedName: input.verifiedName,
      qualityRating: input.qualityRating,
      name: input.name,
    })

    return {
      ...completion,
      exchange: {
        tokenType: exchange.tokenType,
        expiresIn: exchange.expiresIn,
      },
    }
  }

  async sendConversationMessage(
    workspaceId: string,
    conversationId: string,
    input: SendConversationMessageInput
  ): Promise<unknown> {
    const text = input.text?.trim()
    const attachment = this.normalizeOutboundAttachment(input.attachment)

    if (!text && !attachment) {
      throw new ValidationError('Debes enviar texto o un adjunto')
    }

    const conversation = await inboxDb.conversation.findFirst({
      where: { id: conversationId, workspaceId },
      include: {
        connection: true,
      },
    })

    if (!conversation) {
      throw new NotFoundError('Conversation', conversationId)
    }

    if (!conversation.externalUserId) {
      throw new ValidationError('La conversacion no tiene externalUserId para enviar mensajes')
    }

    const adapter = this.requireAdapter(conversation.provider)
    const replyTarget = await this.resolveReplyTarget(
      workspaceId,
      conversationId,
      input.replyToMessageId
    )
    const queuedAt = new Date()

    const pendingMessage = await inboxDb.$transaction(async (tx: any) => {
      const createdMessage = await tx.message.create({
        data: {
          workspaceId,
          conversationId: conversation.id,
          contactId: conversation.contactId,
          provider: conversation.provider,
          channel: conversation.channel,
          direction: 'outbound',
          type: attachment?.type ?? 'text',
          status: 'pending',
          providerReplyToId: replyTarget?.providerMessageId,
          text,
          metadata: {
            ...(input.previewUrl !== undefined && { previewUrl: input.previewUrl }),
          } as Prisma.InputJsonValue,
        },
      })

      if (attachment) {
        await tx.messageAttachment.create({
          data: {
            messageId: createdMessage.id,
            type: attachment.type,
            mimeType: attachment.mimeType,
            url: attachment.url,
            externalAssetId: attachment.externalAssetId,
            fileName: attachment.fileName,
            metadata: {} as Prisma.InputJsonValue,
          },
        })
      }

      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: queuedAt,
          status: 'open',
          inboxState: 'active',
        },
      })

      return createdMessage
    })

    const draft: OutboundMessageDraft = {
      provider: conversation.provider,
      channel: conversation.channel,
      externalAccountId: conversation.connection.externalAccountId,
      externalUserId: conversation.externalUserId,
      externalThreadId: conversation.externalThreadId,
      providerReplyToId: replyTarget?.providerMessageId,
      text,
      attachments: attachment ? [attachment] : undefined,
      metadata: {
        ...(input.previewUrl !== undefined && { previewUrl: input.previewUrl }),
      },
      credentials: this.asJsonRecord(conversation.connection.credentials),
      settings: this.asJsonRecord(conversation.connection.settings),
    }

    try {
      const result = await adapter.sendMessage(draft)

      const message = await inboxDb.$transaction(async (tx: any) => {
        await tx.message.update({
          where: { id: pendingMessage.id },
          data: {
            status: 'sent',
            providerMessageId: result.providerMessageId,
            rawPayload: result.rawResponse as Prisma.InputJsonValue,
            sentAt: result.acceptedAt,
            failedAt: null,
          },
        })

        await tx.messageDelivery.create({
          data: {
            messageId: pendingMessage.id,
            providerMessageId: result.providerMessageId,
            providerStatus: 'accepted',
            providerTimestamp: result.acceptedAt,
            rawPayload: result.rawResponse as Prisma.InputJsonValue,
          },
        })

        await tx.conversation.update({
          where: { id: conversation.id },
          data: {
            lastOutboundAt: result.acceptedAt,
            lastMessageAt: result.acceptedAt,
            status: 'open',
            inboxState: 'active',
          },
        })

        return tx.message.findUnique({
          where: { id: pendingMessage.id },
          include: {
            attachments: true,
            deliveries: {
              orderBy: { createdAt: 'asc' },
            },
          },
        })
      })

      await this.eventBus.emit('message.sent', {
        workspaceId,
        provider: conversation.provider,
        channel: conversation.channel,
        contactId: conversation.contactId,
        conversationId: conversation.id,
        messageId: pendingMessage.id,
      })

      return message
    } catch (error) {
      const failedAt = new Date()
      const rawPayload = this.serializeError(error)

      await inboxDb.$transaction(async (tx: any) => {
        await tx.message.update({
          where: { id: pendingMessage.id },
          data: {
            status: 'failed',
            rawPayload: rawPayload as Prisma.InputJsonValue,
            failedAt,
          },
        })

        await tx.messageDelivery.create({
          data: {
            messageId: pendingMessage.id,
            providerStatus: 'failed',
            providerTimestamp: failedAt,
            errorMessage: this.extractErrorMessage(error),
            rawPayload: rawPayload as Prisma.InputJsonValue,
          },
        })
      })

      throw error
    }
  }

  async ingestInboundMessage(message: NormalizedInboundMessage): Promise<IngestResult> {
    if (!message.externalAccountId || !message.externalUserId) {
      return { status: 'ignored', reason: 'missing_external_ids' }
    }

    const connection = await inboxDb.channelConnection.findFirst({
      where: {
        provider: message.provider,
        channel: message.channel,
        externalAccountId: message.externalAccountId,
      },
    })

    if (!connection) {
      return { status: 'ignored', reason: 'connection_not_found' }
    }

    if (message.providerMessageId) {
      const existing = await inboxDb.message.findUnique({
        where: { providerMessageId: message.providerMessageId },
      })

      if (existing) {
        return {
          status: 'duplicate',
          workspaceId: existing.workspaceId,
          conversationId: existing.conversationId,
          messageId: existing.id,
        }
      }
    }

    const result = await inboxDb.$transaction(async (tx: any) => {
      const identity = await this.ensureIdentity(tx, connection.workspaceId, message)

      const conversation = await tx.conversation.upsert({
        where: {
          connectionId_contactId: {
            connectionId: connection.id,
            contactId: identity.contactId,
          },
        },
        update: {
          provider: message.provider,
          channel: message.channel,
          externalThreadId: message.externalThreadId,
          externalUserId: message.externalUserId,
          lastInboundAt: message.occurredAt,
          lastMessageAt: message.occurredAt,
          unreadCount: { increment: 1 },
          status: 'open',
          inboxState: 'active',
        },
        create: {
          workspaceId: connection.workspaceId,
          connectionId: connection.id,
          contactId: identity.contactId,
          provider: message.provider,
          channel: message.channel,
          externalThreadId: message.externalThreadId,
          externalUserId: message.externalUserId,
          lastInboundAt: message.occurredAt,
          lastMessageAt: message.occurredAt,
          unreadCount: 1,
          status: 'open',
          inboxState: 'active',
        },
      })

      const createdMessage = await tx.message.create({
        data: {
          workspaceId: connection.workspaceId,
          conversationId: conversation.id,
          contactId: identity.contactId,
          provider: message.provider,
          channel: message.channel,
          direction: 'inbound',
          type: message.type,
          status: 'received',
          providerMessageId: message.providerMessageId,
          providerReplyToId: message.providerReplyToId,
          text: message.text,
          rawPayload: (message.rawPayload ?? null) as Prisma.InputJsonValue,
          metadata: (message.metadata ?? {}) as Prisma.InputJsonValue,
          sentAt: message.occurredAt,
        },
      })

      if (message.attachments?.length) {
        await tx.messageAttachment.createMany({
          data: message.attachments.map((attachment) => ({
            messageId: createdMessage.id,
            type: attachment.type,
            mimeType: attachment.mimeType,
            url: attachment.url,
            externalAssetId: attachment.externalAssetId,
            fileName: attachment.fileName,
            sizeBytes: attachment.sizeBytes,
            metadata: (attachment.metadata ?? {}) as Prisma.InputJsonValue,
          })),
        })
      }

      return {
        workspaceId: connection.workspaceId,
        conversationId: conversation.id,
        messageId: createdMessage.id,
        contactId: identity.contactId,
      }
    })

    await this.eventBus.emit('message.received', {
      workspaceId: result.workspaceId,
      channel: message.channel,
      provider: message.provider,
      contactId: result.contactId,
      conversationId: result.conversationId,
      messageId: result.messageId,
    })

    return {
      status: 'created',
      workspaceId: result.workspaceId,
      conversationId: result.conversationId,
      messageId: result.messageId,
    }
  }

  async applyDeliveryEvent(event: NormalizedDeliveryEvent): Promise<DeliveryEventResult> {
    if (!event.externalAccountId || !event.providerMessageId) {
      return { status: 'ignored', reason: 'missing_external_ids' }
    }

    const connection = await inboxDb.channelConnection.findFirst({
      where: {
        provider: event.provider,
        channel: event.channel,
        externalAccountId: event.externalAccountId,
      },
      select: {
        id: true,
        workspaceId: true,
      },
    })

    if (!connection) {
      return { status: 'ignored', reason: 'connection_not_found' }
    }

    const message = await inboxDb.message.findUnique({
      where: { providerMessageId: event.providerMessageId },
      select: {
        id: true,
        workspaceId: true,
        conversationId: true,
        status: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
        failedAt: true,
      },
    })

    if (!message) {
      return { status: 'ignored', reason: 'message_not_found' }
    }

    if (message.workspaceId !== connection.workspaceId) {
      return { status: 'ignored', reason: 'workspace_mismatch' }
    }

    const duplicateDelivery = await inboxDb.messageDelivery.findFirst({
      where: {
        messageId: message.id,
        providerMessageId: event.providerMessageId,
        providerStatus: event.status,
        providerTimestamp: event.occurredAt,
      },
      select: { id: true },
    })

    if (duplicateDelivery) {
      return {
        status: 'duplicate',
        workspaceId: message.workspaceId,
        conversationId: message.conversationId,
        messageId: message.id,
      }
    }

    const messageUpdate = this.buildMessageStatusUpdate(message, event)

    await inboxDb.$transaction(async (tx: any) => {
      if (Object.keys(messageUpdate).length > 0) {
        await tx.message.update({
          where: { id: message.id },
          data: messageUpdate,
        })
      }

      await tx.messageDelivery.create({
        data: {
          messageId: message.id,
          providerMessageId: event.providerMessageId,
          providerStatus: event.status,
          providerTimestamp: event.occurredAt,
          errorCode: event.errorCode,
          errorMessage: event.errorMessage,
          rawPayload: event.rawPayload as Prisma.InputJsonValue,
        },
      })
    })

    return {
      status: 'updated',
      workspaceId: message.workspaceId,
      conversationId: message.conversationId,
      messageId: message.id,
    }
  }

  async listConversations(
    workspaceId: string,
    filters: ConversationFilters
  ): Promise<PaginatedResult<unknown>> {
    const page = filters.page ?? 0
    const limit = Math.min(filters.limit ?? 25, 100)

    const where = {
      workspaceId,
      ...(filters.channel && { channel: filters.channel }),
      ...(filters.status && { status: filters.status }),
    }

    const [items, total] = await Promise.all([
      inboxDb.conversation.findMany({
        where,
        take: limit,
        skip: page * limit,
        orderBy: [
          { lastMessageAt: 'desc' },
          { updatedAt: 'desc' },
        ],
        include: {
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          connection: {
            select: {
              id: true,
              name: true,
              channel: true,
              status: true,
              externalAccountId: true,
              externalAccountLabel: true,
            },
          },
          messages: {
            take: 1,
            orderBy: [
              { sentAt: 'desc' },
              { createdAt: 'desc' },
            ],
            select: {
              id: true,
              direction: true,
              type: true,
              text: true,
              status: true,
              sentAt: true,
              createdAt: true,
              attachments: {
                take: 1,
                select: {
                  type: true,
                  url: true,
                  fileName: true,
                },
              },
            },
          },
        },
      }),
      inboxDb.conversation.count({ where }),
    ])

    return paginate(items, total, page, limit)
  }

  async markConversationAsRead(
    workspaceId: string,
    conversationId: string
  ): Promise<void> {
    const conversation = await inboxDb.conversation.findFirst({
      where: { id: conversationId, workspaceId },
      select: { id: true },
    })

    if (!conversation) {
      throw new NotFoundError('Conversation', conversationId)
    }

    await inboxDb.conversation.update({
      where: { id: conversationId },
      data: {
        unreadCount: 0,
        inboxState: 'active',
      },
    })
  }

  async listMessages(
    workspaceId: string,
    conversationId: string,
    filters: PaginationQuery
  ): Promise<PaginatedResult<unknown>> {
    const page = filters.page ?? 0
    const limit = Math.min(filters.limit ?? 50, 100)

    const conversation = await inboxDb.conversation.findFirst({
      where: { id: conversationId, workspaceId },
      select: { id: true },
    })

    if (!conversation) {
      throw new NotFoundError('Conversation', conversationId)
    }

    const where = {
      workspaceId,
      conversationId,
    }

    const [items, total] = await Promise.all([
      inboxDb.message.findMany({
        where,
        take: limit,
        skip: page * limit,
        orderBy: [
          { sentAt: 'asc' },
          { createdAt: 'asc' },
        ],
        include: {
          attachments: true,
          deliveries: {
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
      inboxDb.message.count({ where }),
    ])

    return paginate(items, total, page, limit)
  }

  private async ensureIdentity(
    tx: any,
    workspaceId: string,
    message: NormalizedInboundMessage
  ) {
    const existing = await tx.contactIdentity.findUnique({
      where: {
        workspaceId_channel_externalUserId: {
          workspaceId,
          channel: message.channel,
          externalUserId: message.externalUserId,
        },
      },
    })

    if (existing) {
      return existing
    }

    const displayName = this.extractDisplayName(message)

    try {
      const contact = await tx.contact.create({
        data: {
          workspaceId,
          firstName: displayName.slice(0, 100),
          source: message.channel.toUpperCase(),
          tags: [],
          customData: {},
        },
      })

      return await tx.contactIdentity.create({
        data: {
          workspaceId,
          contactId: contact.id,
          provider: message.provider,
          channel: message.channel,
          externalUserId: message.externalUserId,
          externalUsername: this.extractUsername(message),
          externalDisplayName: displayName,
          metadata: (message.metadata ?? {}) as Prisma.InputJsonValue,
        },
      })
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return tx.contactIdentity.findUniqueOrThrow({
          where: {
            workspaceId_channel_externalUserId: {
              workspaceId,
              channel: message.channel,
              externalUserId: message.externalUserId,
            },
          },
        })
      }

      throw error
    }
  }

  private extractDisplayName(message: NormalizedInboundMessage): string {
    const candidate = typeof message.metadata?.displayName === 'string'
      ? message.metadata.displayName
      : undefined

    if (candidate?.trim()) return candidate.trim()

    const fallback = message.channel.charAt(0).toUpperCase() + message.channel.slice(1)
    return `Contacto ${fallback}`
  }

  private extractUsername(message: NormalizedInboundMessage): string | undefined {
    const candidate = message.metadata?.username
    return typeof candidate === 'string' && candidate.trim()
      ? candidate.trim()
      : undefined
  }

  private async requireConnection(workspaceId: string, connectionId: string): Promise<any> {
    const connection = await inboxDb.channelConnection.findFirst({
      where: { id: connectionId, workspaceId },
    })

    if (!connection) {
      throw new NotFoundError('ChannelConnection', connectionId)
    }

    return connection
  }

  private requireAdapter(provider: string): ChannelProviderAdapter {
    const adapter = this.adapters[provider]
    if (!adapter) {
      throw new ValidationError(`No hay adapter configurado para el provider ${provider}`)
    }

    return adapter
  }

  private async resolveReplyTarget(
    workspaceId: string,
    conversationId: string,
    replyToMessageId?: string
  ) {
    if (!replyToMessageId) return null

    const message = await inboxDb.message.findFirst({
      where: {
        id: replyToMessageId,
        workspaceId,
        conversationId,
      },
      select: {
        id: true,
        providerMessageId: true,
      },
    })

    if (!message) {
      throw new NotFoundError('Message', replyToMessageId)
    }

    if (!message.providerMessageId) {
      throw new ValidationError('No se puede responder sobre un mensaje que no tiene providerMessageId')
    }

    return message
  }

  private normalizeOutboundAttachment(
    input: SendConversationMessageInput['attachment']
  ): NormalizedAttachment | undefined {
    if (!input) return undefined

    const url = input.url?.trim()
    const externalAssetId = input.externalAssetId?.trim()

    if (!url && !externalAssetId) {
      throw new ValidationError('El adjunto necesita url o externalAssetId')
    }

    return {
      type: input.type,
      ...(url && { url }),
      ...(externalAssetId && { externalAssetId }),
      ...(input.mimeType?.trim() && { mimeType: input.mimeType.trim() }),
      ...(input.fileName?.trim() && { fileName: input.fileName.trim() }),
      metadata: {},
    }
  }

  private buildMessageStatusUpdate(message: any, event: NormalizedDeliveryEvent): Record<string, unknown> {
    const currentStatus = typeof message.status === 'string' ? message.status : 'pending'

    switch (event.status) {
      case 'sent':
        if (currentStatus === 'failed' || currentStatus === 'deleted') {
          return {}
        }

        return {
          ...(this.shouldAdvanceProgressStatus(currentStatus, 'sent') && {
            status: 'sent',
          }),
          ...(message.sentAt ? {} : { sentAt: event.occurredAt }),
        }
      case 'delivered':
        if (currentStatus === 'failed' || currentStatus === 'deleted') {
          return {}
        }

        return {
          ...(this.shouldAdvanceProgressStatus(currentStatus, 'delivered') && {
            status: 'delivered',
          }),
          ...(message.sentAt ? {} : { sentAt: event.occurredAt }),
          ...(message.deliveredAt ? {} : { deliveredAt: event.occurredAt }),
        }
      case 'read':
        if (currentStatus === 'failed' || currentStatus === 'deleted') {
          return {}
        }

        return {
          ...(this.shouldAdvanceProgressStatus(currentStatus, 'read') && {
            status: 'read',
          }),
          ...(message.sentAt ? {} : { sentAt: event.occurredAt }),
          ...(message.deliveredAt ? {} : { deliveredAt: event.occurredAt }),
          ...(message.readAt ? {} : { readAt: event.occurredAt }),
        }
      case 'failed':
        if (!this.shouldMarkAsFailed(currentStatus)) {
          return {}
        }

        return {
          status: 'failed',
          ...(message.failedAt ? {} : { failedAt: event.occurredAt }),
        }
      case 'deleted':
        return {
          ...(currentStatus !== 'deleted' && { status: 'deleted' }),
        }
      default:
        return {}
    }
  }

  private shouldAdvanceProgressStatus(
    currentStatus: string,
    nextStatus: 'sent' | 'delivered' | 'read'
  ): boolean {
    if (currentStatus === 'failed' || currentStatus === 'deleted') {
      return false
    }

    return this.getStatusOrder(nextStatus) > this.getStatusOrder(currentStatus)
  }

  private shouldMarkAsFailed(currentStatus: string): boolean {
    return currentStatus !== 'delivered'
      && currentStatus !== 'read'
      && currentStatus !== 'deleted'
      && currentStatus !== 'failed'
  }

  private getStatusOrder(status: string): number {
    switch (status) {
      case 'sent':
        return 1
      case 'delivered':
        return 2
      case 'read':
        return 3
      default:
        return 0
    }
  }

  private buildEmbeddedSignupLabel(input: {
    displayPhoneNumber?: string
    verifiedName?: string
  }): string | undefined {
    const verifiedName = input.verifiedName?.trim()
    const displayPhoneNumber = input.displayPhoneNumber?.trim()

    if (verifiedName && displayPhoneNumber) {
      return `${verifiedName} (${displayPhoneNumber})`
    }

    return verifiedName || displayPhoneNumber || undefined
  }

  private sanitizeConnection(connection: any) {
    return {
      id: connection.id,
      workspaceId: connection.workspaceId,
      provider: connection.provider,
      channel: connection.channel,
      name: connection.name,
      status: connection.status,
      externalAccountId: connection.externalAccountId,
      externalAccountLabel: connection.externalAccountLabel,
      settings: connection.settings,
      hasCredentials: this.hasCredentials(connection.credentials),
      lastSyncedAt: connection.lastSyncedAt,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    }
  }

  private hasCredentials(value: unknown): boolean {
    return !!value && typeof value === 'object' && Object.keys(value as Record<string, unknown>).length > 0
  }

  private asJsonRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined
  }

  private serializeError(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
      }
    }

    return {
      message: String(error),
    }
  }

  private extractErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Error desconocido al enviar el mensaje'
  }
}
