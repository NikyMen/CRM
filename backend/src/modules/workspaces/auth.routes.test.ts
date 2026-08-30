import assert from 'node:assert/strict'
import test from 'node:test'
import Fastify from 'fastify'

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test'
process.env.REDIS_URL ||= 'redis://127.0.0.1:6379'
process.env.JWT_SECRET ||= 'test-secret-with-at-least-thirty-two-characters'
process.env.ALLOW_PUBLIC_REGISTRATION = 'false'

test('normaliza emails de autenticación antes de usarlos', async () => {
  const { normalizeAuthEmail } = await import('../../core/auth/auth.service')
  assert.equal(normalizeAuthEmail('  Usuario.MIXTO@Example.COM  '), 'usuario.mixto@example.com')
})

test('registro, login e invitación consultan el email normalizado', async (t) => {
  const { AuthService } = await import('../../core/auth/auth.service')
  const { db } = await import('../../core/database')
  const lookups: string[] = []
  let flow: 'register' | 'login' | 'invite' = 'register'
  const userDelegate = db.user as unknown as {
    findUnique(args: { where: { email: string } }): Promise<unknown>
  }
  const membershipDelegate = db.workspaceUser as unknown as {
    findUnique(args: unknown): Promise<unknown>
  }
  const originalUserFindUnique = userDelegate.findUnique
  const originalMembershipFindUnique = membershipDelegate.findUnique

  userDelegate.findUnique = async (args) => {
    lookups.push(args.where.email)
    return flow === 'login' ? null : { id: 'existing-user' }
  }
  membershipDelegate.findUnique = async () => ({ id: 'existing-membership' })
  t.after(() => {
    userDelegate.findUnique = originalUserFindUnique
    membershipDelegate.findUnique = originalMembershipFindUnique
  })

  const service = new AuthService()
  await assert.rejects(service.register({
    email: '  Registro@Example.COM  ',
    password: 'password-seguro',
    firstName: 'Registro',
    workspaceName: 'Workspace',
  }), /registrado/)

  flow = 'login'
  await assert.rejects(service.login('  Login@Example.COM  ', 'password-seguro'), /Credenciales inválidas/)

  flow = 'invite'
  await assert.rejects(service.inviteUser({
    workspaceId: 'workspace-id',
    email: '  Invitado@Example.COM  ',
    password: 'password-seguro',
    firstName: 'Invitado',
    role: 'member',
  }), /ya es miembro/)

  assert.deepEqual(lookups, [
    'registro@example.com',
    'login@example.com',
    'invitado@example.com',
  ])
})

test('el registro público queda bloqueado sin ejecutar el alta', async () => {
  const { authRoutes } = await import('./auth.routes')
  const app = Fastify()
  await app.register(authRoutes, { prefix: '/auth' })

  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'publico@example.com',
      password: 'not-used-password',
      firstName: 'Publico',
      workspaceName: 'No debe crearse',
    },
  })

  assert.equal(response.statusCode, 404)
  assert.deepEqual(response.json(), {
    error: 'REGISTRATION_DISABLED',
    message: 'El alta de usuarios se realiza desde Equipo.',
  })

  await app.close()
})

test('forgot-password busca el email normalizado', async (t) => {
  const { db } = await import('../../core/database')
  const { authRoutes } = await import('./auth.routes')
  const lookups: string[] = []
  const userDelegate = db.user as unknown as {
    findUnique(args: { where: { email: string } }): Promise<unknown>
  }

  const originalFindUnique = userDelegate.findUnique
  userDelegate.findUnique = async (args) => {
    lookups.push(args.where.email)
    return null
  }
  t.after(() => {
    userDelegate.findUnique = originalFindUnique
  })

  const app = Fastify()
  await app.register(authRoutes, { prefix: '/auth' })

  const response = await app.inject({
    method: 'POST',
    url: '/auth/forgot-password',
    payload: { email: '  Recuperar@Example.COM  ' },
  })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(lookups, ['recuperar@example.com'])

  await app.close()
})
