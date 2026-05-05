import { ValidationError } from '../../types'
import type {
  ChannelProviderAdapter,
  VerifyWebhookResult,
  WebhookEnvelope,
} from './provider'
import type {
  ConnectionInspectionInput,
  ConnectionInspectionResult,
  DeliveryStatus,
  EmbeddedSignupCodeExchangeInput,
  EmbeddedSignupCodeExchangeResult,
  MessageKind,
  NormalizedAttachment,
  NormalizedDeliveryEvent,
  NormalizedInboundMessage,
  OutboundMessageDraft,
  OutboundMessageResult,
  PhoneRegistrationInput,
  PhoneRegistrationResult,
} from './types'

type PlainObject = Record<string, any>
type JsonRecord = Record<string, unknown>
type ProviderRequestInput = {
  credentials?: Record<string, unknown>
  settings?: Record<string, unknown>
}

export class MetaWebhookAdapter implements ChannelProviderAdapter {
  readonly provider = 'meta'
  readonly channel = 'meta'

  private static readonly DEFAULT_API_VERSION = 'v23.0'
  private static readonly DEFAULT_BASE_URL = 'https://graph.facebook.com'

  constructor(private readonly verifyToken?: string) {}

  async verifyWebhook(input: WebhookEnvelope): Promise<VerifyWebhookResult> {
    const mode = this.asString(input.query['hub.mode'])
    const token = this.asString(input.query['hub.verify_token'])
    const challenge = this.asString(input.query['hub.challenge'])

    if (mode !== 'subscribe' || !challenge || !this.verifyToken) {
      return { ok: false }
    }

    return {
      ok: token === this.verifyToken,
      challenge,
    }
  }

  async parseInbound(input: WebhookEnvelope): Promise<NormalizedInboundMessage[]> {
    const body = (input.body ?? {}) as PlainObject

    if (body.object === 'whatsapp_business_account') {
      return this.parseWhatsApp(body)
    }

    if (body.object === 'page') {
      return this.parsePageStyleMessages(body, 'messenger')
    }

    if (body.object === 'instagram') {
      return this.parsePageStyleMessages(body, 'instagram')
    }

    return []
  }

  async parseDeliveryEvents(input: WebhookEnvelope): Promise<NormalizedDeliveryEvent[]> {
    const body = (input.body ?? {}) as PlainObject

    if (body.object === 'whatsapp_business_account') {
      return this.parseWhatsAppDeliveryEvents(body)
    }

    return []
  }

  async inspectConnection(input: ConnectionInspectionInput): Promise<ConnectionInspectionResult> {
    if (input.channel !== 'whatsapp') {
      throw new ValidationError('Meta solo implementa prueba de conexion para WhatsApp en este paso')
    }

    const externalAccountId = this.asString(input.externalAccountId)
    if (!externalAccountId) {
      throw new ValidationError('La conexion de WhatsApp no tiene externalAccountId configurado')
    }

    const accessToken = this.readString(input.credentials, 'accessToken')
    if (!accessToken) {
      throw new ValidationError('La conexion de WhatsApp no tiene accessToken configurado')
    }

    const fields = [
      'id',
      'display_phone_number',
      'verified_name',
      'quality_rating',
      'code_verification_status',
      'name_status',
    ]

    const query = new URLSearchParams({
      fields: fields.join(','),
    })

    const endpoint = `${this.resolveBaseUrl(input)}/${this.resolveApiVersion(input)}/${externalAccountId}?${query.toString()}`
    const rawResponse = await this.getJson(endpoint, accessToken)

    return {
      status: 'connected',
      externalAccountLabel: this.buildWhatsAppConnectionLabel(rawResponse),
      metadata: {
        phoneNumberId: this.asString(rawResponse.id) ?? externalAccountId,
        displayPhoneNumber: this.asString(rawResponse.display_phone_number),
        verifiedName: this.asString(rawResponse.verified_name),
        qualityRating: this.asString(rawResponse.quality_rating),
        codeVerificationStatus: this.asString(rawResponse.code_verification_status),
        nameStatus: this.asString(rawResponse.name_status),
      },
      rawResponse,
    }
  }

