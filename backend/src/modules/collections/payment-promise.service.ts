import { Prisma, type PaymentPromiseStatus } from '@prisma/client'
import { db } from '../../core/database'
import type { EventBus } from '../../core/event-bus'
import { ForbiddenError, NotFoundError, ValidationError, type WorkspaceContext } from '../../types'
import { clientVisibilityWhere, ensureClientAccess, ensureWorkspaceUser } from '../clients/client-access'
import { currencyCode, money } from './collection.service'

export type PromiseScope = 'mine' | 'all'
export type PromiseBucket = 'today' | 'overdue' | 'upcoming' | 'closed'

export interface PaymentPromiseInput {
  companyId: string
  promisedDate: string
  amount?: string | number | null
  currency?: string
  note?: string | null
  chatId?: string | null
  assignedUserId?: string | null
}

export interface PaymentPromiseUpdate {
  promisedDate?: string
  amount?: string | number | null
  currency?: string
  note?: string | null
  status?: PaymentPromiseStatus
  assignedUserId?: string | null
}

const asuncionDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Asuncion',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Día calendario de Paraguay como `YYYY-MM-DD`. */
export function paraguayToday(now = new Date()) {
  return asuncionDay.format(now)
}

/** `YYYY-MM-DD` → fecha de una columna `@db.Date` (medianoche UTC, sin zona). */
export function parsePromiseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) throw new ValidationError('La fecha prometida debe tener el formato AAAA-MM-DD')
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new ValidationError('La fecha prometida no existe')
  }
  return date
}

