import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateSaleTotals } from './sale-calculations'

const item = (quantity: string, unitPrice: string) => ({ description: 'Honorarios', quantity, unitPrice })

test('suma los items y aplica descuento e impuesto', () => {
  const totals = calculateSaleTotals({
    items: [item('2', '150000'), item('1', '50000')],
    currency: 'PYG',
    discount: '20000',
    taxAmount: '30000',
  })
  assert.equal(totals.subtotal.toString(), '350000')
  assert.equal(totals.total.toString(), '360000')
  assert.equal(totals.items[1].position, 1)
})

test('rechaza una venta sin items', () => {
  assert.throws(() => calculateSaleTotals({ items: [] }), /al menos un/i)
})

test('rechaza cantidades y precios invalidos', () => {
  assert.throws(() => calculateSaleTotals({ items: [item('0', '1000')] }), /mayor a cero/i)
  assert.throws(() => calculateSaleTotals({ items: [item('1', '-5')] }), /negativo/i)
})

test('el descuento no puede superar el subtotal', () => {
  assert.throws(
    () => calculateSaleTotals({ items: [item('1', '100000')], discount: '150000' }),
    /superar el subtotal/i
  )
})

test('PYG no admite centavos', () => {
  assert.throws(() => calculateSaleTotals({ items: [item('1', '1000.50')] }), /guaran/i)
  assert.equal(calculateSaleTotals({ items: [item('1', '1000.50')], currency: 'USD' }).total.toString(), '1000.5')
})

test('la moneda debe ser un codigo ISO', () => {
  assert.throws(() => calculateSaleTotals({ items: [item('1', '1000')], currency: 'PYGG' }), /ISO/i)
})
