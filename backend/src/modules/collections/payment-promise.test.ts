import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import { Prisma } from '@prisma/client'
import type { WorkspaceContext } from '../../types'

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test'
process.env.REDIS_URL ||= 'redis://127.0.0.1:6379'
process.env.JWT_SECRET ||= 'test-secret-with-at-least-thirty-two-characters'

// Import dinámico: el servicio carga la config de la base y necesita el entorno de arriba.
const load = () => import('./payment-promise.service')

// 22/10/2026 a las 23:30 en Asunción (UTC-3): en UTC ya es 23/10.
const NOW = new Date('2026-10-23T02:30:00Z')
const owner = { workspaceId: 'workspace', userId: 'owner', role: 'owner' } as WorkspaceContext
const member = { workspaceId: 'workspace', userId: 'sonia', role: 'member' } as WorkspaceContext

test('las fechas prometidas son días de Paraguay, sin corrimiento por zona horaria', async () => {
  const { paraguayToday, parsePromiseDate, promiseDateKey } = await load()
  assert.equal(paraguayToday(NOW), '2026-10-22')
  const date = parsePromiseDate('2026-10-28')
  assert.equal(date.toISOString(), '2026-10-28T00:00:00.000Z')
  assert.equal(promiseDateKey(date), '2026-10-28')
  assert.throws(() => parsePromiseDate('2026-02-30'), /no existe/)
  assert.throws(() => parsePromiseDate('28/10/2026'), /formato/)
})

test('clasifica en hoy, vencidas, próximas y cerradas', async () => {
  const { parsePromiseDate, promiseBucket } = await load()
  const today = '2026-10-22'
  assert.equal(promiseBucket(parsePromiseDate('2026-10-22'), 'PENDING', today), 'today')
  assert.equal(promiseBucket(parsePromiseDate('2026-10-21'), 'PENDING', today), 'overdue')
  assert.equal(promiseBucket(parsePromiseDate('2026-10-28'), 'PENDING', today), 'upcoming')
  assert.equal(promiseBucket(parsePromiseDate('2026-10-21'), 'FULFILLED', today), 'closed')
})

test('agendar valida fecha, monto, chat, responsable y rol', async (t) => {
  const { db } = await import('../../core/database')
  const { PaymentPromiseService, parsePromiseDate } = await load()
  mockMethod(t, db.company, 'findFirst', async ({ where }) => { assert.equal(where.workspaceId, 'workspace'); return { id: 'client', ownerId: null } })
  mockMethod(t, db.workspaceUser, 'findUnique', async ({ where }) => where.workspaceId_userId.workspaceId === 'workspace' ? { userId: where.workspaceId_userId.userId, role: 'member' } : null)
  mockMethod(t, db.collectionWhatsAppChat, 'findFirst', async ({ where }) => {
    assert.equal(where.workspaceId, 'workspace')
    assert.equal(where.line, 'collections')
    if (where.id === 'chat') return { id: 'chat', companyId: 'client' }
    if (where.id === 'other-client-chat') return { id: 'other-client-chat', companyId: 'other' }
    return null
  })
  let created: any
  mockMethod(t, db.paymentPromise, 'create', async ({ data }) => {
    created = data
    return { ...data, id: 'promise', status: 'PENDING', createdAt: NOW, company: null, chat: null, assignedUser: null, createdBy: null, closedBy: null }
  })
  const service = new PaymentPromiseService()
  const base = { companyId: 'client', promisedDate: '2026-10-28', currency: 'PYG' }

  const result = await service.create(member, { ...base, amount: '1500000', chatId: 'chat', note: '  Paga por transferencia  ' }, NOW)
  assert.equal(created.workspaceId, 'workspace')
  assert.equal(created.assignedUserId, 'sonia')
  assert.equal(created.createdByUserId, 'sonia')
  assert.equal(created.chatId, 'chat')
  assert.equal(created.note, 'Paga por transferencia')
  assert.ok(created.amount instanceof Prisma.Decimal)
  assert.equal(result.promisedDate, '2026-10-28')
  assert.equal(result.amount, '1500000')

  await service.create(member, { ...base, promisedDate: '2026-10-22' }, NOW)
  assert.equal(created.amount, null)
  await assert.rejects(service.create(member, { ...base, promisedDate: '2026-10-21' }, NOW), /anterior a hoy/)
  await assert.rejects(service.create(member, { ...base, amount: '1500,50' }, NOW), /guaraníes enteros/)
  await assert.rejects(service.create(member, { ...base, chatId: 'commercial-chat' }, NOW), /WhatsApp de Cobranzas/)
  await assert.rejects(service.create(member, { ...base, chatId: 'other-client-chat' }, NOW), /otro cliente/)
  await assert.rejects(service.create(member, { ...base, assignedUserId: 'another' }, NOW), /propietario o administrador/)
  await assert.rejects(service.create({ ...member, role: 'viewer' }, base, NOW), /viewer/)
  await service.create(owner, { ...base, assignedUserId: 'sonia' }, NOW)
  assert.equal(created.assignedUserId, 'sonia')
  assert.equal(created.createdByUserId, 'owner')
})

