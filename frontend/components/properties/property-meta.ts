import type { Property, PropertyOperation, PropertyStatus, PropertyType } from '@/lib/api'

export const OPERATION_LABEL: Record<PropertyOperation, string> = { sale: 'Venta', rent: 'Alquiler' }
export const TYPE_LABEL: Record<PropertyType, string> = { house: 'Casa', apartment: 'Departamento', land: 'Terreno', commercial: 'Local / oficina', country: 'Quinta / campo', other: 'Otro' }
export const STATUS_META: Record<PropertyStatus, { label: string; className: string }> = {
  available: { label: 'Disponible', className: 'bg-[var(--success-paper)] text-[var(--success)]' },
  reserved: { label: 'Reservada', className: 'bg-[var(--warning-paper)] text-[var(--warning)]' },
  closed: { label: 'Vendida / alquilada', className: 'bg-[var(--paper-inset)] text-[var(--ink-tertiary)]' },
}

/** Centro por defecto del mapa: Corrientes capital. */
export const DEFAULT_CENTER: [number, number] = [-27.4692, -58.8306]

export function formatPrice(property: Pick<Property, 'price' | 'currency' | 'operation'>) {
  if (!property.price) return 'Consultar'
  const amount = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Number(property.price))
  const value = property.currency === 'USD' ? `USD ${amount}` : `$ ${amount}`
  return property.operation === 'rent' ? `${value} / mes` : value
}

/** Precio corto para el pin del mapa: "USD 95k", "$ 450k". */
export function shortPrice(property: Pick<Property, 'price' | 'currency'>) {
  if (!property.price) return '—'
  const n = Number(property.price)
  const short = n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
  return property.currency === 'USD' ? `USD ${short}` : `$ ${short}`
}

export function propertyPlace(property: Pick<Property, 'address' | 'neighborhood' | 'city'>) {
  return [property.address, property.neighborhood, property.city].filter(Boolean).join(' · ')
}
