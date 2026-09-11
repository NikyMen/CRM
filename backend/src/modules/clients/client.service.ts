import { ClientPersonType, ClientStatus, Prisma } from '@prisma/client'
import { db } from '../../core/database'
import type { EventBus } from '../../core/event-bus'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  paginate,
  type WorkspaceContext,
} from '../../types'
import {
  canManageAllClients,
  clientVisibilityWhere,
  ensureClientAccess,
  ensureWorkspaceUser,
} from './client-access'
import type { ClientImportRow } from './client-import'
import { whatsAppRealtime } from '../whatsapp/whatsapp.events'

const clientInclude = {
  owner: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } },
  assignments: {
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
  _count: { select: { contacts: true, deals: true, tickets: true, checklists: true } },
} satisfies Prisma.CompanyInclude

export interface ClientInput {
  name: string
  personType?: ClientPersonType
  ruc?: string | null
  dv?: string | null
  legalName?: string | null
  tradeName?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
  activity?: string | null
  taxObligations?: string[]
  address?: string | null
  city?: string | null
  department?: string | null
  country?: string
  status?: ClientStatus
  ownerId?: string | null
  tags?: string[]
  customData?: Record<string, unknown>
  assignments?: Array<{ userId: string; area?: string }>
}

export interface ClientFilters {
  search?: string
  status?: ClientStatus
  ownerId?: string
  hasDebt?: boolean
  page?: number
  limit?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}

function normalizeRuc(value?: string | null) {
  if (!value) return value
  return value.replace(/\D/g, '') || null
}

export class ClientService {
  constructor(private readonly eventBus?: EventBus) {}

