import { Prisma, type ReceivableStatus } from '@prisma/client'

const asuncionDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Asuncion',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function isPastParaguayDate(dueDate: Date, now = new Date()) {
  return asuncionDay.format(dueDate) < asuncionDay.format(now)
}

export function normalizeParaguayDateInput(value: unknown) {
  if (typeof value !== 'string') return value
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return value
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day, 12))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return new Date(Number.NaN)
  }
  return date
}

export function startOfParaguayDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Asuncion',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const utcNoon = new Date(Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    12
  ))
  const localAtNoon = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Asuncion',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(utcNoon)
  const localValues = Object.fromEntries(localAtNoon.map((part) => [part.type, part.value]))
  const offset = Date.UTC(
    Number(localValues.year),
    Number(localValues.month) - 1,
    Number(localValues.day),
    Number(localValues.hour),
    Number(localValues.minute),
    Number(localValues.second)
  ) - utcNoon.getTime()
  return new Date(Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day)
  ) - offset)
}

export function calculateReceivableStatus(
  amount: Prisma.Decimal,
  paidAmount: Prisma.Decimal,
  dueDate: Date,
  voided = false,
  now = new Date()
): ReceivableStatus {
  if (voided) return 'VOID'
  if (paidAmount.gte(amount)) return 'PAID'
  if (isPastParaguayDate(dueDate, now)) return 'OVERDUE'
  if (paidAmount.gt(0)) return 'PARTIAL'
  return 'PENDING'
}
