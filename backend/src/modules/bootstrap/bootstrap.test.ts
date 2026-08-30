import assert from 'node:assert/strict'
import test from 'node:test'
import { readBootstrapEnvironment } from './bootstrap.service'

test('bootstrap exige credenciales y configura defaults ROMEZ', () => {
  assert.throws(() => readBootstrapEnvironment({}), /ROMEZ_OWNER/)
  const config = readBootstrapEnvironment({
    ROMEZ_OWNER_EMAIL: 'OWNER@EXAMPLE.COM',
    ROMEZ_OWNER_PASSWORD: 'una-clave-segura-2026',
  })
  assert.equal(config.ROMEZ_WORKSPACE_SLUG, 'romez')
  assert.equal(config.ROMEZ_WORKSPACE_NAME, 'ROMEZ Servicios Contables')
  assert.equal(config.ROMEZ_OWNER_FIRST_NAME, 'Administrador')
})
