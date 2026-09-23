import fs from 'node:fs'
import path from 'node:path'
import { Prisma } from '@prisma/client'

type PaymentRow = { paidAt: Date; amount: Prisma.Decimal; currency: string; method: string | null; reference: string | null; voidedAt: Date | null }
type ChargeRow = { amount: Prisma.Decimal; paidAmount: Prisma.Decimal; currency: string; description?: string; dueDate?: Date; status?: string }
type Client = { name: string; ruc: string | null; dv: string | null }
type Rgb = [number, number, number]

// Informe A4 dibujado a mano: fuentes PDF estándar (Helvetica, WinAnsi) y el logo ROMEZ
// incrustado como imagen con canal alfa. Los datos sólo se escriben como cadenas escapadas,
// nunca como operadores del documento.

const PAGE_W = 595
const PAGE_H = 842
const LEFT = 42
const RIGHT = PAGE_W - 42
const CONTENT_W = RIGHT - LEFT
const BOTTOM = 72

const NAVY: Rgb = [0, 0.149, 0.376]
const BLUE: Rgb = [0.2, 0.345, 0.647]
const INK: Rgb = [0.122, 0.161, 0.216]
const MUTED: Rgb = [0.42, 0.447, 0.502]
const LINE: Rgb = [0.886, 0.898, 0.918]
const SOFT: Rgb = [0.957, 0.965, 0.98]
const WHITE: Rgb = [1, 1, 1]
const DANGER: Rgb = [0.706, 0.137, 0.094]
const SUCCESS: Rgb = [0.024, 0.463, 0.278]

const LOGO_W = 480
const LOGO_H = 817

let cachedLogo: { rgb: Buffer; alpha: Buffer } | null | undefined
function loadLogo() {
  if (cachedLogo !== undefined) return cachedLogo
  // src/modules/collections (tsx) o dist/src/modules/collections (build) → backend/assets
  const candidates = [path.resolve(__dirname, '..', '..', '..', 'assets'), path.resolve(__dirname, '..', '..', '..', '..', 'assets')]
  const dir = candidates.find((candidate) => fs.existsSync(path.join(candidate, 'romez-logo-rgb.zlib')))
  if (!dir) {
    console.warn('[payment-summary] No se encontró backend/assets/romez-logo-*.zlib; el PDF sale sin logo.')
    cachedLogo = null
    return cachedLogo
  }
  cachedLogo = { rgb: fs.readFileSync(path.join(dir, 'romez-logo-rgb.zlib')), alpha: fs.readFileSync(path.join(dir, 'romez-logo-alpha.zlib')) }
  return cachedLogo
}

// Anchos AFM de Helvetica y Helvetica-Bold (1/1000 em) para ASCII 32–126.
const HELVETICA = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584]
const HELVETICA_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584]
// Letras acentuadas miden lo mismo que su letra base.
const ACCENT_BASE: Record<string, string> = { 'á': 'a', 'à': 'a', 'â': 'a', 'ä': 'a', 'ã': 'a', 'å': 'a', 'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e', 'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i', 'ó': 'o', 'ò': 'o', 'ô': 'o', 'ö': 'o', 'õ': 'o', 'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u', 'ñ': 'n', 'ç': 'c', 'ý': 'y', 'ÿ': 'y', 'Á': 'A', 'À': 'A', 'Â': 'A', 'Ä': 'A', 'Ã': 'A', 'É': 'E', 'È': 'E', 'Ê': 'E', 'Ë': 'E', 'Í': 'I', 'Ì': 'I', 'Î': 'I', 'Ï': 'I', 'Ó': 'O', 'Ò': 'O', 'Ô': 'O', 'Ö': 'O', 'Õ': 'O', 'Ú': 'U', 'Ù': 'U', 'Û': 'U', 'Ü': 'U', 'Ñ': 'N', 'Ç': 'C', 'Ý': 'Y' }
const SPECIAL_WIDTH: Record<string, [number, number]> = { '\x97': [1000, 1000], '\x96': [556, 556], '\x95': [350, 350], '\x85': [1000, 1000], '\x93': [333, 500], '\x94': [333, 500], '\x91': [222, 278], '\x92': [222, 278], '°': [400, 400], 'º': [365, 365], 'ª': [370, 370], '¿': [611, 611], '¡': [333, 333], '·': [278, 278], '«': [556, 556], '»': [556, 556], '\xa0': [278, 278] }
const WIN_ANSI: Record<string, string> = { '—': '\x97', '–': '\x96', '•': '\x95', '…': '\x85', '“': '\x93', '”': '\x94', '‘': '\x91', '’': '\x92', '€': '\x80' }

