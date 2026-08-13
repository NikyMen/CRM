import test from 'node:test'
import assert from 'node:assert/strict'
import { createLeadNumberCandidate } from './lead-number'

test('genera números de lead de ocho dígitos', () => {
  for (let index = 0; index < 2_000; index += 1) {
    assert.match(createLeadNumberCandidate(), /^\d{8}$/)
  }
})
