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
  lastName?: string | null
  avatar?: string | null
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
  leadNumber: string
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
    lidJid?: string | null
    assignedToUserId?: string | null
    assignee?: {
      id: string
      firstName: string
      lastName?: string | null
      email: string
      avatar?: string | null
    } | null
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
  stock: {
    totalProducts: number
    unitsInStock: number
    lowStockProducts: number
    outOfStockProducts: number
    inventoryValue: number
    criticalProducts: {
      id: string
      name: string
      sku?: string | null
      stockQuantity: number
      minStock: number
      updatedAt: string
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

export type StockMovementType = 'IN' | 'OUT' | 'SALE' | 'ADJUSTMENT'
export type StockCashTransactionType = 'INCOME' | 'EXPENSE'

export interface StockCategory {
  id: string
  workspaceId: string
  name: string
  description?: string | null
  productCount: number
  createdAt: string
  updatedAt: string
}

export interface StockProduct {
  id: string
  workspaceId: string
  categoryId?: string | null
  category?: {
    id: string
    name: string
  } | null
  name: string
  description: string
  sku?: string | null
  price: number
  cost?: number | null
  image?: string | null
  images: string[]
  featured: boolean
  stockQuantity: number
  minStock: number
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

export interface StockMovement {
  id: string
  workspaceId: string
  productId: string
  product?: {
    id: string
    name: string
    sku?: string | null
  } | null
  type: StockMovementType
  quantity: number
  reason: string
  note?: string | null
  batchCode?: string | null
  userId?: string | null
  createdAt: string
}

export interface StockCashTransaction {
  id: string
  workspaceId: string
  type: StockCashTransactionType
  category: string
  amount: number
  paymentMethod?: string | null
  reference?: string | null
  note?: string | null
  occurredAt: string
  createdAt: string
}

export interface StockDashboard {
  metrics: {
    totalProducts: number
    unitsInStock: number
    lowStockProducts: number
    outOfStockProducts: number
    inventoryValue: number
    inventoryCost: number
    netCash: number
  }
  lowStockProducts: StockProduct[]
  recentMovements: StockMovement[]
  recentCashTransactions: StockCashTransaction[]
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
  lidJid?: string | null
  phoneNumberSource?: string | null
  assignedToUserId?: string | null
  assignee?: {
    id: string
    firstName: string
    lastName?: string | null
    email: string
    avatar?: string | null
  } | null
  leadNumber?: string | null
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
  isDefault?:  boolean
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

export interface MetaApiEndpoint {
  method: string
  path: string
  auth: string
  description: string
}

export interface MetaApiChannel {
  channel: 'whatsapp' | 'instagram' | 'messenger'
  externalAccountId: string
  token: string
  capabilities: string[]
}

export interface MetaApiStatus {
  provider: 'meta'
  graphApiVersion: string
  graphBaseUrl: string
  configured: {
    appConfigured: boolean
    webhookVerifyTokenConfigured: boolean
    embeddedSignupConfigured: boolean
    codeExchangeReady: boolean
  }
  missing: string[]
  webhook: {
    verifyMethod: 'GET'
    receiveMethod: 'POST'
    path: string
    legacyPath: string
  }
  embeddedSignup: EmbeddedSignupConfig
  supportedChannels: MetaApiChannel[]
  endpoints: MetaApiEndpoint[]
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

export type ChatwootChannel = 'messenger' | 'instagram'

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

// Gestión ROMEZ
export interface AssigneeSummary {
  id: string
  firstName: string
  lastName?: string | null
  email?: string
  avatar?: string | null
}

export interface InternalChatMember extends AssigneeSummary {
  email: string
  role: Role
  joinedAt: string
  isCurrentUser: boolean
}

export interface InternalChatMessage {
  id: string
  conversationId: string
  senderId: string
  body: string
  createdAt: string
  updatedAt: string
  sender: AssigneeSummary & { email: string }
}

export interface InternalChatConversation {
  id: string
  type: 'GENERAL' | 'DIRECT'
  title?: string | null
  otherParticipant?: (AssigneeSummary & { email: string }) | null
  participantCount: number
  lastMessageAt?: string | null
  lastMessage?: InternalChatMessage | null
  unreadCount: number
}

export interface InternalChatMessagesPage {
  items: InternalChatMessage[]
  nextCursor?: string | null
}

export type ClientPersonType = 'INDIVIDUAL' | 'LEGAL_ENTITY'
export type ClientStatus = 'PROSPECT' | 'ACTIVE' | 'SUSPENDED' | 'INACTIVE'

export interface ClientAssignment {
  id: string
  userId: string
  area: string
  user: AssigneeSummary
  createdAt: string
}

export interface Client {
  id: string
  workspaceId: string
  name: string
  legalName?: string | null
  tradeName?: string | null
  personType: ClientPersonType
  ruc?: string | null
  dv?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
  activity?: string | null
  address?: string | null
  city?: string | null
  department?: string | null
  country: string
  taxObligations: string[]
  tags: string[]
  status: ClientStatus
  ownerId?: string | null
  owner?: AssigneeSummary | null
  assignments: ClientAssignment[]
  contacts?: Contact[]
  _count?: { contacts: number; deals: number; tickets: number; checklists: number }
  balances?: Array<{ currency: string; balance: string; overdueBalance: string }>
  hasDebt?: boolean
  pendingChecklists?: number
  pendingChecklistItems?: number
  openTickets?: number
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

export interface AccountSummary {
  currency: string
  billed: string
  paid: string
  balance: string
  count: number
}

export interface ClientSummary {
  client: Client
  account: AccountSummary[]
  recentPayments: CollectionPayment[]
  checklists: ClientChecklist[]
  tickets: Ticket[]
  contacts: Contact[]
  documents: ClientDocument[]
  notes: ClientNote[]
}

export type ChecklistStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE'

export interface ChecklistTemplateItem {
  id: string
  title: string
  description?: string | null
  position: number
  isRequired: boolean
}

export interface ChecklistTemplate {
  id: string
  name: string
  description?: string | null
  periodicity: 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'ON_DEMAND'
  items: ChecklistTemplateItem[]
  isActive: boolean
}

export interface ClientChecklistItem {
  id: string
  title: string
  isCompleted: boolean
  isRequired: boolean
  notes?: string | null
  completedAt?: string | null
  completedBy?: AssigneeSummary | null
}

export interface ClientChecklist {
  id: string
  companyId: string
  templateId: string
  template: ChecklistTemplate
  assignedToUserId?: string | null
  assignedTo?: AssigneeSummary | null
  periodKey: string
  dueDate?: string | null
  status: ChecklistStatus
  items: ClientChecklistItem[]
}

export interface ChecklistSummary {
  pending: number
  inProgress: number
  overdue: number
  completed: number
  upcoming: Array<ClientChecklist & { company: Pick<Client, 'id' | 'name' | 'ruc' | 'dv'> }>
}

export type ReceivableStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'VOID'

export interface Receivable {
  id: string
  companyId: string
  company?: Pick<Client, 'id' | 'name' | 'ruc' | 'dv' | 'ownerId'>
  description: string
  periodKey?: string | null
  currency: string
  amount: string
  paidAmount: string
  balance?: string
  outstanding: string
  dueDate: string
  status: ReceivableStatus
  reference?: string | null
  createdAt: string
}

export interface CollectionPayment {
  voidedAt?: string | null
  id: string
  companyId: string
  company?: Pick<Client, 'id' | 'name' | 'ruc' | 'dv'>
  currency: string
  amount: string
  method?: string | null
  reference?: string | null
  notes?: string | null
  allocations?: Array<{ id: string; receivableId: string; amount: string }>
  paidAt: string
  createdAt: string
}

export interface CollectionSummary {
  currencies: Array<{
    currency: string
    billed: string
    applied: string
    outstanding: string
    received: string
    receivableCount: number
    paymentCount: number
  }>
  overdueCount: number
}

export interface RecurringCharge {
  id: string
  companyId: string
  company?: Pick<Client, 'id' | 'name' | 'ruc'>
  name: string
  description?: string | null
  amount: string
  currency: string
  frequency: 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
  dayOfMonth: number
  startDate: string
  endDate?: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type TicketStatus = 'NEW' | 'OPEN' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED'
export type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'

export interface TicketMessage {
  id: string
  messageId?: string
  direction?: 'INBOUND' | 'OUTBOUND'
  fromMe?: boolean
  text?: string | null
  mediaUrl?: string | null
  mediaMimeType?: string | null
  mediaFileName?: string | null
  mediaSizeBytes?: number | null
  mediaDurationSeconds?: number | null
  messageType?: string | null
  status?: string | null
  pushName?: string | null
  sentAt: string
  senderName?: string | null
  quotedMessageId?: string | null
  quotedText?: string | null
  quotedMessageType?: string | null
}

export interface Ticket {
  id: string
  number?: string | number | null
  subject?: string | null
  status: TicketStatus
  priority: TicketPriority
  category?: string | null
  source?: string | null
  activeKey?: string | null
  channel?: 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER' | string
  clientId?: string | null
  client?: Pick<Client, 'id' | 'name' | 'ruc' | 'dv' | 'owner'> | null
  companyId?: string | null
  company?: Pick<Client, 'id' | 'name' | 'ruc' | 'dv' | 'owner'> | null
  contactId?: string | null
  contact?: Pick<Contact, 'id' | 'firstName' | 'lastName' | 'phone'> | null
  assignedToUserId?: string | null
  assignee?: AssigneeSummary | null
  assignedTo?: AssigneeSummary | null
  whatsappChat?: Pick<WhatsAppChat, 'id' | 'jid' | 'displayName' | 'phoneNumber' | 'lastMessagePreview'> | null
  unreadCount?: number
  openedAt?: string | null
  firstResponseAt?: string | null
  dueAt?: string | null
  resolvedAt?: string | null
  closedAt?: string | null
  lastMessageAt?: string | null
  lastMessagePreview?: string | null
  messages?: TicketMessage[]
  comments?: Array<{ id: string; body: string; createdAt: string; author?: AssigneeSummary | null }>
  events?: Array<{ id: string; type: string; fromValue?: string | null; toValue?: string | null; createdAt: string; actor?: AssigneeSummary | null }>
  _count?: { messages: number; comments: number }
  createdAt: string
  updatedAt: string
}

export interface CustomerServiceSummary {
  openTotal: number
  unassigned: number
  mine: number
  waitingCustomer: number
  resolvedToday: number
  avgFirstResponseMinutes: number | null
  whatsapp: {
    status: WhatsAppConnectionStatus
    phoneNumber?: string | null
    pushName?: string | null
    lastConnectedAt?: string | null
    lastError?: string | null
  } | null
  byAssignee: Array<{
    userId?: string | null
    user?: AssigneeSummary | null
    count: number
  }>
}

export interface ClientDocument {
  id: string
  companyId: string
  clientId?: string
  name: string
  category?: string | null
  mimeType?: string | null
  sizeBytes?: number | null
  url?: string | null
  createdAt: string
}

export interface ClientNote {
  id: string
  clientId: string
  content: string
  author?: AssigneeSummary | null
  createdAt: string
}

export type SaleStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED'

export interface SaleItem {
  id: string
  description: string
  quantity: string
  unitPrice: string
  total: string
  position: number
}

export interface Sale {
  id: string
  number: number
  companyId: string
  status: SaleStatus
  soldAt: string
  currency: string
  subtotal: string
  discount: string
  taxAmount: string
  total: string
  reference?: string | null
  notes?: string | null
  confirmedAt?: string | null
  cancelledAt?: string | null
  createdAt: string
  updatedAt: string
  company?: { id: string; name: string; ruc?: string | null; tradeName?: string | null }
  createdBy?: AssigneeSummary | null
  items: SaleItem[]
}

export interface SaleSummary {
  draftCount: number
  currencies: Array<{ currency: string; confirmedCount: number; confirmedTotal: string }>
}