/** Convierte a WinAnsi (un carácter = un byte latin1); lo no representable queda como "?". */
function toWinAnsi(value: string) {
  // 0x80–0x9F se conservan: son los glifos WinAnsi (…, —, •) que ya produjo esta misma función.
  return value.normalize('NFC').replace(/[\r\n\t]/g, ' ').replace(/[^\x20-\x7e\x80-\xff]/g, (char) => WIN_ANSI[char] ?? '?')
}

function textWidth(value: string, size: number, bold = false) {
  const table = bold ? HELVETICA_BOLD : HELVETICA
  let units = 0
  for (const char of value) {
    const code = char.charCodeAt(0)
    if (code >= 32 && code <= 126) units += table[code - 32]
    else if (SPECIAL_WIDTH[char]) units += SPECIAL_WIDTH[char][bold ? 1 : 0]
    else if (ACCENT_BASE[char]) units += table[ACCENT_BASE[char].charCodeAt(0) - 32]
    else units += 556
  }
  return (units * size) / 1000
}

/** Recorta con "…" para que el texto no invada la columna siguiente. */
function fit(value: string, width: number, size: number, bold = false) {
  const text = toWinAnsi(value)
  if (textWidth(text, size, bold) <= width) return text
  let cut = text
  while (cut.length && textWidth(`${cut}\x85`, size, bold) > width) cut = cut.slice(0, -1)
  return `${cut.trimEnd()}\x85`
}

function wrap(value: string, width: number, size: number, bold = false) {
  const lines: string[] = []
  let current = ''
  for (const word of toWinAnsi(value).split(' ')) {
    const next = current ? `${current} ${word}` : word
    if (textWidth(next, size, bold) <= width || !current) current = next
    else { lines.push(current); current = word }
  }
  if (current) lines.push(current)
  return lines
}

const escapeText = (text: string) => text.replace(/([\\()])/g, '\\$1')
const num = (value: number) => (Math.round(value * 100) / 100).toString()
const color = (rgb: Rgb) => rgb.map(num).join(' ')

