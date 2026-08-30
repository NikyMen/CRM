import assert from 'node:assert/strict'
import test from 'node:test'
import { AppError } from '../../types'
import { assertDealWriteAccess, dealVisibilityWhere, dealWriteVisibilityWhere } from './deal-access'
import { buildClientSeed, convertWonDealToClient } from './deal-conversion'

test('aplica la cartera comercial según el rol', () => {
  assert.deepEqual(dealVisibilityWhere({ workspaceId: 'w', userId: 'owner-1', role: 'owner' }), {})
  assert.deepEqual(dealVisibilityWhere({ workspaceId: 'w', userId: 'admin-1', role: 'admin' }), {})
  assert.deepEqual(dealVisibilityWhere({ workspaceId: 'w', userId: 'member-1', role: 'member' }), {
    OR: [
      { ownerId: 'member-1' },
      { ownerId: null },
      { company: { is: { assignments: { some: { userId: 'member-1' } } } } },
    ],
  })
  assert.deepEqual(dealVisibilityWhere({ workspaceId: 'w', userId: 'viewer-1', role: 'viewer' }), {
    OR: [
      { ownerId: 'viewer-1' },
      { company: { is: { assignments: { some: { userId: 'viewer-1' } } } } },
    ],
  })
})

test('member solo toma libres de forma explícita y no modifica cartera ajena', () => {
  const member = { workspaceId: 'w', userId: 'member-1', role: 'member' as const }
  assert.doesNotThrow(() => assertDealWriteAccess(member, null, 'member-1', true))
  assert.doesNotThrow(() => assertDealWriteAccess(member, 'member-1', null, true))
  assert.throws(
    () => assertDealWriteAccess(member, null, undefined, false),
    (error: unknown) => error instanceof AppError && error.statusCode === 403
  )
  assert.throws(
    () => assertDealWriteAccess(member, 'member-2', 'member-1', true),
    (error: unknown) => error instanceof AppError && error.statusCode === 403
  )
  assert.doesNotThrow(() => assertDealWriteAccess(member, 'member-2', undefined, false, true))
  assert.throws(
    () => assertDealWriteAccess(member, 'member-2', 'member-1', true, true),
    (error: unknown) => error instanceof AppError && error.statusCode === 403
  )
  assert.deepEqual(dealWriteVisibilityWhere(member), {
    OR: [
      { ownerId: 'member-1' },
      { company: { is: { assignments: { some: { userId: 'member-1' } } } } },
    ],
  })
  assert.deepEqual(dealWriteVisibilityWhere({ ...member, role: 'viewer' }), {
    AND: [{ ownerId: 'member-1' }, { ownerId: null }],
  })
})

test('reutiliza los datos paraguayos del contacto al preparar el cliente', () => {
  assert.deepEqual(buildClientSeed({
    title: 'Constitución Acme',
    customData: {},
    contacts: [{
      contact: {
        firstName: 'Ana',
        lastName: 'Benítez',
        email: 'ana@example.com',
        phone: '+595 981 000000',
        customData: { ruc: '1.234.567-8', personType: 'INDIVIDUAL' },
      },
    }],
  }), {
    name: 'Ana Benítez',
    personType: 'INDIVIDUAL',
    ruc: '1234567',
    dv: '8',
    legalName: null,
    tradeName: 'Constitución Acme',
    email: 'ana@example.com',
    phone: '+595 981 000000',
  })
})

