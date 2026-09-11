import assert from 'node:assert/strict'
import test from 'node:test'
import { AppError } from '../../types'
import { assignChatAndRelatedRecords } from './ticket.assignment'
import { attachOutboundMessageToActiveTicket, ensureTicketForInboundMessage, ticketActiveKey } from './ticket.inbound'
import { buildTicketVisibilityScope, TicketService } from './ticket.service'
import {
  createReplyReservationMetadata,
  readReplyReservationSnapshot,
  replyCompletionPatch,
} from './ticket.reply-state'

function createInboundDatabase() {
  const workspaceId = 'workspace-1'
  const chatId = 'chat-1'
  const state = {
    chats: new Map([[chatId, {
      id: chatId,
      jid: '595981000000@s.whatsapp.net',
      displayName: 'Cliente de prueba',
      phoneNumber: '595981000000',
      contactId: 'contact-1',
      assignedToUserId: null as string | null,
      contact: { ownerId: null, companyId: 'company-1', company: { ownerId: null } },
    }]]),
    messages: new Map<string, { id: string; workspaceId: string; ticketId: string | null }>(),
    tickets: [] as any[],
    events: [] as any[],
  }
  let id = 0
  let lock = Promise.resolve()

  const ticketApi = {
    findUnique: async ({ where }: any) => state.tickets.find((ticket) => ticket.activeKey === where.activeKey) ?? null,
    findFirst: async ({ where }: any) => state.tickets.find((ticket) => {
      if (where.id) return ticket.id === where.id
      if (where.whatsappChatId) {
        return ticket.workspaceId === where.workspaceId
          && ticket.whatsappChatId === where.whatsappChatId
          && (where.status === undefined || ticket.status === where.status)
          && (where.activeKey === undefined
            || (where.activeKey === null ? ticket.activeKey === null : ticket.activeKey !== null))
      }
      return false
    }) ?? null,
    aggregate: async () => ({ _max: { number: Math.max(0, ...state.tickets.map((ticket) => ticket.number)) || null } }),
    create: async ({ data }: any) => {
      const ticket = { id: `ticket-${++id}`, createdAt: new Date(), updatedAt: new Date(), ...data }
      state.tickets.push(ticket)
      return ticket
    },
    update: async ({ where, data }: any) => {
      const ticket = state.tickets.find((item) => item.id === where.id)
      Object.assign(ticket, data)
      return ticket
    },
  }
  const messageApi = {
    findFirst: async ({ where }: any) => {
      const message = state.messages.get(where.id)
      return message ? { ticketId: message.ticketId } : null
    },
    updateMany: async ({ where, data }: any) => {
      const message = state.messages.get(where.id)
      if (!message || (where.ticketId === null && message.ticketId !== null)) return { count: 0 }
      Object.assign(message, data)
      return { count: 1 }
    },
  }

  const database: any = {
    ticket: ticketApi,
    whatsAppMessage: messageApi,
    $transaction: async (callback: (tx: any) => Promise<any>) => {
      let release: (() => void) | null = null
      const tx = {
        ticket: ticketApi,
        whatsAppMessage: messageApi,
        whatsAppChat: {
          findFirst: async ({ where }: any) => state.chats.get(where.id) ?? null,
          update: async ({ where, data }: any) => {
            const chat = state.chats.get(where.id)!
            Object.assign(chat, data)
            return chat
          },
        },
        contact: { updateMany: async () => ({ count: 1 }) },
        company: { updateMany: async () => ({ count: 1 }) },
        deal: { updateMany: async () => ({ count: 1 }) },
        workspaceUser: {
          findMany: async ({ where }: any) => (where.userId.in as string[]).map((userId) => ({ userId })),
        },
        ticketEvent: {
          create: async ({ data }: any) => {
            state.events.push(data)
            return data
          },
        },
        $executeRaw: async () => {
          const previous = lock
          lock = new Promise<void>((resolve) => { release = resolve })
          await previous
          return 1
        },
      }
      try {
        return await callback(tx)
      } finally {
        release?.()
      }
    },
  }

  return {
    workspaceId,
    chatId,
    state,
    database,
    addMessage(messageId: string) {
      state.messages.set(messageId, { id: messageId, workspaceId, ticketId: null })
    },
  }
}

