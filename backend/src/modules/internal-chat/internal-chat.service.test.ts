import assert from 'node:assert/strict'
import test from 'node:test'
import { InternalConversationType } from '@prisma/client'
import { canAccessInternalConversation, directConversationKey, messageReaders } from './internal-chat.service'

test('la clave privada es estable sin importar el orden de usuarios', () => {
  assert.equal(directConversationKey('user-b', 'user-a'), 'direct:user-a:user-b')
  assert.equal(directConversationKey('user-a', 'user-b'), 'direct:user-a:user-b')
})

test('el grupo general es visible para cualquier miembro y los privados solo para participantes', () => {
  assert.equal(canAccessInternalConversation(InternalConversationType.GENERAL, [], 'user-c'), true)
  assert.equal(canAccessInternalConversation(InternalConversationType.DIRECT, ['user-a', 'user-b'], 'user-a'), true)
  assert.equal(canAccessInternalConversation(InternalConversationType.DIRECT, ['user-a', 'user-b'], 'user-c'), false)
})

test('el visto lista a todos los destinatarios menos a quien consulta, aunque no hayan abierto el chat', () => {
  const read = new Date('2026-11-24T12:00:00Z')
  assert.deepEqual(
    messageReaders(['me', 'ana', 'beto', 'ana'], [{ userId: 'me', lastReadAt: read }, { userId: 'ana', lastReadAt: read }], 'me'),
    [{ userId: 'ana', lastReadAt: read }, { userId: 'beto', lastReadAt: null }],
  )
})
