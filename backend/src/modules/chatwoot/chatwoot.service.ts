import { AppError, ValidationError, paginate, type PaginatedResult } from '../../types'
import { config } from '../../core/config'

type ChatwootChannel = 'messenger' | 'instagram'
type ChatwootChannelFilter = ChatwootChannel | 'all'
type PlainObject = Record<string, any>

export interface ChatwootInbox {
  id: number
  name: string
  channel: ChatwootChannel
  channelType?: string | null
  provider?: string | null
  webUrl: string
}

export interface ChatwootStatus {
  configured: boolean
  reachable: boolean
  baseUrl?: string
  accountId?: number
  portalUrl?: string
  missing: string[]
  inboxes: ChatwootInbox[]
  channels: Record<ChatwootChannel, boolean>
  error?: string
}

export interface ChatwootConversation {
  id: number
  uuid?: string | null
  inboxId: number
  channel: ChatwootChannel
  status: string
  unreadCount: number
  canReply: boolean
  lastActivityAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  webUrl: string
  contact: {
    id?: number | null
    name: string
    email?: string | null
    phoneNumber?: string | null
    thumbnail?: string | null
  }
  assignee?: {
    id?: number | null
    name?: string | null
    email?: string | null
  } | null
  inbox: ChatwootInbox
  latestMessage?: {
    id: number
    content?: string | null
    direction: 'inbound' | 'outbound' | 'activity'
    createdAt?: string | null
    status?: string | null
  } | null
}

export interface ChatwootMessage {
  id: number
  conversationId: number
  content?: string | null
  direction: 'inbound' | 'outbound' | 'activity'
  status?: string | null
  private: boolean
  contentType?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  sender?: {
    id?: number | null
    name?: string | null
    email?: string | null
    type?: string | null
    thumbnail?: string | null
  } | null
  attachments: Array<{
    id?: number | string
    type?: string | null
    url?: string | null
    fileName?: string | null
    thumbUrl?: string | null
  }>
}

export interface ChatwootConversationFilters {
  channel?: ChatwootChannelFilter
  status?: 'all' | 'open' | 'resolved' | 'pending' | 'snoozed'
  q?: string
  page?: number
  limit?: number
}

export class ChatwootService {
  private readonly baseUrl = config.CHATWOOT_BASE_URL?.replace(/\/+$/, '')
  private readonly accountId = config.CHATWOOT_ACCOUNT_ID
  private readonly token = config.CHATWOOT_API_ACCESS_TOKEN
  private readonly messengerInboxId = config.CHATWOOT_MESSENGER_INBOX_ID
  private readonly instagramInboxId = config.CHATWOOT_INSTAGRAM_INBOX_ID

  async getStatus(): Promise<ChatwootStatus> {
    const missing = this.getMissingConfig()
    const configured = missing.length === 0

    if (!configured) {
      return {
        configured: false,
        reachable: false,
        baseUrl: this.baseUrl,
        accountId: this.accountId,
        portalUrl: undefined,
        missing,
        inboxes: [],
        channels: { messenger: false, instagram: false },
      }
    }

    try {
      const inboxes = await this.listManagedInboxes()

      return {
        configured: true,
        reachable: true,
        baseUrl: this.baseUrl,
        accountId: this.accountId,
        portalUrl: this.accountUrl(),
        missing: [],
        inboxes,
        channels: {
          messenger: inboxes.some((inbox) => inbox.channel === 'messenger'),
          instagram: inboxes.some((inbox) => inbox.channel === 'instagram'),
        },
      }
    } catch (error) {
      return {
        configured: true,
        reachable: false,
        baseUrl: this.baseUrl,
        accountId: this.accountId,
        portalUrl: this.accountUrl(),
        missing: [],
        inboxes: [],
        channels: { messenger: false, instagram: false },
        error: this.errorMessage(error),
      }
    }
  }

  async listInboxes(): Promise<ChatwootInbox[]> {
    this.ensureConfigured()
    return this.listManagedInboxes()
  }

  async listConversations(
    filters: ChatwootConversationFilters
  ): Promise<PaginatedResult<ChatwootConversation>> {
    this.ensureConfigured()

    const page = filters.page ?? 0
    const limit = Math.min(filters.limit ?? 50, 100)
    const channel = filters.channel && filters.channel !== 'all' ? filters.channel : undefined
    const status = filters.status ?? 'open'
    const inboxes = (await this.listManagedInboxes()).filter((inbox) => !channel || inbox.channel === channel)

    if (!inboxes.length) {
      return paginate([], 0, page, limit)
    }

    const responses = await Promise.all(
      inboxes.map(async (inbox) => {
        const raw = await this.request('GET', '/conversations', {
          assignee_type: 'all',
          status,
          inbox_id: inbox.id,
          page: page + 1,
          ...(filters.q?.trim() && { q: filters.q.trim() }),
        })

        const data = raw.data ?? raw
        const payload = Array.isArray(data.payload) ? data.payload : []

        return payload.map((item: PlainObject) => this.normalizeConversation(item, inbox))
      })
    )

    const items = responses
      .flat()
      .sort((left, right) => this.sortDate(right.lastActivityAt) - this.sortDate(left.lastActivityAt))
      .slice(0, limit)

    return paginate(items, items.length, page, limit)
  }

