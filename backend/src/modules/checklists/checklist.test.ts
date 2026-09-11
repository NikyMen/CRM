import assert from 'node:assert/strict'
import test from 'node:test'
import { deriveChecklistStatus } from './checklist-status'

test('deriva estado de checklist priorizando completado y vencido', () => {
  const future = new Date('2100-01-01')
  const past = new Date('2020-01-01')
  assert.equal(deriveChecklistStatus([{ isRequired: true, isCompleted: false }], future), 'PENDING')
  assert.equal(deriveChecklistStatus([{ isRequired: true, isCompleted: true }, { isRequired: false, isCompleted: false }], future), 'COMPLETED')
  assert.equal(deriveChecklistStatus([{ isRequired: true, isCompleted: false }], past), 'OVERDUE')
  assert.equal(deriveChecklistStatus([{ isRequired: true, isCompleted: false }, { isRequired: false, isCompleted: true }], future), 'IN_PROGRESS')
})

test('un vencimiento permanece vigente durante todo el día calendario de Paraguay', () => {
  const dueDate = new Date('2026-08-29T12:00:00.000Z')
  const sameParaguayDay = new Date('2026-08-30T02:59:59.000Z')
  const nextParaguayDay = new Date('2026-08-30T03:00:00.000Z')
  const items = [{ isRequired: true, isCompleted: false }]

  assert.equal(deriveChecklistStatus(items, dueDate, sameParaguayDay), 'PENDING')
  assert.equal(deriveChecklistStatus(items, dueDate, nextParaguayDay), 'OVERDUE')
})
