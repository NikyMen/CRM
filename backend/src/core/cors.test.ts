import assert from 'node:assert/strict'
import test from 'node:test'
import { isAllowedCorsOrigin, sseCorsHeaders } from './cors'

test('SSE autoriza únicamente el frontend configurado', () => {
  const configured = 'https://romez.consultoriadigital.io'
  assert.equal(isAllowedCorsOrigin(configured, configured), true)
  assert.deepEqual(sseCorsHeaders(configured, configured), {
    'Access-Control-Allow-Origin': configured,
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  })
  assert.equal(isAllowedCorsOrigin('https://sitio-malicioso.test', configured), false)
  assert.deepEqual(sseCorsHeaders('https://sitio-malicioso.test', configured), {})
})
