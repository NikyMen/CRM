import axios from 'axios'
import { auth } from './auth'
import type { ModuleDefinition, ModuleKey, ModuleState } from './modules'
import type {
  ChatwootConversation, ChatwootMessage, ChatwootStatus, Contact, Deal,
  Pipeline, Stage, InboxConnection, InboxConversation, InboxMessage, PaginatedResult,
  StockCashTransaction, StockCashTransactionType, StockCategory, StockDashboard,
  StockMovement, StockMovementType, StockProduct, WhatsAppChat,
  EmbeddedSignupCompletionResult, EmbeddedSignupConfig, MetaApiStatus,
  AccountSummary, ChecklistSummary, ChecklistTemplate, Client, ClientChecklist, ClientDocument,
  ClientNote, ClientSummary, CollectionPayment, CollectionSummary, CustomerServiceSummary,
  Receivable, RecurringCharge, Ticket, TicketPriority, TicketStatus, WhatsAppSessionSnapshot,
  InternalChatConversation, InternalChatMember, InternalChatMessage, InternalChatMessagesPage,
  Sale, SaleHistoryEntry, SaleStatus, SaleSummary,
} from '@/types'

export type WorkspaceSettingsResponse = {
  modules: ModuleState
  definitions: ModuleDefinition[]
  stockVisible: boolean
}

// Apunta al backend que ya tenemos corriendo
export const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'

export function resolveApiAssetUrl(value?: string | null) {
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return value
  const apiOrigin = BASE_URL.replace(/\/api\/v1\/?$/, '')
  const normalizedPath = value.startsWith('/') ? value : `/${value}`
  return `${apiOrigin}${normalizedPath}`
}

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Interceptor: agrega el token JWT automaticamente a cada request
// Sin esto tendrias que pasarlo manualmente en cada llamada
api.interceptors.request.use((config) => {
  const token = auth.getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Interceptor de respuesta: maneja errores globalmente
// Si el token expiro (401), limpia la sesion y redirige al login.
// Omitimos la redireccion si el error de auth proviene del propio login.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAuthRoute = error.config?.url?.includes('/auth/login') || error.config?.url?.includes('/auth/register')
    
    if (error.response?.status === 401 && !isAuthRoute) {
      auth.clear()
      window.location.replace('/login')
    }
    return Promise.reject(error)
  }
)

// Auth
export const authApi = {
  register: (data: {
    email: string
    password: string
    firstName: string
    lastName?: string
    workspaceName: string
  }) => api.post('/auth/register', data),

  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),

  me: () => api.get('/auth/me'),

  getWorkspaceSettings: () =>
    api.get<WorkspaceSettingsResponse>('/auth/workspace-settings'),

  updateWorkspaceSettings: (data: { modules?: Partial<Record<ModuleKey, boolean>>; stockVisible?: boolean }) =>
    api.patch<WorkspaceSettingsResponse>('/auth/workspace-settings', data),

  updateAvatar: (avatar: string | null) =>
    api.patch('/auth/me/avatar', { avatar }),

  listApiKeys: () =>
    api.get('/auth/api-keys'),

  createApiKey: (data: { name: string }) =>
    api.post('/auth/api-keys', data),

  deleteApiKey: (id: string) =>
    api.delete(`/auth/api-keys/${id}`),

  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) =>
    api.post('/auth/reset-password', { token, password }),
}

// Contactos
type ContactFiltersQuery = {
  search?: string; status?: string; page?: number
  limit?: number; sortBy?: string; sortDir?: 'asc' | 'desc'
  scoreMin?: number; scoreMax?: number
}