  async listMessages(
    conversationId: number,
    filters: { before?: number; after?: number } = {}
  ): Promise<ChatwootMessage[]> {
    this.ensureConfigured()

    const raw = await this.request('GET', `/conversations/${conversationId}/messages`, {
      ...(filters.before && { before: filters.before }),
      ...(filters.after && { after: filters.after }),
    })

    const payload = Array.isArray(raw.payload)
      ? raw.payload
      : Array.isArray(raw.data?.payload)
        ? raw.data.payload
        : []

    return payload.map((item: PlainObject) => this.normalizeMessage(item))
  }

  async sendMessage(conversationId: number, content: string): Promise<ChatwootMessage> {
    this.ensureConfigured()

    const text = content.trim()
    if (!text) {
      throw new ValidationError('El mensaje no puede estar vacio')
    }

    const raw = await this.request('POST', `/conversations/${conversationId}/messages`, undefined, {
      content: text,
      message_type: 'outgoing',
      private: false,
      content_type: 'text',
      content_attributes: {},
    })

    return this.normalizeMessage(raw.payload ?? raw.data ?? raw)
  }

  private async listManagedInboxes(): Promise<ChatwootInbox[]> {
    const raw = await this.request('GET', '/inboxes')
    const payload = Array.isArray(raw.payload) ? raw.payload : []
    return payload
      .map((inbox: PlainObject) => this.normalizeInbox(inbox))
      .filter((inbox: ChatwootInbox | null): inbox is ChatwootInbox => Boolean(inbox))
      .filter((inbox) => this.shouldExposeInbox(inbox))
  }

  private normalizeInbox(inbox: PlainObject): ChatwootInbox | null {
    const id = this.asNumber(inbox.id)
    if (!id) return null

    const channel = this.resolveInboxChannel(inbox)
    if (!channel) return null

    return {
      id,
      name: this.asString(inbox.name) ?? `${channel} ${id}`,
      channel,
      channelType: this.asString(inbox.channel_type) ?? null,
      provider: this.asString(inbox.provider) ?? null,
      webUrl: `${this.accountUrl()}/settings/inboxes/${id}`,
    }
  }

  private normalizeConversation(item: PlainObject, inbox: ChatwootInbox): ChatwootConversation {
    const sender = item.meta?.sender ?? {}
    const assignee = item.meta?.assignee ?? item.assignee ?? null
    const latestRaw = item.last_non_activity_message ?? item.messages?.[0] ?? null

    return {
      id: this.asNumber(item.id) ?? 0,
      uuid: this.asString(item.uuid) ?? null,
      inboxId: this.asNumber(item.inbox_id) ?? inbox.id,
      channel: inbox.channel,
      status: this.asString(item.status) ?? 'open',
      unreadCount: this.asNumber(item.unread_count) ?? 0,
      canReply: item.can_reply !== false,
      lastActivityAt: this.timestampToIso(item.last_activity_at ?? item.timestamp),
      createdAt: this.timestampToIso(item.created_at),
      updatedAt: this.timestampToIso(item.updated_at),
      webUrl: `${this.accountUrl()}/conversations/${this.asNumber(item.id) ?? ''}`,
      contact: {
        id: this.asNumber(sender.id) ?? null,
        name: this.asString(sender.name) ?? this.asString(sender.identifier) ?? 'Contacto sin nombre',
        email: this.asString(sender.email) ?? null,
        phoneNumber: this.asString(sender.phone_number) ?? null,
        thumbnail: this.asString(sender.thumbnail) ?? null,
      },
      assignee: assignee ? {
        id: this.asNumber(assignee.id) ?? null,
        name: this.asString(assignee.name) ?? this.asString(assignee.available_name) ?? null,
        email: this.asString(assignee.email) ?? null,
      } : null,
      inbox,
      latestMessage: latestRaw ? {
        id: this.asNumber(latestRaw.id) ?? 0,
        content: this.asString(latestRaw.content ?? latestRaw.processed_message_content) ?? null,
        direction: this.resolveMessageDirection(latestRaw.message_type),
        createdAt: this.timestampToIso(latestRaw.created_at),
        status: this.asString(latestRaw.status) ?? null,
      } : null,
    }
  }

