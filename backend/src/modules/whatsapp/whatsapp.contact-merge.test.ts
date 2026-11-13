import assert from 'node:assert/strict'
import test from 'node:test'
import { groupContactsSafeToMerge } from './whatsapp.contact-merge'

const ids = (groups: Array<Array<{ id: string }>>) => groups.map((group) => group.map((c) => c.id))

test('no fusiona contactos con el mismo teléfono de clientes distintos (las dos Paolas)', () => {
  const groups = groupContactsSafeToMerge([
    { id: 'paola-monserrat-contacto-viejo', companyId: 'carolina' },
    { id: 'paola-monserrat', companyId: 'monserrat' },
  ])
  assert.deepEqual(groups, [])
})

test('fusiona duplicados del mismo cliente', () => {
  const groups = groupContactsSafeToMerge([
    { id: 'a', companyId: 'c1' },
    { id: 'b', companyId: 'c1' },
    { id: 'c', companyId: 'c2' },
  ])
  assert.deepEqual(ids(groups), [['a', 'b']])
})

test('los contactos sin cliente se suman al único cliente que haya', () => {
  const groups = groupContactsSafeToMerge([
    { id: 'sin', companyId: null },
    { id: 'con', companyId: 'c1' },
  ])
  assert.deepEqual(ids(groups), [['con', 'sin']])
})

test('con varios clientes, los contactos sin cliente se fusionan sólo entre ellos', () => {
  const groups = groupContactsSafeToMerge([
    { id: 'sin1', companyId: null },
    { id: 'sin2', companyId: null },
    { id: 'c1', companyId: 'c1' },
    { id: 'c2', companyId: 'c2' },
  ])
  assert.deepEqual(ids(groups), [['sin1', 'sin2']])
})

test('sin ningún cliente, fusiona todos entre sí', () => {
  const groups = groupContactsSafeToMerge([
    { id: 'a', companyId: null },
    { id: 'b' },
  ])
  assert.deepEqual(ids(groups), [['a', 'b']])
})

test('un solo contacto no se fusiona', () => {
  assert.deepEqual(groupContactsSafeToMerge([{ id: 'a', companyId: 'c1' }]), [])
})
