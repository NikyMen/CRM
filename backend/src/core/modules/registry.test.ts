import assert from 'node:assert/strict'
import test from 'node:test'
import { MODULE_DEFINITIONS, MODULE_KEYS, mergeModuleState, readModuleState, writeModuleState } from './registry'

test('sin configuración guardada cada módulo toma su valor por defecto', () => {
  const state = readModuleState(null)
  assert.equal(state.clients, true)
  assert.equal(state.sales, true)
  assert.equal(state.team, true)
  assert.equal(state.integrations, true)
  assert.equal(state.stock, false)
})

test('el registro cubre todos los módulos apagables del producto', () => {
  const state = readModuleState(null)
  assert.deepEqual(Object.keys(state).sort(), [...MODULE_KEYS].sort())
  assert.equal(MODULE_DEFINITIONS.length, MODULE_KEYS.length)
})

test('el flag histórico stockVisible sigue mandando si no hay estado nuevo de stock', () => {
  assert.equal(readModuleState({ stockVisible: true }).stock, true)
  assert.equal(readModuleState({ stockVisible: true, modules: { stock: false } }).stock, false)
})

test('merge ignora claves desconocidas y valores no booleanos', () => {
  const current = readModuleState(null)
  const next = mergeModuleState(current, { sales: false, inexistente: true, clients: undefined })
  assert.equal(next.sales, false)
  assert.equal(next.clients, true)
  assert.equal('inexistente' in next, false)
})

test('escribir el estado conserva las demás claves de settings', () => {
  const settings = { brandColor: '#000', modules: { sales: true } }
  const next = writeModuleState(settings, mergeModuleState(readModuleState(settings), { sales: false }))
  assert.equal(next.brandColor, '#000')
  assert.equal((next.modules as Record<string, boolean>).sales, false)
  assert.equal(next.stockVisible, false)
})
