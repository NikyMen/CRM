// ─── Marca editable desde Configuración ───────────────────────────
// Título y subtítulo viven en `workspace.settings.branding`; las imágenes,
// en `workspace_assets`. Lo que no esté cargado sigue saliendo del .env
// (BRAND_* / NEXT_PUBLIC_BRAND_*), así una instancia sin cambios no se mueve.

export const ASSET_KINDS = ['logo', 'logo-dark', 'favicon'] as const
export type AssetKind = typeof ASSET_KINDS[number]

export const MAX_ASSET_BYTES: Record<AssetKind, number> = {
  logo: 512 * 1024,
  'logo-dark': 512 * 1024,
  favicon: 256 * 1024,
}

type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/x-icon'

const ALLOWED_MIMES: Record<AssetKind, ImageMime[]> = {
  logo: ['image/png', 'image/jpeg', 'image/webp'],
  'logo-dark': ['image/png', 'image/jpeg', 'image/webp'],
  favicon: ['image/png', 'image/x-icon'],
}

export function isAssetKind(value: string): value is AssetKind {
  return (ASSET_KINDS as readonly string[]).includes(value)
}

/** Tipo real por los primeros bytes; el tipo declarado no se usa. SVG no se acepta (puede llevar scripts). */
export function detectImageMime(bytes: Buffer): ImageMime | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (bytes.length >= 6 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0 && bytes.readUInt16LE(4) > 0) return 'image/x-icon'
  return null
}

export type DecodedAsset = { mimeType: ImageMime; data: Buffer }

/** Valida un data URL en base64 para el tipo de imagen pedido. Devuelve un error legible o la imagen. */
export function decodeAsset(kind: AssetKind, dataUrl: string): DecodedAsset | { error: string } {
  const match = /^data:[\w/+.-]*;base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl.trim())
  if (!match) return { error: 'La imagen tiene que llegar como data URL en base64' }
  const data = Buffer.from(match[1].replace(/\s/g, ''), 'base64')
  if (!data.length) return { error: 'La imagen está vacía' }
  if (data.length > MAX_ASSET_BYTES[kind]) return { error: `La imagen supera ${Math.round(MAX_ASSET_BYTES[kind] / 1024)} KB` }
  const mimeType = detectImageMime(data)
  if (!mimeType || !ALLOWED_MIMES[kind].includes(mimeType)) {
    return { error: kind === 'favicon' ? 'El favicon tiene que ser PNG o ICO' : 'El logo tiene que ser PNG, JPG o WebP' }
  }
  return { mimeType, data }
}

export type BrandingText = { name: string | null; tagline: string | null }

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

const cleanText = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null

export function readBrandingText(settings: unknown): BrandingText {
  const branding = asRecord(asRecord(settings).branding)
  return { name: cleanText(branding.name), tagline: cleanText(branding.tagline) }
}

/** Aplica cambios parciales (null o vacío = volver al valor del .env) conservando el resto de settings. */
export function writeBrandingText(settings: unknown, patch: Partial<Record<keyof BrandingText, string | null>>) {
  const root = asRecord(settings)
  const next = { ...readBrandingText(settings) }
  for (const key of ['name', 'tagline'] as const) {
    if (key in patch) next[key] = cleanText(patch[key])
  }
  return { ...root, branding: next }
}
