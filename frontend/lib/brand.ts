// ─── Marca visible de la instancia ────────────────────────────────
// Next inlinea `process.env.NEXT_PUBLIC_*` al compilar, así que cada
// cliente necesita su propio build (igual que con NEXT_PUBLIC_API_URL).
// Sin variables, la instancia se presenta como Gestión ROMEZ (cliente #1).
// Las referencias van escritas completas: Next no inlinea accesos dinámicos.

function text(value: string | undefined, fallback: string) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

/** Sólo rutas propias de `public/`: Next Image no carga orígenes externos sin configurarlos. */
function localPath(value: string | undefined, fallback: string) {
  const trimmed = value?.trim()
  return trimmed && /^\/[\w./-]+$/.test(trimmed) && !trimmed.includes('..') ? trimmed : fallback
}

function slug(value: string | undefined, fallback: string) {
  const trimmed = value?.trim()
  return trimmed && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed) ? trimmed : fallback
}

const name = text(process.env.NEXT_PUBLIC_BRAND_NAME, 'Gestión ROMEZ')
const legalName = text(process.env.NEXT_PUBLIC_BRAND_LEGAL_NAME, 'ROMEZ Servicios Contables')

export const brand = {
  /** Nombre del producto: títulos, login, sidebar. */
  name,
  /** Nombre corto para etiquetas como "Equipo ROMEZ". */
  shortName: text(process.env.NEXT_PUBLIC_BRAND_SHORT_NAME, 'ROMEZ'),
  /** Razón social: textos alternativos de los logos. */
  legalName,
  description: text(process.env.NEXT_PUBLIC_BRAND_DESCRIPTION, `Gestión contable, clientes, cobranzas y atención de ${legalName}.`),
  /** Prefijo de archivos descargados. */
  slug: slug(process.env.NEXT_PUBLIC_BRAND_SLUG, 'romez'),
  /** Logo sobre fondos claros (login, recuperación de acceso). */
  logo: localPath(process.env.NEXT_PUBLIC_BRAND_LOGO, '/brand/romez-light.jpg'),
  /** Logo sobre fondos oscuros (sidebar, panel del login, ícono de Apple). */
  logoOnDark: localPath(process.env.NEXT_PUBLIC_BRAND_LOGO_ON_DARK, '/brand/romez-navy.jpg'),
  favicon: localPath(process.env.NEXT_PUBLIC_BRAND_FAVICON, '/favicon.ico'),
}

const HEX_COLOR = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

type ColorOverrides = Record<string, string | undefined>

function declarations(overrides: ColorOverrides) {
  return Object.entries(overrides)
    .map(([variable, value]) => [variable, value?.trim()] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1] && HEX_COLOR.test(entry[1])))
    .map(([variable, value]) => `${variable}:${value}`)
    .join(';')
}

/**
 * CSS que pisa los colores de marca de `globals.css` sólo para las variables
 * definidas. Los selectores ganan por especificidad, no por orden:
 * - navy y navy-deep no cambian con el tema → `html:root`;
 * - blue, blue-hover y paper tienen versión oscura en `.dark` → la clara va
 *   en `html:root:not(.dark)` y la oscura en `html:root.dark`.
 * Sólo se aceptan hex, así que el valor nunca puede cerrar la regla.
 */
export function brandColorCss() {
  const shared = declarations({
    '--brand-navy': process.env.NEXT_PUBLIC_BRAND_COLOR_NAVY,
    '--brand-navy-deep': process.env.NEXT_PUBLIC_BRAND_COLOR_NAVY_DEEP,
  })
  const light = declarations({
    '--brand-blue': process.env.NEXT_PUBLIC_BRAND_COLOR_BLUE,
    '--brand-blue-hover': process.env.NEXT_PUBLIC_BRAND_COLOR_BLUE_HOVER,
    '--brand-paper': process.env.NEXT_PUBLIC_BRAND_COLOR_PAPER,
  })
  const dark = declarations({
    '--brand-blue': process.env.NEXT_PUBLIC_BRAND_COLOR_BLUE_DARK,
    '--brand-blue-hover': process.env.NEXT_PUBLIC_BRAND_COLOR_BLUE_HOVER_DARK,
    '--brand-paper': process.env.NEXT_PUBLIC_BRAND_COLOR_PAPER_DARK,
  })
  return [
    shared && `html:root{${shared}}`,
    light && `html:root:not(.dark){${light}}`,
    dark && `html:root.dark{${dark}}`,
  ].filter(Boolean).join('')
}
