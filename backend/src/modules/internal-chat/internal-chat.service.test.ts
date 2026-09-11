import assert from 'node:assert/strict'
import test from 'node:test'
import { InternalConversationType } from '@prisma/client'
import { canAccessInternalConversation, directConversationKey } from './internal-chat.service'

test('la clave privada es estable sin importar el orden de usuarios', () => {
  assert.equal(directConversationKey('user-b', 'user-a'), 'direct:user-a:user-b')
  assert.equal(directConversationKey('user-a', 'user-b'), 'direct:user-a:user-b')
})

test('el grupo general es visible para cualquier miembro y los privados solo para participantes', () => {
  assert.equal(canAccessInternalConversation(InternalConversationType.GENERAL, [], 'user-c'), true)
  assert.equal(canAccessInternalConversation(InternalConversationType.DIRECT, ['user-a', 'user-b'], 'user-a'), true)
  assert.equal(canAccessInternalConversation(InternalConversationType.DIRECT, ['user-a', 'user-b'], 'user-c'), false)
})
