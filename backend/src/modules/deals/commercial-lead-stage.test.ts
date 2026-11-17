import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeStageName, resolveBotStageMove, type StageRow } from './commercial-lead-stage'

// Columnas reales del embudo «GESTION COMERCIAL ROMEZ E.A.S» (posición incluida, como en producción).
const stages: StageRow[] = [
  { id: 'consulta', name: 'Consulta recibida', position: 0, isWon: false, isLost: false },
  { id: 'activo', name: 'Cliente activo', position: 1, isWon: true, isLost: false },
  { id: 'propuesta', name: 'Propuesta enviada', position: 2, isWon: false, isLost: false },
  { id: 'negociacion', name: 'Negociación', position: 3, isWon: false, isLost: false },
  { id: 'venta', name: 'Venta', position: 4, isWon: false, isLost: false },
  { id: 'futuro', name: 'Venta a Futuro ', position: 5, isWon: false, isLost: false },
  { id: 'perdido', name: 'No concretado', position: 6, isWon: false, isLost: true },
]
const at = (id: string) => stages.find((stage) => stage.id === id)!

test('normalizeStageName ignora tildes, mayúsculas y espacios', () => {
  assert.equal(normalizeStageName('  Negociación '), 'negociacion')
  assert.equal(normalizeStageName('Venta a Futuro '), 'venta a futuro')
})

test('el asistente avanza el lead según la etapa de la charla', () => {
  assert.equal(resolveBotStageMove(at('consulta'), stages, 'COSTOS_ENVIADOS')?.id, 'propuesta')
  assert.equal(resolveBotStageMove(at('consulta'), stages, 'DOCUMENTACION')?.id, 'negociacion')
  assert.equal(resolveBotStageMove(at('propuesta'), stages, 'LISTO_PARA_INICIAR')?.id, 'negociacion')
})

test('etapas de la charla sin columna propia no mueven el lead', () => {
  for (const botStage of ['NUEVO', 'CALIFICANDO', 'DERIVADO', 'DESCARTADO', 'INVENTADA']) {
    assert.equal(resolveBotStageMove(at('consulta'), stages, botStage), null, botStage)
  }
})

test('nunca retrocede ni pisa lo que movió el equipo', () => {
  assert.equal(resolveBotStageMove(at('negociacion'), stages, 'COSTOS_ENVIADOS'), null)
  assert.equal(resolveBotStageMove(at('venta'), stages, 'DOCUMENTACION'), null)
  assert.equal(resolveBotStageMove(at('propuesta'), stages, 'COSTOS_ENVIADOS'), null)
  assert.equal(resolveBotStageMove(at('activo'), stages, 'DOCUMENTACION'), null)
  assert.equal(resolveBotStageMove(at('perdido'), stages, 'COSTOS_ENVIADOS'), null)
})

test('si renombraron la columna destino, no mueve nada', () => {
  const renamed = stages.map((stage) => stage.id === 'propuesta' ? { ...stage, name: 'Cotizado' } : stage)
  assert.equal(resolveBotStageMove(at('consulta'), renamed, 'COSTOS_ENVIADOS'), null)
})
