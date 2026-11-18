import assert from 'node:assert/strict'
import test from 'node:test'
import { canChangeStatus, canSeeTask, diffTask, eventTypeFor, nextCompletedAt, type TaskSnapshot } from './task.logic'

const base: TaskSnapshot = {
  title: 'Liquidar IVA de octubre',
  description: '',
  status: 'PENDING',
  priority: 'MEDIUM',
  assignee: 'Ana Pérez',
  client: 'Ferretería Central',
  dueDate: '2026-11-20',
}

test('el alta lista los campos con valor, legibles', () => {
  const changes = diffTask(null, base)
  assert.deepEqual(changes.map((change) => change.field), ['title', 'status', 'priority', 'assignee', 'client', 'dueDate'])
  assert.deepEqual(changes.find((change) => change.field === 'status'), { field: 'status', label: 'Estado', from: null, to: 'Pendiente' })
  assert.equal(changes.find((change) => change.field === 'dueDate')?.to, '20/11/2026')
})

test('una edición guarda el antes y el después de cada campo cambiado', () => {
  const changes = diffTask(base, { ...base, assignee: 'José Rojas', priority: 'HIGH', dueDate: null })
  assert.deepEqual(changes, [
    { field: 'priority', label: 'Prioridad', from: 'Media', to: 'Alta' },
    { field: 'assignee', label: 'Responsable', from: 'Ana Pérez', to: 'José Rojas' },
    { field: 'dueDate', label: 'Vencimiento', from: '20/11/2026', to: null },
  ])
})

test('sin cambios no hay nada que registrar; texto vacío y nulo cuentan igual', () => {
  assert.deepEqual(diffTask(base, { ...base }), [])
  assert.deepEqual(diffTask({ ...base, description: '' }, { ...base, description: '' }), [])
})

test('si sólo cambió el estado, el evento es de estado', () => {
  assert.equal(eventTypeFor(diffTask(base, { ...base, status: 'DONE' })), 'status')
  assert.equal(eventTypeFor(diffTask(base, { ...base, status: 'DONE', title: 'Otro' })), 'updated')
})

test('permisos: admin ve todo; el resto, lo suyo; un viewer no cambia estados', () => {
  const task = { assignedToUserId: 'u-ana', createdByUserId: 'u-admin' }
  assert.equal(canSeeTask({ userId: 'u-otro', role: 'admin' }, task), true)
  assert.equal(canSeeTask({ userId: 'u-ana', role: 'member' }, task), true)
  assert.equal(canSeeTask({ userId: 'u-otro', role: 'member' }, task), false)
  assert.equal(canChangeStatus({ userId: 'u-ana', role: 'member' }, task), true)
  assert.equal(canChangeStatus({ userId: 'u-otro', role: 'member' }, task), false)
  assert.equal(canChangeStatus({ userId: 'u-ana', role: 'viewer' }, task), false)
})

test('completedAt se fija al terminar y se limpia al reabrir', () => {
  const now = new Date('2026-11-18T12:00:00Z')
  const earlier = new Date('2026-11-17T12:00:00Z')
  assert.equal(nextCompletedAt(null, 'DONE', now), now)
  assert.equal(nextCompletedAt(earlier, 'DONE', now), earlier)
  assert.equal(nextCompletedAt(earlier, 'IN_PROGRESS', now), null)
})
