import * as Sentry from '@sentry/node'

export function initSentry() {
  if (!process.env.SENTRY_DSN) return

  Sentry.init({
    dsn:         process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.2, // Capturar 20% de las transacciones
  })
}

export { Sentry }