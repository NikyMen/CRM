import { buildApp } from './app'
import { config } from './core/config'

async function startServer() {
  const app = await buildApp()

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' })
    app.log.info(`🚀 CRM corriendo en http://localhost:${config.PORT}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }

  // Apagado limpio — cerrar conexiones antes de salir
  const shutdown = async (signal: string) => {
    app.log.info(`🛑 Recibido ${signal}, iniciando apagado suave...`)
    await app.close()
    process.exit(0)
  }

  process.on('SIGINT',  () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  // Mantener el proceso persistente para el watchdog de WhatsApp.
  setInterval(() => {}, 1000 * 60 * 60)
}

startServer()