test('dos mensajes simultaneos comparten un unico ticket activo', async () => {
  const fixture = createInboundDatabase()
  fixture.addMessage('message-1')
  fixture.addMessage('message-2')

  await Promise.all([
    ensureTicketForInboundMessage({
      workspaceId: fixture.workspaceId,
      chatId: fixture.chatId,
      messageId: 'message-1',
      sentAt: new Date('2026-08-29T12:00:00Z'),
    }, fixture.database),
    ensureTicketForInboundMessage({
      workspaceId: fixture.workspaceId,
      chatId: fixture.chatId,
      messageId: 'message-2',
      sentAt: new Date('2026-08-29T12:00:01Z'),
    }, fixture.database),
  ])

  assert.equal(fixture.state.tickets.length, 1)
  assert.equal(fixture.state.messages.get('message-1')?.ticketId, fixture.state.tickets[0].id)
  assert.equal(fixture.state.messages.get('message-2')?.ticketId, fixture.state.tickets[0].id)
})

test('un mensaje posterior a un ticket cerrado reabre el mismo ticket', async () => {
  const fixture = createInboundDatabase()
  fixture.addMessage('message-1')
  await ensureTicketForInboundMessage({
    workspaceId: fixture.workspaceId,
    chatId: fixture.chatId,
    messageId: 'message-1',
    sentAt: new Date('2026-08-29T12:00:00Z'),
  }, fixture.database)

  fixture.state.tickets[0].status = 'CLOSED'
  fixture.state.tickets[0].activeKey = null
  fixture.addMessage('message-2')
  await ensureTicketForInboundMessage({
    workspaceId: fixture.workspaceId,
    chatId: fixture.chatId,
    messageId: 'message-2',
    sentAt: new Date('2026-08-30T12:00:00Z'),
  }, fixture.database)

  assert.equal(fixture.state.tickets.length, 1)
  assert.equal(fixture.state.tickets[0].status, 'OPEN')
  assert.equal(fixture.state.tickets[0].closedAt, null)
  assert.equal(
    fixture.state.tickets[0].activeKey,
    ticketActiveKey(fixture.workspaceId, fixture.chatId)
  )
  assert.equal(fixture.state.messages.get('message-2')?.ticketId, fixture.state.tickets[0].id)
})

test('un mensaje posterior a resuelto reabre el mismo ticket', async () => {
  const fixture = createInboundDatabase()
  fixture.addMessage('message-1')
  await ensureTicketForInboundMessage({
    workspaceId: fixture.workspaceId,
    chatId: fixture.chatId,
    messageId: 'message-1',
    sentAt: new Date('2026-08-29T12:00:00Z'),
  }, fixture.database)

  fixture.state.tickets[0].status = 'RESOLVED'
  fixture.state.tickets[0].resolvedAt = new Date('2026-08-29T12:30:00Z')
  fixture.addMessage('message-2')
  await ensureTicketForInboundMessage({
    workspaceId: fixture.workspaceId,
    chatId: fixture.chatId,
    messageId: 'message-2',
    sentAt: new Date('2026-08-29T13:00:00Z'),
  }, fixture.database)

  assert.equal(fixture.state.tickets.length, 1)
  assert.equal(fixture.state.tickets[0].status, 'OPEN')
  assert.equal(fixture.state.tickets[0].resolvedAt, null)
})

test('un mensaje enviado desde el teléfono se vincula al ticket activo', async () => {
  const fixture = createInboundDatabase()
  fixture.addMessage('message-1')
  await ensureTicketForInboundMessage({
    workspaceId: fixture.workspaceId,
    chatId: fixture.chatId,
    messageId: 'message-1',
    sentAt: new Date('2026-08-29T12:00:00Z'),
  }, fixture.database)

  fixture.addMessage('message-phone')
  await attachOutboundMessageToActiveTicket({
    workspaceId: fixture.workspaceId,
    chatId: fixture.chatId,
    messageId: 'message-phone',
    sentAt: new Date('2026-08-29T12:05:00Z'),
  }, fixture.database)

  assert.equal(fixture.state.messages.get('message-phone')?.ticketId, fixture.state.tickets[0].id)
  assert.equal(fixture.state.tickets[0].lastMessageAt.toISOString(), '2026-08-29T12:05:00.000Z')
  assert.equal(fixture.state.events.at(-1)?.type, 'MESSAGE_SENT_FROM_PHONE')
})

