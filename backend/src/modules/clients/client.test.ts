import assert from 'node:assert/strict'
import test from 'node:test'
import { clientVisibilityWhere } from './client-visibility'
import { normalizeParaguayanRuc, parseClientSpreadsheet } from './client-import'

test('normaliza RUC paraguayo y DV', () => {
  assert.deepEqual(normalizeParaguayanRuc('80012345-6'), { ruc: '80012345', dv: '6' })
  assert.deepEqual(normalizeParaguayanRuc(' 1.234.567 ', '8'), { ruc: '1234567', dv: '8' })
})

test('importa clientes desde CSV con encabezados en español', async () => {
  const csv = Buffer.from([
    'RUC,Razón social,Nombre comercial,Tipo,Email,Obligaciones',
    '80012345-6,ROME Z SA,ROME Z,Jurídica,cliente@example.com,"IVA;IRE"',
  ].join('\n'))
  const rows = await parseClientSpreadsheet(csv, 'clientes.csv')
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.ruc, '80012345')
  assert.equal(rows[0]?.dv, '6')
  assert.equal(rows[0]?.name, 'ROME Z')
  assert.deepEqual(rows[0]?.taxObligations, ['IVA', 'IRE'])
  assert.deepEqual(rows[0]?.errors, [])
})

test('aplica visibilidad por rol sin exponer clientes libres a viewer', () => {
  assert.deepEqual(clientVisibilityWhere({ workspaceId: 'w', userId: 'u', role: 'owner' }), {})
  assert.deepEqual(clientVisibilityWhere({ workspaceId: 'w', userId: 'u', role: 'member' }), {
    OR: [
      { ownerId: 'u' },
      { ownerId: null },
      { assignments: { some: { userId: 'u' } } },
    ],
  })
  assert.deepEqual(clientVisibilityWhere({ workspaceId: 'w', userId: 'u', role: 'viewer' }), {
    OR: [
      { ownerId: 'u' },
      { assignments: { some: { userId: 'u' } } },
    ],
  })
})
