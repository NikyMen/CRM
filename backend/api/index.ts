import { buildApp } from '../src/app'

// Mantenemos una instancia cachead de la app (Fastify) a lo ancho de múltiples 
// invocaciones (warm starts) en Vercel Serverless Functions.
let appCache: any;

export default async function handler(req: any, res: any) {
  if (!appCache) {
    appCache = await buildApp()
    await appCache.ready()
  }
  
  // Emitimos el request hacia Fastify
  appCache.server.emit('request', req, res)
}
