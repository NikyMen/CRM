import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeReaction, reactionSchema, readReactionMessage, readReactions } from './whatsapp.reactions'

const at = new Date('2026-10-16T12:00:00Z')

test('una reacción nueva del mismo emisor reemplaza a la anterior y vacía la quita', () => {
  let reactions = mergeReaction(null, { emoji: '👍', fromMe: false, sender: '595981@s.whatsapp.net', at })
  reactions = mergeReaction(reactions, { emoji: '✅', fromMe: true, sender: 'ignorado', at })
  assert.deepEqual(reactions.map((item) => [item.sender, item.emoji]), [['595981@s.whatsapp.net', '👍'], ['me', '✅']])

  reactions = mergeReaction(reactions, { emoji: '❤️', fromMe: false, sender: '595981@s.whatsapp.net', at })
  assert.deepEqual(reactions.map((item) => item.emoji), ['✅', '❤️'])

  reactions = mergeReaction(reactions, { emoji: '', fromMe: true, sender: 'me', at })
  assert.deepEqual(reactions.map((item) => item.emoji), ['❤️'])
})

test('ignora datos guardados con formato inválido', () => {
  assert.deepEqual(readReactions('x'), [])
  assert.deepEqual(readReactions([{ emoji: '', sender: 'a' }, { emoji: '👍' }, null]), [])
})

test('lee el mensaje de reacción de Baileys', () => {
  const parsed = readReactionMessage({
    key: { id: 'R1', fromMe: false, remoteJid: '595981@s.whatsapp.net' },
    message: { reactionMessage: { key: { id: 'M1', fromMe: true }, text: '🙏' } },
  })
  assert.deepEqual(parsed, { targetId: 'M1', emoji: '🙏', fromMe: false, sender: '595981@s.whatsapp.net' })
  assert.equal(readReactionMessage({ message: { conversation: 'hola' } }), null)
})

test('sólo acepta emojis o vacío', () => {
  assert.equal(reactionSchema.safeParse({ emoji: '👍' }).success, true)
  assert.equal(reactionSchema.safeParse({ emoji: '' }).success, true)
  assert.equal(reactionSchema.safeParse({ emoji: 'hola' }).success, false)
  assert.equal(reactionSchema.safeParse({ emoji: '👍 ' }).success, false)
})
