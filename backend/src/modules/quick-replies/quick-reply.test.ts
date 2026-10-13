import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeShortcut } from './quick-reply.shortcut'

test('normalizeShortcut quita la barra, acentos y espacios', () => {
  assert.equal(normalizeShortcut('/Saludo inicial'), 'saludo-inicial')
  assert.equal(normalizeShortcut('  //Recibí_IVA  '), 'recibi_iva')
  assert.equal(normalizeShortcut('***'), '')
})