export const contactsApi = {
  list: (params?: ContactFiltersQuery) =>
    api.get('/contacts', { params }),

  get: (id: string) =>
    api.get(`/contacts/${id}`),

  create: (data: Omit<Partial<Contact>, 'id' | 'workspaceId' | 'score' | 'isArchived' | 'createdAt' | 'updatedAt'> & { firstName: string }) =>
    api.post('/contacts', data),

  update: (id: string, data: Omit<Partial<Contact>, 'id' | 'workspaceId' | 'score' | 'isArchived' | 'createdAt' | 'updatedAt'>) =>
    api.patch(`/contacts/${id}`, data),

  delete: (id: string) =>
    api.delete(`/contacts/${id}`),

  merge: (winnerId: string, loserId: string) =>
    api.post(`/contacts/${winnerId}/merge`, { loserId }),
}

// Deals
type CreateDealPayload = {
  title: string; pipelineId: string; stageId: string
  value?: number; currency?: string; probability?: number
  companyId?: string; ownerId?: string; contactIds?: string[]
  expectedCloseDate?: string
}
type UpdateDealPayload = Omit<Partial<CreateDealPayload>, 'pipelineId' | 'stageId'>

export const dealsApi = {
  list: (params?: { pipelineId?: string; stageId?: string; status?: string; page?: number; limit?: number }) =>
    api.get('/deals', { params }),

  getKanban: (pipelineId: string) =>
    api.get(`/deals/kanban/${pipelineId}`),

  create: (data: CreateDealPayload) =>
    api.post('/deals', data),

  update: (id: string, data: UpdateDealPayload) =>
    api.patch(`/deals/${id}`, data),

  move: (id: string, stageId: string, position?: number) =>
    api.patch(`/deals/${id}/move`, { stageId, position }),

  convertToClient: (id: string, clientId?: string) =>
    api.post<{ client: Client; deal: Deal; created: boolean }>(`/deals/${id}/convert-to-client`, clientId ? { clientId } : {}),

  delete: (id: string) =>
    api.delete(`/deals/${id}`),
}

// Webhooks
type WebhookPayload = { name: string; url: string; events: string[]; secret?: string }

export const webhooksApi = {
  list: () =>
    api.get('/webhooks'),

  getEvents: () =>
    api.get('/webhooks/events'),

  create: (data: WebhookPayload) =>
    api.post('/webhooks', data),

  update: (id: string, data: Partial<WebhookPayload> & { isActive?: boolean }) =>
    api.patch(`/webhooks/${id}`, data),

  delete: (id: string) =>
    api.delete(`/webhooks/${id}`),

  test: (id: string) =>
    api.post(`/webhooks/${id}/test`),
}

// Pipelines
export const pipelinesApi = {
  list:        ()                                                            => api.get('/pipelines'),
  create:      (data: Pick<Pipeline, 'name'>)                                => api.post('/pipelines', data),
  update:      (id: string, data: Partial<Pick<Pipeline, 'name' | 'isDefault'>>) => api.patch(`/pipelines/${id}`, data),
  delete:      (id: string)                                                  => api.delete(`/pipelines/${id}`),
  createStage: (pipelineId: string, data: Pick<Stage, 'name' | 'color'>)    =>
    api.post(`/pipelines/${pipelineId}/stages`, data),
  updateStage: (pipelineId: string, stageId: string, data: Partial<Pick<Stage, 'name' | 'color'>>) =>
    api.patch(`/pipelines/${pipelineId}/stages/${stageId}`, data),
  deleteStage: (pipelineId: string, stageId: string)                        =>
    api.delete(`/pipelines/${pipelineId}/stages/${stageId}`),
  reorderStages: (pipelineId: string, stageIds: string[]) =>
    api.patch(`/pipelines/${pipelineId}/stages/reorder`, { stageIds }),
}

// Actividades
export const activitiesApi = {
  list: (contactId: string) =>
    api.get('/activities', { params: { contactId } }),

  create: (data: {
    contactId:   string
    type:        string
    title:       string
    description?: string
  }) => api.post('/activities', data),

  delete: (id: string) => api.delete(`/activities/${id}`),
}

