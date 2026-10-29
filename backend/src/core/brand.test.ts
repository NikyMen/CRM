import assert from 'node:assert/strict'
import test from 'node:test'
import { hexToRgb, readBrand } from './brand'

test('sin variables la marca es Gestión ROMEZ', () => {
  const brand = readBrand({})
  assert.equal(brand.name, 'Gestión ROMEZ')
  assert.equal(brand.shortName, 'ROMEZ')
  assert.equal(brand.tagline, 'Servicios contables')
  assert.equal(brand.slug, 'romez')
  assert.equal(brand.pdfLogo, 'romez-logo')
  assert.equal(brand.pdfPrimary, null)
  assert.equal(brand.pdfAccent, null)
})

test('las variables vacías usan el valor por defecto', () => {
  const brand = readBrand({ BRAND_NAME: '  ', BRAND_SLUG: '', BRAND_PDF_PRIMARY_COLOR: '' })
  assert.equal(brand.name, 'Gestión ROMEZ')
  assert.equal(brand.slug, 'romez')
  assert.equal(brand.pdfPrimary, null)
})

test('toma la marca del cliente desde el entorno', () => {
  const brand = readBrand({
    BRAND_NAME: ' Gestión Acme ',
    BRAND_SHORT_NAME: 'Acme',
    BRAND_SLUG: 'acme',
    BRAND_PDF_LOGO: 'acme-logo',
    BRAND_PDF_PRIMARY_COLOR: '#ff0000',
    BRAND_PDF_ACCENT_COLOR: '#0080FF',
  })
  assert.equal(brand.name, 'Gestión Acme')
  assert.equal(brand.shortName, 'Acme')
  assert.equal(brand.slug, 'acme')
  assert.equal(brand.pdfLogo, 'acme-logo')
  assert.deepEqual(brand.pdfPrimary, [1, 0, 0])
  assert.deepEqual(brand.pdfAccent, [0, 0.502, 1])
})

test('rechaza slugs y colores inválidos', () => {
  assert.throws(() => readBrand({ BRAND_SLUG: 'Acme SA' }), /BRAND_SLUG/)
  assert.throws(() => readBrand({ BRAND_PDF_LOGO: '../logo' }), /BRAND_PDF_LOGO/)
  assert.throws(() => readBrand({ BRAND_PDF_PRIMARY_COLOR: 'red' }), /BRAND_PDF_PRIMARY_COLOR/)
})

test('hexToRgb convierte a componentes 0–1', () => {
  assert.deepEqual(hexToRgb('#002660'), [0, 0.149, 0.376])
})
