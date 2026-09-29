import assert from 'node:assert/strict'
import test from 'node:test'
import { paraguayToday, parseReportDate, reportDateKey, summarizeReportItems } from './daily-report-calculations'
import { dailyReportDayLabel, dailyReportFileName, renderDailyReportPdf, type DailyReportPdfMember } from './daily-report-pdf'

const member = (firstName: string, items: number, state: DailyReportPdfMember['state'] = 'SUBMITTED'): DailyReportPdfMember => ({
  user: { firstName, lastName: 'Giménez', email: `${firstName}@romez.test` },
  state,
  report: state === 'MISSING' ? null : {
    items: Array.from({ length: items }, (_, index) => ({ description: `Tarea (${index + 1}) \\ con símbolos`, isDone: index % 2 === 0, company: index === 0 ? { name: 'Cabaña Ñande' } : null })),
    notes: 'Quedó pendiente el IVA',
    physicalCount: 319,
    migratedCount: 367,
  },
})

const totals = { members: 0, submitted: 0, draft: 0, missing: 0, tasks: 0, pending: 0, physical: 0, migrated: 0 }

test('el día de la planilla es el calendario de Paraguay, no el de UTC', () => {
  // 02:00 UTC del 25 todavía es la noche del 24 en Asunción.
  assert.equal(paraguayToday(new Date('2026-09-25T02:00:00Z')), '2026-09-24')
  assert.equal(paraguayToday(new Date('2026-09-24T15:00:00Z')), '2026-09-24')
})

test('acepta hoy y días pasados pero rechaza fechas futuras o inexistentes', () => {
  assert.equal(reportDateKey(parseReportDate('2026-09-24', '2026-09-24')), '2026-09-24')
  assert.equal(reportDateKey(parseReportDate('2026-09-20', '2026-09-24')), '2026-09-20')
  assert.throws(() => parseReportDate('2026-09-25', '2026-09-24'), /no lleg/i)
  assert.throws(() => parseReportDate('2026-02-30', '2026-09-24'), /inválida/i)
})

test('la clave de una columna DATE no se corre de día', () => {
  assert.equal(reportDateKey(new Date('2026-09-24T00:00:00.000Z')), '2026-09-24')
})

test('resume tareas hechas, pendientes y minutos', () => {
  assert.deepEqual(summarizeReportItems([
    { minutes: 30, isDone: true },
    { minutes: null, isDone: false },
    { minutes: 45, isDone: true },
  ]), { tasks: 3, done: 2, pending: 1, minutes: 75 })
  assert.deepEqual(summarizeReportItems([]), { tasks: 0, done: 0, pending: 0, minutes: 0 })
})

test('el PDF lleva el encabezado y el nombre de archivo de la planilla en papel', () => {
  assert.equal(dailyReportDayLabel('2026-09-24'), 'jueves 24/09/2026')
  assert.equal(dailyReportFileName('2026-09-24'), 'Planilla Diaria - Jueves 24-09-2026.pdf')
  const pdf = renderDailyReportPdf({ date: '2026-09-24', totals, members: [member('Perla', 7), member('Devora', 0, 'MISSING'), member('Silvia', 3, 'DRAFT')] }).toString('latin1')
  assert.ok(pdf.startsWith('%PDF-1.4'))
  assert.ok(pdf.includes('(jueves 24/09/2026) Tj'))
  assert.ok(pdf.includes('NOMBRE Y APELLIDOS: PERLA GIM\xc9NEZ'))
  assert.ok(pdf.includes('(SIN CARGAR) Tj'))
  assert.ok(pdf.includes('Carga F\xedsico:  319'))
  // Los paréntesis y barras del texto se escapan y no rompen el documento.
  assert.ok(pdf.includes('Tarea \\(1\\) \\\\ con s\xedmbolos'))
  assert.ok(pdf.includes('/Count 1'))
})

test('el PDF pasa a otra página cuando no entran todos los integrantes', () => {
  const members = Array.from({ length: 12 }, (_, index) => member(`Persona${index}`, 12))
  const pdf = renderDailyReportPdf({ date: '2026-09-24', totals, members }).toString('latin1')
  assert.match(pdf, /\/Count [2-9]/)
  assert.ok(pdf.includes('Página 1 de'))
})