export const notesApi = {
  list: (contactId: string) =>
    api.get('/notes', { params: { contactId } }),

  create: (data: { contactId: string; content: string }) =>
    api.post('/notes', data),

  delete: (id: string) => api.delete(`/notes/${id}`),
}

// Dashboard
export const dashboardApi = {
  get: () => api.get('/dashboard'),
}

// Clientes contables (Company se mantiene como detalle interno del backend)
export const clientsApi = {
  remove: (id: string) => api.delete(`/clients/${id}`),
  list: (params?: {
    search?: string
    status?: string
    ownerId?: string
    hasDebt?: boolean
    page?: number
    limit?: number
  }) => api.get<PaginatedResult<Client>>('/clients', { params }),

  get: (id: string) => api.get<Client>(`/clients/${id}`),

  summary: (id: string) => api.get<ClientSummary>(`/clients/${id}/summary`),

  create: (data: Partial<Client> & { name: string }) => api.post<Client>('/clients', data),

  update: (id: string, data: Partial<Omit<Client, 'assignments'>> & {
    assignments?: Array<{ userId: string; area?: string }>
  }) => api.patch<Client>(`/clients/${id}`, data),

  listContacts: (id: string) => api.get<Contact[]>(`/clients/${id}/contacts`),

  claim: (id: string) => api.post<Client>(`/clients/${id}/claim`),

  release: (id: string) => api.post<Client>(`/clients/${id}/release`),

  import: (file: File, commit = false) => {
    const body = new FormData()
    body.append('file', file)
    return api.post('/clients/import', body, { params: { commit }, headers: { 'Content-Type': 'multipart/form-data' } })
  },

  listDocuments: (id: string) => api.get<ClientDocument[]>(`/clients/${id}/documents`),

  uploadDocument: (id: string, file: File, category?: string) => {
    const body = new FormData()
    body.append('file', file)
    if (category) body.append('category', category)
    return api.post<ClientDocument>(`/clients/${id}/documents`, body, { headers: { 'Content-Type': 'multipart/form-data' } })
  },

  downloadDocument: (id: string, documentId: string) =>
    api.get<Blob>(`/clients/${id}/documents/${documentId}/download`, { responseType: 'blob' }),

  listNotes: (id: string) => api.get<ClientNote[]>(`/clients/${id}/notes`),

  addNote: (id: string, content: string) => api.post<ClientNote>(`/clients/${id}/notes`, { content }),

  account: (id: string) => api.get<AccountSummary[]>(`/clients/${id}/account`),
}

export const checklistsApi = {
  summary: () => api.get<ChecklistSummary>('/checklists/summary'),

  listTemplates: (params?: { page?: number; limit?: number; includeInactive?: boolean }) =>
    api.get<PaginatedResult<ChecklistTemplate>>('/checklist-templates', { params }),

  createTemplate: (data: Pick<ChecklistTemplate, 'name' | 'description' | 'periodicity'> & {
    items: Array<Pick<ChecklistTemplate['items'][number], 'title' | 'description' | 'isRequired'>>
  }) => api.post<ChecklistTemplate>('/checklist-templates', data),

  listForClient: (clientId: string, params?: { periodKey?: string; status?: string; page?: number; limit?: number }) =>
    api.get<PaginatedResult<ClientChecklist>>(`/clients/${clientId}/checklists`, { params }),

  createForClient: (clientId: string, data: { templateId: string; periodKey: string; dueDate?: string; assignedToUserId?: string | null }) =>
    api.post<ClientChecklist>(`/clients/${clientId}/checklists`, data),

  updateItem: (clientId: string, checklistId: string, itemId: string, isCompleted: boolean, notes?: string | null) =>
    api.patch<ClientChecklist>(`/clients/${clientId}/checklists/${checklistId}/items/${itemId}`, { isCompleted, ...(notes !== undefined ? { notes } : {}) }),
}

