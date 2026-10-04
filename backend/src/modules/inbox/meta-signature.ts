import { createHmac, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { config } from '../../core/config'

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer
  }
}

const SIGNATURE_PREFIX = 'sha256='

// Meta firma cada POST del webhook con HMAC-SHA256 del body crudo usando el App Secret.
// Para recalcular la firma hace falta el body tal cual llego, asi que se guarda en req.rawBody.
// El parseo sigue siendo el JSON parser por defecto de Fastify (misma proteccion contra __proto__).
export function captureRawJsonBody(app: FastifyInstance) {
  const parseJson = app.getDefaultJsonParser('error', 'error')

  app.removeContentTypeParser('application/json')
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    const buffer = body as Buffer
    req.rawBody = buffer
    parseJson(req, buffer.toString('utf8'), done)
  })
}

export function isValidMetaSignature(
  rawBody: Buffer | undefined,
  signatureHeader: unknown,
  appSecret: string
): boolean {
  if (!rawBody || typeof signatureHeader !== 'string') return false
  if (!signatureHeader.startsWith(SIGNATURE_PREFIX)) return false

  const received = Buffer.from(signatureHeader.slice(SIGNATURE_PREFIX.length), 'hex')
  const expected = createHmac('sha256', appSecret).update(rawBody).digest()

  return received.length === expected.length && timingSafeEqual(received, expected)
}

// preHandler para los POST publicos del webhook de Meta. Sin App Secret no hay forma de
// distinguir a Meta de cualquiera que conozca la URL, asi que se rechaza todo.
export async function requireMetaSignature(req: FastifyRequest, reply: FastifyReply) {
  if (!config.META_APP_SECRET) {
    req.log.error('Webhook Meta rechazado: falta META_APP_SECRET para validar la firma')
    return reply.status(503).send({ error: 'META_APP_SECRET_NOT_CONFIGURED' })
  }

  if (!isValidMetaSignature(req.rawBody, req.headers['x-hub-signature-256'], config.META_APP_SECRET)) {
    req.log.warn('Webhook Meta rechazado: firma X-Hub-Signature-256 invalida')
    return reply.status(401).send({ error: 'INVALID_WEBHOOK_SIGNATURE' })
  }
}
