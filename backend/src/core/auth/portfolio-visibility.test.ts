import assert from 'node:assert/strict'
import test from 'node:test'
import type { WorkspaceContext } from '../../types'
import {
  activityDeleteWhere,
  activityPortfolioWhere,
  contactPortfolioWhere,
  contactFilterVisibilityWhere,
  contactWriteVisibilityWhere,
  dealPortfolioWhere,
  noteDeleteWhere,
  ownerVisibilityWhere,
} from './portfolio-visibility'

const owner: WorkspaceContext = { workspaceId: 'workspace-1', userId: 'owner-1', role: 'owner' }
const admin: WorkspaceContext = { workspaceId: 'workspace-1', userId: 'admin-1', role: 'admin' }
const member: WorkspaceContext = { workspaceId: 'workspace-1', userId: 'member-1', role: 'member' }
const viewer: WorkspaceContext = { workspaceId: 'workspace-1', userId: 'viewer-1', role: 'viewer' }

test('owner/admin ven toda la cartera y member/viewer reciben su alcance', () => {
  assert.deepEqual(ownerVisibilityWhere(owner), {})
  assert.deepEqual(ownerVisibilityWhere(admin), {})
  assert.deepEqual(ownerVisibilityWhere(member), {
    OR: [{ ownerId: 'member-1' }, { ownerId: null }],
  })
  assert.deepEqual(ownerVisibilityWhere(viewer), { ownerId: 'viewer-1' })
})

test('contactos y oportunidades siempre quedan limitados al workspace', () => {
  assert.deepEqual(contactPortfolioWhere(member), {
    workspaceId: 'workspace-1',
    OR: [
      { ownerId: 'member-1' },
      { ownerId: null },
      { company: { is: { assignments: { some: { userId: 'member-1' } } } } },
    ],
  })
  assert.deepEqual(dealPortfolioWhere(viewer), {
    workspaceId: 'workspace-1',
    OR: [
      { ownerId: 'viewer-1' },
      { company: { is: { assignments: { some: { userId: 'viewer-1' } } } } },
    ],
  })
})

test('colaboradores pueden escribir la cartera asignada sin habilitar libres a viewer', () => {
  assert.deepEqual(contactWriteVisibilityWhere(member), {
    OR: [
      { ownerId: 'member-1' },
      { company: { is: { assignments: { some: { userId: 'member-1' } } } } },
    ],
  })
  assert.deepEqual(contactWriteVisibilityWhere(viewer), {
    AND: [{ ownerId: 'viewer-1' }, { ownerId: null }],
  })
  assert.deepEqual(contactFilterVisibilityWhere(member), {
    AND: [{
      OR: [
        { ownerId: 'member-1' },
        { ownerId: null },
        { company: { is: { assignments: { some: { userId: 'member-1' } } } } },
      ],
    }],
  })
})

test('actividad reciente exige visibilidad de cada contacto y oportunidad vinculados', () => {
  assert.deepEqual(activityPortfolioWhere(member), {
    AND: [
      {
        OR: [
          { contactId: null },
          {
            contact: {
              is: {
                workspaceId: 'workspace-1',
                OR: [
                  { ownerId: 'member-1' },
                  { ownerId: null },
                  { company: { is: { assignments: { some: { userId: 'member-1' } } } } },
                ],
              },
            },
          },
        ],
      },
      {
        OR: [
          { dealId: null },
          {
            deal: {
              is: {
                workspaceId: 'workspace-1',
                OR: [
                  { ownerId: 'member-1' },
                  { ownerId: null },
                  { company: { is: { assignments: { some: { userId: 'member-1' } } } } },
                ],
              },
            },
          },
        ],
      },
      {
        OR: [
          { contactId: { not: null } },
          { dealId: { not: null } },
          { userId: 'member-1' },
        ],
      },
    ],
  })
})

test('member solo puede borrar actividades y notas propias dentro de su cartera', () => {
  const activityWhere = activityDeleteWhere(member, 'activity-1')
  const noteWhere = noteDeleteWhere(member, 'note-1')

  assert.equal(activityWhere.workspaceId, 'workspace-1')
  assert.equal(activityWhere.userId, 'member-1')
  assert.equal(noteWhere.workspaceId, 'workspace-1')
  assert.equal(noteWhere.userId, 'member-1')
  assert.ok(activityWhere.AND)
  assert.ok(noteWhere.AND)
})

test('owner/admin pueden borrar registros del workspace sin quedar atados al autor', () => {
  assert.equal(activityDeleteWhere(owner, 'activity-1').userId, undefined)
  assert.equal(noteDeleteWhere(admin, 'note-1').userId, undefined)
})
