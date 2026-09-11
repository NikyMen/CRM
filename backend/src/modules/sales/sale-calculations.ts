import { Prisma } from '@prisma/client'
import { ValidationError } from '../../types'

export interface SaleItemInput {
  description: string
  quantity: string | number
  unitPrice: string | number
}

export interface SaleTotals {
  subtotal: Prisma.Decimal
  discount: Prisma.Decimal
  taxAmount: Prisma.Decimal
  total: Prisma.Decimal
  items: Array<{ description: string; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; total: Prisma.Decimal; position: number }>
}

export function currencyCode(value = 'PYG') {
  const currency = value.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) throw new ValidationError('La moneda debe ser un código ISO de tres letras')
  return currency
}

function decimal(value: string | number | Prisma.Decimal, label: string) {
  try {
    const normalized = typeof value === 'string' ? value.replace(',', '.') : value
    const parsed = new Prisma.Decimal(normalized)
    if (!parsed.isFinite()) throw new Error()
    return parsed
  } catch {
    throw new ValidationError(`${label} no es un número válido`)
  }
}

/** Los guaraníes no tienen centavos: cualquier decimal sería un error de carga. */
function assertCurrencyPrecision(value: Prisma.Decimal, currency: string, label: string) {
  if (currency === 'PYG' && !value.isInteger()) {
    throw new ValidationError(`${label} en PYG debe expresarse en guaraníes enteros`)
  }
}

export function calculateSaleTotals(input: {
  items: SaleItemInput[]
  currency?: string
  discount?: string | number | null
  taxAmount?: string | number | null
}): SaleTotals & { currency: string } {
  const currency = currencyCode(input.currency)
  if (!input.items?.length) throw new ValidationError('La venta necesita al menos un ítem')
  if (input.items.length > 200) throw new ValidationError('Una venta admite hasta 200 ítems')

  let subtotal = new Prisma.Decimal(0)
  const items = input.items.map((item, index) => {
    const description = item.description?.trim()
    if (!description) throw new ValidationError(`El ítem ${index + 1} necesita una descripción`)

    const quantity = decimal(item.quantity, `La cantidad del ítem ${index + 1}`)
    if (quantity.lte(0)) throw new ValidationError(`La cantidad del ítem ${index + 1} debe ser mayor a cero`)

    const unitPrice = decimal(item.unitPrice, `El precio del ítem ${index + 1}`)
    if (unitPrice.lt(0)) throw new ValidationError(`El precio del ítem ${index + 1} no puede ser negativo`)
    assertCurrencyPrecision(unitPrice, currency, `El precio del ítem ${index + 1}`)

    const total = quantity.mul(unitPrice).toDecimalPlaces(2)
    assertCurrencyPrecision(total, currency, `El total del ítem ${index + 1}`)
    subtotal = subtotal.add(total)

    return { description, quantity, unitPrice, total, position: index }
  })

  const discount = decimal(input.discount ?? 0, 'El descuento').toDecimalPlaces(2)
  if (discount.lt(0)) throw new ValidationError('El descuento no puede ser negativo')
  if (discount.gt(subtotal)) throw new ValidationError('El descuento no puede superar el subtotal')
  assertCurrencyPrecision(discount, currency, 'El descuento')

  const taxAmount = decimal(input.taxAmount ?? 0, 'El impuesto').toDecimalPlaces(2)
  if (taxAmount.lt(0)) throw new ValidationError('El impuesto no puede ser negativo')
  assertCurrencyPrecision(taxAmount, currency, 'El impuesto')

  const total = subtotal.sub(discount).add(taxAmount)
  if (total.lte(0)) throw new ValidationError('El total de la venta debe ser mayor a cero')

  return { currency, subtotal, discount, taxAmount, total, items }
}
