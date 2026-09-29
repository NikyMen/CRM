import { buildPdf, DANGER, fit, INK, loadLogo, MUTED, NAVY, Page, SOFT, type Rgb } from '../collections/payment-summary'

// Réplica de la "Planilla Diaria" en papel del estudio: A4 vertical, dos recuadros por fila,
// uno por integrante, con NRO / tarea / CHECK LIST y la línea final de Carga físico e Imputado.

type PdfItem = { description: string; isDone: boolean; company?: { name: string } | null }

export type DailyReportPdfMember = {
  user: { firstName: string; lastName?: string | null; email: string }
  state: 'SUBMITTED' | 'DRAFT' | 'MISSING'
  report: {
    items: PdfItem[]
    notes?: string | null
    physicalCount?: number | null
    migratedCount?: number | null
  } | null
}

export type DailyReportPdfDay = {
  date: string
  totals: { members: number; submitted: number; draft: number; missing: number; tasks: number; pending: number; physical: number; migrated: number }
  members: DailyReportPdfMember[]
}

const PAGE_W = 595
const PAGE_H = 842
const MARGIN = 28
const CONTENT_W = PAGE_W - MARGIN * 2
const GAP = 14
const COL_W = (CONTENT_W - GAP) / 2
const NRO_W = 24
const CHECK_W = 40
const TEXT_W = COL_W - NRO_W - CHECK_W
const HEAD_H = 21
const ROW_H = 11.5
const MIN_ROWS = 10
const MAX_ROWS = 55
const BOTTOM = 40
const GRID: Rgb = [0.55, 0.58, 0.62]
const FONT = 7

const STATE_TAG: Record<DailyReportPdfMember['state'], string> = { SUBMITTED: '', DRAFT: 'BORRADOR — NO ENVIADA', MISSING: 'SIN CARGAR' }

