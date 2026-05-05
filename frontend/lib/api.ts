import axios from 'axios'
import { auth } from './auth'
import type {
  Contact, Deal, Webhook,
  Pipeline, Stage, InboxConnection, InboxConversation, InboxMessage, PaginatedResult,
} from '@/types'

// Apunta al backend que ya tenemos corriendo
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'

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
      window.location.href = '/login'
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
  update:      (id: string, data: Pick<Pipeline, 'name'>)                    => api.patch(`/pipelines/${id}`, data),
  delete:      (id: string)                                                  => api.delete(`/pipelines/${id}`),
  createStage: (pipelineId: string, data: Pick<Stage, 'name' | 'color'>)    =>
    api.post(`/pipelines/${pipelineId}/stages`, data),
  updateStage: (pipelineId: string, stageId: string, data: Partial<Pick<Stage, 'name' | 'color'>>) =>
    api.patch(`/pipelines/${pipelineId}/stages/${stageId}`, data),
  deleteStage: (pipelineId: string, stageId: string)                        =>
    api.delete(`/pipelines/${pipelineId}/stages/${stageId}`),
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

export const whatsappApi = {
  getSession: () =>
    api.get('/whatsapp/session'),

  connect: () =>
    api.post('/whatsapp/connect', { mode: 'qr' }),

  disconnect: () =>
    api.post('/whatsapp/disconnect'),

  listChats: (params?: { search?: string }) =>
    api.get('/whatsapp/chats', { params }),

  listMessages: (jid: string, params?: { limit?: number }) =>
    api.get(`/whatsapp/chats/${encodeURIComponent(jid)}/messages`, { params }),

  deleteChat: (jid: string) =>
    api.delete(`/whatsapp/chats/${encodeURIComponent(jid)}`),

  syncHistory: (jid: string, params?: { count?: number }) =>
    api.post(`/whatsapp/chats/${encodeURIComponent(jid)}/history`, undefined, { params }),

  sendMessage: (jid: string, text: string) =>
    api.post(`/whatsapp/chats/${encodeURIComponent(jid)}/messages`, { text }),
}

// Equipo
export const teamApi = {
  list: () =>
    api.get('/auth/team'),

  invite: (data: { email: string; firstName: string; lastName?: string; password: string; role: 'admin' | 'member' | 'viewer' }) =>
    api.post('/auth/invite', data),

  updateRole: (memberId: string, role: 'admin' | 'member' | 'viewer') =>
    api.patch(`/auth/team/${memberId}/role`, { role }),

  remove: (memberId: string) =>
    api.delete(`/auth/team/${memberId}`),
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
