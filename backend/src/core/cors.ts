const localOrigins = ['http://localhost:3001', 'http://localhost:3000']

export function isAllowedCorsOrigin(origin: string | undefined, frontendUrl: string) {
  return !origin || origin === frontendUrl || localOrigins.includes(origin)
}

export function sseCorsHeaders(origin: string | undefined, frontendUrl: string) {
  if (!origin || !isAllowedCorsOrigin(origin, frontendUrl)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  }
}
