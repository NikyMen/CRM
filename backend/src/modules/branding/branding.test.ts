import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeAsset, detectImageMime, readBrandingText, writeBrandingText } from './branding'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const ICO = Buffer.from([0, 0, 1, 0, 1, 0, 16, 16])
const toDataUrl = (bytes: Buffer, mime = 'image/png') => `data:${mime};base64,${bytes.toString('base64')}`

test('detecta el tipo real por los primeros bytes', () => {
  assert.equal(detectImageMime(PNG), 'image/png')
  assert.equal(detectImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg')
  assert.equal(detectImageMime(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'binary')), 'image/webp')
  assert.equal(detectImageMime(ICO), 'image/x-icon')
  assert.equal(detectImageMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), null)
})

test('el tipo declarado no cuenta: un SVG disfrazado de PNG se rechaza', () => {
  const result = decodeAsset('logo', toDataUrl(Buffer.from('<svg onload="alert(1)"/>'), 'image/png'))
  assert.ok('error' in result)
})

test('el favicon acepta ICO y PNG; el logo no acepta ICO', () => {
  assert.ok(!('error' in decodeAsset('favicon', toDataUrl(ICO, 'image/x-icon'))))
  assert.ok(!('error' in decodeAsset('favicon', toDataUrl(PNG))))
  assert.ok('error' in decodeAsset('logo', toDataUrl(ICO, 'image/x-icon')))
})

test('rechaza imágenes demasiado grandes y data URLs inválidos', () => {
  const big = Buffer.concat([PNG, Buffer.alloc(300 * 1024)])
  assert.ok('error' in decodeAsset('favicon', toDataUrl(big)))
  assert.ok(!('error' in decodeAsset('logo', toDataUrl(big))))
  assert.ok('error' in decodeAsset('logo', 'https://example.com/logo.png'))
})

test('título y subtítulo: vacío vuelve al .env y se conserva el resto de settings', () => {
  const settings = { modules: { sales: true }, locale: 'es-PY' }
  const written = writeBrandingText(settings, { name: '  Gestión Wolves ', tagline: 'Indumentaria' })
  assert.deepEqual(readBrandingText(written), { name: 'Gestión Wolves', tagline: 'Indumentaria' })
  assert.deepEqual((written as Record<string, unknown>).modules, { sales: true })
  const cleared = writeBrandingText(written, { tagline: '' })
  assert.deepEqual(readBrandingText(cleared), { name: 'Gestión Wolves', tagline: null })
  assert.deepEqual(readBrandingText({}), { name: null, tagline: null })
})
