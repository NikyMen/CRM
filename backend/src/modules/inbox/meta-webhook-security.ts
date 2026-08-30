import { Readable } from 'node:stream'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { config } from '../../core/config'
import { AppError, ForbiddenError } from '../../types'
import { isValidMetaWebhookSignature } from './meta-webhook-signature'

const MAX_WEBHOOK_BYTES = 2 * 1024 * 1024

type RawWebhookRequest = FastifyRequest & { rawWebhookBody?: Buffer }

export function installRawMetaWebhookCapture(
  app: FastifyInstance,
  matchesWebhook: (pathname: string) => boolean
) {
  app.addHook('preParsing', async (request, _reply, payload) => {
    const pathname = request.url.split('?', 1)[0]
    if (request.method !== 'POST' || !matchesWebhook(pathname)) return payload

    const chunks: Buffer[] = []
    let total = 0
    for await (const chunk of payload) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      total += buffer.length
      if (total > MAX_WEBHOOK_BYTES) {
        throw new AppError(413, 'El webhook supera el límite permitido.', 'WEBHOOK_TOO_LARGE')
      }
      chunks.push(buffer)
    }

    const rawBody = Buffer.concat(chunks)
    ;(request as RawWebhookRequest).rawWebhookBody = rawBody
    const replacement = Readable.from([rawBody]) as Readable & { receivedEncodedLength?: number }
    replacement.receivedEncodedLength = rawBody.length
    return replacement
  })
}

export function assertValidMetaWebhookSignature(request: FastifyRequest) {
  if (!config.META_APP_SECRET) {
    throw new AppError(503, 'La recepción de webhooks Meta no está configurada.', 'META_WEBHOOK_NOT_CONFIGURED')
  }

  const rawHeader = request.headers['x-hub-signature-256']
  const signature = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader
  const match = typeof signature === 'string' ? /^sha256=([a-f0-9]{64})$/i.exec(signature.trim()) : null
  const rawBody = (request as RawWebhookRequest).rawWebhookBody
  if (!match || !rawBody || !isValidMetaWebhookSignature(rawBody, match[1], config.META_APP_SECRET)) {
    throw new ForbiddenError('Firma de webhook Meta inválida')
  }
}
