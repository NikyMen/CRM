import { ValidationError } from '../../types'

/** Marcador de precio dentro del texto de un servicio. */
export const PRICE_TOKEN = '{{precio}}'

/** 880000 → "880.000" (guaraníes, sin decimales). */
export function formatGuaranies(amount: string | number | bigint) {
  const digits = String(amount).replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export function bodyUsesPrice(body: string) {
  return body.includes(PRICE_TOKEN)
}

/** Texto exacto que recibe el cliente: reemplaza {{precio}} por el monto formateado. */
export function renderServiceBody(body: string, amount: string | null) {
  if (!bodyUsesPrice(body)) return body
  if (amount === null || amount === '') throw new ValidationError('El texto usa {{precio}} pero el servicio no tiene precio cargado.')
  return body.split(PRICE_TOKEN).join(formatGuaranies(amount))
}

/** Teléfonos como los escribe una persona → sólo dígitos, 9 a 15, sin repetidos. */
export function normalizePhoneList(values: string[]) {
  const seen = new Set<string>()
  for (const raw of values) {
    const digits = raw.replace(/\D/g, '')
    if (!digits) continue
    if (digits.length < 9 || digits.length > 15) {
      throw new ValidationError(`El teléfono "${raw.trim()}" no es válido: usá entre 9 y 15 dígitos, con código de país.`)
    }
    seen.add(digits)
  }
  return [...seen]
}

export function normalizeTextList(values: string[], maxLength: number) {
  const seen = new Set<string>()
  for (const raw of values) {
    const text = raw.trim().replace(/\s+/g, ' ')
    if (!text) continue
    if (text.length > maxLength) throw new ValidationError(`Cada ítem admite hasta ${maxLength} caracteres.`)
    seen.add(text)
  }
  return [...seen]
}

export function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

export function isValidTimezone(value: string) {
  try {
    new Intl.DateTimeFormat('es', { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

// ─── Configuración que consume n8n ──────────────────────────────────

export type SettingsRow = {
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
  updatedAt: Date
}

export type ServiceRow = {
  code: string
  title: string
  description: string
  body: string
  amount: string | null
  active: boolean
  sortOrder: number
}

/**
 * Lo que el flujo de n8n lee en cada mensaje. Las claves de `config` son las del nodo
 * «Config» del flujo; `bloques` lleva el texto ya con el precio puesto y `catalogo` sólo
 * la descripción (el modelo nunca ve montos).
 */
export function buildFlowConfig(settings: SettingsRow, services: ServiceRow[]) {
  const active = services.filter((service) => service.active).sort((a, b) => a.sortOrder - b.sortOrder)
  const bloques: Record<string, string> = {}
  const catalogo: Record<string, string> = {}
  for (const service of active) {
    bloques[service.code] = renderServiceBody(service.body, service.amount)
    catalogo[service.code] = service.description || service.title
  }
  return {
    version: 1,
    actualizado: settings.updatedAt.toISOString(),
    config: {
      botActivo: settings.enabled,
      soloPrueba: settings.testOnlyPhones.join(','),
      excluir: settings.excludedPhones.join(','),
      notificarA: settings.notifyTo ?? '',
      pausaHoras: settings.pauseHours,
      esperaSegundos: settings.waitSeconds,
      maxAudioSegundos: settings.maxAudioSeconds,
      maxRespuestasPorHora: settings.maxRepliesPerHour,
      zonaHoraria: settings.timezone,
      atencionDesde: settings.officeFrom,
      atencionHasta: settings.officeTo,
      atencionDias: settings.officeDays.join(','),
      seguimientoActivo: settings.followUpEnabled,
      seguimientoHoras: settings.followUpHours,
      seguimientoDesde: settings.followUpFrom,
      seguimientoHasta: settings.followUpTo,
      crmActivo: settings.crmSyncEnabled,
    },
    bloques,
    catalogo,
    sinTarifa: settings.handoffTopics,
    instruccionesExtra: settings.extraInstructions,
    mensajeFallback: settings.fallbackMessage,
    mensajeSeguimiento: settings.followUpMessage,
  }
}

// ─── Métricas de la línea comercial ─────────────────────────────────

export type InsightMessage = { fromMe: boolean; sentAt: Date; messageType: string; text: string | null; sentByUserId: string | null }
export type InsightChat = { id: string; displayName: string | null; phoneNumber: string | null; messages: InsightMessage[] }
export type OfficeHours = { timezone: string; days: number[]; from: string; to: string }

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

export function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')), minutes: Number(get('hour')) * 60 + Number(get('minute')), weekday: WEEKDAYS[get('weekday')] ?? 0 }
}

export function isWithinOfficeHours(date: Date, office: OfficeHours) {
  const local = localParts(date, office.timezone)
  const [fromH, fromM] = office.from.split(':').map(Number)
  const [toH, toM] = office.to.split(':').map(Number)
  return office.days.includes(local.weekday) && local.minutes >= fromH * 60 + fromM && local.minutes < toH * 60 + toM
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return null
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
}

const RESPONSE_BUCKETS = [
  { key: 'lt15m', label: 'Menos de 15 min', max: 15 },
  { key: '15m-2h', label: '15 min a 2 h', max: 120 },
  { key: '2h-12h', label: '2 a 12 h', max: 720 },
  { key: '12h-24h', label: '12 a 24 h', max: 1440 },
  { key: 'gt24h', label: 'Más de 24 h', max: Infinity },
] as const

export function computeInsights(chats: InsightChat[], now: Date, office: OfficeHours) {
  const responseMinutes: number[] = []
  const byHour = Array<number>(24).fill(0)
  const byDay = new Map<string, number>()
  const pending: { chatId: string; name: string | null; phoneTail: string | null; waitingMinutes: number }[] = []
  let leads = 0
  let answered = 0
  let offHours = 0
  let inbound = 0
  let outbound = 0
  let outboundFromPhone = 0
  let outboundFromCrm = 0
  let audios = 0
  const outboundTexts = new Map<string, number>()
  let outboundTextTotal = 0

  for (const chat of chats) {
    const messages = [...chat.messages].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())
    for (const message of messages) {
      if (message.fromMe) {
        outbound++
        if (message.sentByUserId) outboundFromCrm++
        else outboundFromPhone++
        const text = message.text?.replace(/\s+/g, ' ').trim()
        if (message.messageType === 'text' && text) {
          outboundTextTotal++
          outboundTexts.set(text, (outboundTexts.get(text) ?? 0) + 1)
        }
      } else inbound++
      if (message.messageType === 'audio') audios++
    }
    const first = messages[0]
    if (!first || first.fromMe) continue // sólo cuentan los chats que empezó el cliente
    leads++
    const local = localParts(first.sentAt, office.timezone)
    byHour[local.hour]++
    byDay.set(local.day, (byDay.get(local.day) ?? 0) + 1)
    if (!isWithinOfficeHours(first.sentAt, office)) offHours++
    const reply = messages.find((message) => message.fromMe && message.sentAt >= first.sentAt)
    if (reply) {
      answered++
      responseMinutes.push(Math.max(0, Math.round((reply.sentAt.getTime() - first.sentAt.getTime()) / 60000)))
    } else {
      const phone = chat.phoneNumber?.replace(/\D/g, '') ?? ''
      pending.push({
        chatId: chat.id,
        name: chat.displayName,
        phoneTail: phone.length >= 4 ? phone.slice(-4) : null,
        waitingMinutes: Math.max(0, Math.round((now.getTime() - first.sentAt.getTime()) / 60000)),
      })
    }
  }

  const sorted = [...responseMinutes].sort((a, b) => a - b)
  const buckets = RESPONSE_BUCKETS.map((bucket) => ({ key: bucket.key, label: bucket.label, count: 0 }))
  for (const minutes of sorted) buckets[RESPONSE_BUCKETS.findIndex((bucket) => minutes < bucket.max)].count++
  const repeated = [...outboundTexts.entries()].filter(([, count]) => count >= 2)
  const repeatedMessages = repeated.reduce((sum, [, count]) => sum + count, 0)

  return {
    leads,
    answered,
    unanswered: leads - answered,
    offHoursLeads: offHours,
    firstResponse: {
      samples: sorted.length,
      medianMinutes: percentile(sorted, 0.5),
      p90Minutes: percentile(sorted, 0.9),
      averageMinutes: sorted.length ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : null,
      buckets,
    },
    leadsByHour: byHour,
    leadsByDay: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({ day, count })),
    messages: { inbound, outbound, outboundFromPhone, outboundFromCrm, audios },
    repeatedReplies: {
      textMessages: outboundTextTotal,
      repeatedMessages,
      share: outboundTextTotal ? Math.round((repeatedMessages / outboundTextTotal) * 100) : 0,
      top: repeated
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([text, count]) => ({ preview: text.length > 90 ? `${text.slice(0, 89)}…` : text, count })),
    },
    pending: pending.sort((a, b) => b.waitingMinutes - a.waitingMinutes).slice(0, 10),
  }
}