function parts(dateKey: string) {
  const [year, month, day] = dateKey.split('-')
  const weekday = new Intl.DateTimeFormat('es-PY', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${dateKey}T12:00:00Z`))
  return { year, month, day, weekday }
}

/** "jueves 24/09/2026", como el encabezado de la planilla en papel. */
export function dailyReportDayLabel(dateKey: string) {
  const { year, month, day, weekday } = parts(dateKey)
  return `${weekday} ${day}/${month}/${year}`
}

/** "Planilla Diaria - Jueves 24-09-2026.pdf", el mismo nombre que usa el estudio. */
export function dailyReportFileName(dateKey: string) {
  const { year, month, day, weekday } = parts(dateKey)
  return `Planilla Diaria - ${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${day}-${month}-${year}.pdf`
}

const personName = (user: DailyReportPdfMember['user']) =>
  ([user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email).toLocaleUpperCase('es-PY')

const emittedAt = (value: Date) => new Intl.DateTimeFormat('es-PY', { timeZone: 'America/Asuncion', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(value)

type Row = { text: string; check: string; checkRgb?: Rgb; rgb?: Rgb }

function taskRows(member: DailyReportPdfMember): Row[] {
  const rows: Row[] = (member.report?.items ?? []).map((item) => ({
    text: item.company ? `${item.description} · ${item.company.name}` : item.description,
    check: item.isDone ? 'ok' : 'pend.',
    checkRgb: item.isDone ? INK : DANGER,
  }))
  if (rows.length > MAX_ROWS) {
    const hidden = rows.length - (MAX_ROWS - 1)
    rows.splice(MAX_ROWS - 1)
    rows.push({ text: `+ ${hidden} tareas más (ver el detalle en el sistema)`, check: '', rgb: MUTED })
  }
  return rows
}

function drawBox(page: Page, x: number, top: number, member: DailyReportPdfMember | null, rowCount: number, withNotes: boolean) {
  const bodyRows = rowCount + (withNotes ? 1 : 0)
  const height = HEAD_H + (bodyRows + 1) * ROW_H
  const textX = x + NRO_W
  const checkX = textX + TEXT_W

  page.rect(x, top - HEAD_H, COL_W, HEAD_H, SOFT)
  page.text('NRO', x + NRO_W / 2, top - 13, { size: 6.5, bold: true, align: 'center' })
  page.text('CHECK', checkX + CHECK_W / 2, top - 9, { size: 6.5, bold: true, align: 'center' })
  page.text('LIST', checkX + CHECK_W / 2, top - 16.5, { size: 6.5, bold: true, align: 'center' })
  if (member) {
    const tag = STATE_TAG[member.state]
    page.text(fit(`NOMBRE Y APELLIDOS: ${personName(member.user)}`, TEXT_W - 8, 7.5, true), textX + TEXT_W / 2, top - (tag ? 9.5 : 13), { size: 7.5, bold: true, align: 'center' })
    if (tag) page.text(tag, textX + TEXT_W / 2, top - 17.5, { size: 5.5, bold: true, rgb: DANGER, align: 'center', spacing: 0.4 })
  }

  const rows = member ? taskRows(member) : []
  let y = top - HEAD_H
  for (let index = 0; index < rowCount; index++) {
    const row = rows[index]
    page.text(String(index + 1), x + NRO_W / 2, y - 8.3, { size: FONT, bold: true, align: 'center' })
    if (row) {
      page.text(fit(row.text, TEXT_W - 6, FONT), textX + 3, y - 8.3, { size: FONT, rgb: row.rgb ?? INK })
      if (row.check) page.text(row.check, checkX + CHECK_W / 2, y - 8.3, { size: FONT, bold: !row.checkRgb || row.checkRgb === DANGER, rgb: row.checkRgb ?? INK, align: 'center' })
    }
    y -= ROW_H
    page.line(x, y, x + COL_W, y, GRID, 0.4)
  }
  if (withNotes) {
    page.text('Obs.', x + NRO_W / 2, y - 8.3, { size: 6, bold: true, rgb: MUTED, align: 'center' })
    if (member?.report?.notes) page.text(fit(member.report.notes, TEXT_W + CHECK_W - 6, FONT), textX + 3, y - 8.3, { size: FONT, rgb: MUTED })
    y -= ROW_H
    page.line(x, y, x + COL_W, y, GRID, 0.4)
  }

  // Línea final: Carga físico e Imputado / migrado.
  const physical = member?.report?.physicalCount
  const migrated = member?.report?.migratedCount
  page.text(`Carga Físico:  ${physical ?? ''}`, textX + 3, y - 8.3, { size: FONT, bold: true })
  page.text(`Imputado/ Migrado:  ${migrated ?? ''}`, textX + TEXT_W / 2 + 6, y - 8.3, { size: FONT, bold: true })

  page.line(x, top - HEAD_H, x + COL_W, top - HEAD_H, GRID, 0.6)
  page.line(textX, top, textX, top - height, GRID, 0.5)
  page.line(checkX, top, checkX, top - height, GRID, 0.5)
  page.stroke(x, top - height, COL_W, height, INK, 0.8)
  return height
}

export function renderDailyReportPdf(day: DailyReportPdfDay, now = new Date()) {
  const logo = loadLogo()
  const pages: Page[] = []
  const label = dailyReportDayLabel(day.date)
  let page!: Page
  let y = 0

  const newPage = () => {
    page = new Page()
    pages.push(page)
    const top = PAGE_H - MARGIN
    const headerH = 50
    page.stroke(MARGIN, top - headerH, CONTENT_W, headerH, INK, 0.8)
    if (logo) page.logo(MARGIN + 10, top - headerH + 5, headerH - 10)
    page.text(label, PAGE_W / 2, top - 23, { size: 14, bold: true, align: 'center' })
    page.text('Planilla diaria · Gestión ROMEZ', PAGE_W / 2, top - 37, { size: 8, rgb: MUTED, align: 'center' })
    const { totals } = day
    page.text(`Enviaron ${totals.submitted} de ${totals.members}`, MARGIN + CONTENT_W - 10, top - 17, { size: 7.5, bold: true, rgb: NAVY, align: 'right' })
    page.text(`Tareas ${totals.tasks} · Pendientes ${totals.pending}`, MARGIN + CONTENT_W - 10, top - 28, { size: 7.5, rgb: MUTED, align: 'right' })
    page.text(`Físico ${totals.physical} · Migrado ${totals.migrated}`, MARGIN + CONTENT_W - 10, top - 39, { size: 7.5, rgb: MUTED, align: 'right' })
    y = top - headerH - 14
  }

  newPage()

  if (!day.members.length) {
    page.text('No hay integrantes con la planilla diaria habilitada.', PAGE_W / 2, y - 20, { size: 9, rgb: MUTED, align: 'center' })
  }

  for (let index = 0; index < day.members.length; index += 2) {
    const pair = [day.members[index], day.members[index + 1] ?? null]
    // Los dos recuadros de una fila comparten alto, como en la planilla en papel.
    const rowCount = Math.max(MIN_ROWS, ...pair.map((member) => (member ? taskRows(member).length : 0)))
    const withNotes = pair.some((member) => Boolean(member?.report?.notes))
    const bandH = HEAD_H + (rowCount + (withNotes ? 1 : 0) + 1) * ROW_H
    if (y - bandH < BOTTOM) newPage()
    pair.forEach((member, column) => drawBox(page, MARGIN + column * (COL_W + GAP), y, member, rowCount, withNotes))
    y -= bandH + 12
  }

  pages.forEach((current, index) => {
    current.text(`Emitido el ${emittedAt(now)} h`, MARGIN, 22, { size: 7, rgb: MUTED })
    current.text(`Página ${index + 1} de ${pages.length}`, PAGE_W - MARGIN, 22, { size: 7, rgb: MUTED, align: 'right' })
  })

  return buildPdf(pages, logo, `Planilla diaria ${label}`)
}