  async list(ctx: WorkspaceContext, filters: ClientFilters) {
    const page = filters.page ?? 0
    const limit = Math.min(filters.limit ?? 25, 100)
    const conditions: Prisma.CompanyWhereInput[] = [
      { workspaceId: ctx.workspaceId, isArchived: false },
      clientVisibilityWhere(ctx),
    ]

    if (filters.search) {
      conditions.push({
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { legalName: { contains: filters.search, mode: 'insensitive' } },
          { tradeName: { contains: filters.search, mode: 'insensitive' } },
          { ruc: { contains: normalizeRuc(filters.search) ?? filters.search } },
          { email: { contains: filters.search, mode: 'insensitive' } },
          { phone: { contains: filters.search } },
          {
            owner: {
              is: {
                OR: [
                  { firstName: { contains: filters.search, mode: 'insensitive' } },
                  { lastName: { contains: filters.search, mode: 'insensitive' } },
                  { email: { contains: filters.search, mode: 'insensitive' } },
                ],
              },
            },
          },
        ],
      })
    }
    if (filters.status) conditions.push({ status: filters.status })
    if (filters.ownerId) conditions.push({ ownerId: filters.ownerId })
    if (filters.hasDebt !== undefined) {
      conditions.push(filters.hasDebt
        ? { receivables: { some: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } } } }
        : { receivables: { none: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } } } })
    }

    const where: Prisma.CompanyWhereInput = { AND: conditions }
    const allowedSorts = ['name', 'legalName', 'tradeName', 'ruc', 'status', 'createdAt', 'updatedAt']
    const sortBy = allowedSorts.includes(filters.sortBy ?? '') ? filters.sortBy! : 'name'
    const orderBy = { [sortBy]: filters.sortDir ?? 'asc' } as Prisma.CompanyOrderByWithRelationInput
    const [items, total] = await Promise.all([
      db.company.findMany({ where, include: clientInclude, orderBy, skip: page * limit, take: limit }),
      db.company.count({ where }),
    ])
    const clientIds = items.map((item) => item.id)
    if (!clientIds.length) return paginate(items, total, page, limit)

    const [receivables, checklists, tickets] = await Promise.all([
      db.receivable.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          companyId: { in: clientIds },
          status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
        },
        select: { companyId: true, currency: true, amount: true, paidAmount: true, status: true },
      }),
      db.clientChecklist.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          companyId: { in: clientIds },
          status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] },
        },
        select: {
          companyId: true,
          items: { where: { isRequired: true, isCompleted: false }, select: { id: true } },
        },
      }),
      db.ticket.groupBy({
        by: ['companyId'],
        where: {
          workspaceId: ctx.workspaceId,
          companyId: { in: clientIds },
          status: { in: ['NEW', 'OPEN', 'WAITING_CUSTOMER'] },
        },
        _count: true,
      }),
    ])

    const balancesByClient = new Map<string, Map<string, { balance: Prisma.Decimal; overdueBalance: Prisma.Decimal }>>()
    for (const receivable of receivables) {
      const byCurrency = balancesByClient.get(receivable.companyId) ?? new Map()
      const totals = byCurrency.get(receivable.currency) ?? {
        balance: new Prisma.Decimal(0),
        overdueBalance: new Prisma.Decimal(0),
      }
      const balance = receivable.amount.minus(receivable.paidAmount)
      totals.balance = totals.balance.plus(balance)
      if (receivable.status === 'OVERDUE') totals.overdueBalance = totals.overdueBalance.plus(balance)
      byCurrency.set(receivable.currency, totals)
      balancesByClient.set(receivable.companyId, byCurrency)
    }

    const checklistCounts = new Map<string, { pendingChecklists: number; pendingChecklistItems: number }>()
    for (const checklist of checklists) {
      const counts = checklistCounts.get(checklist.companyId) ?? { pendingChecklists: 0, pendingChecklistItems: 0 }
      counts.pendingChecklists += 1
      counts.pendingChecklistItems += checklist.items.length
      checklistCounts.set(checklist.companyId, counts)
    }
    const openTickets = new Map(tickets.flatMap((row) => row.companyId ? [[row.companyId, row._count]] : []))

    const enriched = items.map((item) => {
      const balances = [...(balancesByClient.get(item.id) ?? new Map()).entries()].map(([currency, totals]) => ({
        currency,
        balance: totals.balance.toString(),
        overdueBalance: totals.overdueBalance.toString(),
      }))
      const checklist = checklistCounts.get(item.id) ?? { pendingChecklists: 0, pendingChecklistItems: 0 }
      return {
        ...item,
        balances,
        hasDebt: balances.some((balance) => new Prisma.Decimal(balance.balance).gt(0)),
        ...checklist,
        openTickets: openTickets.get(item.id) ?? 0,
      }
    })
    return paginate(enriched, total, page, limit)
  }

  async findById(ctx: WorkspaceContext, id: string) {
    await ensureClientAccess(ctx, id)
    const client = await db.company.findFirst({
      where: { id, workspaceId: ctx.workspaceId, isArchived: false },
      include: {
        ...clientInclude,
        contacts: {
          where: { isArchived: false },
          include: { owner: { select: { id: true, firstName: true, lastName: true, email: true } } },
          orderBy: { firstName: 'asc' },
        },
      },
    })
    if (!client) throw new NotFoundError('Cliente', id)
    return client
  }

  async create(ctx: WorkspaceContext, input: ClientInput) {
    const data = await this.prepareInput(ctx, input, true) as Prisma.CompanyCreateInput
    return db.company.create({ data, include: clientInclude })
  }

  async update(ctx: WorkspaceContext, id: string, input: Partial<ClientInput>) {
    await ensureClientAccess(ctx, id, 'write')
    const prepared = await this.prepareInput(ctx, input, false, id)
    const ownerWasProvided = Object.prototype.hasOwnProperty.call(input, 'ownerId')
    const assignmentsWereProvided = Object.prototype.hasOwnProperty.call(input, 'assignments')

    if ((ownerWasProvided || assignmentsWereProvided) && !canManageAllClients(ctx)) {
      throw new ForbiddenError('Solo owner o admin pueden reasignar una cartera')
    }

    const updated = await db.$transaction(async (tx) => {
      const updated = await tx.company.update({
        where: { id, workspaceId: ctx.workspaceId },
        data: prepared,
        include: clientInclude,
      })
      if (ownerWasProvided) await this.syncOwner(tx, ctx.workspaceId, id, input.ownerId ?? null, ctx.userId)
      return updated
    })
    if (ownerWasProvided) await this.publishOwnerSync(ctx.workspaceId, id, input.ownerId ?? null)
    return updated
  }

  async archive(ctx: WorkspaceContext, id: string) {
    if (!canManageAllClients(ctx)) throw new ForbiddenError('Solo owner o admin pueden archivar clientes')
    const client = await db.company.findFirst({ where: { id, workspaceId: ctx.workspaceId, isArchived: false } })
    if (!client) throw new NotFoundError('Cliente', id)
    await db.$transaction([
      db.company.update({ where: { id }, data: { isArchived: true, status: 'INACTIVE' } }),
      db.recurringCharge.updateMany({
        where: { workspaceId: ctx.workspaceId, companyId: id, isActive: true },
        data: { isActive: false },
      }),
    ])
  }

  async claim(ctx: WorkspaceContext, id: string) {
    if (ctx.role === 'viewer') throw new ForbiddenError('El rol viewer no puede tomar clientes')
    await ensureClientAccess(ctx, id)
    const result = await db.company.updateMany({
      where: { id, workspaceId: ctx.workspaceId, ownerId: null, isArchived: false },
      data: { ownerId: ctx.userId },
    })
    if (result.count === 0) {
      const current = await db.company.findFirst({ where: { id, workspaceId: ctx.workspaceId }, select: { ownerId: true } })
      if (current?.ownerId !== ctx.userId) throw new ConflictError('El cliente ya fue tomado por otra persona')
    }
    await db.$transaction((tx) => this.syncOwner(tx, ctx.workspaceId, id, ctx.userId, ctx.userId))
    await this.publishOwnerSync(ctx.workspaceId, id, ctx.userId)
    return this.findById(ctx, id)
  }

  async release(ctx: WorkspaceContext, id: string) {
    if (ctx.role === 'viewer') throw new ForbiddenError('El rol viewer no puede liberar clientes')
    const current = await ensureClientAccess(ctx, id, 'write')
    if (!canManageAllClients(ctx) && current.ownerId !== ctx.userId) {
      throw new ForbiddenError('Solo podés liberar clientes bajo tu responsabilidad')
    }
    await db.$transaction(async (tx) => {
      await tx.company.update({ where: { id }, data: { ownerId: null } })
      await this.syncOwner(tx, ctx.workspaceId, id, null, ctx.userId)
    })
    await this.publishOwnerSync(ctx.workspaceId, id, null)
    return this.findById(ctx, id)
  }

  async summary(ctx: WorkspaceContext, id: string) {
    const client = await this.findById(ctx, id)
    const [receivables, recentPayments, checklists, tickets, documents, notes] = await Promise.all([
      db.receivable.groupBy({
        by: ['currency'],
        where: { workspaceId: ctx.workspaceId, companyId: id, status: { not: 'VOID' } },
        _sum: { amount: true, paidAmount: true },
        _count: true,
      }),
      db.payment.findMany({
        where: { workspaceId: ctx.workspaceId, companyId: id, voidedAt: null },
        include: { allocations: true },
        orderBy: { paidAt: 'desc' },
        take: 10,
      }),
      db.clientChecklist.findMany({
        where: { workspaceId: ctx.workspaceId, companyId: id },
        include: { template: true, items: { orderBy: { position: 'asc' } } },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        take: 20,
      }),
      db.ticket.findMany({
        where: { workspaceId: ctx.workspaceId, companyId: id },
        include: { assignedTo: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { lastMessageAt: 'desc' },
        take: 20,
      }),
      db.clientDocument.findMany({
        where: { workspaceId: ctx.workspaceId, companyId: id },
        include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      db.note.findMany({
        where: { workspaceId: ctx.workspaceId, entityType: 'client', entityId: id },
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    return {
      client,
      account: receivables.map((row) => {
        const billed = row._sum.amount ?? new Prisma.Decimal(0)
        const paid = row._sum.paidAmount ?? new Prisma.Decimal(0)
        return { currency: row.currency, billed: billed.toString(), paid: paid.toString(), balance: billed.minus(paid).toString(), count: row._count }
      }),
      recentPayments,
      checklists,
      tickets,
      contacts: client.contacts,
      documents: documents.map((document) => ({
        ...document,
        clientId: document.companyId,
        url: `/api/v1/clients/${document.companyId}/documents/${document.id}/download`,
      })),
      notes: notes.map((note) => ({ ...note, clientId: id, author: note.user })),
    }
  }

  async importRows(ctx: WorkspaceContext, rows: ClientImportRow[], commit: boolean) {
    if (!canManageAllClients(ctx)) throw new ForbiddenError('Solo owner o admin pueden importar clientes')
    if (rows.length > 2000) throw new ValidationError('La importación admite hasta 2.000 filas')

    const rucs = rows.flatMap((row) => row.ruc ? [row.ruc] : [])
    const emails = rows.flatMap((row) => row.responsibleEmail ? [row.responsibleEmail] : [])
    const [existing, members] = await Promise.all([
      rucs.length ? db.company.findMany({ where: { workspaceId: ctx.workspaceId, ruc: { in: rucs } }, select: { ruc: true } }) : [],
      db.workspaceUser.findMany({
        where: { workspaceId: ctx.workspaceId, ...(emails.length ? { user: { email: { in: emails, mode: 'insensitive' } } } : { userId: '__none__' }) },
        include: { user: { select: { id: true, email: true } } },
      }),
    ])
    const existingRucs = new Set(existing.flatMap((item) => item.ruc ? [item.ruc] : []))
    const seenRucs = new Set<string>()
    const memberByEmail = new Map(members.map((member) => [member.user.email.toLowerCase(), member.user.id]))

    const reviewed = rows.map((row) => {
      const errors = [...row.errors]
      if (row.ruc && (existingRucs.has(row.ruc) || seenRucs.has(row.ruc))) errors.push('RUC duplicado')
      if (row.ruc) seenRucs.add(row.ruc)
      if (row.responsibleEmail && !memberByEmail.has(row.responsibleEmail)) errors.push('Responsable fuera del equipo')
      return { ...row, errors }
    })
    const valid = reviewed.filter((row) => row.errors.length === 0)
    const invalid = reviewed.length - valid.length

    if (!commit) return { rows: reviewed, total: reviewed.length, valid: valid.length, invalid, committed: 0 }
    if (invalid > 0) throw new ValidationError(`Hay ${invalid} filas con errores; corregilas antes de confirmar`)

    await db.$transaction(valid.map((row) => db.company.create({
      data: {
        workspaceId: ctx.workspaceId,
        name: row.name,
        personType: row.personType,
        ruc: row.ruc,
        dv: row.dv,
        legalName: row.legalName,
        tradeName: row.tradeName,
        email: row.email,
        phone: row.phone,
        activity: row.activity,
        taxObligations: row.taxObligations,
        address: row.address,
        city: row.city,
        department: row.department,
        status: row.status,
        ownerId: row.responsibleEmail ? memberByEmail.get(row.responsibleEmail) : null,
      },
    })))
    return { rows: reviewed, total: reviewed.length, valid: valid.length, invalid: 0, committed: valid.length }
  }

  private async prepareInput(ctx: WorkspaceContext, input: Partial<ClientInput>, creating: boolean, currentId?: string): Promise<Prisma.CompanyCreateInput | Prisma.CompanyUpdateInput> {
    const ownerId = creating && ctx.role === 'member' ? ctx.userId : input.ownerId
    if (ownerId) await ensureWorkspaceUser(ctx.workspaceId, ownerId)
    if (input.assignments && !canManageAllClients(ctx)) throw new ForbiddenError('Solo owner o admin pueden administrar colaboradores')
    if (input.assignments) {
      await Promise.all(input.assignments.map((assignment) => ensureWorkspaceUser(ctx.workspaceId, assignment.userId)))
    }
    const ruc = normalizeRuc(input.ruc)
    if (ruc) {
      const duplicate = await db.company.findFirst({
        where: { workspaceId: ctx.workspaceId, ruc, isArchived: false, ...(currentId ? { id: { not: currentId } } : {}) },
        select: { id: true },
      })
      if (duplicate) throw new ConflictError('Ya existe un cliente con ese RUC')
    }

    const common: Prisma.CompanyCreateInput | Prisma.CompanyUpdateInput = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.personType !== undefined ? { personType: input.personType } : {}),
      ...(input.ruc !== undefined ? { ruc } : {}),
      ...(input.dv !== undefined ? { dv: input.dv?.replace(/\D/g, '') || null } : {}),
      ...(input.legalName !== undefined ? { legalName: input.legalName } : {}),
      ...(input.tradeName !== undefined ? { tradeName: input.tradeName } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.website !== undefined ? { website: input.website } : {}),
      ...(input.activity !== undefined ? { activity: input.activity } : {}),
      ...(input.taxObligations !== undefined ? { taxObligations: input.taxObligations } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.department !== undefined ? { department: input.department } : {}),
      ...(input.country !== undefined ? { country: input.country } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.customData !== undefined ? { customData: input.customData as Prisma.InputJsonValue } : {}),
      ...(ownerId ? { owner: { connect: { id: ownerId } } } : {}),
      ...(!creating && ownerId === null ? { owner: { disconnect: true } } : {}),
      ...(input.assignments !== undefined ? {
        assignments: creating ? {
          create: input.assignments.map((assignment) => ({
            workspaceId: ctx.workspaceId,
            area: assignment.area?.trim().toUpperCase() || 'GENERAL',
            userId: assignment.userId,
          })),
        } : {
          deleteMany: {},
          create: input.assignments.map((assignment) => ({
            workspaceId: ctx.workspaceId,
            area: assignment.area?.trim().toUpperCase() || 'GENERAL',
            userId: assignment.userId,
          })),
        },
      } : {}),
    }

    if (creating) {
      return {
        ...common,
        workspace: { connect: { id: ctx.workspaceId } },
      } as Prisma.CompanyCreateInput
    }
    return common
  }

  private async syncOwner(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    companyId: string,
    ownerId: string | null,
    actorUserId: string
  ) {
    const [contacts, tickets] = await Promise.all([
      tx.contact.findMany({
      where: { workspaceId, companyId, isArchived: false },
      select: { id: true },
      }),
      tx.ticket.findMany({
        where: { workspaceId, companyId, status: { in: ['NEW', 'OPEN', 'WAITING_CUSTOMER'] } },
        select: { id: true, assignedToUserId: true },
      }),
    ])
    const contactIds = contacts.map((contact) => contact.id)
    await Promise.all([
      tx.contact.updateMany({ where: { workspaceId, companyId, isArchived: false }, data: { ownerId } }),
      tx.deal.updateMany({ where: { workspaceId, companyId, status: 'OPEN', isArchived: false }, data: { ownerId } }),
      tx.ticket.updateMany({ where: { workspaceId, companyId, status: { in: ['NEW', 'OPEN', 'WAITING_CUSTOMER'] } }, data: { assignedToUserId: ownerId } }),
      contactIds.length
        ? tx.whatsAppChat.updateMany({ where: { workspaceId, contactId: { in: contactIds } }, data: { assignedToUserId: ownerId } })
        : Promise.resolve(),
      tx.activity.create({
        data: {
          workspaceId,
          type: 'CLIENT_OWNER_CHANGED',
          entityType: 'company',
          entityId: companyId,
          userId: actorUserId,
          title: ownerId ? 'Responsable del cliente actualizado' : 'Cliente liberado',
          metadata: { ownerId },
        },
      }),
      tickets.length
        ? tx.ticketEvent.createMany({
            data: tickets.map((ticket) => ({
              workspaceId,
              ticketId: ticket.id,
              actorUserId,
              type: 'ASSIGNED',
              fromValue: ticket.assignedToUserId,
              toValue: ownerId,
              metadata: { reason: 'client.owner_changed', companyId },
            })),
          })
        : Promise.resolve(),
    ])
  }

  private async publishOwnerSync(workspaceId: string, companyId: string, ownerId: string | null) {
    const chats = await db.whatsAppChat.findMany({
      where: { workspaceId, contact: { companyId } },
      select: { jid: true },
    })
    for (const chat of chats) {
      whatsAppRealtime.publish(workspaceId, { type: 'assignment.updated', jid: chat.jid })
      whatsAppRealtime.publish(workspaceId, { type: 'kanban.updated', jid: chat.jid })
    }
    await Promise.all([
      this.eventBus?.emit('contact.updated', { workspaceId, companyId, ownerId, reason: 'client.owner_changed' }),
      this.eventBus?.emit('ticket.updated', { workspaceId, companyId, assignedToUserId: ownerId, reason: 'client.owner_changed' }),
    ])
  }
}