export const collectionsApi = {
  paymentSummaryPdf: (id: string) => api.get<Blob>(`/collections/clients/${id}/payments.pdf`, { responseType: 'blob' }),
  removePayment: (id: string) => api.delete(`/collections/payments/${id}`),
  setPaymentStatus: (id: string, status: 'RECEIVED' | 'VOID') => api.patch(`/collections/payments/${id}/status`, { status }),
  summary: () => api.get<CollectionSummary>('/collections/summary'),

  listReceivables: (params?: {
    status?: string
    companyId?: string
    currency?: string
    page?: number
    limit?: number
  }) => api.get<PaginatedResult<Receivable>>('/collections/receivables', { params }),

  exportReceivables: (params?: { status?: string; companyId?: string; currency?: string }) =>
    api.get<Blob>('/collections/receivables/export', { params, responseType: 'blob' }),

  createReceivable: (data: {
    companyId: string
    description: string
    periodKey?: string
    currency?: string
    amount: string
    dueDate: string
    reference?: string
  }) => api.post<Receivable>('/collections/receivables', data),

  listPayments: (params?: { companyId?: string; currency?: string; includeVoided?: boolean; page?: number; limit?: number }) =>
    api.get<PaginatedResult<CollectionPayment>>('/collections/payments', { params }),

  createPayment: (data: {
    companyId: string
    currency?: string
    amount: string
    paidAt?: string
    method?: string
    reference?: string
    notes?: string
    allocations?: Array<{ receivableId: string; amount: string }>
  }) => api.post<CollectionPayment>('/collections/payments', data),

  import: (file: File, commit = false) => {
    const body = new FormData()
    body.append('file', file)
    return api.post('/collections/import', body, { params: { commit }, headers: { 'Content-Type': 'multipart/form-data' } })
  },

  listRecurring: (params?: { companyId?: string; page?: number; limit?: number }) => api.get<PaginatedResult<RecurringCharge>>('/collections/recurring-charges', { params }),

  createRecurring: (data: {
    companyId: string
    name: string
    description?: string
    amount: string
    currency?: string
    frequency?: 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
    dayOfMonth?: number
    startDate: string
    endDate?: string | null
    isActive?: boolean
  }) => api.post<RecurringCharge>('/collections/recurring-charges', data),

  generateRecurring: (periodKey: string) => api.post('/collections/recurring-charges/generate', { periodKey }),
}

export const ticketsApi = {
  list: (params?: {
    inbox?: 'free' | 'mine' | 'all'
    search?: string
    status?: TicketStatus | ''
    priority?: TicketPriority | ''
    page?: number
    limit?: number
  }) => api.get<PaginatedResult<Ticket>>('/tickets', {
    params: params ? {
      ...params,
      status: params.status || undefined,
      priority: params.priority || undefined,
    } : undefined,
  }),

  get: (id: string) => api.get<Ticket>(`/tickets/${id}`),

  update: (id: string, data: Partial<Pick<Ticket, 'subject' | 'priority' | 'category' | 'dueAt'>>) =>
    api.patch<Ticket>(`/tickets/${id}`, data),

  assign: (id: string, assignedToUserId: string | null) =>
    api.patch<Ticket>(`/tickets/${id}/assign`, { assignedToUserId }),

  updateStatus: (id: string, status: TicketStatus) =>
    api.patch<Ticket>(`/tickets/${id}/status`, { status }),

  reply: (id: string, text: string) => api.post<Ticket>(`/tickets/${id}/reply`, { text }),

  listComments: (id: string) => api.get<Array<{ id: string; body: string; createdAt: string }>>(`/tickets/${id}/comments`),

  addComment: (id: string, body: string) => api.post(`/tickets/${id}/comments`, { body }),
}

export const customerServiceApi = {
  summary: () => api.get<CustomerServiceSummary>('/customer-service/summary'),
}

