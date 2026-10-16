import type { FastifyReply } from 'fastify'

/** Tipos que el navegador puede mostrar dentro del chat; el resto se descarga. */
const INLINE_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/mp4',
  'video/mp4',
  'video/webm',
  'video/3gpp',
  'video/quicktime',
])

/** Responde un archivo de WhatsApp autenticado, sin permitir que el navegador lo ejecute. */
export function sendWhatsAppMedia(reply: FastifyReply, media: { buffer: Buffer; mimeType: string; fileName: string }) {
  const mediaType = media.mimeType.toLowerCase().split(';', 1)[0].trim()
  const inline = INLINE_MEDIA_TYPES.has(mediaType)
  const fileName = media.fileName.replace(/[\\\r\n"]/g, '').trim() || 'archivo'
  reply.header('Cache-Control', 'private, max-age=300')
  reply.header('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${fileName}"`)
  reply.header('X-Content-Type-Options', 'nosniff')
  reply.header('Content-Security-Policy', "sandbox; default-src 'none'")
  return reply.type(inline ? mediaType : 'application/octet-stream').send(media.buffer)
}
