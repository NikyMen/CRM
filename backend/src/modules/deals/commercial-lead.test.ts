import assert from 'node:assert/strict'
import test from 'node:test'
import { readCommercialChatId } from './commercial-lead'

test('lee el chat comercial vinculado al lead sólo si es un texto válido', () => {
  assert.equal(readCommercialChatId({ commercialChatId: 'chat_1', sourceChannel: 'commercial-whatsapp' }), 'chat_1')
  assert.equal(readCommercialChatId({ whatsAppChatJid: '595981@s.whatsapp.net' }), null)
  assert.equal(readCommercialChatId({ commercialChatId: 42 }), null)
  assert.equal(readCommercialChatId(null), null)
  assert.equal(readCommercialChatId(['x']), null)
})
