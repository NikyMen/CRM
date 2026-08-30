import assert from 'node:assert/strict'
import test from 'node:test'
import { Prisma } from '@prisma/client'
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
