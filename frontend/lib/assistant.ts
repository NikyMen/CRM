import { api } from './api'

// Tipos y API del módulo oculto /asistente (asistente comercial de WhatsApp).

export const PRICE_TOKEN = '{{precio}}'

export type AssistantSettings = {
  id: string
  /** Los maneja el servidor: no se reenvían al guardar. */
  workspaceId: string
  servicesSeeded: boolean
  createdAt: string
  enabled: boolean
  testOnlyPhones: string[]
  excludedPhones: string[]
  notifyTo: string | null
  pauseHours: number
  waitSeconds: number
  maxAudioSeconds: number
  maxRepliesPerHour: number
  timezone: string
  officeDays: number[]
  officeFrom: string
  officeTo: string
  followUpEnabled: boolean
  followUpHours: number
  followUpFrom: string
  followUpTo: string
  followUpMessage: string
  fallbackMessage: string
  extraInstructions: string
  handoffTopics: string[]
  crmSyncEnabled: boolean
  updatedAt: string
}

export type AssistantSettingsInput = Omit<AssistantSettings, 'id' | 'workspaceId' | 'servicesSeeded' | 'createdAt' | 'updatedAt'>

/**
 * Lo que acepta PUT /assistant/settings, campo por campo. El servidor rechaza (422) cualquier campo que no
 * conozca, así que no se reenvía el objeto entero: id, workspaceId, servicesSeeded, createdAt y updatedAt los maneja él.
 */
export function toSettingsInput(settings: AssistantSettings): AssistantSettingsInput {
  return {
    enabled: settings.enabled,
    testOnlyPhones: settings.testOnlyPhones,
    excludedPhones: settings.excludedPhones,
    notifyTo: settings.notifyTo,
    pauseHours: settings.pauseHours,
    waitSeconds: settings.waitSeconds,
    maxAudioSeconds: settings.maxAudioSeconds,
    maxRepliesPerHour: settings.maxRepliesPerHour,
    timezone: settings.timezone,
    officeDays: settings.officeDays,
    officeFrom: settings.officeFrom,
    officeTo: settings.officeTo,
    followUpEnabled: settings.followUpEnabled,
    followUpHours: settings.followUpHours,
    followUpFrom: settings.followUpFrom,
    followUpTo: settings.followUpTo,
    followUpMessage: settings.followUpMessage,
    fallbackMessage: settings.fallbackMessage,
    extraInstructions: settings.extraInstructions,
    handoffTopics: settings.handoffTopics,
    crmSyncEnabled: settings.crmSyncEnabled,
  }
}

export type AssistantService = {
  id: string
  code: string
  title: string
  description: string
  body: string
  /** Guaraníes sin decimales, como texto. */
  amount: string | null
  active: boolean
  sortOrder: number
  /** Texto tal como lo recibe el cliente (null si el texto usa {{precio}} y no hay precio). */
  rendered: string | null
  updatedAt: string
}

export type AssistantServiceInput = Pick<AssistantService, 'title' | 'description' | 'body' | 'amount' | 'active'>

export type AssistantInsights = {
  days: number
  generatedAt: string
  leads: number
  answered: number
  unanswered: number
  offHoursLeads: number
  firstResponse: {
    samples: number
    medianMinutes: number | null
    p90Minutes: number | null
    averageMinutes: number | null
    buckets: { key: string; label: string; count: number }[]
  }
  leadsByHour: number[]
  leadsByDay: { day: string; count: number }[]
  messages: { inbound: number; outbound: number; outboundFromPhone: number; outboundFromCrm: number; audios: number }
  repeatedReplies: { textMessages: number; repeatedMessages: number; share: number; top: { preview: string; count: number }[] }
  pending: { chatId: string; name: string | null; phoneTail: string | null; waitingMinutes: number }[]
}

export type AssistantFlowConfig = {
  version: number
  actualizado: string
  config: Record<string, string | number | boolean>
  bloques: Record<string, string>
  catalogo: Record<string, string>
  sinTarifa: string[]
  instruccionesExtra: string
  mensajeFallback: string
  mensajeSeguimiento: string
}

export const assistantApi = {
  settings: () => api.get<AssistantSettings>('/assistant/settings'),
  saveSettings: (data: AssistantSettingsInput) => api.put<AssistantSettings>('/assistant/settings', data),
  services: () => api.get<AssistantService[]>('/assistant/services'),
  createService: (data: AssistantServiceInput & { code: string }) => api.post<AssistantService>('/assistant/services', data),
  updateService: (id: string, data: AssistantServiceInput) => api.put<AssistantService>(`/assistant/services/${id}`, data),
  deleteService: (id: string) => api.delete(`/assistant/services/${id}`),
  reorderServices: (ids: string[]) => api.put<AssistantService[]>('/assistant/services-order', { ids }),
  restoreDefaults: () => api.post<{ restored: string[]; services: AssistantService[] }>('/assistant/services/restore-defaults'),
  insights: (days: number) => api.get<AssistantInsights>('/assistant/insights', { params: { days } }),
  flowConfig: () => api.get<AssistantFlowConfig>('/assistant/flow-config'),
}

// ─── Formato ────────────────────────────────────────────────────────

/** 880000 → "880.000" (igual que el backend, para que la vista previa coincida con lo que recibe el cliente). */
export function formatGuaranies(amount: string | number) {
  const digits = String(amount).replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export function renderPreview(body: string, amount: string | null) {
  if (!body.includes(PRICE_TOKEN)) return body
  if (!amount) return null
  return body.split(PRICE_TOKEN).join(formatGuaranies(amount))
}

/** 340 → "5 h 40 min", 45 → "45 min", 2900 → "2 d 1 h". */
export function formatWaiting(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) return '—'
  if (minutes < 1) return 'menos de 1 min'
  if (minutes < 60) return `${minutes} min`
  if (minutes < 1440) {
    const rest = minutes % 60
    return rest ? `${Math.floor(minutes / 60)} h ${rest} min` : `${Math.floor(minutes / 60)} h`
  }
  const hours = Math.floor((minutes % 1440) / 60)
  return hours ? `${Math.floor(minutes / 1440)} d ${hours} h` : `${Math.floor(minutes / 1440)} d`
}

export const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
