import ExcelJS from 'exceljs'
import { Readable } from 'node:stream'

export interface ClientImportRow {
  rowNumber: number
  name: string
  personType: 'INDIVIDUAL' | 'LEGAL_ENTITY'
  ruc?: string
  dv?: string
  legalName?: string
  tradeName?: string
  email?: string
  phone?: string
  activity?: string
  taxObligations: string[]
  address?: string
  city?: string
  department?: string
  status: 'PROSPECT' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
  responsibleEmail?: string
  errors: string[]
}

const normalizeHeader = (value: unknown) => String(value ?? '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

const aliases: Record<string, string> = {
  cliente: 'name',
  nombre: 'name',
  'razon social': 'legalName',
  'razón social': 'legalName',
  'nombre comercial': 'tradeName',
  tipo: 'personType',
  'tipo persona': 'personType',
  ruc: 'ruc',
  dv: 'dv',
  email: 'email',
  correo: 'email',
  telefono: 'phone',
  celular: 'phone',
  actividad: 'activity',
  obligaciones: 'taxObligations',
  direccion: 'address',
  ciudad: 'city',
  departamento: 'department',
  estado: 'status',
  responsable: 'responsibleEmail',
  'responsable email': 'responsibleEmail',
}

const cellText = (value: ExcelJS.CellValue): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    if ('text' in value) return String(value.text ?? '').trim()
    if ('result' in value) return String(value.result ?? '').trim()
    if ('richText' in value) return value.richText.map((part) => part.text).join('').trim()
  }
  return String(value).trim()
}

function normalizePersonType(value: string): ClientImportRow['personType'] {
  const normalized = normalizeHeader(value)
  return ['fisica', 'persona fisica', 'individual'].includes(normalized)
    ? 'INDIVIDUAL'
    : 'LEGAL_ENTITY'
}

function normalizeStatus(value: string): ClientImportRow['status'] {
  const normalized = normalizeHeader(value)
  if (normalized === 'prospecto') return 'PROSPECT'
  if (normalized === 'inactivo') return 'INACTIVE'
  if (normalized === 'suspendido') return 'SUSPENDED'
  return 'ACTIVE'
}

export function normalizeParaguayanRuc(rawRuc: string, rawDv = '') {
  const cleaned = rawRuc.replace(/\s/g, '')
  const parts = cleaned.split('-')
  const ruc = (parts[0] ?? '').replace(/\D/g, '')
  const dv = (rawDv || parts[1] || '').replace(/\D/g, '')
  return { ruc: ruc || undefined, dv: dv || undefined }
}

export async function parseClientSpreadsheet(buffer: Buffer, filename: string): Promise<ClientImportRow[]> {
  const workbook = new ExcelJS.Workbook()
  if (filename.toLowerCase().endsWith('.csv')) {
    await workbook.csv.read(Readable.from(buffer))
  } else {
    await workbook.xlsx.load(buffer as any)
  }

  const sheet = workbook.worksheets[0]
  if (!sheet || sheet.rowCount < 2) return []

  const headers = new Map<number, string>()
  sheet.getRow(1).eachCell((cell, column) => {
    const normalized = normalizeHeader(cellText(cell.value))
    headers.set(column, aliases[normalized] ?? normalized.replace(/\s+(.)/g, (_, letter: string) => letter.toUpperCase()))
  })

  const rows: ClientImportRow[] = []
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber)
    const raw: Record<string, string> = {}
    headers.forEach((key, column) => { raw[key] = cellText(row.getCell(column).value) })
    if (!Object.values(raw).some(Boolean)) continue

    const { ruc, dv } = normalizeParaguayanRuc(raw.ruc ?? '', raw.dv ?? '')
    const legalName = raw.legalName || undefined
    const tradeName = raw.tradeName || undefined
    const name = raw.name || tradeName || legalName || ''
    const errors: string[] = []
    if (!name) errors.push('Falta nombre, razón social o nombre comercial')
    if (raw.ruc && !ruc) errors.push('RUC inválido')
    if (ruc && dv && dv.length !== 1) errors.push('El DV debe tener un dígito')
    if (raw.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.email)) errors.push('Email inválido')

    rows.push({
      rowNumber,
      name,
      personType: normalizePersonType(raw.personType ?? ''),
      ruc,
      dv,
      legalName,
      tradeName,
      email: raw.email || undefined,
      phone: raw.phone || undefined,
      activity: raw.activity || undefined,
      taxObligations: (raw.taxObligations ?? '').split(/[,;|]/).map((value) => value.trim()).filter(Boolean),
      address: raw.address || undefined,
      city: raw.city || undefined,
      department: raw.department || undefined,
      status: normalizeStatus(raw.status ?? ''),
      responsibleEmail: raw.responsibleEmail?.toLowerCase() || undefined,
      errors,
    })
  }
  return rows
}
