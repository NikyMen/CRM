import { ValidationError } from '../../types'
import { normalizeParaguayDateInput } from '../collections/collection-calculations'

const asuncionDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Asuncion',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Día calendario de Paraguay en formato `yyyy-mm-dd`. */
export function paraguayToday(now = new Date()) {
  return asuncionDay.format(now)
}

/**
 * Convierte la fecha pedida en el valor que se guarda en la columna DATE.
 * Se permiten días pasados (quien se olvidó de cerrar ayer) pero no futuros.
 */
export function parseReportDate(value: string, today = paraguayToday()) {
  const date = normalizeParaguayDateInput(value)
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new ValidationError('Fecha inválida. Usá el formato aaaa-mm-dd.')
  if (value.trim() > today) throw new ValidationError('No se puede cargar la planilla de un día que todavía no llegó')
  return date
}

/**
 * Clave `yyyy-mm-dd` de una columna DATE. Prisma la devuelve como medianoche UTC,
 * así que acá el ISO sí coincide con el día guardado (no es una hora local).
 */
export function reportDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function summarizeReportItems(items: Array<{ minutes: number | null; isDone: boolean }>) {
  let done = 0
  let minutes = 0
  for (const item of items) {
    if (item.isDone) done += 1
    minutes += item.minutes ?? 0
  }
  return { tasks: items.length, done, pending: items.length - done, minutes }
}
