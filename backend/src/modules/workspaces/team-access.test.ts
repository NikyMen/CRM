import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import { createHash } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { WorkspaceContext } from '../../types'

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test'
process.env.REDIS_URL ||= 'redis://127.0.0.1:6379'
process.env.JWT_SECRET ||= 'test-secret-with-at-least-thirty-two-characters'
const owner = { workspaceId: 'workspace', userId: 'owner', role: 'owner' } as WorkspaceContext
const input = { token: 'a'.repeat(64), email: '  NUEVO@Example.com ', password: 'test-password-only', firstName: 'Prueba', lastName: 'Invitación' }

test('invitación: guarda sólo hash, rol y caducidad máxima de 24 horas', async (t) => {
  const { db } = await import('../../core/database')
  const { TeamAccessService } = await import('./team-access.service')
  let saved: any
  mockMethod(t, db.workspaceUser, 'findFirst', async (args) => { assert.deepEqual(args.where, { workspaceId: 'workspace', userId: 'owner', role: 'owner' }); return { id: 'creator' } })
  mockMethod(t, db.teamInvitation, 'create', async ({ data }) => { saved = data })
  const before = Date.now()
  const result = await new TeamAccessService().createInvitation(owner, 'viewer')
  assert.match(result.token, /^[a-f0-9]{64}$/)
  assert.equal(saved.tokenHash, createHash('sha256').update(result.token).digest('hex'))
  assert.equal(saved.role, 'viewer')
  assert.equal(saved.token, undefined)
  assert.ok(result.expiresAt.getTime() >= before + 86400000)
  assert.ok(result.expiresAt.getTime() <= Date.now() + 86400000)
})

test('sólo owner puede generar enlaces o cambiar contraseñas', async () => {
  const { TeamAccessService } = await import('./team-access.service')
  for (const role of ['admin', 'member', 'viewer']) {
    const ctx = { ...owner, role } as WorkspaceContext
    await assert.rejects(new TeamAccessService().createInvitation(ctx, 'member'), /propietario/)
    await assert.rejects(new TeamAccessService().changePassword(ctx, 'member', input.password), /propietario/)
  }
})

test('enlace usado, vencido o sin owner activo se rechaza antes de crear usuarios', async (t) => {
  const { db } = await import('../../core/database')
  const { TeamAccessService } = await import('./team-access.service')
  mockMethod(t, db.teamInvitation, 'findFirst', async ({ where }) => {
    assert.equal(where.usedAt, null)
    assert.ok(where.expiresAt.gt instanceof Date)
    assert.equal(where.createdBy.role, 'owner')
    return null
  })
  const tx = mockMethod(t, db, '$transaction', async () => { throw new Error('No debe llegar a la transacción') })
  await assert.rejects(new TeamAccessService().acceptInvitation(input), /inválido.*usado.*venció/)
  assert.equal(tx.mock.callCount(), 0)
})

test('dos altas simultáneas con el mismo enlace: sólo una crea cuenta en el espacio y rol autorizados', async (t) => {
  const { db } = await import('../../core/database')
  const { TeamAccessService } = await import('./team-access.service')
  let consumed = false
  const created: any[] = []
  mockMethod(t, db.teamInvitation, 'findFirst', async () => ({ id: 'invitation' }))
  const tx = {
    teamInvitation: {
      updateMany: async ({ where }) => {
        assert.equal(where.id, 'invitation'); assert.equal(where.usedAt, null)
        assert.ok(where.expiresAt.gt instanceof Date); assert.equal(where.createdBy.role, 'owner')
        if (consumed) return { count: 0 }
        consumed = true; return { count: 1 }
      },
      findUniqueOrThrow: async () => ({ role: 'viewer', createdBy: { workspaceId: 'workspace' } }),
    },
    user: { findUnique: async () => null, create: async ({ data }) => { created.push(data) } },
  }
  mockMethod(t, db, '$transaction', async (work: any) => work(tx))
  const results = await Promise.allSettled([new TeamAccessService().acceptInvitation(input), new TeamAccessService().acceptInvitation(input)])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  assert.equal(created.length, 1)
  assert.equal(created[0].email, 'nuevo@example.com')
  assert.deepEqual(created[0].workspaces.create, { workspaceId: 'workspace', role: 'viewer' })
  assert.ok(await bcrypt.compare(input.password, created[0].passwordHash))
})

test('cambiar contraseña limita miembro al espacio, invalida sesiones y recuperación', async (t) => {
  const { db } = await import('../../core/database')
  const { TeamAccessService } = await import('./team-access.service')
  let updated: any
  const tx = {
    workspaceUser: {
      findFirst: async ({ where }) => { assert.deepEqual(where, { id: 'member', workspaceId: 'workspace' }); return { userId: 'user', role: 'member' } },
      count: async () => 0,
    },
    user: { update: async ({ where, data }) => { assert.equal(where.id, 'user'); updated = data } },
  }
  mockMethod(t, db, '$transaction', async (work: any) => work(tx))
  await new TeamAccessService().changePassword(owner, 'member', input.password)
  assert.ok(await bcrypt.compare(input.password, updated.passwordHash))
  assert.deepEqual(updated.sessionVersion, { increment: 1 })
  assert.equal(updated.resetToken, null)
  assert.equal(updated.resetTokenExpiry, null)
  tx.workspaceUser.count = async () => 1
  await assert.rejects(new TeamAccessService().changePassword(owner, 'member', input.password), /otros espacios/)
})

test('JWT emitido antes del cambio de contraseña deja de autorizar', async (t) => {
  const { db } = await import('../../core/database')
  const { AuthService } = await import('../../core/auth/auth.service')
  mockMethod(t, db.workspaceUser, 'findUnique', async () => ({ role: 'member', user: { sessionVersion: 1 } }))
  const req = { jwtVerify: async () => {}, user: { sub: 'user', workspaceId: 'workspace', type: 'access', sessionVersion: 0 } }
  await assert.rejects(AuthService.authenticate(req), /contraseña cambió/)
  req.user.sessionVersion = 1
  await AuthService.authenticate(req)
})

// Los delegates Prisma son proxies; restauramos la propiedad tras cada prueba.
function mockMethod(t: TestContext, target: any, key: string, implementation: (...args: any[]) => any) {
  const original = target[key]
  let calls = 0
  target[key] = (...args: any[]) => { calls++; return implementation(...args) }
  t.after(() => { target[key] = original })
  return { mock: { callCount: () => calls } }
}
