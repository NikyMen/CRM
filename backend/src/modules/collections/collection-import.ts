import ExcelJS from 'exceljs'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'
import { Prisma } from '@prisma/client'

export interface CollectionImportRow {
  rowNumber: number
  type: 'RECEIVABLE' | 'PAYMENT'
  ruc?: string
  description: string
  amount?: string
  currency: string
  dueDate?: Date
  reference?: string
  method?: string
  notes?: string
  externalKey: string
  errors: string[]
}

const normalizeHeader = (value: unknown) => String(value ?? '')
  .trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim()

const aliases: Record<string, string> = {
  tipo: 'type', movimiento: 'type',
  ruc: 'ruc', cliente: 'client', descripcion: 'description', concepto: 'description',
  monto: 'amount', importe: 'amount', moneda: 'currency', vencimiento: 'dueDate',
  'fecha vencimiento': 'dueDate', fecha: 'dueDate', 'fecha pago': 'dueDate',
  referencia: 'reference', metodo: 'method', notas: 'notes', 'id externo': 'externalKey',
}

const cellText = (value: ExcelJS.CellValue): string => {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    if ('text' in value) return String(value.text ?? '').trim()
    if ('result' in value) return String(value.result ?? '').trim()
    if ('richText' in value) return value.richText.map((part) => part.text).join('').trim()
  }
  return String(value).trim()
}

export function parseImportedAmount(value: string): string | undefined {
  let normalized = value.replace(/[^0-9,.-]/g, '')
  if (!normalized) return undefined
  const lastComma = normalized.lastIndexOf(',')
  const lastDot = normalized.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? ',' : '.'
    normalized = normalized
      .replace(decimalSeparator === ',' ? /\./g : /,/g, '')
      .replace(decimalSeparator, '.')
  } else if (lastComma >= 0) {
    const decimals = normalized.length - lastComma - 1
    normalized = decimals >= 1 && decimals <= 2 ? normalized.replace(',', '.') : normalized.replace(/,/g, '')
  } else if (lastDot >= 0) {
    const decimals = normalized.length - lastDot - 1
    if (decimals < 1 || decimals > 2) normalized = normalized.replace(/\./g, '')
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return undefined
  try {
    const amount = new Prisma.Decimal(normalized)
    const fixed = amount.toFixed(2)
    return amount.gt(0) && fixed.split('.')[0].length <= 16 ? fixed : undefined
  } catch {
    return undefined
  }
}

function strictDate(year: number, month: number, day: number) {
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return undefined
  const date = new Date(Date.UTC(year, month - 1, day, 12))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    ? date
    : undefined
}

export function parseImportedDate(value: string): Date | undefined {
  const trimmed = value.trim()
  const localMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed)
  if (localMatch) {
    const [, day, month, year] = localMatch
    return strictDate(Number(year), Number(month), Number(day))
  }
  const isoDay = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(trimmed)
  if (isoDay && !strictDate(Number(isoDay[1]), Number(isoDay[2]), Number(isoDay[3]))) {
    return undefined
  }
  const date = new Date(trimmed)
  return Number.isNaN(date.getTime()) ? undefined : date
}

export async function parseCollectionSpreadsheet(buffer: Buffer, filename: string): Promise<CollectionImportRow[]> {
  const workbook = new ExcelJS.Workbook()
  if (filename.toLowerCase().endsWith('.csv')) await workbook.csv.read(Readable.from(buffer))
  else await workbook.xlsx.load(buffer as any)
  const sheet = workbook.worksheets[0]
  if (!sheet || sheet.rowCount < 2) return []

  const headers = new Map<number, string>()
  sheet.getRow(1).eachCell((cell, column) => {
    const normalized = normalizeHeader(cellText(cell.value))
    headers.set(column, aliases[normalized] ?? normalized)
  })

  const rows: CollectionImportRow[] = []
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const raw: Record<string, string> = {}
    const sheetRow = sheet.getRow(rowNumber)
    headers.forEach((key, column) => { raw[key] = cellText(sheetRow.getCell(column).value) })
    if (!Object.values(raw).some(Boolean)) continue

    const ruc = (raw.ruc ?? '').split('-')[0].replace(/\D/g, '') || undefined
    const rawType = (raw.type || 'cargo').trim().toLowerCase()
    const type = ['pago', 'payment', 'cobro'].includes(rawType) ? 'PAYMENT' : 'RECEIVABLE'
    const description = raw.description?.trim() ?? ''
    const amount = parseImportedAmount(raw.amount ?? '')
    const currency = (raw.currency || 'PYG').trim().toUpperCase()
    const dueDate = parseImportedDate(raw.dueDate ?? '')
    const errors: string[] = []
    if (![...['cargo', 'cuenta', 'receivable', 'honorario'], ...['pago', 'payment', 'cobro']].includes(rawType)) {
      errors.push('Tipo de movimiento inválido; usá cargo o pago')
    }
    if (!ruc) errors.push('Falta RUC para identificar al cliente')
    if (type === 'RECEIVABLE' && !description) errors.push('Falta concepto')
    if (!amount) errors.push('Monto inválido')
    if (amount && currency === 'PYG' && !new Prisma.Decimal(amount).isInteger()) {
      errors.push('PYG no admite centavos')
    }
    if (!dueDate) errors.push('Fecha de vencimiento inválida')
    if (!/^[A-Z]{3}$/.test(currency)) errors.push('Moneda inválida')
    const naturalKey = [type, ruc, description.toLowerCase(), amount, dueDate?.toISOString().slice(0, 10), currency, raw.reference].join('|')
    const externalKey = raw.externalKey?.trim() || `import:${crypto.createHash('sha256').update(naturalKey).digest('hex')}`

    rows.push({
      rowNumber,
      type,
      ruc,
      description,
      amount,
      currency,
      dueDate,
      reference: raw.reference?.trim() || undefined,
      method: raw.method?.trim() || undefined,
      notes: raw.notes?.trim() || undefined,
      externalKey,
      errors,
    })
  }
  return rows
}
