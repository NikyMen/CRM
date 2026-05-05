// Roles
export type Role = 'owner' | 'admin' | 'member' | 'viewer'

/** Helper para verificar si un rol tiene acceso a una accion */
export function canDo(userRole: Role | string | undefined, allowedRoles: Role[]): boolean {
  if (!userRole) return false
  return allowedRoles.includes(userRole as Role)
}

// Auth
export interface User {
  id: string
  email: string
  firstName: string
  lastName?: string
  avatar?: string
}

export interface Workspace {
  id: string
  name: string
  slug: string
}

export interface AuthResponse {
  user: User
  workspace: Workspace
  role: string
  accessToken: string
}

// Contactos
export interface Contact {
  id: string
  workspaceId: string
  firstName: string
  lastName?: string
  email?: string
  phone?: string
  avatar?: string
  status: 'LEAD' | 'QUALIFIED' | 'ACTIVE' | 'CUSTOMER' | 'CHURNED'
  source: string
  score: number
  tags: string[]
  companyId?: string
  ownerId?: string
  isArchived: boolean
  createdAt: string
  updatedAt: string
  lastContactedAt?: string
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface ContactFilters {
  search?: string
  status?: string
  page?: number
  limit?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  scoreMin?: number
  scoreMax?: number
}

// Deals y Kanban
export interface Deal {
  id: string
  workspaceId: string
  title: string
  value?: number
  currency: string
  probability?: number
  pipelineId: string
  stageId: string
  position: number
  status: 'OPEN' | 'WON' | 'LOST' | 'PAUSED'
  ownerId?: string
  companyId?: string
  expectedCloseDate?: string
  closedAt?: string
  createdAt: string
  updatedAt: string
}

export interface KanbanStage {
  id: string
  name: string
  position: number
  color: string
  probability?: number
  isWon: boolean
  isLost: boolean
  rottenAfterDays?: number
}

export interface KanbanCard {
  id: string
  leadNumber: string
  title: string
  value?: number
  currency: string
  probability?: number
  position: number
  status: string
  contactIds: string[]
  companyId?: string
  ownerId?: string
  expectedCloseDate?: string
  daysInStage: number
  isRotten: boolean
  chat?: {
    id: string
    jid: string
    displayName?: string | null
    phoneNumber?: string | null
    profileImageUrl?: string | null
    unreadCount: number
    lastMessageAt?: string | null
    lastMessagePreview?: string | null
    lastMessageFromMe?: boolean | null
    contactName?: string | null
  }
  createdAt: string
  updatedAt: string
}

export interface KanbanColumn {
  stage: KanbanStage
  deals: KanbanCard[]
  totalValue: number
  count: number
}

export interface KanbanBoard {
  pipeline: { id: string; name: string }
  columns: KanbanColumn[]
}

// Webhooks
export interface Webhook {
  id: string
  workspaceId: string
  name: string
  url: string
  events: string[]
  isActive: boolean
  successCount: number
  failureCount: number
  lastTriggeredAt?: string
  lastStatusCode?: number
  createdAt: string
  updatedAt: string
}

// API Keys
export interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  lastUsedAt?: string
  expiresAt?: string
  isActive: boolean
  createdAt: string
}

// Activities
export interface Activity {
  id:          string
  type:        string
  title:       string
  description: string | null
  contactId:   string | null
  userId:      string | null
  createdAt:   string
}

// Notes
export interface Note {
  id:        string
  content:   string
  contactId: string | null
  userId:    string | null
  createdAt: string
}

// Dashboard
export interface DashboardData {
  contacts: {
    total:    number
    byStatus: { status: string; count: number }[]
    recent:   {
      id:        string
      firstName: string
      lastName:  string | null
      status:    string
      score:     number
      createdAt: string
    }[]
  }
  deals: {
    total:         number
    pipelineValue: number
    byStage: {
      stageId:   string
      stageName: string
      color:     string
      count:     number
      value:     number
    }[]
  }
  recentActivities: {
    id:          string
    type:        string
    title:       string
    contactName: string | null
    createdAt:   string
  }[]
}

// WhatsApp QR
export type WhatsAppConnectionStatus =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'PAIRING'
  | 'CONNECTED'
  | 'ERROR'

export interface WhatsAppSessionSnapshot {
  id: string
  workspaceId: string
  status: WhatsAppConnectionStatus
  phoneNumber?: string | null
  phoneJid?: string | null
  pushName?: string | null
  pairingCode?: string | null
  pairingCodeIssuedAt?: string | null
  qrCode?: string | null
  lastConnectedAt?: string | null
  lastDisconnectedAt?: string | null
  lastDisconnectCode?: number | null
  lastError?: string | null
  createdAt: string
  updatedAt: string
  packageInstalled: boolean
  runtimeCompatible: boolean
  authAvailable: boolean
  hasActiveSocket: boolean
  chatCount: number
}

export interface WhatsAppChat {
  id: string
  workspaceId: string
  sessionId: string
  jid: string
  displayName?: string | null
  phoneNumber?: string | null
  profileImageUrl?: string | null
  isGroup: boolean
  unreadCount: number
  archived: boolean
  pinned: boolean
  mutedUntil?: string | null
  lastMessageAt?: string | null
  lastMessagePreview?: string | null
  lastMessageFromMe?: boolean | null
  contactId?: string | null
  contactName?: string | null
  createdAt: string
  updatedAt: string
}