  async registerPhoneNumber(
    input: PhoneRegistrationInput
  ): Promise<PhoneRegistrationResult> {
    if (input.channel !== 'whatsapp') {
      throw new ValidationError('Meta solo implementa registro de numero para WhatsApp en este paso')
    }

    const externalAccountId = this.asString(input.externalAccountId)
    if (!externalAccountId) {
      throw new ValidationError('La conexion de WhatsApp no tiene externalAccountId configurado')
    }

    const pin = this.asString(input.pin)
    if (!pin || !/^\d{6}$/.test(pin)) {
      throw new ValidationError('El PIN de registro de WhatsApp debe tener 6 digitos')
    }

    const accessToken = this.readString(input.credentials, 'accessToken')
    if (!accessToken) {
      throw new ValidationError('La conexion de WhatsApp no tiene accessToken configurado')
    }

    const endpoint = `${this.resolveBaseUrl(input)}/${this.resolveApiVersion(input)}/${externalAccountId}/register`
    const rawResponse = await this.postJson(endpoint, accessToken, {
      messaging_product: 'whatsapp',
      pin,
    })

    return {
      registeredAt: new Date(),
      metadata: {
        phoneNumberId: externalAccountId,
      },
      rawResponse,
    }
  }

  async exchangeEmbeddedSignupCode(
    input: EmbeddedSignupCodeExchangeInput
  ): Promise<EmbeddedSignupCodeExchangeResult> {
    if (input.channel !== 'whatsapp') {
      throw new ValidationError('Meta solo implementa code exchange para WhatsApp en este paso')
    }

    const appId = this.asString(input.appId)
    const appSecret = this.asString(input.appSecret)
    const code = this.asString(input.code)

    if (!appId || !appSecret) {
      throw new ValidationError('Faltan META_APP_ID o META_APP_SECRET para completar el code exchange')
    }

    if (!code) {
      throw new ValidationError('El code de Embedded Signup es obligatorio')
    }

    const query = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      code,
    })

    const redirectUri = this.asString(input.redirectUri)
    if (redirectUri) {
      query.set('redirect_uri', redirectUri)
    }

    const endpoint = `${this.resolveBaseUrl(input)}/${this.resolveApiVersion(input)}/oauth/access_token?${query.toString()}`
    const rawResponse = await this.requestPublicJson('GET', endpoint)
    const accessToken = this.asString(rawResponse.access_token)

    if (!accessToken) {
      throw new Error('Meta no devolvio access_token al intercambiar el code')
    }

    return {
      accessToken,
      tokenType: this.asString(rawResponse.token_type),
      expiresIn: this.asNumber(rawResponse.expires_in),
      rawResponse,
    }
  }
  async sendMessage(input: OutboundMessageDraft): Promise<OutboundMessageResult> {
    if (input.channel !== 'whatsapp') {
      throw new ValidationError('Meta solo implementa envio saliente para WhatsApp en este paso')
    }

    if ((input.attachments?.length ?? 0) > 1) {
      throw new ValidationError('WhatsApp solo admite un adjunto saliente por mensaje en este paso')
    }

    const externalAccountId = this.asString(input.externalAccountId)
    if (!externalAccountId) {
      throw new ValidationError('La conexion de WhatsApp no tiene externalAccountId configurado')
    }

    const externalUserId = this.asString(input.externalUserId)
    if (!externalUserId) {
      throw new ValidationError('La conversacion no tiene externalUserId para enviar el mensaje')
    }

    const text = this.asString(input.text)
    const attachment = input.attachments?.[0]

    if (!text && !attachment) {
      throw new ValidationError('WhatsApp necesita texto o un adjunto para enviar el mensaje')
    }

    const accessToken = this.readString(input.credentials, 'accessToken')
    if (!accessToken) {
      throw new ValidationError('La conexion de WhatsApp no tiene accessToken configurado')
    }

    const previewUrl = this.readBoolean(input.metadata, 'previewUrl')
    const payload = attachment
      ? this.buildWhatsAppMediaPayload({
          to: externalUserId,
          text,
          attachment,
          providerReplyToId: input.providerReplyToId,
        })
      : this.buildWhatsAppTextPayload({
          to: externalUserId,
          text,
          previewUrl,
          providerReplyToId: input.providerReplyToId,
        })

    const endpoint = `${this.resolveBaseUrl(input)}/${this.resolveApiVersion(input)}/${externalAccountId}/messages`
    const rawResponse = await this.postJson(endpoint, accessToken, payload)
    const providerMessageId = this.asString(rawResponse.messages?.[0]?.id)

    if (!providerMessageId) {
      throw new Error('Meta acepto el envio pero no devolvio el id del mensaje')
    }

    return {
      providerMessageId,
      acceptedAt: new Date(),
      rawResponse,
    }
  }

  private buildWhatsAppTextPayload(input: {
    to: string
    text?: string
    previewUrl?: boolean
    providerReplyToId?: string
  }): PlainObject {
    if (!input.text) {
      throw new ValidationError('El mensaje de WhatsApp no puede estar vacio')
    }

    const payload: PlainObject = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: input.to,
      type: 'text',
      text: {
        body: input.text,
      },
    }

    if (input.previewUrl !== undefined) {
      payload.text.preview_url = input.previewUrl
    }

    if (input.providerReplyToId) {
      payload.context = {
        message_id: input.providerReplyToId,
      }
    }

    return payload
  }

  private buildWhatsAppMediaPayload(input: {
    to: string
    text?: string
    attachment: NormalizedAttachment
    providerReplyToId?: string
  }): PlainObject {
    const mediaType = this.mapOutboundWhatsAppMediaType(input.attachment.type)
    if (!mediaType) {
      throw new ValidationError('WhatsApp no admite ese tipo de adjunto saliente en este paso')
    }

    if (mediaType === 'audio' && input.text) {
      throw new ValidationError('WhatsApp no admite caption en mensajes de audio')
    }

    const mediaObject: PlainObject = {
      ...(input.attachment.externalAssetId
        ? { id: input.attachment.externalAssetId }
        : input.attachment.url
          ? { link: input.attachment.url }
          : {}),
    }

    if (!mediaObject.id && !mediaObject.link) {
      throw new ValidationError('El adjunto de WhatsApp necesita externalAssetId o url')
    }

    if (input.text && mediaType !== 'audio') {
      mediaObject.caption = input.text
    }

    if (mediaType === 'document' && input.attachment.fileName) {
      mediaObject.filename = input.attachment.fileName
    }

    const payload: PlainObject = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: input.to,
      type: mediaType,
      [mediaType]: mediaObject,
    }

    if (input.providerReplyToId) {
      payload.context = {
        message_id: input.providerReplyToId,
      }
    }

    return payload
  }

  private mapOutboundWhatsAppMediaType(type: NormalizedAttachment['type']): 'image' | 'audio' | 'video' | 'document' | null {
    switch (type) {
      case 'image':
        return 'image'
      case 'audio':
        return 'audio'
      case 'video':
        return 'video'
      case 'file':
        return 'document'
      default:
        return null
    }
  }

  private async getJson(url: string, accessToken: string): Promise<PlainObject> {
    return this.requestJson('GET', url, accessToken)
  }

  private async postJson(
    url: string,
    accessToken: string,
    payload: PlainObject
  ): Promise<PlainObject> {
    return this.requestJson('POST', url, accessToken, payload)
  }

  private async requestPublicJson(
    method: 'GET' | 'POST',
    url: string,
    payload?: PlainObject
  ): Promise<PlainObject> {
    return this.requestJsonCore(method, url, undefined, payload)
  }

  private async requestJson(
    method: 'GET' | 'POST',
    url: string,
    accessToken: string,
    payload?: PlainObject
  ): Promise<PlainObject> {
    return this.requestJsonCore(method, url, accessToken, payload)
  }

  private async requestJsonCore(
    method: 'GET' | 'POST',
    url: string,
    accessToken?: string,
    payload?: PlainObject
  ): Promise<PlainObject> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15_000)

    let response: Response
    try {
      response = await fetch(url, {
        method,
        headers: {
          ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
          'Content-Type': 'application/json',
        },
        ...(payload && { body: JSON.stringify(payload) }),
        signal: controller.signal,
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Meta no respondio a tiempo')
      }

      throw error
    } finally {
      clearTimeout(timeoutId)
    }

    const rawBody = await response.text()
    const parsedBody = this.parseResponseBody(rawBody)

    if (!response.ok) {
      const providerMessage = this.extractProviderError(parsedBody)
        ?? `Meta respondio con status ${response.status}`

      if (response.status >= 400 && response.status < 500) {
        throw new ValidationError(providerMessage)
      }

      throw new Error(providerMessage)
    }

    return parsedBody
  }

  private parseResponseBody(value: string): PlainObject {
    if (!value.trim()) return {}

    try {
      const parsed = JSON.parse(value)
      return this.isPlainObject(parsed) ? parsed : { value: parsed }
    } catch {
      return { raw: value }
    }
  }

  private extractProviderError(body: PlainObject): string | undefined {
    return this.asString(
      body.error?.error_user_msg
      ?? body.error?.message
      ?? body.error_description
      ?? body.message
    )
  }

  private resolveApiVersion(input: ProviderRequestInput): string {
    return this.readString(input.settings, 'apiVersion')
      ?? this.readString(input.credentials, 'apiVersion')
      ?? MetaWebhookAdapter.DEFAULT_API_VERSION
  }

  private resolveBaseUrl(input: ProviderRequestInput): string {
    const configuredBaseUrl = this.readString(input.settings, 'baseUrl')
      ?? this.readString(input.credentials, 'baseUrl')

    return (configuredBaseUrl ?? MetaWebhookAdapter.DEFAULT_BASE_URL).replace(/\/+$/, '')
  }

  private parseWhatsApp(body: PlainObject): NormalizedInboundMessage[] {
    const messages: NormalizedInboundMessage[] = []

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {}
        const externalAccountId = this.asString(value.metadata?.phone_number_id)
        if (!externalAccountId) continue

        for (const message of value.messages ?? []) {
          const normalized = this.normalizeWhatsAppMessage(message, externalAccountId, value)
          if (normalized) messages.push(normalized)
        }
      }
    }

    return messages
  }

  private parseWhatsAppDeliveryEvents(body: PlainObject): NormalizedDeliveryEvent[] {
    const events: NormalizedDeliveryEvent[] = []

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {}
        const externalAccountId = this.asString(value.metadata?.phone_number_id)
        if (!externalAccountId) continue

        for (const statusPayload of value.statuses ?? []) {
          const normalized = this.normalizeWhatsAppStatus(statusPayload, externalAccountId)
          if (normalized) events.push(normalized)
        }
      }
    }

    return events
  }

  private normalizeWhatsAppMessage(
    message: PlainObject,
    externalAccountId: string,
    value: PlainObject
  ): NormalizedInboundMessage | null {
    const type = this.mapWhatsAppType(message.type)
    if (!type) return null

    const occurredAt = this.parseUnixTimestamp(message.timestamp)
    const attachments = this.extractWhatsAppAttachments(message)
    const text = this.extractWhatsAppText(message)
    const displayName = this.findWhatsAppContactName(value.contacts, message.from)

    return {
      provider: 'meta',
      channel: 'whatsapp',
      externalAccountId,
      externalUserId: this.asString(message.from) ?? '',
      externalThreadId: this.asString(message.from),
      providerMessageId: this.asString(message.id),
      providerReplyToId: this.asString(message.context?.id),
      text,
      type,
      occurredAt,
      rawPayload: message,
      attachments,
      metadata: {
        displayName,
        profileName: displayName,
      },
    }
  }

  private normalizeWhatsAppStatus(
    statusPayload: PlainObject,
    externalAccountId: string
  ): NormalizedDeliveryEvent | null {
    const status = this.mapWhatsAppDeliveryStatus(statusPayload.status)
    const providerMessageId = this.asString(statusPayload.id)
    if (!status || !providerMessageId) return null

    const firstError = Array.isArray(statusPayload.errors)
      ? statusPayload.errors[0]
      : undefined

    return {
      provider: 'meta',
      channel: 'whatsapp',
      externalAccountId,
      providerMessageId,
      externalUserId: this.asString(statusPayload.recipient_id),
      status,
      occurredAt: this.parseUnixTimestamp(statusPayload.timestamp),
      rawPayload: statusPayload,
      errorCode: this.asString(firstError?.code) ?? this.asNumberString(firstError?.code),
      errorMessage: this.asString(
        firstError?.message
        ?? firstError?.title
        ?? firstError?.error_data?.details
      ),
      metadata: {
        recipientId: this.asString(statusPayload.recipient_id),
        conversationId: this.asString(statusPayload.conversation?.id),
        pricingCategory: this.asString(statusPayload.pricing?.category),
        pricingModel: this.asString(statusPayload.pricing?.pricing_model),
      },
    }
  }

  private parsePageStyleMessages(
    body: PlainObject,
    channel: 'messenger' | 'instagram'
  ): NormalizedInboundMessage[] {
    const messages: NormalizedInboundMessage[] = []

    for (const entry of body.entry ?? []) {
      const externalAccountId = this.asString(entry.id)
      if (!externalAccountId) continue

      for (const event of entry.messaging ?? []) {
        const message = event.message
        if (!message || message.is_echo) continue

        const occurredAt = this.parseUnixTimestamp(event.timestamp)
        const attachments = this.extractPageAttachments(message.attachments)
        const text = this.asString(message.text)
        const type = this.inferPageMessageType(message, attachments)

        messages.push({
          provider: 'meta',
          channel,
          externalAccountId,
          externalUserId: this.asString(event.sender?.id) ?? '',
          externalThreadId: this.asString(event.sender?.id),
          providerMessageId: this.asString(message.mid),
          providerReplyToId: this.asString(message.reply_to?.mid),
          text,
          type,
          occurredAt,
          rawPayload: event,
          attachments,
          metadata: {},
        })
      }
    }

    return messages
  }

  private buildWhatsAppConnectionLabel(payload: PlainObject): string | undefined {
    const verifiedName = this.asString(payload.verified_name)
    const displayPhoneNumber = this.asString(payload.display_phone_number)

    if (verifiedName && displayPhoneNumber) {
      return `${verifiedName} (${displayPhoneNumber})`
    }

    return verifiedName ?? displayPhoneNumber
  }

  private extractWhatsAppText(message: PlainObject): string | undefined {
    if (message.type === 'text') return this.asString(message.text?.body)
    if (message.type === 'button') return this.asString(message.button?.text)
    if (message.type === 'interactive') {
      return this.asString(
        message.interactive?.button_reply?.title ??
        message.interactive?.list_reply?.title
      )
    }
    return undefined
  }

  private extractWhatsAppAttachments(message: PlainObject): NormalizedAttachment[] | undefined {
    const media = message[message.type]
    if (!media) return undefined

    const type = this.mapWhatsAppAttachmentType(message.type)
    if (!type) return undefined

    return [{
      type,
      mimeType: this.asString(media.mime_type),
      externalAssetId: this.asString(media.id),
      fileName: this.asString(media.filename),
      metadata: {},
    }]
  }

  private extractPageAttachments(attachments: PlainObject[] | undefined): NormalizedAttachment[] | undefined {
    if (!attachments?.length) return undefined

    const normalized = attachments
      .map((attachment) => {
        const type = this.mapPageAttachmentType(attachment.type)
        if (!type) return null

        return {
          type,
          url: this.asString(attachment.payload?.url),
          externalAssetId: this.asString(attachment.payload?.attachment_id),
          metadata: {},
        } as NormalizedAttachment
      })
      .filter(Boolean) as NormalizedAttachment[]

    return normalized.length ? normalized : undefined
  }

  private inferPageMessageType(
    message: PlainObject,
    attachments: NormalizedAttachment[] | undefined
  ): MessageKind {
    if (this.asString(message.text)) return 'text'
    if (attachments?.length) return attachments[0].type
    return 'unsupported'
  }

  private mapWhatsAppType(type: string | undefined): MessageKind | null {
    switch (type) {
      case 'text':
      case 'button':
      case 'interactive':
        return 'text'
      case 'image':
        return 'image'
      case 'audio':
        return 'audio'
      case 'video':
        return 'video'
      case 'document':
        return 'file'
      case 'sticker':
        return 'sticker'
      default:
        return null
    }
  }

  private mapWhatsAppDeliveryStatus(status: string | undefined): DeliveryStatus | null {
    switch (status) {
      case 'sent':
      case 'delivered':
      case 'read':
      case 'failed':
      case 'deleted':
        return status
      default:
        return null
    }
  }

  private mapWhatsAppAttachmentType(type: string | undefined): Exclude<MessageKind, 'text' | 'unsupported'> | null {
    switch (type) {
      case 'image':
        return 'image'
      case 'audio':
        return 'audio'
      case 'video':
        return 'video'
      case 'document':
        return 'file'
      case 'sticker':
        return 'sticker'
      default:
        return null
    }
  }

  private mapPageAttachmentType(type: string | undefined): Exclude<MessageKind, 'text' | 'unsupported'> | null {
    switch (type) {
      case 'image':
        return 'image'
      case 'audio':
        return 'audio'
      case 'video':
        return 'video'
      case 'file':
        return 'file'
      default:
        return null
    }
  }

  private findWhatsAppContactName(contacts: PlainObject[] | undefined, waId: string | undefined): string | undefined {
    const match = contacts?.find((contact) => this.asString(contact.wa_id) === waId)
    return this.asString(match?.profile?.name)
  }

  private parseUnixTimestamp(value: unknown): Date {
    const raw = this.asString(value)
    if (!raw) return new Date()

    const numeric = Number(raw)
    if (!Number.isFinite(numeric)) return new Date()

    return new Date(numeric > 1e12 ? numeric : numeric * 1000)
  }

  private readString(record: unknown, key: string): string | undefined {
    if (!this.isJsonRecord(record)) return undefined
    return this.asString(record[key])
  }

  private readBoolean(record: unknown, key: string): boolean | undefined {
    if (!this.isJsonRecord(record)) return undefined
    const value = record[key]
    return typeof value === 'boolean' ? value : undefined
  }

  private isJsonRecord(value: unknown): value is JsonRecord {
    return !!value && typeof value === 'object' && !Array.isArray(value)
  }

  private isPlainObject(value: unknown): value is PlainObject {
    return !!value && typeof value === 'object' && !Array.isArray(value)
  }

  private asNumberString(value: unknown): string | undefined {
    return typeof value === 'number' && Number.isFinite(value)
      ? String(value)
      : undefined
  }

  private asNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : undefined
  }

  private asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined
  }
}