/** Inversa de `parsePromiseDate`: la columna es sólo día, así que se leen las partes UTC. */
export function promiseDateKey(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export function promiseBucket(promisedDate: Date, status: PaymentPromiseStatus, today: string): PromiseBucket {
  if (status !== 'PENDING') return 'closed'
  const key = promiseDateKey(promisedDate)
  if (key === today) return 'today'
  return key < today ? 'overdue' : 'upcoming'
}

const userName = { select: { id: true, firstName: true, lastName: true, email: true } } as const

const promiseInclude = {
  company: { select: { id: true, name: true, ruc: true, dv: true, isArchived: true } },
  chat: { select: { id: true, displayName: true, phoneNumber: true } },
  assignedUser: userName,
  createdBy: userName,
  closedBy: userName,
} satisfies Prisma.PaymentPromiseInclude

type PromiseRecord = Prisma.PaymentPromiseGetPayload<{ include: typeof promiseInclude }>

const PENDING_LIMIT = 500
const CLOSED_LIMIT = 30

function isManager(ctx: WorkspaceContext) {
  return ctx.role === 'owner' || ctx.role === 'admin'
}

/** Promesas de clientes visibles y no archivados; `mine` limita a las asignadas a quien consulta. */
function promiseScopeWhere(ctx: WorkspaceContext, scope: PromiseScope, companyId?: string): Prisma.PaymentPromiseWhereInput {
  return {
    workspaceId: ctx.workspaceId,
    company: { isArchived: false, ...clientVisibilityWhere(ctx) },
    ...(scope === 'mine' ? { assignedUserId: ctx.userId } : {}),
    ...(companyId ? { companyId } : {}),
  }
}

function serialize(record: PromiseRecord, paidSince?: Prisma.Decimal) {
  return {
    ...record,
    promisedDate: promiseDateKey(record.promisedDate),
    amount: record.amount?.toString() ?? null,
    paidSince: paidSince?.toString() ?? null,
  }
}

export class PaymentPromiseService {
  constructor(private readonly eventBus?: EventBus) {}

  /** Bandeja agrupada en hoy / vencidas / próximas / cerradas según el día de Paraguay. */
  async list(ctx: WorkspaceContext, filters: { scope: PromiseScope; companyId?: string }, now = new Date()) {
    const where = promiseScopeWhere(ctx, filters.scope, filters.companyId)
    const [pending, closed] = await Promise.all([
      db.paymentPromise.findMany({
        where: { ...where, status: 'PENDING' },
        include: promiseInclude,
        orderBy: [{ promisedDate: 'asc' }, { createdAt: 'asc' }],
        take: PENDING_LIMIT,
      }),
      db.paymentPromise.findMany({
        where: { ...where, status: { not: 'PENDING' } },
        include: promiseInclude,
        orderBy: [{ updatedAt: 'desc' }],
        take: CLOSED_LIMIT,
      }),
    ])
    const paid = await this.paidSincePromise(ctx.workspaceId, pending)
    const today = paraguayToday(now)
    const groups = { today: [], overdue: [], upcoming: [], closed: [] } as Record<PromiseBucket, ReturnType<typeof serialize>[]>
    for (const record of pending) groups[promiseBucket(record.promisedDate, record.status, today)].push(serialize(record, paid.get(record.id)))
    // Las vencidas más viejas primero ya vienen del orden ascendente; las cerradas, la última tocada primero.
    groups.closed = closed.map((record) => serialize(record))
    return { date: today, ...groups }
  }

  /** Contadores para la campanita y el menú: siempre las propias de quien consulta. */
  async counts(ctx: WorkspaceContext, now = new Date()) {
    const where = { ...promiseScopeWhere(ctx, 'mine'), status: 'PENDING' as const }
    const today = parsePromiseDate(paraguayToday(now))
    const [dueToday, overdue, upcoming] = await Promise.all([
      db.paymentPromise.count({ where: { ...where, promisedDate: today } }),
      db.paymentPromise.count({ where: { ...where, promisedDate: { lt: today } } }),
      db.paymentPromise.count({ where: { ...where, promisedDate: { gt: today } } }),
    ])
    return { today: dueToday, overdue, upcoming }
  }

  async create(ctx: WorkspaceContext, input: PaymentPromiseInput, now = new Date()) {
    if (ctx.role === 'viewer') throw new ForbiddenError('El rol viewer solo puede consultar promesas de pago')
    // Agendar una promesa no toca el saldo: alcanza con ver al cliente.
    await ensureClientAccess(ctx, input.companyId)
    const promisedDate = this.futureDate(input.promisedDate, now)
    const currency = currencyCode(input.currency)
    const amount = input.amount == null || input.amount === '' ? null : money(input.amount, currency)
    const chatId = await this.validChatId(ctx, input.companyId, input.chatId)
    const assignedUserId = await this.validAssignee(ctx, input.assignedUserId ?? ctx.userId)

    const created = await db.paymentPromise.create({
      data: {
        workspaceId: ctx.workspaceId,
        companyId: input.companyId,
        chatId,
        promisedDate,
        amount,
        currency,
        note: input.note?.trim() || null,
        assignedUserId,
        createdByUserId: ctx.userId,
      },
      include: promiseInclude,
    })
    await this.emitUpdate(ctx.workspaceId, created.companyId, 'promise.created', created.id)
    return serialize(created)
  }

  async update(ctx: WorkspaceContext, id: string, input: PaymentPromiseUpdate, now = new Date()) {
    if (ctx.role === 'viewer') throw new ForbiddenError('El rol viewer solo puede consultar promesas de pago')
    const current = await db.paymentPromise.findFirst({ where: { id, ...promiseScopeWhere(ctx, 'all') } })
    if (!current) throw new NotFoundError('Promesa de pago', id)
    if (!isManager(ctx) && current.assignedUserId !== ctx.userId && current.createdByUserId !== ctx.userId) {
      throw new ForbiddenError('Solo quien tiene asignada la promesa puede modificarla')
    }

    const data: Prisma.PaymentPromiseUncheckedUpdateInput = {}
    let status = input.status
    if (input.promisedDate !== undefined) {
      data.promisedDate = this.futureDate(input.promisedDate, now)
      // Reprogramar una promesa incumplida o cerrada la vuelve a dejar pendiente.
      status ??= 'PENDING'
    }
    const currency = input.currency !== undefined ? currencyCode(input.currency) : current.currency
    if (input.currency !== undefined) data.currency = currency
    if (input.amount !== undefined) data.amount = input.amount == null || input.amount === '' ? null : money(input.amount, currency)
    else if (input.currency !== undefined && current.amount) data.amount = money(current.amount, currency)
    if (input.note !== undefined) data.note = input.note?.trim() || null
    if (input.assignedUserId !== undefined) {
      if (!isManager(ctx) && input.assignedUserId !== ctx.userId) throw new ForbiddenError('Solo el propietario o administrador puede reasignar promesas')
      data.assignedUserId = await this.validAssignee(ctx, input.assignedUserId)
    }
    if (status !== undefined && status !== current.status) {
      data.status = status
      const closing = status !== 'PENDING'
      data.closedAt = closing ? now : null
      data.closedByUserId = closing ? ctx.userId : null
    }

    const updated = await db.paymentPromise.update({ where: { id: current.id }, data, include: promiseInclude })
    await this.emitUpdate(ctx.workspaceId, updated.companyId, 'promise.updated', updated.id)
    return serialize(updated)
  }

  private futureDate(value: string, now: Date) {
    const date = parsePromiseDate(value)
    if (promiseDateKey(date) < paraguayToday(now)) throw new ValidationError('La fecha prometida no puede ser anterior a hoy')
    return date
  }

  private async validChatId(ctx: WorkspaceContext, companyId: string, chatId?: string | null) {
    if (!chatId) return null
    const chat = await db.collectionWhatsAppChat.findFirst({
      where: { id: chatId, workspaceId: ctx.workspaceId, line: 'collections' },
      select: { id: true, companyId: true },
    })
    if (!chat) throw new ValidationError('El chat no pertenece al WhatsApp de Cobranzas')
    if (chat.companyId && chat.companyId !== companyId) throw new ValidationError('El chat está vinculado a otro cliente')
    return chat.id
  }

  private async validAssignee(ctx: WorkspaceContext, userId: string | null) {
    if (!userId) return null
    if (!isManager(ctx) && userId !== ctx.userId) throw new ForbiddenError('Solo el propietario o administrador puede asignar promesas a otra persona')
    await ensureWorkspaceUser(ctx.workspaceId, userId)
    return userId
  }

  /**
   * Cuánto pagó el cliente, en la moneda de cada promesa, desde que se agendó.
   * Es sólo una pista para marcarla cumplida; no se cierra sola.
   */
  private async paidSincePromise(workspaceId: string, promises: Array<{ id: string; companyId: string; currency: string; createdAt: Date }>) {
    const result = new Map<string, Prisma.Decimal>()
    if (!promises.length) return result
    const since = promises.reduce((min, promise) => promise.createdAt < min ? promise.createdAt : min, promises[0].createdAt)
    const payments = await db.payment.findMany({
      where: {
        workspaceId,
        companyId: { in: [...new Set(promises.map((promise) => promise.companyId))] },
        voidedAt: null,
        createdAt: { gte: since },
      },
      select: { companyId: true, currency: true, amount: true, createdAt: true },
    })
    for (const promise of promises) {
      const total = payments
        .filter((payment) => payment.companyId === promise.companyId && payment.currency === promise.currency && payment.createdAt >= promise.createdAt)
        .reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0))
      if (total.gt(0)) result.set(promise.id, total)
    }
    return result
  }

  private async emitUpdate(workspaceId: string, companyId: string, action: string, entityId: string) {
    await this.eventBus?.emit('collection.updated', { workspaceId, companyId, action, entityId })
  }
}