export const stockApi = {
  dashboard: () =>
    api.get<StockDashboard>('/stock/dashboard'),

  listCategories: () =>
    api.get<StockCategory[]>('/stock/categories'),

  createCategory: (data: { name: string; description?: string }) =>
    api.post<StockCategory>('/stock/categories', data),

  listProducts: (params?: {
    search?: string
    categoryId?: string
    stockState?: 'all' | 'low' | 'out' | 'active'
    page?: number
    limit?: number
  }) =>
    api.get<PaginatedResult<StockProduct>>('/stock/products', { params }),

  createProduct: (data: {
    name: string
    description?: string
    sku?: string
    categoryId?: string
    price?: number
    cost?: number
    image?: string
    images?: string[]
    featured?: boolean
    stockQuantity?: number
    minStock?: number
  }) =>
    api.post<StockProduct>('/stock/products', data),

  updateProduct: (id: string, data: Partial<{
    name: string
    description: string
    sku: string
    categoryId: string
    price: number
    cost: number
    image: string
    images: string[]
    featured: boolean
    stockQuantity: number
    minStock: number
  }>) =>
    api.patch<StockProduct>(`/stock/products/${id}`, data),

  deleteProduct: (id: string) =>
    api.delete(`/stock/products/${id}`),

  quickSale: (id: string, data?: {
    quantity?: number
    paymentMethod?: string
    reference?: string
    note?: string
  }) =>
    api.post(`/stock/products/${id}/quick-sale`, data),

  listMovements: (params?: {
    productId?: string
    type?: StockMovementType
    page?: number
    limit?: number
  }) =>
    api.get<PaginatedResult<StockMovement>>('/stock/movements', { params }),

  createMovement: (data: {
    productId: string
    type: StockMovementType
    quantity: number
    reason: string
    note?: string
    batchCode?: string
  }) =>
    api.post<StockMovement>('/stock/movements', data),

  listCash: (params?: {
    type?: StockCashTransactionType
    page?: number
    limit?: number
  }) =>
    api.get<PaginatedResult<StockCashTransaction>>('/stock/cash', { params }),

  createCash: (data: {
    type: StockCashTransactionType
    category: string
    amount: number
    paymentMethod?: string
    reference?: string
    note?: string
    occurredAt?: string
  }) =>
    api.post<StockCashTransaction>('/stock/cash', data),

  deleteCash: (id: string) =>
    api.delete(`/stock/cash/${id}`),
}

export const whatsappApi = {
  getSession: () =>
    api.get<WhatsAppSessionSnapshot>('/whatsapp/session'),

  connect: () =>
    api.post<WhatsAppSessionSnapshot>('/whatsapp/connect', { mode: 'qr' }),

  disconnect: () =>
    api.post('/whatsapp/disconnect'),

  listChats: (params?: { search?: string }) =>
    api.get('/whatsapp/chats', { params }),

  listMessages: (jid: string, params?: { limit?: number }) =>
    api.get(`/whatsapp/chats/${encodeURIComponent(jid)}/messages`, { params }),

  updateChat: (jid: string, data: { displayName: string }) =>
    api.patch<WhatsAppChat>(`/whatsapp/chats/${encodeURIComponent(jid)}`, data),

  updateAssignee: (jid: string, assignedToUserId: string | null) =>
    api.patch<WhatsAppChat>(`/whatsapp/chats/${encodeURIComponent(jid)}/assignee`, { assignedToUserId }),

  updateIdentity: (jid: string, phoneNumber: string) =>
    api.patch<WhatsAppChat>(`/whatsapp/chats/${encodeURIComponent(jid)}/identity`, { phoneNumber }),

  deleteChat: (jid: string) =>
    api.delete(`/whatsapp/chats/${encodeURIComponent(jid)}`),

  syncHistory: (jid: string, params?: { count?: number }) =>
    api.post(`/whatsapp/chats/${encodeURIComponent(jid)}/history`, undefined, { params }),

  getMessageMedia: (messageId: string) =>
    api.get<Blob>(`/whatsapp/messages/${encodeURIComponent(messageId)}/media`, { responseType: 'blob' }),

  sendMessage: (jid: string, data: {
    text?: string
    file?: {
      fileName: string
      mimeType: string
      dataBase64: string
    }
  }) =>
    api.post(`/whatsapp/chats/${encodeURIComponent(jid)}/messages`, data),
}

