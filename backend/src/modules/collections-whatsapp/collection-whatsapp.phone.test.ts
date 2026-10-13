import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeCollectionPhone, phoneMatchKey } from './collection-whatsapp.phone'

test('normaliza teléfonos paraguayos al formato de WhatsApp', () => {
  assert.equal(normalizeCollectionPhone('0981 123 456'), '595981123456')
  assert.equal(normalizeCollectionPhone('981123456'), '595981123456')
  assert.equal(normalizeCollectionPhone('+595 981 123456'), '595981123456')
  assert.equal(normalizeCollectionPhone('0054 9 11 2345 6789'), '5491123456789')
  assert.equal(normalizeCollectionPhone('123'), null)
  assert.equal(normalizeCollectionPhone(null), null)
})

test('compara teléfonos por sus últimos 9 dígitos', () => {
  assert.equal(phoneMatchKey('0981-123-456'), phoneMatchKey('595981123456'))
  assert.equal(phoneMatchKey('12345'), null)
})
