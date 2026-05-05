export type ChannelProvider = 'meta' | 'tiktok'

export type ChannelKind =
  | 'whatsapp'
  | 'instagram'
  | 'messenger'
  | 'tiktok'

export type MessageDirection = 'inbound' | 'outbound'

export type MessageKind =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'file'
  | 'sticker'
  | 'unsupported'

export type DeliveryStatus =
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'deleted'

export interface NormalizedAttachment {
  type: Exclude<MessageKind, 'text' | 'unsupported'>
  mimeType?: string
  url?: string
  externalAssetId?: string
  fileName?: string
  sizeBytes?: number
  metadata?: Record<string, unknown>
}

export interface NormalizedInboundMessage {
  provider: ChannelProvider
  channel: ChannelKind
  externalAccountId: string
  externalUserId: string
  externalThreadId?: string
  providerMessageId?: string
  providerReplyToId?: string
  text?: string
  type: MessageKind
  occurredAt: Date
  rawPayload: unknown
  attachments?: NormalizedAttachment[]
  metadata?: Record<string, unknown>
}

export interface NormalizedDeliveryEvent {
  provider: ChannelProvider
  channel: ChannelKind
  externalAccountId: string
  providerMessageId: string
  externalUserId?: string
  status: DeliveryStatus
  occurredAt: Date
  rawPayload: unknown
  errorCode?: string
  errorMessage?: string
  metadata?: Record<string, unknown>
}

export interface ConnectionInspectionInput {
  provider: ChannelProvider
  channel: ChannelKind
  externalAccountId: string
  credentials?: Record<string, unknown>
  settings?: Record<string, unknown>
}

export interface ConnectionInspectionResult {
  status: 'connected'
  externalAccountLabel?: string
  metadata?: Record<string, unknown>
  rawResponse: unknown
}

export interface PhoneRegistrationInput {
  provider: ChannelProvider
  channel: ChannelKind
  externalAccountId: string
  pin: string
  credentials?: Record<string, unknown>
  settings?: Record<string, unknown>
}

export interface PhoneRegistrationResult {
  registeredAt: Date
  metadata?: Record<string, unknown>
  rawResponse: unknown
}

export interface EmbeddedSignupCodeExchangeInput {
  provider: ChannelProvider
  channel: ChannelKind
  appId: string
  appSecret: string
  code: string
  redirectUri?: string
  settings?: Record<string, unknown>
}

export interface EmbeddedSignupCodeExchangeResult {
  accessToken: string
  tokenType?: string
  expiresIn?: number
  rawResponse: unknown
}

export interface OutboundMessageDraft {
  provider: ChannelProvider
  channel: ChannelKind
  externalAccountId: string
  externalUserId: string
  externalThreadId?: string
  providerReplyToId?: string
  text?: string
  attachments?: NormalizedAttachment[]
  metadata?: Record<string, unknown>
  credentials?: Record<string, unknown>
  settings?: Record<string, unknown>
}

export interface OutboundMessageResult {
  providerMessageId: string
  acceptedAt: Date
  rawResponse: unknown
}
