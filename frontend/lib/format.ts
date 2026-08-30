export const DEFAULT_CURRENCY = 'PYG'

export function formatMoney(value: number | string | null | undefined, currency = DEFAULT_CURRENCY) {
  const raw = String(value ?? 0).replace(',', '.')
  const match = raw.match(/^(-?)(\d+)(?:\.(\d+))?$/)
  if (!match) return new Intl.NumberFormat('es-PY', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'PYG' ? 0 : 2,
  }).format(0)

  const fractionDigits = currency === 'PYG' ? 0 : 2
  const integer = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(BigInt(match[2]))
  const fraction = fractionDigits ? `,${(match[3] ?? '').padEnd(fractionDigits, '0').slice(0, fractionDigits)}` : ''
  const symbol = new Intl.NumberFormat('es-PY', { style: 'currency', currency }).formatToParts(0).find((part) => part.type === 'currency')?.value ?? currency
  return `${symbol}\u00a0${match[1]}${integer}${fraction}`
}

export function subtractDecimal(left: number | string, right: number | string) {
  const parse = (value: number | string) => {
    const match = String(value).replace(',', '.').match(/^(-?)(\d+)(?:\.(\d+))?$/)
    if (!match) return { negative: false, integer: '0', fraction: '' }
    return { negative: match[1] === '-', integer: match[2], fraction: match[3] ?? '' }
  }
  const a = parse(left)
  const b = parse(right)
  const scale = Math.max(a.fraction.length, b.fraction.length)
  const scaled = (value: typeof a) => {
    const magnitude = BigInt(`${value.integer}${value.fraction.padEnd(scale, '0')}`)
    return value.negative ? -magnitude : magnitude
  }
  const result = scaled(a) - scaled(b)
  const negative = result < BigInt(0)
  const digits = (negative ? -result : result).toString().padStart(scale + 1, '0')
  if (!scale) return `${negative ? '-' : ''}${digits}`
  const fraction = digits.slice(-scale).replace(/0+$/, '')
  return `${negative ? '-' : ''}${digits.slice(0, -scale)}${fraction ? `.${fraction}` : ''}`
}

export function isPositiveDecimal(value: number | string | null | undefined) {
  const raw = String(value ?? '').trim().replace(',', '.')
  return /^\+?\d*(?:\.\d+)?$/.test(raw) && /[1-9]/.test(raw)
}

export function formatDate(value?: string | null, options?: Intl.DateTimeFormatOptions) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-PY', options ?? { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

export function formatDateTime(value?: string | null) {
  return formatDate(value, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function fullName(person?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null) {
  if (!person) return 'Sin responsable'
  const value = [person.firstName, person.lastName].filter(Boolean).join(' ').trim()
  return value || person.email || 'Sin responsable'
}

export function getErrorMessage(error: unknown, fallback = 'No pudimos cargar la información.') {
  if (typeof error === 'object' && error) {
    const candidate = error as { response?: { data?: { message?: string; error?: string } }; message?: string }
    return candidate.response?.data?.message ?? candidate.response?.data?.error ?? candidate.message ?? fallback
  }
  return fallback
}
