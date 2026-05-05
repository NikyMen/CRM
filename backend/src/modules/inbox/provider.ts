import type {
  ConnectionInspectionInput,
  ConnectionInspectionResult,
  EmbeddedSignupCodeExchangeInput,
  EmbeddedSignupCodeExchangeResult,
  NormalizedDeliveryEvent,
  NormalizedInboundMessage,
  OutboundMessageDraft,
  OutboundMessageResult,
  PhoneRegistrationInput,
  PhoneRegistrationResult,
} from './types'

export interface VerifyWebhookResult {
  ok: boolean
  challenge?: string
}

export interface WebhookEnvelope {
  headers: Record<string, string | string[] | undefined>
  query: Record<string, unknown>
  body: unknown
}

// Cada proveedor traduce su formato al mismo contrato interno.
// Si no hacemos esto ahora, despues la app queda llena de casos especiales.
export interface ChannelProviderAdapter {
  readonly provider: string
  readonly channel: string

  verifyWebhook(input: WebhookEnvelope): Promise<VerifyWebhookResult>
  parseInbound(input: WebhookEnvelope): Promise<NormalizedInboundMessage[]>
  parseDeliveryEvents(input: WebhookEnvelope): Promise<NormalizedDeliveryEvent[]>
  inspectConnection(input: ConnectionInspectionInput): Promise<ConnectionInspectionResult>
  exchangeEmbeddedSignupCode?(input: EmbeddedSignupCodeExchangeInput): Promise<EmbeddedSignupCodeExchangeResult>
  registerPhoneNumber?(input: PhoneRegistrationInput): Promise<PhoneRegistrationResult>
  sendMessage(input: OutboundMessageDraft): Promise<OutboundMessageResult>
}