// Equipo
export const teamApi = {
  createInvitation: (role: 'admin' | 'member' | 'viewer') => api.post<{ token: string; expiresAt: string }>('/auth/invitations', { role }),
  acceptInvitation: (data: { token: string; email: string; password: string; firstName: string; lastName: string }) => api.post('/auth/invitations/accept', data),
  changePassword: (id: string, password: string) => api.patch(`/auth/team/${id}/password`, { password }),
  list: () =>
    api.get('/auth/team'),

  invite: (data: { email: string; firstName: string; lastName?: string; password: string; role: 'admin' | 'member' | 'viewer' }) =>
    api.post('/auth/invite', data),

  updateRole: (memberId: string, role: 'admin' | 'member' | 'viewer') =>
    api.patch(`/auth/team/${memberId}/role`, { role }),

  remove: (memberId: string) =>
    api.delete(`/auth/team/${memberId}`),
}

export const internalChatApi = {
  listMembers: () =>
    api.get<InternalChatMember[]>('/internal-chat/members'),

  listConversations: () =>
    api.get<InternalChatConversation[]>('/internal-chat/conversations'),

  createDirect: (userId: string) =>
    api.post<{ id: string }>('/internal-chat/conversations/direct', { userId }),

  listMessages: (conversationId: string, params?: { limit?: number; cursor?: string }) =>
    api.get<InternalChatMessagesPage>(`/internal-chat/conversations/${conversationId}/messages`, { params }),

  sendMessage: (conversationId: string, body: string) =>
    api.post<InternalChatMessage>(`/internal-chat/conversations/${conversationId}/messages`, { body }),

  markRead: (conversationId: string, messageId?: string) =>
    api.post(`/internal-chat/conversations/${conversationId}/read`, { messageId }),
}


// Inbox / Canales
export const inboxApi = {
  listConnections: () =>
    api.get<InboxConnection[]>('/inbox/connections'),

  listConversations: (params?: {
    channel?: 'whatsapp' | 'instagram' | 'messenger' | 'tiktok'
    status?: string
    page?: number
    limit?: number
  }) =>
    api.get<PaginatedResult<InboxConversation>>('/inbox/conversations', { params }),

  listMessages: (conversationId: string, params?: { page?: number; limit?: number }) =>
    api.get<PaginatedResult<InboxMessage>>(`/inbox/conversations/${conversationId}/messages`, { params }),

  markConversationRead: (conversationId: string) =>
    api.post(`/inbox/conversations/${conversationId}/read`),

  sendConversationMessage: (conversationId: string, data: {
    text: string
    replyToMessageId?: string
    previewUrl?: boolean
  }) =>
    api.post<InboxMessage>(`/inbox/conversations/${conversationId}/messages`, data),

  testConnection: (id: string) =>
    api.post(`/inbox/connections/${id}/test`),

}