function conversionFixture() {
  const state = {
    deal: {
      id: 'deal-1',
      workspaceId: 'workspace-1',
      title: 'Servicios Ana',
      status: 'WON',
      isArchived: false,
      ownerId: 'member-1',
      companyId: null as string | null,
      customData: {},
      contacts: [{
        contactId: 'contact-1',
        contact: {
          id: 'contact-1',
          firstName: 'Ana',
          lastName: 'Benítez',
          email: 'ana@example.com',
          phone: '0981000000',
          companyId: null as string | null,
          ownerId: 'member-1' as string | null,
          customData: { ruc: '1234567-8' },
        },
      }],
    },
    companies: [] as any[],
    chatOwner: null as string | null,
    ticket: { companyId: null as string | null, assignedToUserId: null as string | null },
    openDeal: { companyId: null as string | null, ownerId: null as string | null },
    assignedCollaborators: new Set<string>(),
  }
  let releaseQueue = Promise.resolve()

  const tx: any = {
    deal: {
      findFirst: async () => state.deal,
      update: async ({ data }: any) => Object.assign(state.deal, data),
      updateMany: async ({ data }: any) => {
        Object.assign(state.openDeal, data)
        return { count: 1 }
      },
    },
    company: {
      findFirst: async ({ where }: any) => state.companies.find((client) =>
        (where.id ? client.id === where.id : client.ruc === where.ruc)
      ) ?? null,
      create: async ({ data }: any) => {
        const client = { id: `client-${state.companies.length + 1}`, isArchived: false, ...data }
        state.companies.push(client)
        return client
      },
      update: async ({ where, data }: any) => {
        const client = state.companies.find((item) => item.id === where.id)
        return Object.assign(client, data)
      },
    },
    clientAssignment: {
      findFirst: async ({ where }: any) => state.assignedCollaborators.has(where.userId)
        ? { id: `assignment-${where.userId}` }
        : null,
    },
    contact: {
      updateMany: async ({ data }: any) => {
        Object.assign(state.deal.contacts[0].contact, data)
        return { count: 1 }
      },
    },
    whatsAppChat: {
      updateMany: async ({ data }: any) => {
        state.chatOwner = data.assignedToUserId
        return { count: 1 }
      },
    },
    ticket: {
      updateMany: async ({ data }: any) => {
        Object.assign(state.ticket, data)
        return { count: 1 }
      },
    },
  }

  const database = {
    $transaction: async (callback: (transaction: any) => Promise<any>) => {
      const previous = releaseQueue
      let release!: () => void
      releaseQueue = new Promise<void>((resolve) => { release = resolve })
      await previous
      try {
        return await callback(tx)
      } finally {
        release()
      }
    },
  }
  return { state, database }
}

test('dos conversiones simultáneas crean un solo cliente y sincronizan la cartera', async () => {
  const fixture = conversionFixture()
  const input = {
    workspaceId: 'workspace-1',
    userId: 'member-1',
    role: 'member' as const,
    dealId: 'deal-1',
  }

  const results = await Promise.all([
    convertWonDealToClient(input, fixture.database),
    convertWonDealToClient(input, fixture.database),
  ])

  assert.equal(fixture.state.companies.length, 1)
  assert.deepEqual(results.map((result) => result.created).sort(), [false, true])
  assert.deepEqual(results.map((result) => result.changed).sort(), [false, true])
  assert.equal(fixture.state.deal.companyId, 'client-1')
  assert.equal(fixture.state.deal.contacts[0].contact.companyId, 'client-1')
  assert.equal(fixture.state.ticket.companyId, 'client-1')
  assert.equal(fixture.state.chatOwner, 'member-1')
  assert.deepEqual(fixture.state.openDeal, { companyId: 'client-1', ownerId: 'member-1' })
})

test('no convierte una oportunidad que todavía no fue ganada', async () => {
  const fixture = conversionFixture()
  fixture.state.deal.status = 'OPEN'
  await assert.rejects(
    convertWonDealToClient({
      workspaceId: 'workspace-1',
      userId: 'member-1',
      role: 'member',
      dealId: 'deal-1',
    }, fixture.database),
    (error: unknown) => error instanceof AppError && error.statusCode === 422
  )
})

test('un colaborador asignado puede completar la conversión sin asumir la responsabilidad principal', async () => {
  const fixture = conversionFixture()
  fixture.state.companies.push({
    id: 'client-1',
    workspaceId: 'workspace-1',
    name: 'Cliente existente',
    ownerId: 'owner-1',
    isArchived: false,
  })
  fixture.state.deal.companyId = 'client-1'
  fixture.state.deal.ownerId = 'owner-1'
  fixture.state.assignedCollaborators.add('member-1')

  const result = await convertWonDealToClient({
    workspaceId: 'workspace-1',
    userId: 'member-1',
    role: 'member',
    dealId: 'deal-1',
  }, fixture.database)

  assert.equal(result.client.id, 'client-1')
  assert.equal(result.deal.ownerId, 'owner-1')
})