export interface WhatsAppMessage {
  id: string
  workspaceId: string
  sessionId: string
  chatId: string
  remoteJid: string
  messageId: string
  fromMe: boolean
  participant?: string | null
  pushName?: string | null
  messageType: string
  text?: string | null
  status?: string | null
  mediaUrl?: string | null
  mediaMimeType?: string | null
  mediaFileName?: string | null
  mediaSizeBytes?: number | null
  mediaDurationSeconds?: number | null
  quotedMessageId?: string | null
  quotedText?: string | null
  quotedMessageType?: string | null
  sentAt: string
  createdAt: string
  updatedAt: string
}

export interface WhatsAppMessagesPayload {
  chat: WhatsAppChat | null
  items: WhatsAppMessage[]
  totalMessages: number
  historyAnchorAvailable: boolean
}

// Pipelines
export interface Stage {
  id:         string
  pipelineId: string
  name:       string
  color:      string
  position:   number
}

export interface Pipeline {
  id:          string
  workspaceId: string
  name:        string
  stages:      Stage[]
  createdAt:   string
}
export interface InboxConversationPreviewAttachment {
  type: string
  url?: string | null
  fileName?: string | null
}

export interface InboxConversationLatestMessage {
  id: string
  direction: 'inbound' | 'outbound'
  type: string
  text?: string | null
  status: string
  sentAt?: string | null
  createdAt: string
  attachments: InboxConversationPreviewAttachment[]
}

export interface InboxConversationContact {
  id: string
  firstName: string
  lastName?: string | null
  email?: string | null
  phone?: string | null
}

export interface InboxConversationConnection {
  id: string
  name: string
  channel: 'whatsapp' | 'instagram' | 'messenger' | 'tiktok'
  status: 'disconnected' | 'connected' | 'error'
  externalAccountId: string
  externalAccountLabel?: string | null
}

export interface InboxConversation {
  id: string
  workspaceId: string
  connectionId: string
  contactId: string
  provider: 'meta' | 'tiktok' | string
  channel: 'whatsapp' | 'instagram' | 'messenger' | 'tiktok' | string
  externalThreadId?: string | null
  externalUserId?: string | null
  status: string
  inboxState: string
  unreadCount: number
  lastInboundAt?: string | null
  lastOutboundAt?: string | null
  lastMessageAt?: string | null
  assignedToUserId?: string | null
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
  contact: InboxConversationContact
  connection: InboxConversationConnection
  messages: InboxConversationLatestMessage[]
}

export interface InboxMessageAttachment {
  id: string
  type: string
  mimeType?: string | null
  url?: string | null
  externalAssetId?: string | null
  fileName?: string | null
  sizeBytes?: number | null
  metadata?: Record<string, unknown>
  createdAt: string
}

export interface InboxMessageDelivery {
  id: string
  messageId: string
  providerMessageId?: string | null
  providerStatus: string
  providerTimestamp?: string | null
  errorCode?: string | null
  errorMessage?: string | null
  rawPayload?: unknown
  createdAt: string
}

export interface InboxMessage {
  id: string
  workspaceId: string
  conversationId: string
  contactId?: string | null
  provider: 'meta' | 'tiktok' | string
  channel: 'whatsapp' | 'instagram' | 'messenger' | 'tiktok' | string
  direction: 'inbound' | 'outbound'
  type: string
  status: string
  providerMessageId?: string | null
  providerReplyToId?: string | null
  text?: string | null
  rawPayload?: unknown
  metadata?: Record<string, unknown>
  sentAt?: string | null
  deliveredAt?: string | null
  readAt?: string | null
  failedAt?: string | null
  createdAt: string
  updatedAt: string
  attachments: InboxMessageAttachment[]
  deliveries: InboxMessageDelivery[]
}
// Canales / Inbox
export interface InboxConnection {
  id: string
  workspaceId: string
  provider: 'meta' | 'tiktok'
  channel: 'whatsapp' | 'instagram' | 'messenger' | 'tiktok'
  name: string
  status: 'disconnected' | 'connected' | 'error'
  externalAccountId: string
  externalAccountLabel?: string | null
  settings?: Record<string, unknown>
  hasCredentials: boolean
  lastSyncedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface EmbeddedSignupConfig {
  enabled: boolean
  codeExchangeReady: boolean
  appId?: string
  configurationId?: string
  provider: 'meta'
  channel: 'whatsapp'
}

export interface ConnectionInspection {
  status: 'connected'
  externalAccountLabel?: string
  metadata?: Record<string, unknown>
  rawResponse: unknown
}

export interface ConnectionTestResult {
  connection: InboxConnection
  inspection: ConnectionInspection
}

export interface WhatsAppPhoneRegistration {
  registeredAt: string
  metadata?: Record<string, unknown>
  rawResponse: unknown
}

export interface RegisterWhatsAppPhoneResult extends ConnectionTestResult {
  registration: WhatsAppPhoneRegistration
}

export interface EmbeddedSignupCompletionResult extends ConnectionTestResult {
  mode: 'created' | 'updated'
  exchange?: {
    tokenType?: string
    expiresIn?: number
  }
}