test('member ve propios y libres; viewer solo propios', () => {
  assert.deepEqual(
    buildTicketVisibilityScope({ workspaceId: 'w', userId: 'member-1', role: 'member' }, 'all'),
    { AND: [{ OR: [{ assignedToUserId: null }, { assignedToUserId: 'member-1' }] }] }
  )
  assert.deepEqual(
    buildTicketVisibilityScope({ workspaceId: 'w', userId: 'viewer-1', role: 'viewer' }, 'all'),
    { assignedToUserId: 'viewer-1' }
  )
  assert.deepEqual(
    buildTicketVisibilityScope({ workspaceId: 'w', userId: 'admin-1', role: 'admin' }, 'all'),
    {}
  )
})

test('claim usa compare-and-set y sincroniza chat, ticket, contacto, cliente y deals', async () => {
  const state = {
    assignedToUserId: null as string | null,
    ticketOwner: null as string | null,
    contactOwner: null as string | null,
    companyOwner: null as string | null,
    dealOwner: null as string | null,
  }
  const tx: any = {
    whatsAppChat: {
      updateMany: async ({ where, data }: any) => {
        if (state.assignedToUserId !== where.assignedToUserId) return { count: 0 }
        state.assignedToUserId = data.assignedToUserId
        return { count: 1 }
      },
      findFirst: async () => ({
        id: 'chat-1',
        jid: '595981000000@s.whatsapp.net',
        contactId: 'contact-1',
        contact: { companyId: 'company-1' },
      }),
    },
    ticket: {
      updateMany: async ({ data }: any) => {
        state.ticketOwner = data.assignedToUserId
        return { count: 1 }
      },
    },
    contact: { updateMany: async ({ data }: any) => { state.contactOwner = data.ownerId; return { count: 1 } } },
    company: { updateMany: async ({ data }: any) => { state.companyOwner = data.ownerId; return { count: 1 } } },
    deal: { updateMany: async ({ data }: any) => { state.dealOwner = data.ownerId; return { count: 1 } } },
  }
  const database = { $transaction: (callback: (transaction: any) => Promise<any>) => callback(tx) }

  await assignChatAndRelatedRecords({
    workspaceId: 'workspace-1',
    chatId: 'chat-1',
    expectedAssignedToUserId: null,
    assignedToUserId: 'user-1',
  }, database)

  assert.deepEqual(state, {
    assignedToUserId: 'user-1',
    ticketOwner: 'user-1',
    contactOwner: 'user-1',
    companyOwner: 'user-1',
    dealOwner: 'user-1',
  })

  await assert.rejects(
    assignChatAndRelatedRecords({
      workspaceId: 'workspace-1',
      chatId: 'chat-1',
      expectedAssignedToUserId: null,
      assignedToUserId: 'user-2',
    }, database),
    (error: unknown) => error instanceof AppError && error.code === 'ASSIGNMENT_CONFLICT'
  )
})

