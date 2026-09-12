import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import { Prisma } from '@prisma/client'
import { renderPaymentSummary } from './payment-summary'
import type { WorkspaceContext } from '../../types'
import {
  parseCollectionSpreadsheet,
  parseImportedAmount,
  parseImportedDate,
} from './collection-import'
import {
  calculateReceivableStatus,
  normalizeParaguayDateInput,
  startOfParaguayDay,
} from './collection-calculations'

test('normaliza importes paraguayos y decimales', () => {
  assert.equal(parseImportedAmount('Gs. 1.500.000'), '1500000.00')
  assert.equal(parseImportedAmount('1.500,50'), '1500.50')
  assert.equal(parseImportedAmount('9007199254740993,50'), '9007199254740993.50')
  assert.equal(parseImportedAmount('10,5'), '10.50')
  assert.equal(parseImportedAmount('0'), undefined)
})

test('interpreta fechas locales sin cambiar el día', () => {
  assert.equal(parseImportedDate('29/08/2026')?.toISOString(), '2026-08-29T12:00:00.000Z')
  assert.equal(parseImportedDate('31/02/2026'), undefined)
  assert.equal(parseImportedDate('2026-02-31'), undefined)
})

test('calcula estado contable desde monto aplicado y vencimiento', () => {
  const amount = new Prisma.Decimal(1000)
  assert.equal(calculateReceivableStatus(amount, new Prisma.Decimal(1000), new Date('2020-01-01')), 'PAID')
  assert.equal(calculateReceivableStatus(amount, new Prisma.Decimal(100), new Date('2100-01-01')), 'PARTIAL')
  assert.equal(calculateReceivableStatus(amount, new Prisma.Decimal(0), new Date('2020-01-01')), 'OVERDUE')
  assert.equal(calculateReceivableStatus(amount, new Prisma.Decimal(0), new Date('2100-01-01'), true), 'VOID')
  const dueToday = new Date('2026-08-29T12:00:00.000Z')
  const endOfDay = new Date('2026-08-30T02:59:59.000Z')
  assert.equal(calculateReceivableStatus(amount, new Prisma.Decimal(0), dueToday, false, endOfDay), 'PENDING')
  assert.equal(normalizeParaguayDateInput('2026-08-29') instanceof Date, true)
  assert.equal(Number.isNaN((normalizeParaguayDateInput('2026-02-31') as Date).getTime()), true)
  assert.equal(startOfParaguayDay(new Date('2026-08-29T15:00:00Z')).toISOString(), '2026-08-29T03:00:00.000Z')
})

test('previsualiza cobranza CSV con clave idempotente', async () => {
  const csv = Buffer.from([
    'RUC,Concepto,Monto,Moneda,Vencimiento',
    '80012345-6,Honorarios agosto,"1.500.000",PYG,31/08/2026',
  ].join('\n'))
  const [row] = await parseCollectionSpreadsheet(csv, 'cobranzas.csv')
  assert.equal(row?.ruc, '80012345')
  assert.equal(row?.amount, '1500000.00')
  assert.match(row?.externalKey ?? '', /^import:[a-f0-9]{64}$/)
  assert.deepEqual(row?.errors, [])
})

test('el PDF incluye historial completo, acentos, páginas y totales por moneda sin pagos anulados', () => {
  const payments = Array.from({ length: 35 }, (_, i) => ({ paidAt: new Date('2026-09-12T12:00:00Z'), amount: new Prisma.Decimal('1000'), currency: 'PYG', method: 'Transferencia', reference: `Pago ${i} (prueba)`, voidedAt: i === 0 ? new Date() : null }))
  const pdf = renderPaymentSummary({ name: 'Compañía de prueba', ruc: null, dv: null }, payments, [])
  const text = pdf.toString('latin1')
  assert.ok(text.startsWith('%PDF-1.4'))
  assert.match(text, /Compañía de prueba/)
  assert.match(text, /Pagos recibidos: PYG 34 000/)
  assert.match(text, /Pago 34/)
  assert.match(text, /Página 3 de 3/)
  const xref = Number(text.match(/startxref\n(\d+)/)![1])
  assert.equal(pdf.subarray(xref, xref + 4).toString(), 'xref')
  const mixed = renderPaymentSummary({ name: 'Prueba', ruc: null, dv: null }, [{ ...payments[1], currency: 'USD', amount: new Prisma.Decimal('12.50') }, payments[1]], [])
  assert.match(mixed.toString('latin1'), /Pagos recibidos: USD 12.50/)
  assert.match(mixed.toString('latin1'), /Pagos recibidos: PYG 1 000/)
})

