import assert from 'node:assert/strict'
import test from 'node:test'
import { paraguayToday, parseReportDate, reportDateKey, summarizeReportItems } from './daily-report-calculations'

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