test('la finalización de respuesta nunca reabre un ticket cerrado durante el envío', async () => {
  const reservedAt = new Date('2026-08-29T12:00:00Z')
  const sentAt = new Date('2026-08-29T12:00:05Z')
  const ticket = {
    id: 'ticket-1',
    workspaceId: 'workspace-1',
    status: 'CLOSED',
    assignedToUserId: 'admin-2',
    activeKey: null,
    firstResponseAt: null,
    lastMessageAt: reservedAt,
    resolvedAt: reservedAt,
  }
  const operation = {
    id: 'operation-1',
    workspaceId: 'workspace-1',
    ticketId: ticket.id,
    actorUserId: 'member-1',
    type: 'MESSAGE_SEND_REQUESTED',
    metadata: createReplyReservationMetadata('Respuesta', {
      status: 'OPEN',
      assignedToUserId: 'member-1',
      activeKey: 'whatsapp:workspace-1:chat-1',
    }),
  }
  let messageWhere: any
  let ticketWhere: any
  const tx: any = {
    $queryRaw: async () => [{ id: ticket.id }],
    ticketEvent: {
      findFirst: async () => operation,
      updateMany: async ({ where, data }: any) => {
        assert.equal(where.workspaceId, 'workspace-1')
        Object.assign(operation, data)
        return { count: 1 }
      },
    },
    ticket: {
      findFirst: async () => ({ ...ticket }),
      updateMany: async ({ where, data }: any) => {
        ticketWhere = where
        Object.assign(ticket, data)
        return { count: 1 }
      },
    },
    whatsAppMessage: {
      updateMany: async ({ where }: any) => {
        messageWhere = where
        return { count: 1 }
      },
    },
  }
  const database: any = {
    $transaction: (callback: (transaction: any) => Promise<any>) => callback(tx),
    ticket: { findFirst: async () => null },
  }
  const service = new TicketService(database)

  const result = await service.recordReply(
    { workspaceId: 'workspace-1', userId: 'member-1', role: 'member' },
    {
      ...ticket,
      status: 'OPEN',
      assignedToUserId: 'member-1',
      activeKey: 'whatsapp:workspace-1:chat-1',
      whatsappChat: { jid: '595981000000@s.whatsapp.net' },
    },
    { id: 'message-1', sentAt },
    operation.id
  )

  assert.equal(ticket.status, 'CLOSED')
  assert.equal(ticket.assignedToUserId, 'admin-2')
  assert.equal(ticket.activeKey, null)
  assert.equal(ticket.firstResponseAt?.toISOString(), sentAt.toISOString())
  assert.equal(operation.type, 'MESSAGE_SENT')
  assert.equal(ticketWhere.workspaceId, 'workspace-1')
  assert.equal(messageWhere.workspaceId, 'workspace-1')
  assert.equal(result.status, 'CLOSED')
})

test('una reasignación durante la red preserva el estado actual y un snapshot intacto puede abrirlo', () => {
  const sentAt = new Date('2026-08-29T12:00:05Z')
  const metadata = createReplyReservationMetadata('Respuesta', {
    status: 'RESOLVED',
    assignedToUserId: 'member-1',
    activeKey: 'whatsapp:workspace-1:chat-1',
  })
  const reservation = readReplyReservationSnapshot(metadata)
  const reassignedPatch = replyCompletionPatch(reservation, {
    status: 'RESOLVED',
    assignedToUserId: 'member-2',
    activeKey: 'whatsapp:workspace-1:chat-1',
    firstResponseAt: null,
    lastMessageAt: new Date('2026-08-29T12:00:00Z'),
    resolvedAt: new Date('2026-08-29T11:59:00Z'),
  }, sentAt)
  assert.equal('status' in reassignedPatch, false)
  assert.equal('resolvedAt' in reassignedPatch, false)

  const unchangedPatch = replyCompletionPatch(reservation, {
    status: 'RESOLVED',
    assignedToUserId: 'member-1',
    activeKey: 'whatsapp:workspace-1:chat-1',
    firstResponseAt: null,
    lastMessageAt: new Date('2026-08-29T12:00:00Z'),
    resolvedAt: new Date('2026-08-29T11:59:00Z'),
  }, sentAt)
  assert.equal(unchangedPatch.status, 'OPEN')
  assert.equal(unchangedPatch.resolvedAt, null)
})

test('la reserva CAS aborta antes de enviar si el ticket cambió', async () => {
  const tx: any = {
    $queryRaw: async () => [{ id: 'ticket-1' }],
    ticket: {
      findFirst: async () => ({
        id: 'ticket-1',
        workspaceId: 'workspace-1',
        status: 'OPEN',
        assignedToUserId: 'member-1',
        activeKey: 'whatsapp:workspace-1:chat-1',
        whatsappChat: { id: 'chat-1', jid: '595981000000@s.whatsapp.net' },
      }),
      updateMany: async ({ where }: any) => {
        assert.equal(where.workspaceId, 'workspace-1')
        return { count: 0 }
      },
    },
    ticketEvent: {
      findFirst: async () => null,
      create: async () => assert.fail('no debe crear la operación después de un CAS fallido'),
    },
  }
  const service = new TicketService({
    $transaction: (callback: (transaction: any) => Promise<any>) => callback(tx),
  })

  await assert.rejects(
    service.prepareReply(
      { workspaceId: 'workspace-1', userId: 'member-1', role: 'member' },
      'ticket-1',
      'Respuesta'
    ),
    (error: unknown) => error instanceof AppError && error.code === 'TICKET_REPLY_CONFLICT'
  )
})