  private normalizeMessage(item: PlainObject): ChatwootMessage {
    return {
      id: this.asNumber(item.id) ?? 0,
      conversationId: this.asNumber(item.conversation_id) ?? 0,
      content: this.asString(item.content ?? item.processed_message_content) ?? null,
      direction: this.resolveMessageDirection(item.message_type),
      status: this.asString(item.status) ?? null,
      private: item.private === true,
      contentType: this.asString(item.content_type) ?? null,
      createdAt: this.timestampToIso(item.created_at),
      updatedAt: this.timestampToIso(item.updated_at),
      sender: item.sender ? {
        id: this.asNumber(item.sender.id) ?? null,
        name: this.asString(item.sender.name ?? item.sender.available_name) ?? null,
        email: this.asString(item.sender.email) ?? null,
        type: this.asString(item.sender_type ?? item.sender.type) ?? null,
        thumbnail: this.asString(item.sender.thumbnail ?? item.sender.avatar_url) ?? null,
      } : null,
      attachments: this.normalizeAttachments(item),
    }
  }

  private normalizeAttachments(item: PlainObject): ChatwootMessage['attachments'] {
    const rawAttachments = Array.isArray(item.attachments)
      ? item.attachments
      : item.attachment && Object.keys(item.attachment).length
        ? [item.attachment]
        : []

    return rawAttachments.map((attachment: PlainObject, index: number) => ({
      id: attachment.id ?? `${item.id}-${index}`,
      type: this.asString(attachment.file_type ?? attachment.type) ?? null,
      url: this.asString(attachment.data_url ?? attachment.file_url ?? attachment.url) ?? null,
      fileName: this.asString(attachment.file_name ?? attachment.name) ?? null,
      thumbUrl: this.asString(attachment.thumb_url) ?? null,
    }))
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    query?: Record<string, unknown>,
    body?: PlainObject
  ): Promise<PlainObject> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)
    const url = new URL(`${this.baseUrl}/api/v1/accounts/${this.accountId}${path}`)

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        url.searchParams.set(key, String(value))
      }
    }

    try {
      const response = await fetch(url, {
        method,
        headers: {
          api_access_token: this.token!,
          'Content-Type': 'application/json',
        },
        ...(body && { body: JSON.stringify(body) }),
        signal: controller.signal,
      })

      const text = await response.text()
      const payload = text.trim() ? this.parseJson(text) : {}

      if (!response.ok) {
        const message = this.providerMessage(payload) ?? `Chatwoot respondio con status ${response.status}`
        throw new AppError(response.status >= 500 ? 502 : 422, message, 'CHATWOOT_ERROR')
      }

      return payload
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AppError(504, 'Chatwoot no respondio a tiempo', 'CHATWOOT_TIMEOUT')
      }

      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private resolveInboxChannel(inbox: PlainObject): ChatwootChannel | null {
    const id = this.asNumber(inbox.id)
    if (id && id === this.messengerInboxId) return 'messenger'
    if (id && id === this.instagramInboxId) return 'instagram'

    const signature = [
      inbox.channel_type,
      inbox.provider,
      inbox.medium,
      inbox.name,
    ].filter(Boolean).join(' ').toLowerCase()

    if (signature.includes('instagram')) return 'instagram'
    if (signature.includes('facebook') || signature.includes('messenger')) return 'messenger'
    return null
  }

  private shouldExposeInbox(inbox: ChatwootInbox): boolean {
    const explicitIds = [this.messengerInboxId, this.instagramInboxId].filter(Boolean)
    if (!explicitIds.length) return true
    return explicitIds.includes(inbox.id)
  }

  private resolveMessageDirection(value: unknown): 'inbound' | 'outbound' | 'activity' {
    if (value === 'outgoing' || value === 1) return 'outbound'
    if (value === 'activity' || value === 2) return 'activity'
    return 'inbound'
  }

  private timestampToIso(value: unknown): string | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return new Date(value > 1e12 ? value : value * 1000).toISOString()
    }

    if (typeof value === 'string' && value.trim()) {
      const numeric = Number(value)
      if (Number.isFinite(numeric)) {
        return new Date(numeric > 1e12 ? numeric : numeric * 1000).toISOString()
      }

      const parsed = new Date(value)
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
    }

    return null
  }

  private sortDate(value?: string | null): number {
    if (!value) return 0
    const timestamp = new Date(value).getTime()
    return Number.isFinite(timestamp) ? timestamp : 0
  }

  private accountUrl(): string {
    return `${this.baseUrl}/app/accounts/${this.accountId}`
  }

  private ensureConfigured() {
    const missing = this.getMissingConfig()
    if (missing.length) {
      throw new ValidationError(`Falta configurar Chatwoot: ${missing.join(', ')}`)
    }
  }

  private getMissingConfig(): string[] {
    return [
      !this.baseUrl && 'CHATWOOT_BASE_URL',
      !this.accountId && 'CHATWOOT_ACCOUNT_ID',
      !this.token && 'CHATWOOT_API_ACCESS_TOKEN',
    ].filter(Boolean) as string[]
  }

  private parseJson(value: string): PlainObject {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : { value: parsed }
    } catch {
      return { raw: value }
    }
  }

  private providerMessage(payload: PlainObject): string | undefined {
    return this.asString(
      payload.message ??
      payload.error ??
      payload.description ??
      payload.errors?.[0]?.message
    )
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }

  private asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
  }

  private asNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : undefined
    }
    return undefined
  }
}
