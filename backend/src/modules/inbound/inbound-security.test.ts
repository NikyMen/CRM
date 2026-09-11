import assert from 'node:assert/strict'
import test from 'node:test'
import { AppError } from '../../types'
import {
  assertInboundChannelAllowed,
  createValidatedInboundActivity,
  findInboundContactById,
} from './inbound-security'

test('bloquea solo WhatsApp inbound cuando los canales heredados están apagados', () => {
  assert.throws(
    () => assertInboundChannelAllowed('whatsapp', false),
    (error: unknown) => error instanceof AppError && error.statusCode === 422
  )
  assert.doesNotThrow(() => assertInboundChannelAllowed('email', false))
  assert.doesNotThrow(() => assertInboundChannelAllowed('whatsapp', true))
})

function transactionDatabase(overrides: Record<string, unknown>) {
  const database: any = { ...overrides }
  database.$transaction = async (callback: (tx: any) => Promise<unknown>) => callback(database)
  return database
}

test('no crea actividad ni actualiza un contacto de otro workspace', async () => {
  let creates = 0
  let updates = 0
  const database = transactionDatabase({
    contact: {
      findFirst: async ({ where }: any) => {
        assert.deepEqual(where, {
          id: 'contact-foreign',
          workspaceId: 'workspace-own',
          isArchived: false,
        })
        return null
      },
      updateMany: async () => {
        updates += 1
        return { count: 1 }
      },
    },
    activity: {
      create: async () => {
        creates += 1
        return { id: 'activity-1' }
      },
    },
  })

  await assert.rejects(
    createValidatedInboundActivity(database, {
      workspaceId: 'workspace-own',
      type: 'CALL',
      entityType: 'contact',
      entityId: 'contact-foreign',
      title: 'No debe crearse',
    }),
    (error: unknown) => error instanceof AppError && error.statusCode === 404
  )
  assert.equal(creates, 0)
  assert.equal(updates, 0)
})

test('crea y marca un contacto usando siempre el workspace de la API key', async () => {
  const contactedAt = new Date('2026-08-29T12:00:00.000Z')
  const database = transactionDatabase({
    contact: {
      findFirst: async ({ where, select }: any) => {
        assert.deepEqual(where, {
          id: 'contact-1',
          workspaceId: 'workspace-1',
          isArchived: false,
        })
        assert.deepEqual(select, { id: true })
        return { id: 'contact-1' }
      },
      updateMany: async ({ where, data }: any) => {
        assert.deepEqual(where, {
          id: 'contact-1',
          workspaceId: 'workspace-1',
          isArchived: false,
        })
        assert.deepEqual(data, { lastContactedAt: contactedAt })
        return { count: 1 }
      },
    },
    activity: {
      create: async ({ data }: any) => {
        assert.equal(data.workspaceId, 'workspace-1')
        assert.equal(data.entityId, 'contact-1')
        assert.equal(data.contactId, 'contact-1')
        return { id: 'activity-1', ...data }
      },
    },
  })

  const activity = await createValidatedInboundActivity(database, {
    workspaceId: 'workspace-1',
    type: 'CALL',
    entityType: 'contact',
    entityId: 'contact-1',
    title: 'Contacto validado',
  }, contactedAt)
  assert.equal(activity.id, 'activity-1')
})

test('valida empresas por id y workspace antes de registrar actividad', async () => {
  let contactUpdates = 0
  const database = transactionDatabase({
    company: {
      findFirst: async ({ where, select }: any) => {
        assert.deepEqual(where, { id: 'company-1', workspaceId: 'workspace-1' })
        assert.deepEqual(select, { id: true })
        return { id: 'company-1' }
      },
    },
    contact: {
      updateMany: async () => {
        contactUpdates += 1
        return { count: 1 }
      },
    },
    activity: {
      create: async ({ data }: any) => ({ id: 'activity-company', ...data }),
    },
  })

  const activity = await createValidatedInboundActivity(database, {
    workspaceId: 'workspace-1',
    type: 'NOTE',
    entityType: 'company',
    entityId: 'company-1',
    title: 'Empresa validada',
  })
  assert.equal(activity.entityType, 'company')
  assert.equal(contactUpdates, 0)
})

test('rechaza una oportunidad que no pertenece al workspace de la API key', async () => {
  let creates = 0
  const database = transactionDatabase({
    deal: {
      findFirst: async ({ where, select }: any) => {
        assert.deepEqual(where, {
          id: 'deal-foreign',
          workspaceId: 'workspace-own',
          isArchived: false,
        })
        assert.deepEqual(select, { id: true })
        return null
      },
    },
    activity: {
      create: async () => {
        creates += 1
        return { id: 'activity-1' }
      },
    },
  })

  await assert.rejects(
    createValidatedInboundActivity(database, {
      workspaceId: 'workspace-own',
      type: 'NOTE',
      entityType: 'deal',
      entityId: 'deal-foreign',
      title: 'No debe crearse',
    }),
    (error: unknown) => error instanceof AppError && error.statusCode === 404
  )
  assert.equal(creates, 0)
})

test('rechaza task porque no existe un modelo verificable', async () => {
  let transactions = 0
  const database = {
    $transaction: async () => {
      transactions += 1
    },
  }

  await assert.rejects(
    createValidatedInboundActivity(database, {
      workspaceId: 'workspace-1',
      type: 'TASK',
      entityType: 'task',
      entityId: 'task-foreign',
      title: 'No verificable',
    }),
    (error: unknown) => error instanceof AppError && error.statusCode === 422
  )
  assert.equal(transactions, 0)
})

test('la búsqueda de contactId entrante queda limitada al workspace', async () => {
  const database = {
    contact: {
      findFirst: async ({ where, select }: any) => {
        assert.deepEqual(where, {
          id: 'contact-1',
          workspaceId: 'workspace-1',
          isArchived: false,
        })
        assert.deepEqual(select, { id: true })
        return null
      },
    },
  }

  assert.equal(
    await findInboundContactById(database, 'workspace-1', 'contact-1'),
    null
  )
})
