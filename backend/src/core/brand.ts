import { z } from 'zod'

// ─── Marca visible de la instancia ────────────────────────────────
// Cada cliente se despliega con su propio .env; sin variables, la
// instancia se presenta como Gestión ROMEZ (cliente #1). Se lee aparte
// de `core/config` para que los PDF y sus pruebas no exijan base ni Redis.

const blankAsUndefined = (value: unknown) => typeof value === 'string' && value.trim() === '' ? undefined : value

const text = (fallback: string) => z.preprocess(blankAsUndefined, z.string().trim().min(1).max(120).default(fallback))
const slug = (fallback: string) => z.preprocess(blankAsUndefined, z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).default(fallback))
const hexColor = z.preprocess(blankAsUndefined, z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional())

const brandEnvSchema = z.object({
  BRAND_NAME: text('Gestión ROMEZ'),
  BRAND_SHORT_NAME: text('ROMEZ'),
  BRAND_TAGLINE: text('Servicios contables'),
  BRAND_SLUG: slug('romez'),
  BRAND_PDF_LOGO: slug('romez-logo'),
  BRAND_PDF_PRIMARY_COLOR: hexColor,
  BRAND_PDF_ACCENT_COLOR: hexColor,
})

export type Rgb = [number, number, number]

/** `#rrggbb` → componentes 0–1, redondeados a tres decimales como los del PDF. */
export function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => Math.round((channel / 255) * 1000) / 1000) as Rgb
}

export function readBrand(env: NodeJS.ProcessEnv) {
  const result = brandEnvSchema.safeParse(env)
  if (!result.success) {
    throw new Error(`Variables BRAND_* inválidas: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`)
  }
  const data = result.data
  return {
    name: data.BRAND_NAME,
    shortName: data.BRAND_SHORT_NAME,
    tagline: data.BRAND_TAGLINE,
    slug: data.BRAND_SLUG,
    pdfLogo: data.BRAND_PDF_LOGO,
    pdfPrimary: data.BRAND_PDF_PRIMARY_COLOR ? hexToRgb(data.BRAND_PDF_PRIMARY_COLOR) : null,
    pdfAccent: data.BRAND_PDF_ACCENT_COLOR ? hexToRgb(data.BRAND_PDF_ACCENT_COLOR) : null,
  }
}

export type Brand = ReturnType<typeof readBrand>

export const brand = readBrand(process.env)