test('cerrar, reprogramar y permisos al modificar una promesa', async (t) => {
  const { db } = await import('../../core/database')
  const { PaymentPromiseService, parsePromiseDate } = await load()
  const stored = { id: 'promise', workspaceId: 'workspace', companyId: 'client', currency: 'PYG', amount: null, status: 'PENDING', assignedUserId: 'sonia', createdByUserId: 'sonia', promisedDate: parsePromiseDate('2026-10-20') }
  mockMethod(t, db.paymentPromise, 'findFirst', async ({ where }) => {
    assert.equal(where.workspaceId, 'workspace')
    assert.equal(where.company.isArchived, false)
    return where.id === stored.id ? stored : null
  })
  let lastData: any
  mockMethod(t, db.paymentPromise, 'update', async ({ data }) => {
    lastData = data
    Object.assign(stored, data)
    return { ...stored, company: null, chat: null, assignedUser: null, createdBy: null, closedBy: null }
  })
  const service = new PaymentPromiseService()

  await service.update(member, 'promise', { status: 'BROKEN' }, NOW)
  assert.equal(lastData.status, 'BROKEN')
  assert.equal(lastData.closedAt, NOW)
  assert.equal(lastData.closedByUserId, 'sonia')

  const rescheduled = await service.update(member, 'promise', { promisedDate: '2026-10-30' }, NOW)
  assert.equal(lastData.status, 'PENDING')
  assert.equal(lastData.closedAt, null)
  assert.equal(rescheduled.promisedDate, '2026-10-30')

  await assert.rejects(service.update(member, 'promise', { promisedDate: '2026-10-01' }, NOW), /anterior a hoy/)
  await assert.rejects(service.update({ ...member, userId: 'otro' }, 'promise', { status: 'FULFILLED' }, NOW), /asignada/)
  await assert.rejects(service.update(member, 'promise', { assignedUserId: 'otro' }, NOW), /reasignar/)
  await assert.rejects(service.update(member, 'missing', { status: 'FULFILLED' }, NOW), /no encontrad|Promesa de pago/)
  await assert.rejects(service.update({ ...member, role: 'viewer' }, 'promise', { status: 'FULFILLED' }, NOW), /viewer/)
})

test('la bandeja agrupa por día y suma lo pagado desde la promesa en su moneda', async (t) => {
  const { db } = await import('../../core/database')
  const { PaymentPromiseService, parsePromiseDate } = await load()
  const extras = { company: null, chat: null, assignedUser: null, createdBy: null, closedBy: null, amount: null }
  const pending = [
    { ...extras, id: 'vencida', companyId: 'a', currency: 'PYG', status: 'PENDING', promisedDate: parsePromiseDate('2026-10-20'), createdAt: new Date('2026-10-15T12:00:00Z') },
    { ...extras, id: 'hoy', companyId: 'b', currency: 'USD', status: 'PENDING', promisedDate: parsePromiseDate('2026-10-22'), createdAt: new Date('2026-10-18T12:00:00Z') },
    { ...extras, id: 'proxima', companyId: 'a', currency: 'PYG', status: 'PENDING', promisedDate: parsePromiseDate('2026-10-28'), createdAt: new Date('2026-10-21T12:00:00Z') },
  ]
  const wheres: any[] = []
  mockMethod(t, db.paymentPromise, 'findMany', async ({ where }) => {
    wheres.push(where)
    return where.status === 'PENDING' ? pending : [{ ...extras, id: 'cumplida', companyId: 'a', currency: 'PYG', status: 'FULFILLED', promisedDate: parsePromiseDate('2026-10-10'), createdAt: NOW }]
  })
  mockMethod(t, db.payment, 'findMany', async ({ where }) => {
    assert.equal(where.workspaceId, 'workspace')
    assert.equal(where.voidedAt, null)
    return [
      { companyId: 'a', currency: 'PYG', amount: new Prisma.Decimal(500000), createdAt: new Date('2026-10-16T12:00:00Z') },
      { companyId: 'a', currency: 'PYG', amount: new Prisma.Decimal(250000), createdAt: new Date('2026-10-22T12:00:00Z') },
      { companyId: 'a', currency: 'USD', amount: new Prisma.Decimal(10), createdAt: new Date('2026-10-22T12:00:00Z') },
      { companyId: 'b', currency: 'PYG', amount: new Prisma.Decimal(99), createdAt: new Date('2026-10-22T12:00:00Z') },
    ]
  })
  const result = await new PaymentPromiseService().list(member, { scope: 'mine' }, NOW)
  assert.equal(result.date, '2026-10-22')
  assert.deepEqual(result.overdue.map((item) => item.id), ['vencida'])
  assert.deepEqual(result.today.map((item) => item.id), ['hoy'])
  assert.deepEqual(result.upcoming.map((item) => item.id), ['proxima'])
  assert.deepEqual(result.closed.map((item) => item.id), ['cumplida'])
  assert.equal(result.overdue[0].paidSince, '750000')
  assert.equal(result.upcoming[0].paidSince, '250000')
  // Un pago en otra moneda no cuenta para la promesa en dólares.
  assert.equal(result.today[0].paidSince, null)
  for (const where of wheres) {
    assert.equal(where.workspaceId, 'workspace')
    assert.equal(where.assignedUserId, 'sonia')
    assert.equal(where.company.isArchived, false)
    assert.ok(where.company.OR, 'un member sólo ve promesas de su cartera')
  }
})

// Los delegates Prisma son proxies; restauramos la propiedad tras cada prueba.
function mockMethod(t: TestContext, target: any, key: string, implementation: (...args: any[]) => any) {
  const original = target[key]
  target[key] = (...args: any[]) => implementation(...args)
  t.after(() => { target[key] = original })
}
