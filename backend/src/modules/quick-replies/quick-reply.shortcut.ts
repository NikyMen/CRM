/** Atajo sin la barra inicial, en minúsculas y sin espacios: "/Saludo inicial" → "saludo-inicial". */
export function normalizeShortcut(value: string) {
  return value
    .trim()
    .replace(/^\/+/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}
