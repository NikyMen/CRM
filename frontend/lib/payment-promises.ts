import type { QueryClient } from '@tanstack/react-query'
import type { PaymentPromiseStatus } from '@/types'

export const PROMISE_STATUS_LABELS: Record<PaymentPromiseStatus, string> = {
  PENDING: 'Pendiente',
  FULFILLED: 'Cumplida',
  BROKEN: 'No pagó',
  CANCELLED: 'Cancelada',
}

/** Día calendario de Paraguay como `YYYY-MM-DD`. */
export function paraguayToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function dayToUtc(day: string) {
  const [year, month, date] = day.split('-').map(Number)
  return Date.UTC(year, month - 1, date)
}

/** Suma días a un `YYYY-MM-DD` sin pasar por la zona horaria del navegador. */
export function addDays(day: string, amount: number) {
  const value = new Date(dayToUtc(day) + amount * 86_400_000)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`
}

/** `YYYY-MM-DD` → "mar 28 oct". Se formatea en UTC porque el valor ya es un día, no un instante. */
export function formatPromiseDate(day: string, options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '—'
  return new Intl.DateTimeFormat('es-PY', { ...options, timeZone: 'UTC' }).format(new Date(dayToUtc(day)))
}

/** "Hoy", "Mañana", "En 5 días", "Ayer", "Hace 3 días". */
export function relativePromiseDay(day: string, today = paraguayToday()) {
  const diff = Math.round((dayToUtc(day) - dayToUtc(today)) / 86_400_000)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Mañana'
  if (diff === -1) return 'Ayer'
  return diff > 0 ? `En ${diff} días` : `Hace ${-diff} días`
}

export function invalidatePromises(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['payment-promises'] })
  queryClient.invalidateQueries({ queryKey: ['payment-promise-counts'] })
}
