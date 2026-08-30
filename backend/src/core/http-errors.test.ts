import assert from 'node:assert/strict'
import test from 'node:test'
import { httpClientErrorCode, isHttpClientError } from './http-errors'

test('preserva errores HTTP del rate limiter como 429', () => {
  const error = {
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Demasiados intentos.',
  }

  assert.equal(isHttpClientError(error), true)
  assert.equal(httpClientErrorCode(error), 'RATE_LIMITED')
})

test('no expone errores internos como errores de cliente', () => {
  assert.equal(isHttpClientError({ statusCode: 500, message: 'detalle interno' }), false)
  assert.equal(isHttpClientError({ statusCode: 400 }), false)
})
