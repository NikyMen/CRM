import { createHmac, timingSafeEqual } from 'node:crypto'

export function isValidMetaWebhookSignature(rawBody: Buffer, signatureHex: string, secret: string) {
  if (!/^[a-f0-9]{64}$/i.test(signatureHex)) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest()
  const received = Buffer.from(signatureHex, 'hex')
  return received.length === expected.length && timingSafeEqual(received, expected)
}
