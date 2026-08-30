import assert from 'node:assert/strict'
import test from 'node:test'
import type { CRMEvent } from '../../types'

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test'
process.env.REDIS_URL ||= 'redis://localhost:6379'
process.env.JWT_SECRET ||= 'test-secret-with-at-least-32-characters'
process.env.NODE_ENV = 'test'

const {
  ALL_EVENTS,
  webhookSchema,
  webhookUpdateSchema,
} = require('./webhooks.routes') as typeof import('./webhooks.routes')

test('expone y acepta todos los eventos de gestión ROMEZ', () => {
  const expected: CRMEvent[] = [
    'ticket.created',
    'ticket.updated',
    'collection.updated',
    'checklist.updated',
  ]

  for (const event of expected) {
    assert.equal(ALL_EVENTS.includes(event), true)
  }

  for (const event of ALL_EVENTS) {
    assert.doesNotThrow(() => webhookSchema.parse({
      name: 'Webhook de prueba',
      url: 'https://example.com/webhook',
      events: [event],
    }))
  }
})

test('rechaza eventos desconocidos al crear o actualizar', () => {
  assert.throws(() => webhookSchema.parse({
    name: 'Webhook de prueba',
    url: 'https://example.com/webhook',
    events: ['ticket.created', 'evento.inexistente'],
  }), /Evento no soportado/)

  assert.throws(() => webhookUpdateSchema.parse({
    events: ['evento.inexistente'],
  }), /Evento no soportado/)

  assert.throws(() => webhookUpdateSchema.parse({ events: [] }))
})
