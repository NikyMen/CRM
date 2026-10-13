/**
 * Teléfono listo para WhatsApp en formato internacional sin "+", asumiendo
 * Paraguay (595) cuando el número está escrito en formato local.
 */
export function normalizeCollectionPhone(value?: string | null) {
  const digits = value?.replace(/\D/g, '') ?? ''
  if (!digits) return null
  if (digits.startsWith('595')) return digits.length >= 11 ? digits : null
  if (digits.startsWith('00')) return digits.length >= 10 ? digits.slice(2) : null
  if (digits.startsWith('0') && digits.length === 10) return `595${digits.slice(1)}`
  if (digits.startsWith('9') && digits.length === 9) return `595${digits}`
  return digits.length >= 10 ? digits : null
}

/** Clave para comparar teléfonos escritos de formas distintas: los últimos 9 dígitos. */
export function phoneMatchKey(value?: string | null) {
  const digits = value?.replace(/\D/g, '') ?? ''
  return digits.length >= 9 ? digits.slice(-9) : null
}