export const metaApi = {
  status: () =>
    api.get<MetaApiStatus>('/meta-api/status'),

  embeddedSignupConfig: () =>
    api.get<EmbeddedSignupConfig>('/meta-api/embedded-signup/config'),

  listConnections: () =>
    api.get<InboxConnection[]>('/meta-api/connections'),

  createConnection: (data: {
    channel: 'whatsapp' | 'instagram' | 'messenger'
    name: string
    externalAccountId: string
    externalAccountLabel?: string
    credentials?: Record<string, unknown>
    settings?: Record<string, unknown>
  }) =>
    api.post<InboxConnection>('/meta-api/connections', data),

  updateConnection: (id: string, data: Partial<{
    name: string
    status: 'disconnected' | 'connected' | 'error'
    externalAccountLabel: string | null
    credentials: Record<string, unknown>
    settings: Record<string, unknown>
    lastSyncedAt: string | null
  }>) =>
    api.patch<InboxConnection>(`/meta-api/connections/${id}`, data),

  deleteConnection: (id: string) =>
    api.delete(`/meta-api/connections/${id}`),

  testConnection: (id: string) =>
    api.post(`/meta-api/connections/${id}/test`),

  registerWhatsAppPhone: (id: string, pin: string) =>
    api.post(`/meta-api/connections/${id}/whatsapp/register`, { pin }),

  completeEmbeddedSignup: (data: {
    phoneNumberId: string
    accessToken: string
    businessId?: string
    wabaId?: string
    displayPhoneNumber?: string
    verifiedName?: string
    qualityRating?: string
    name?: string
  }) =>
    api.post<EmbeddedSignupCompletionResult>('/meta-api/embedded-signup/complete', data),

  completeEmbeddedSignupCode: (data: {
    code: string
    phoneNumberId: string
    businessId?: string
    wabaId?: string
    displayPhoneNumber?: string
    verifiedName?: string
    qualityRating?: string
    name?: string
    redirectUri?: string
  }) =>
    api.post<EmbeddedSignupCompletionResult>('/meta-api/embedded-signup/complete-code', data),
}

export const chatwootApi = {
  status: () =>
    api.get<ChatwootStatus>('/chatwoot/status'),

  listConversations: (params?: {
    channel?: 'all' | 'messenger' | 'instagram'
    status?: 'all' | 'open' | 'resolved' | 'pending' | 'snoozed'
    q?: string
    page?: number
    limit?: number
  }) =>
    api.get<PaginatedResult<ChatwootConversation>>('/chatwoot/conversations', { params }),

  listMessages: (conversationId: number, params?: { before?: number; after?: number }) =>
    api.get<ChatwootMessage[]>(`/chatwoot/conversations/${conversationId}/messages`, { params }),

  sendMessage: (conversationId: number, data: { content: string }) =>
    api.post<ChatwootMessage>(`/chatwoot/conversations/${conversationId}/messages`, data),
}

// Ventas
type SaleFiltersQuery = {
  companyId?: string
  status?: SaleStatus
  currency?: string
  from?: string
  to?: string
  page?: number
  limit?: number
  includeDeleted?: boolean
}

export type SalePayload = {
  companyId: string
  soldAt?: string
  currency?: string
  discount?: string
  taxAmount?: string
  reference?: string | null
  notes?: string | null
  items: Array<{ description: string; quantity: string; unitPrice: string }>
}

export const salesApi = {
  summary: (params?: { from?: string; to?: string }) =>
    api.get<SaleSummary>('/sales/summary', { params }),

  list: (params?: SaleFiltersQuery) =>
    api.get<PaginatedResult<Sale>>('/sales', { params }),

  get: (id: string) =>
    api.get<Sale>(`/sales/${id}`),

  create: (data: SalePayload) =>
    api.post<Sale>('/sales', data),

  update: (id: string, data: Partial<SalePayload>) =>
    api.patch<Sale>(`/sales/${id}`, data),

  confirm: (id: string) =>
    api.post<Sale>(`/sales/${id}/confirm`),

  cancel: (id: string, reason?: string) =>
    api.post<Sale>(`/sales/${id}/cancel`, { reason }),

  remove: (id: string) =>
    api.delete(`/sales/${id}`),

  restore: (id: string) =>
    api.post<Sale>(`/sales/${id}/restore`),

  history: (id: string) =>
    api.get<SaleHistoryEntry[]>(`/sales/${id}/history`),

  export: (params?: Omit<SaleFiltersQuery, 'page' | 'limit'>) =>
    api.get('/sales/export', { params, responseType: 'blob' }),
}
