import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
import { isValidMetaWebhookSignature } from './meta-webhook-signature'

test('valida la firma HMAC del cuerpo exacto de Meta', () => {
  const body = Buffer.from('{"entry":[{"id":"123"}]}')
  const signature = createHmac('sha256', 'secreto-local').update(body).digest('hex')

  assert.equal(isValidMetaWebhookSignature(body, signature, 'secreto-local'), true)
  assert.equal(isValidMetaWebhookSignature(Buffer.from('{}'), signature, 'secreto-local'), false)
  assert.equal(isValidMetaWebhookSignature(body, '00', 'secreto-local'), false)
})