test('anular y restaurar pagos recalcula parciales, evita doble reversión y rechaza sobrepago', async (t) => {
  process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test'
  process.env.REDIS_URL ||= 'redis://127.0.0.1:6379'
  process.env.JWT_SECRET ||= 'test-secret-with-at-least-thirty-two-characters'
  const { db } = await import('../../core/database')
  const { CollectionService } = await import('./collection.service')
  const ctx = { workspaceId: 'workspace', userId: 'owner', role: 'owner' } as WorkspaceContext
  const payment = { id: 'payment', companyId: 'client', currency: 'PYG', voidedAt: null as Date | null, allocations: [{ receivableId: 'charge', amount: new Prisma.Decimal(250) }] }
  const charge = { id: 'charge', currency: 'PYG', amount: new Prisma.Decimal(1000), paidAmount: new Prisma.Decimal(500), status: 'PARTIAL', dueDate: new Date('2100-01-01') }
  const tx = {
    $queryRaw: async () => [],
    payment: { findFirst: async ({ where }) => { assert.equal(where.workspaceId, ctx.workspaceId); return payment }, update: async ({ data }) => Object.assign(payment, data) },
    receivable: { findMany: async ({ where }) => { assert.equal(where.workspaceId, ctx.workspaceId); assert.equal(where.companyId, 'client'); return [charge] }, update: async ({ data }) => Object.assign(charge, data) },
  }
  mockMethod(t, db, '$transaction', async (work: any) => work(tx))
  mockMethod(t, db.company, 'findFirst', async ({ where }) => { assert.equal(where.workspaceId, ctx.workspaceId); return { id: 'client' } })
  const service = new CollectionService()
  await service.voidPayment(ctx, 'payment')
  assert.equal(charge.paidAmount.toString(), '250')
  assert.equal(charge.status, 'PARTIAL')
  await service.voidPayment(ctx, 'payment')
  assert.equal(charge.paidAmount.toString(), '250')
  await service.setPaymentStatus(ctx, 'payment', 'RECEIVED')
  assert.equal(charge.paidAmount.toString(), '500')
  assert.equal(payment.voidedAt, null)
  await service.voidPayment(ctx, 'payment')
  charge.paidAmount = new Prisma.Decimal(900)
  await assert.rejects(service.setPaymentStatus(ctx, 'payment', 'RECEIVED'), /saldo cambió/)
  charge.paidAmount = new Prisma.Decimal(0)
  charge.status = 'VOID'
  await assert.rejects(service.setPaymentStatus(ctx, 'payment', 'RECEIVED'), /cargo anulado/)
  charge.status = 'PENDING'; charge.currency = 'USD'
  await assert.rejects(service.setPaymentStatus(ctx, 'payment', 'RECEIVED'), /misma moneda/)
  await assert.rejects(service.voidPayment({ ...ctx, role: 'member' }, 'payment'), /propietario o administrador/)
})

// Los delegates Prisma son proxies; restauramos la propiedad tras cada prueba.
function mockMethod(t: TestContext, target: any, key: string, implementation: (...args: any[]) => any) {
  const original = target[key]
  let calls = 0
  target[key] = (...args: any[]) => { calls++; return implementation(...args) }
  t.after(() => { target[key] = original })
  return { mock: { callCount: () => calls } }
}
