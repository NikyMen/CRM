import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildForcePayload, phoneInList, unansweredText } from './commercial-assistant'

const msg = (fromMe: boolean, text: string | null, messageType = 'text', mediaFileName: string | null = null) => ({ fromMe, text, messageType, mediaFileName })

test('unansweredText toma sólo lo que el cliente escribió después de nuestro último mensaje', () => {
  const result = unansweredText([
    msg(false, 'Hola'),
    msg(true, 'Buen día, ¿en qué te ayudo?'),
    msg(false, '¿Cuánto sale la EAS?'),
    msg(false, 'Y si incluye IVA'),
  ])
  assert.equal(result.count, 2)
  assert.equal(result.text, '¿Cuánto sale la EAS?\nY si incluye IVA')
})

test('unansweredText sin pendientes cuando el último mensaje es nuestro', () => {
  assert.deepEqual(unansweredText([msg(false, 'Hola'), msg(true, 'Hola!')]), { count: 0, text: '' })
})

test('unansweredText marca los adjuntos', () => {
  const result = unansweredText([
    msg(false, '[Imagen]', 'image'),
    msg(false, 'Mirá esta factura', 'image'),
    msg(false, 'propuesta.pdf', 'document', 'propuesta.pdf'),
  ])
  assert.equal(result.text, '[Imagen]\n[Imagen] Mirá esta factura\n[Documento: propuesta.pdf]')
})

test('buildForcePayload tiene la forma del webhook de wppia y viene marcado', () => {
  const body = buildForcePayload({ phone: '595981111222', name: 'María', text: 'Hola', id: 'crm-force-1', at: 1_700_000_000_000 })
  assert.equal(body.event, 'messages.upsert')
  assert.equal(body.force, true)
  const [message] = body.data.messages
  assert.equal(message.key.fromMe, false)
  assert.equal(message.key.remoteJid, '595981111222@s.whatsapp.net')
  assert.equal(message.messageBody, 'Hola')
  assert.equal(message.messageTimestamp, 1_700_000_000)
})

test('phoneInList compara por los últimos 9 dígitos', () => {
  assert.equal(phoneInList('595981111222', ['0981 111 222']), true)
  assert.equal(phoneInList('595981111222', ['0981 999 000']), false)
  assert.equal(phoneInList('595981111222', []), false)
})