const paraguayDate = (value: Date) => new Intl.DateTimeFormat('es-PY', { timeZone: 'America/Asuncion', day: '2-digit', month: '2-digit', year: 'numeric' }).format(value)
const paraguayDateTime = (value: Date) => new Intl.DateTimeFormat('es-PY', { timeZone: 'America/Asuncion', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(value)

const CURRENCY_PREFIX: Record<string, string> = { PYG: 'Gs.', USD: 'US$' }
const CURRENCY_NAME: Record<string, string> = { PYG: 'Guaraníes (PYG)', USD: 'Dólares estadounidenses (USD)' }

/** Formato es-PY: punto de miles y coma decimal; PYG sin decimales. */
export function formatSummaryMoney(value: Prisma.Decimal, currency: string) {
  const fixed = value.toFixed(currency === 'PYG' ? 0 : 2)
  const negative = fixed.startsWith('-')
  const [integer, fraction] = fixed.replace('-', '').split('.')
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${negative ? '-' : ''}${CURRENCY_PREFIX[currency] ?? currency} ${grouped}${fraction ? `,${fraction}` : ''}`
}

const STATUS_LABELS: Record<string, string> = { PENDING: 'Pendiente', PARTIAL: 'Pago parcial', PAID: 'Pagado', OVERDUE: 'Vencido', VOID: 'Anulado' }

type TextOptions = { size?: number; bold?: boolean; rgb?: Rgb; align?: 'left' | 'right' | 'center'; spacing?: number }

class Page {
  ops: string[] = []
  text(value: string, x: number, y: number, { size = 9, bold = false, rgb = INK, align = 'left', spacing = 0 }: TextOptions = {}) {
    const text = toWinAnsi(value)
    const width = textWidth(text, size, bold) + spacing * Math.max(0, text.length - 1)
    const startX = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x
    this.ops.push(`BT ${color(rgb)} rg /${bold ? 'F2' : 'F1'} ${num(size)} Tf ${num(spacing)} Tc ${num(startX)} ${num(y)} Td (${escapeText(text)}) Tj ET`)
  }
  rect(x: number, y: number, w: number, h: number, fill: Rgb) {
    this.ops.push(`${color(fill)} rg ${num(x)} ${num(y)} ${num(w)} ${num(h)} re f`)
  }
  stroke(x: number, y: number, w: number, h: number, rgb: Rgb, lineWidth = 0.75) {
    this.ops.push(`${color(rgb)} RG ${num(lineWidth)} w ${num(x)} ${num(y)} ${num(w)} ${num(h)} re S`)
  }
  line(x1: number, y1: number, x2: number, y2: number, rgb: Rgb, lineWidth = 0.75) {
    this.ops.push(`${color(rgb)} RG ${num(lineWidth)} w ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S`)
  }
  logo(x: number, y: number, height: number, watermark = false) {
    const width = (height * LOGO_W) / LOGO_H
    this.ops.push(`q ${watermark ? '/GSw gs ' : ''}${num(width)} 0 0 ${num(height)} ${num(x)} ${num(y)} cm /Logo Do Q`)
  }
}

type Column = { title: string; width: number; align?: 'left' | 'right' }
type Cell = { text: string; rgb?: Rgb; bold?: boolean }

export function renderPaymentSummary(client: Client, payments: PaymentRow[], charges: ChargeRow[], now = new Date(), periodLabel = 'Historial completo') {
  const logo = loadLogo()
  const pages: Page[] = []
  let page!: Page
  let y = 0

  const newPage = () => {
    page = new Page()
    pages.push(page)
    if (logo) page.logo((PAGE_W - 330 * LOGO_W / LOGO_H) / 2, (PAGE_H - 330) / 2 - 10, 330, true)
    if (pages.length === 1) {
      if (logo) page.logo(LEFT, 738, 76)
      page.text('RESUMEN DE CUENTA', RIGHT, 794, { size: 19, bold: true, rgb: NAVY, align: 'right', spacing: 0.6 })
      page.text('Estado de cuenta corriente del cliente', RIGHT, 778, { size: 9, rgb: MUTED, align: 'right' })
      page.text('Gestión ROMEZ · Servicios contables', RIGHT, 765, { size: 9, rgb: MUTED, align: 'right' })
      page.rect(LEFT, 722, CONTENT_W, 2.2, NAVY)
      page.rect(LEFT, 722, 120, 2.2, BLUE)
      y = 704
    } else {
      if (logo) page.logo(LEFT, 772, 44)
      page.text('RESUMEN DE CUENTA', RIGHT, 800, { size: 11, bold: true, rgb: NAVY, align: 'right', spacing: 0.4 })
      page.text(fit(client.name, 300, 9), RIGHT, 786, { size: 9, rgb: MUTED, align: 'right' })
      page.rect(LEFT, 762, CONTENT_W, 1.5, NAVY)
      y = 740
    }
  }

  const ensure = (height: number) => {
    if (y - height < BOTTOM) { newPage(); return true }
    return false
  }

  const sectionTitle = (title: string, subtitle?: string) => {
    ensure(46)
    y -= 6
    page.rect(LEFT, y - 11, 3, 13, BLUE)
    page.text(title, LEFT + 10, y - 9, { size: 11.5, bold: true, rgb: NAVY })
    if (subtitle) page.text(subtitle, RIGHT, y - 9, { size: 8, rgb: MUTED, align: 'right' })
    y -= 24
  }

  const table = (columns: Column[], rows: Cell[][], empty: string) => {
    const headerHeight = 20
    const rowHeight = 19
    const drawHeader = () => {
      page.rect(LEFT, y - headerHeight, CONTENT_W, headerHeight, NAVY)
      let x = LEFT
      for (const column of columns) {
        const pad = 8
        page.text(column.title.toUpperCase(), column.align === 'right' ? x + column.width - pad : x + pad, y - 13.5, { size: 7.2, bold: true, rgb: WHITE, align: column.align ?? 'left', spacing: 0.5 })
        x += column.width
      }
      y -= headerHeight
    }
    ensure(headerHeight + rowHeight)
    drawHeader()
    if (!rows.length) {
      page.rect(LEFT, y - 28, CONTENT_W, 28, SOFT)
      page.text(empty, LEFT + CONTENT_W / 2, y - 17.5, { size: 8.5, rgb: MUTED, align: 'center' })
      y -= 28
      return
    }
    rows.forEach((row, index) => {
      if (ensure(rowHeight)) drawHeader()
      if (index % 2 === 1) page.rect(LEFT, y - rowHeight, CONTENT_W, rowHeight, SOFT)
      let x = LEFT
      row.forEach((cell, columnIndex) => {
        const column = columns[columnIndex]
        const pad = 8
        const text = fit(cell.text, column.width - pad * 2, 8.5, cell.bold)
        page.text(text, column.align === 'right' ? x + column.width - pad : x + pad, y - 12.8, { size: 8.5, bold: cell.bold, rgb: cell.rgb ?? INK, align: column.align ?? 'left' })
        x += column.width
      })
      page.line(LEFT, y - rowHeight, RIGHT, y - rowHeight, LINE, 0.5)
      y -= rowHeight
    })
  }

  newPage()

  // Datos del cliente y del documento.
  const boxHeight = 64
  page.rect(LEFT, y - boxHeight, CONTENT_W, boxHeight, SOFT)
  page.rect(LEFT, y - boxHeight, 3, boxHeight, NAVY)
  page.text('CLIENTE', LEFT + 16, y - 17, { size: 7, bold: true, rgb: MUTED, spacing: 1 })
  // Nombres largos: primero se achica la letra y sólo como último recurso se recorta.
  let nameSize = 13.5
  while (nameSize > 10 && textWidth(toWinAnsi(client.name), nameSize, true) > 310) nameSize -= 0.5
  page.text(fit(client.name, 310, nameSize, true), LEFT + 16, y - 35, { size: nameSize, bold: true, rgb: INK })
  page.text(`RUC ${client.ruc ? `${client.ruc}${client.dv ? `-${client.dv}` : ''}` : 'no registrado'}`, LEFT + 16, y - 51, { size: 9, rgb: MUTED })
  const metaX = RIGHT - 150
  page.line(metaX - 14, y - 12, metaX - 14, y - boxHeight + 12, LINE, 0.75)
  page.text('FECHA DE EMISIÓN', metaX, y - 17, { size: 7, bold: true, rgb: MUTED, spacing: 1 })
  page.text(`${paraguayDateTime(now)} h`, metaX, y - 29, { size: 9, bold: true, rgb: INK })
  page.text('PERÍODO', metaX, y - 43, { size: 7, bold: true, rgb: MUTED, spacing: 1 })
  page.text(fit(periodLabel, 140, 9, true), metaX, y - 55, { size: 9, bold: true, rgb: INK })
  y -= boxHeight + 22

  // Resumen por moneda: nunca se suman monedas distintas.
  const currencies = [...new Set([...payments.map((p) => p.currency), ...charges.map((c) => c.currency)])].sort((a, b) => (a === 'PYG' ? -1 : b === 'PYG' ? 1 : a.localeCompare(b)))
  sectionTitle('Resumen de la cuenta', currencies.length > 1 ? 'Cada moneda se informa por separado' : undefined)
  if (!currencies.length) {
    page.rect(LEFT, y - 28, CONTENT_W, 28, SOFT)
    page.text('No hay movimientos en el período.', LEFT + CONTENT_W / 2, y - 17.5, { size: 8.5, rgb: MUTED, align: 'center' })
    y -= 40
  }
  for (const currency of currencies) {
    const ofCurrency = charges.filter((c) => c.currency === currency)
    const billed = ofCurrency.reduce((sum, c) => sum.plus(c.amount), new Prisma.Decimal(0))
    const applied = ofCurrency.reduce((sum, c) => sum.plus(c.paidAmount), new Prisma.Decimal(0))
    const received = payments.filter((p) => p.currency === currency && !p.voidedAt).reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0))
    const pending = billed.minus(applied)
    const credit = Prisma.Decimal.max(received.minus(applied), 0)
    ensure((currencies.length > 1 ? 16 : 0) + 62)
    if (currencies.length > 1) {
      page.text(CURRENCY_NAME[currency] ?? currency, LEFT, y - 9, { size: 8.5, bold: true, rgb: MUTED })
      y -= 16
    }
    const gap = 8
    const cardW = (CONTENT_W - gap * 3) / 4
    const cardH = 52
    const cards: Array<{ label: string; value: string; highlight?: boolean; rgb?: Rgb }> = [
      { label: 'Total de cargos', value: formatSummaryMoney(billed, currency) },
      { label: 'Pagos recibidos', value: formatSummaryMoney(received, currency) },
      { label: 'Saldo pendiente', value: formatSummaryMoney(pending, currency), highlight: true },
      { label: 'Saldo a favor', value: formatSummaryMoney(credit, currency), rgb: credit.gt(0) ? SUCCESS : INK },
    ]
    cards.forEach((card, index) => {
      const x = LEFT + index * (cardW + gap)
      if (card.highlight) page.rect(x, y - cardH, cardW, cardH, NAVY)
      else { page.rect(x, y - cardH, cardW, cardH, WHITE); page.stroke(x, y - cardH, cardW, cardH, LINE) }
      page.text(card.label.toUpperCase(), x + 11, y - 18, { size: 6.8, bold: true, rgb: card.highlight ? [0.78, 0.84, 0.95] : MUTED, spacing: 0.6 })
      const valueSize = textWidth(toWinAnsi(card.value), 12.5, true) > cardW - 22 ? 10.5 : 12.5
      page.text(fit(card.value, cardW - 22, valueSize, true), x + 11, y - 38, { size: valueSize, bold: true, rgb: card.highlight ? WHITE : card.rgb ?? INK })
    })
    y -= cardH + 14
  }

  // Detalle de cargos.
  const chargeRows = [...charges].sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0)).map((charge): Cell[] => {
    const outstanding = charge.amount.minus(charge.paidAmount)
    return [
      { text: charge.description || 'Cargo' },
      { text: charge.dueDate ? paraguayDate(charge.dueDate) : '—' },
      { text: STATUS_LABELS[charge.status ?? ''] ?? charge.status ?? '—', rgb: charge.status === 'OVERDUE' ? DANGER : charge.status === 'PAID' ? SUCCESS : INK, bold: charge.status === 'OVERDUE' },
      { text: formatSummaryMoney(charge.amount, charge.currency) },
      { text: formatSummaryMoney(outstanding, charge.currency), bold: outstanding.gt(0) },
    ]
  })
  y -= 4
  sectionTitle('Detalle de cargos', `${charges.length} ${charges.length === 1 ? 'cargo' : 'cargos'}`)
  table([
    { title: 'Concepto', width: CONTENT_W - 70 - 78 - 92 - 92 },
    { title: 'Vencimiento', width: 70 },
    { title: 'Estado', width: 78 },
    { title: 'Importe', width: 92, align: 'right' },
    { title: 'Saldo', width: 92, align: 'right' },
  ], chargeRows, 'No hay cargos en el período.')
  y -= 18

  // Detalle de pagos.
  const paymentRows = payments.map((payment): Cell[] => {
    const voided = Boolean(payment.voidedAt)
    const rgb = voided ? MUTED : INK
    return [
      { text: paraguayDate(payment.paidAt), rgb },
      { text: payment.method ? payment.method.charAt(0) + payment.method.slice(1).toLowerCase() : '—', rgb },
      { text: payment.reference || '—', rgb },
      { text: voided ? 'Anulado' : 'Recibido', rgb: voided ? DANGER : SUCCESS, bold: true },
      { text: formatSummaryMoney(payment.amount, payment.currency), rgb, bold: !voided },
    ]
  })
  sectionTitle('Detalle de pagos', `${payments.length} ${payments.length === 1 ? 'pago' : 'pagos'}`)
  table([
    { title: 'Fecha', width: 70 },
    { title: 'Medio', width: 92 },
    { title: 'Referencia', width: CONTENT_W - 70 - 92 - 72 - 100 },
    { title: 'Estado', width: 72 },
    { title: 'Importe', width: 100, align: 'right' },
  ], paymentRows, 'No hay pagos registrados en el período.')
  y -= 18

  // Notas finales.
  const notes = [
    'Los pagos anulados se muestran como referencia y no integran los totales.',
    'Cada moneda se informa por separado; no se realizan conversiones.',
    'Resumen informativo de cuenta corriente. No constituye comprobante fiscal.',
  ]
  const noteLines = notes.flatMap((note) => wrap(`•  ${note}`, CONTENT_W - 28, 8))
  const notesHeight = 26 + noteLines.length * 12
  ensure(notesHeight)
  page.stroke(LEFT, y - notesHeight, CONTENT_W, notesHeight, LINE)
  page.text('NOTAS', LEFT + 14, y - 16, { size: 7, bold: true, rgb: MUTED, spacing: 1 })
  noteLines.forEach((line, index) => page.text(line, LEFT + 14, y - 30 - index * 12, { size: 8, rgb: MUTED }))
  y -= notesHeight

  // Pie de página con numeración (se conoce el total recién al terminar).
  pages.forEach((current, index) => {
    current.line(LEFT, 50, RIGHT, 50, LINE, 0.75)
    current.text('Gestión ROMEZ · Servicios contables', LEFT, 36, { size: 7.5, bold: true, rgb: NAVY })
    current.text(`Emitido el ${paraguayDateTime(now)} h`, PAGE_W / 2, 36, { size: 7.5, rgb: MUTED, align: 'center' })
    current.text(`Página ${index + 1} de ${pages.length}`, RIGHT, 36, { size: 7.5, rgb: MUTED, align: 'right' })
  })

  return buildPdf(pages, logo)
}

function buildPdf(pages: Page[], logo: { rgb: Buffer; alpha: Buffer } | null) {
  // Objetos fijos: 1 catálogo, 2 páginas, 3–4 fuentes, 5 estado gráfico, 6–7 logo y su máscara.
  const chunks: Buffer[] = []
  const objects: Array<Buffer | string> = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Type /ExtGState /ca 0.06 /CA 0.06 >>',
  ]
  const streamObject = (dict: string, data: Buffer) => Buffer.concat([Buffer.from(`<< ${dict} /Length ${data.length} >>\nstream\n`, 'latin1'), data, Buffer.from('\nendstream', 'latin1')])
  if (logo) {
    objects.push(streamObject(`/Type /XObject /Subtype /Image /Width ${LOGO_W} /Height ${LOGO_H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /SMask 7 0 R`, logo.rgb))
    objects.push(streamObject(`/Type /XObject /Subtype /Image /Width ${LOGO_W} /Height ${LOGO_H} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, logo.alpha))
  }
  const resources = `<< /Font << /F1 3 0 R /F2 4 0 R >> /ExtGState << /GSw 5 0 R >>${logo ? ' /XObject << /Logo 6 0 R >>' : ''} >>`
  const kids: number[] = []
  for (const current of pages) {
    const pageId = objects.length + 1
    kids.push(pageId)
    // Contenido sin comprimir (texto y trazos pesan poco); sólo el logo va comprimido.
    const content = Buffer.from(current.ops.join('\n'), 'latin1')
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources ${resources} /Contents ${pageId + 1} 0 R >>`)
    objects.push(streamObject('', content))
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.map((id) => `${id} 0 R`).join(' ')}] /Count ${kids.length} >>`
  objects.push(`<< /Title (${escapeText(toWinAnsi('Resumen de cuenta'))}) /Author (Gestión ROMEZ) /Producer (Gestión ROMEZ) >>`)
  const infoId = objects.length

  let length = 0
  const push = (chunk: Buffer) => { chunks.push(chunk); length += chunk.length }
  push(Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1'))
  const offsets: number[] = []
  objects.forEach((object, index) => {
    offsets.push(length)
    push(Buffer.from(`${index + 1} 0 obj\n`, 'latin1'))
    push(typeof object === 'string' ? Buffer.from(toWinAnsi(object), 'latin1') : object)
    push(Buffer.from('\nendobj\n', 'latin1'))
  })
  const xref = length
  push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`, 'latin1'))
  return Buffer.concat(chunks)
}

/** Nombre de descarga: "Resumen de cuenta - <Cliente> - <dd-mm-aaaa>.pdf" en fecha de Paraguay. */
export function paymentSummaryFileName(clientName: string, now = new Date()) {
  const date = paraguayDate(now).replace(/\//g, '-')
  const safeName = clientName.normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Cliente'
  return `Resumen de cuenta - ${safeName} - ${date}.pdf`
}
