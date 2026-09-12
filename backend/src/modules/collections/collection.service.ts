import {
  Prisma,
  ReceivableStatus,
  RecurringChargeFrequency,
} from '@prisma/client'
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
  clientVisibilityWhere,
  ensureClientAccess,
} from '../clients/client-access'
import type { CollectionImportRow } from './collection-import'
import { calculateReceivableStatus, startOfParaguayDay } from './collection-calculations'

export interface ReceivableInput {
  companyId: string
  description: string
  amount: string | number
  currency?: string
  dueDate: Date
  periodKey?: string | null
  reference?: string | null
  externalKey?: string | null
}

export interface PaymentInput {
  companyId: string
  amount: string | number
  currency?: string
  paidAt?: Date
  method?: string | null
  reference?: string | null
  notes?: string | null
  externalKey?: string | null
  allocations?: Array<{ receivableId: string; amount: string | number }>
}

export interface RecurringChargeInput {
  companyId: string
  name: string
  description?: string | null
  amount: string | number
  currency?: string
  frequency?: RecurringChargeFrequency
  dayOfMonth?: number
  startDate: Date
  endDate?: Date | null
  isActive?: boolean
}

const money = (value: string | number | Prisma.Decimal, currency?: string) => {
  let decimal: Prisma.Decimal
  try {
    const normalized = typeof value === 'string' ? value.replace(',', '.') : value
    decimal = new Prisma.Decimal(normalized)
    if (!decimal.isFinite() || decimal.lte(0)) throw new Error()
  } catch {
    throw new ValidationError('El monto debe ser mayor a cero')
  }
  if (currency?.toUpperCase() === 'PYG' && !decimal.isInteger()) {
    throw new ValidationError('Los montos en PYG deben expresarse en guaraníes enteros')
  }
  return decimal
}

const currencyCode = (value = 'PYG') => {
  const currency = value.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) throw new ValidationError('La moneda debe ser un código ISO de tres letras')
  return currency
}

async function serializableTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034'
      if (!retryable) throw error
      if (attempt === 2) throw new ConflictError('Otra cobranza modificó el saldo al mismo tiempo; reintentá')
    }
  }
  throw new ConflictError('No se pudo confirmar la cobranza')
}

const paraguayDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Asuncion',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function csvCell(value: unknown) {
  let text = value == null ? '' : String(value)
  text = text.replace(/[\r\n]+/g, ' ')
  if (/^[=+\-@]/.test(text.trimStart())) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export class CollectionService {
  constructor(private readonly eventBus?: EventBus) {}

  async listReceivables(
    ctx: WorkspaceContext,
    filters: { companyId?: string; status?: ReceivableStatus; currency?: string; page: number; limit: number }
  ) {
    await this.refreshOverdue(ctx.workspaceId)
    const where: Prisma.ReceivableWhereInput = {
      workspaceId: ctx.workspaceId,
      company: clientVisibilityWhere(ctx),
      ...(filters.companyId ? { companyId: filters.companyId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.currency ? { currency: currencyCode(filters.currency) } : {}),
    }
    const [items, total] = await Promise.all([
      db.receivable.findMany({
        where,
        include: {
          company: { select: { id: true, name: true, ruc: true, dv: true, ownerId: true } },
          allocations: { include: { payment: true } },
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        skip: filters.page * filters.limit,
        take: filters.limit,
      }),
      db.receivable.count({ where }),
    ])
    return paginate(items.map((item) => ({
      ...item,
      outstanding: item.amount.minus(item.paidAmount).toString(),
    })), total, filters.page, filters.limit)
  }

  async exportReceivables(
    ctx: WorkspaceContext,
    filters: { companyId?: string; status?: ReceivableStatus; currency?: string }
  ) {
    await this.refreshOverdue(ctx.workspaceId)
    const rows = await db.receivable.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        company: clientVisibilityWhere(ctx),
        ...(filters.companyId ? { companyId: filters.companyId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.currency ? { currency: currencyCode(filters.currency) } : {}),
      },
      select: {
        description: true,
        amount: true,
        paidAmount: true,
        currency: true,
        dueDate: true,
        status: true,
        periodKey: true,
        reference: true,
        company: {
          select: {
            name: true,
            ruc: true,
            dv: true,
            owner: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { company: { name: 'asc' } }],
    })
    const headers = [
      'Cliente', 'RUC', 'DV', 'Responsable', 'Concepto', 'Importe', 'Pagado',
      'Saldo', 'Moneda', 'Vencimiento', 'Estado', 'Periodo', 'Referencia',
    ]
    const lines = rows.map((row) => {
      const owner = row.company.owner
        ? `${row.company.owner.firstName}${row.company.owner.lastName ? ` ${row.company.owner.lastName}` : ''}`
        : ''
      return [
        row.company.name,
        row.company.ruc,
        row.company.dv,
        owner,
        row.description,
        row.amount.toString(),
        row.paidAmount.toString(),
        row.amount.minus(row.paidAmount).toString(),
        row.currency,
        paraguayDate.format(row.dueDate),
        row.status,
        row.periodKey,
        row.reference,
      ].map(csvCell).join(',')
    })
    return `\uFEFF${headers.map(csvCell).join(',')}\r\n${lines.join('\r\n')}\r\n`
  }

  async createReceivable(ctx: WorkspaceContext, input: ReceivableInput) {
    await this.ensureFinancialWrite(ctx, input.companyId)
    const currency = currencyCode(input.currency)
    const amount = money(input.amount, currency)
    const receivable = await db.receivable.create({
      data: {
        workspaceId: ctx.workspaceId,
        companyId: input.companyId,
        description: input.description,
        amount,
        currency,
        dueDate: input.dueDate,
        status: calculateReceivableStatus(amount, new Prisma.Decimal(0), input.dueDate),
        periodKey: input.periodKey,
        reference: input.reference,
        externalKey: input.externalKey,
        createdByUserId: ctx.userId,
      },
      include: { company: { select: { id: true, name: true, ruc: true, dv: true } } },
    })
    await this.emitUpdate(ctx.workspaceId, input.companyId, 'receivable.created', receivable.id)
    return receivable
  }

  async updateReceivable(
    ctx: WorkspaceContext,
    id: string,
    input: { description?: string; amount?: string | number; dueDate?: Date; status?: ReceivableStatus; reference?: string | null }
  ) {
    const receivable = await db.receivable.findFirst({ where: { id, workspaceId: ctx.workspaceId } })
    if (!receivable) throw new NotFoundError('Cuenta por cobrar', id)
    const amount = input.amount !== undefined ? money(input.amount, receivable.currency) : receivable.amount
    if (amount.lt(receivable.paidAmount)) throw new ValidationError('El monto no puede ser menor a lo ya cobrado')
    if (input.status === 'VOID' && receivable.paidAmount.gt(0)) {
      throw new ValidationError('Anulá primero los pagos aplicados antes de anular el cargo')
    }
    const dueDate = input.dueDate ?? receivable.dueDate
    const voided = input.status === 'VOID' || receivable.status === 'VOID'
    const status = input.status === 'VOID'
      ? 'VOID'
      : calculateReceivableStatus(amount, receivable.paidAmount, dueDate, voided)
    const updated = await db.receivable.update({
      where: { id },
      data: {
        ...(input.description !== undefined ? { description: input.description } : {}),
        amount,
        dueDate,
        status,
        ...(input.reference !== undefined ? { reference: input.reference } : {}),
        voidedAt: status === 'VOID' ? receivable.voidedAt ?? new Date() : null,
      },
    })
    await this.emitUpdate(ctx.workspaceId, receivable.companyId, 'receivable.updated', id)
    return updated
  }

  async listPayments(
    ctx: WorkspaceContext,
    filters: { companyId?: string; currency?: string; includeVoided?: boolean; page: number; limit: number }
  ) {
    const where: Prisma.PaymentWhereInput = {
      workspaceId: ctx.workspaceId,
      company: clientVisibilityWhere(ctx),
      ...(filters.companyId ? { companyId: filters.companyId } : {}),
      ...(filters.currency ? { currency: currencyCode(filters.currency) } : {}),
      ...(!filters.includeVoided ? { voidedAt: null } : {}),
    }
    const [items, total] = await Promise.all([
      db.payment.findMany({
        where,
        include: {
          company: { select: { id: true, name: true, ruc: true, dv: true } },
          allocations: { include: { receivable: { select: { id: true, description: true, dueDate: true } } } },
        },
        orderBy: { paidAt: 'desc' },
        skip: filters.page * filters.limit,
        take: filters.limit,
      }),
      db.payment.count({ where }),
    ])
    return paginate(items, total, filters.page, filters.limit)
  }

  async createPayment(ctx: WorkspaceContext, input: PaymentInput) {
    await this.ensureFinancialWrite(ctx, input.companyId)
    const currency = currencyCode(input.currency)
    const amount = money(input.amount, currency)

    const payment = await serializableTransaction(async (tx) => {
      let requested = input.allocations?.map((allocation) => ({
        receivableId: allocation.receivableId,
        amount: money(allocation.amount, currency),
      }))

      if (!requested?.length) {
        const open = await tx.receivable.findMany({
          where: {
            workspaceId: ctx.workspaceId,
            companyId: input.companyId,
            currency,
            status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
          },
          orderBy: { dueDate: 'asc' },
        })
        let remaining = amount
        requested = []
        for (const receivable of open) {
          if (remaining.lte(0)) break
          const outstanding = receivable.amount.minus(receivable.paidAmount)
          const allocated = Prisma.Decimal.min(remaining, outstanding)
          if (allocated.gt(0)) requested.push({ receivableId: receivable.id, amount: allocated })
          remaining = remaining.minus(allocated)
        }
      }

      const allocatedTotal = requested.reduce((sum, allocation) => sum.plus(allocation.amount), new Prisma.Decimal(0))
      if (allocatedTotal.gt(amount)) throw new ValidationError('Las aplicaciones superan el monto del pago')
      if (!allocatedTotal.eq(amount)) {
        throw new ValidationError('El pago debe aplicarse completamente; no se admiten créditos sin asignar')
      }

      const receivableIds = requested.map((allocation) => allocation.receivableId)
      if (new Set(receivableIds).size !== receivableIds.length) throw new ValidationError('No repitas una cuenta por cobrar')
      const receivables = receivableIds.length
        ? await tx.receivable.findMany({ where: { id: { in: receivableIds }, workspaceId: ctx.workspaceId, companyId: input.companyId } })
        : []
      if (receivables.length !== receivableIds.length) throw new ValidationError('Una cuenta por cobrar no pertenece al cliente')
      const byId = new Map(receivables.map((receivable) => [receivable.id, receivable]))

      const created = await tx.payment.create({
        data: {
          workspaceId: ctx.workspaceId,
          companyId: input.companyId,
          externalKey: input.externalKey,
          amount,
          currency,
          paidAt: input.paidAt ?? new Date(),
          method: input.method,
          reference: input.reference,
          notes: input.notes,
          createdByUserId: ctx.userId,
        },
      })

      for (const allocation of requested) {
        const receivable = byId.get(allocation.receivableId)!
        if (receivable.currency !== currency) throw new ValidationError('Pago y cuenta por cobrar deben usar la misma moneda')
        if (receivable.status === 'VOID') throw new ValidationError('No se puede aplicar un pago a un cargo anulado')
        const paidAmount = receivable.paidAmount.plus(allocation.amount)
        if (paidAmount.gt(receivable.amount)) throw new ValidationError('La aplicación supera el saldo de una cuenta por cobrar')
        await tx.paymentAllocation.create({ data: { paymentId: created.id, receivableId: receivable.id, amount: allocation.amount } })
        await tx.receivable.update({
          where: { id: receivable.id },
          data: { paidAmount, status: calculateReceivableStatus(receivable.amount, paidAmount, receivable.dueDate) },
        })
      }

      return tx.payment.findUniqueOrThrow({
        where: { id: created.id },
        include: { allocations: { include: { receivable: true } }, company: { select: { id: true, name: true, ruc: true } } },
      })
    })

    await this.emitUpdate(ctx.workspaceId, input.companyId, 'payment.created', payment.id)
    return payment
  }

  async voidPayment(ctx: WorkspaceContext, id: string) {
    return this.setPaymentStatus(ctx, id, 'VOID')
  }

  async setPaymentStatus(ctx: WorkspaceContext, id: string, status: 'RECEIVED' | 'VOID') {
    if (!['owner', 'admin'].includes(ctx.role)) throw new ForbiddenError('Solo el propietario o administrador puede cambiar pagos')
    const voiding = status === 'VOID'
    let companyId: string | null = null
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "payments" WHERE id = ${id} AND "workspaceId" = ${ctx.workspaceId} FOR UPDATE`
      const payment = await tx.payment.findFirst({
        where: { id, workspaceId: ctx.workspaceId },
        include: { allocations: true },
      })
      if (!payment) throw new NotFoundError('Pago', id)
      companyId = payment.companyId
      await ensureClientAccess(ctx, payment.companyId, 'write')
      if (Boolean(payment.voidedAt) === voiding) return

      const receivableIds = [...new Set(payment.allocations.map((allocation) => allocation.receivableId))].sort()
      if (receivableIds.length) {
        await tx.$queryRaw`SELECT id FROM "receivables" WHERE id IN (${Prisma.join(receivableIds)}) ORDER BY id FOR UPDATE`
      }
      const receivables = await tx.receivable.findMany({
        where: { id: { in: receivableIds }, workspaceId: ctx.workspaceId, companyId: payment.companyId },
      })
      const byId = new Map(receivables.map((receivable) => [receivable.id, receivable]))

      for (const allocation of payment.allocations) {
        const receivable = byId.get(allocation.receivableId)
        if (!receivable) throw new ConflictError('La cuenta aplicada ya no está disponible')
        if (receivable.currency !== payment.currency) throw new ConflictError('Pago y cargo deben usar la misma moneda')
        if (!voiding && receivable.status === 'VOID') throw new ValidationError('No se puede restaurar un pago de un cargo anulado')
        const paidAmount = voiding ? receivable.paidAmount.minus(allocation.amount) : receivable.paidAmount.plus(allocation.amount)
        if (paidAmount.lt(0) || paidAmount.gt(receivable.amount)) throw new ConflictError('El saldo cambió. No se puede aplicar este cambio de estado')
        await tx.receivable.update({
          where: { id: receivable.id },
          data: { paidAmount, status: calculateReceivableStatus(receivable.amount, paidAmount, receivable.dueDate) },
        })
      }
      await tx.payment.update({ where: { id: payment.id }, data: { voidedAt: voiding ? new Date() : null } })
    })
    await this.emitUpdate(ctx.workspaceId, companyId!, voiding ? 'payment.voided' : 'payment.restored', id)
  }

  async summary(ctx: WorkspaceContext) {
    await this.refreshOverdue(ctx.workspaceId)
    const clientScope = clientVisibilityWhere(ctx)
    const [receivables, payments, overdueCount] = await Promise.all([
      db.receivable.groupBy({
        by: ['currency'],
        where: { workspaceId: ctx.workspaceId, company: clientScope, status: { not: 'VOID' } },
        _sum: { amount: true, paidAmount: true },
        _count: true,
      }),
      db.payment.groupBy({
        by: ['currency'],
        where: { workspaceId: ctx.workspaceId, company: clientScope, voidedAt: null },
        _sum: { amount: true },
        _count: true,
      }),
      db.receivable.count({ where: { workspaceId: ctx.workspaceId, company: clientScope, status: 'OVERDUE' } }),
    ])
    const paidByCurrency = new Map(payments.map((row) => [row.currency, row]))
    return {
      currencies: receivables.map((row) => {
        const billed = row._sum.amount ?? new Prisma.Decimal(0)
        const applied = row._sum.paidAmount ?? new Prisma.Decimal(0)
        const paymentRow = paidByCurrency.get(row.currency)
        return {
          currency: row.currency,
          billed: billed.toString(),
          applied: applied.toString(),
          outstanding: billed.minus(applied).toString(),
          received: (paymentRow?._sum.amount ?? new Prisma.Decimal(0)).toString(),
          receivableCount: row._count,
          paymentCount: paymentRow?._count ?? 0,
        }
      }),
      overdueCount,
    }
  }

  async listRecurring(ctx: WorkspaceContext, page: number, limit: number, companyId?: string) {
    const where: Prisma.RecurringChargeWhereInput = {
      workspaceId: ctx.workspaceId,
      company: clientVisibilityWhere(ctx),
      ...(companyId ? { companyId } : {}),
    }
    const [items, total] = await Promise.all([
      db.recurringCharge.findMany({
        where,
        include: { company: { select: { id: true, name: true, ruc: true } } },
        orderBy: { createdAt: 'desc' },
        skip: page * limit,
        take: limit,
      }),
      db.recurringCharge.count({ where }),
    ])
    return paginate(items, total, page, limit)
  }

  async createRecurring(ctx: WorkspaceContext, input: RecurringChargeInput) {
    await ensureClientAccess(ctx, input.companyId, 'write')
    const currency = currencyCode(input.currency)
    return db.recurringCharge.create({
      data: {
        workspaceId: ctx.workspaceId,
        companyId: input.companyId,
        name: input.name,
        description: input.description,
        amount: money(input.amount, currency),
        currency,
        frequency: input.frequency ?? 'MONTHLY',
        dayOfMonth: input.dayOfMonth ?? 1,
        startDate: input.startDate,
        endDate: input.endDate,
        isActive: input.isActive ?? true,
      },
    })
  }

  async updateRecurring(ctx: WorkspaceContext, id: string, input: Partial<RecurringChargeInput>) {
    const existing = await db.recurringCharge.findFirst({ where: { id, workspaceId: ctx.workspaceId } })
    if (!existing) throw new NotFoundError('Plan recurrente', id)
    if (input.companyId) await ensureClientAccess(ctx, input.companyId, 'write')
    const nextCurrency = currencyCode(input.currency ?? existing.currency)
    const nextAmount = money(input.amount ?? existing.amount, nextCurrency)
    return db.recurringCharge.update({
      where: { id },
      data: {
        ...(input.companyId !== undefined ? { companyId: input.companyId } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.amount !== undefined || input.currency !== undefined ? { amount: nextAmount } : {}),
        ...(input.currency !== undefined ? { currency: nextCurrency } : {}),
        ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
        ...(input.dayOfMonth !== undefined ? { dayOfMonth: input.dayOfMonth } : {}),
        ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    })
  }

  async generateRecurring(ctx: WorkspaceContext, periodKey: string) {
    const match = /^(\d{4})-(\d{2})$/.exec(periodKey)
    if (!match) throw new ValidationError('El período debe usar formato YYYY-MM')
    const year = Number(match[1])
    const monthIndex = Number(match[2]) - 1
    if (monthIndex < 0 || monthIndex > 11) throw new ValidationError('Período inválido')
    const periodStart = new Date(Date.UTC(year, monthIndex, 1, 0))
    const periodEnd = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59))
    const charges = await db.recurringCharge.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        isActive: true,
        company: { isArchived: false, status: 'ACTIVE' },
        startDate: { lte: periodEnd },
        OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
      },
    })
    const applicable = charges.filter((charge) => {
      const start = charge.startDate
      const months = (year - start.getUTCFullYear()) * 12 + (monthIndex - start.getUTCMonth())
      if (months < 0) return false
      return charge.frequency === 'MONTHLY'
        || (charge.frequency === 'QUARTERLY' && months % 3 === 0)
        || (charge.frequency === 'YEARLY' && months % 12 === 0)
    })

    let generated = 0
    for (const charge of applicable) {
      const dueDate = new Date(Date.UTC(year, monthIndex, charge.dayOfMonth, 12))
      try {
        await db.receivable.create({
          data: {
            workspaceId: ctx.workspaceId,
            companyId: charge.companyId,
            recurringChargeId: charge.id,
            description: charge.name,
            amount: charge.amount,
            currency: charge.currency,
            periodKey,
            dueDate,
            status: calculateReceivableStatus(charge.amount, new Prisma.Decimal(0), dueDate),
          },
        })
        generated += 1
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error
      }
    }
    await this.eventBus?.emit('collection.updated', { workspaceId: ctx.workspaceId, action: 'recurring.generated', periodKey, generated })
    return { periodKey, candidates: applicable.length, generated, skipped: applicable.length - generated }
  }

  async importRows(ctx: WorkspaceContext, rows: CollectionImportRow[], commit: boolean) {
    if (rows.length > 5000) throw new ValidationError('La importación admite hasta 5.000 filas')
    const rucs = [...new Set(rows.flatMap((row) => row.ruc ? [row.ruc] : []))]
    const receivableKeys = rows.filter((row) => row.type === 'RECEIVABLE').map((row) => row.externalKey)
    const paymentKeys = rows.filter((row) => row.type === 'PAYMENT').map((row) => row.externalKey)
    const [clients, existingReceivables, existingPayments] = await Promise.all([
      db.company.findMany({ where: { workspaceId: ctx.workspaceId, ruc: { in: rucs }, isArchived: false }, select: { id: true, ruc: true } }),
      db.receivable.findMany({ where: { workspaceId: ctx.workspaceId, externalKey: { in: receivableKeys } }, select: { externalKey: true } }),
      db.payment.findMany({ where: { workspaceId: ctx.workspaceId, externalKey: { in: paymentKeys } }, select: { externalKey: true } }),
    ])
    const clientByRuc = new Map(clients.flatMap((client) => client.ruc ? [[client.ruc, client.id] as const] : []))
    const existingReceivableKeys = new Set(existingReceivables.flatMap((row) => row.externalKey ? [row.externalKey] : []))
    const existingPaymentKeys = new Set(existingPayments.flatMap((row) => row.externalKey ? [row.externalKey] : []))
    const seenReceivableKeys = new Set<string>()
    const seenPaymentKeys = new Set<string>()
    let reviewed = rows.map((row) => {
      const errors = [...row.errors]
      if (row.ruc && !clientByRuc.has(row.ruc)) errors.push('No existe un cliente activo con ese RUC')
      const existingKeys = row.type === 'PAYMENT' ? existingPaymentKeys : existingReceivableKeys
      const seenKeys = row.type === 'PAYMENT' ? seenPaymentKeys : seenReceivableKeys
      if (existingKeys.has(row.externalKey) || seenKeys.has(row.externalKey)) errors.push('Movimiento duplicado')
      seenKeys.add(row.externalKey)
      return { ...row, companyId: row.ruc ? clientByRuc.get(row.ruc) : undefined, errors }
    })

    const clientIds = clients.map((client) => client.id)
    const openReceivables = await db.receivable.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        companyId: { in: clientIds },
        status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
      },
      select: { companyId: true, currency: true, amount: true, paidAmount: true },
    })
    const capacity = new Map<string, Prisma.Decimal>()
    const capacityKey = (companyId: string, currency: string) => `${companyId}:${currency}`
    for (const receivable of openReceivables) {
      const key = capacityKey(receivable.companyId, receivable.currency)
      capacity.set(key, (capacity.get(key) ?? new Prisma.Decimal(0)).plus(receivable.amount.minus(receivable.paidAmount)))
    }
    for (const row of reviewed) {
      if (row.type !== 'RECEIVABLE' || row.errors.length || !row.companyId || !row.amount) continue
      const key = capacityKey(row.companyId, row.currency)
      capacity.set(key, (capacity.get(key) ?? new Prisma.Decimal(0)).plus(row.amount))
    }
    reviewed = reviewed.map((row) => {
      if (row.type !== 'PAYMENT' || row.errors.length || !row.companyId || !row.amount) return row
      const key = capacityKey(row.companyId, row.currency)
      const available = capacity.get(key) ?? new Prisma.Decimal(0)
      const amount = new Prisma.Decimal(row.amount)
      if (available.lt(amount)) return { ...row, errors: [...row.errors, 'El pago supera el saldo abierto en esa moneda'] }
      capacity.set(key, available.minus(amount))
      return row
    })

    const valid = reviewed.filter((row) => row.errors.length === 0 && row.companyId && row.amount && row.dueDate)
    const invalid = reviewed.length - valid.length
    if (!commit) return { rows: reviewed, total: reviewed.length, valid: valid.length, invalid, committed: 0 }
    if (invalid > 0) throw new ValidationError(`Hay ${invalid} filas con errores; corregilas antes de confirmar`)

    const receivableRows = valid.filter((row) => row.type === 'RECEIVABLE')
    const paymentRows = valid.filter((row) => row.type === 'PAYMENT')
    await serializableTransaction(async (tx) => {
      for (const row of receivableRows) {
        const amount = new Prisma.Decimal(row.amount!)
        await tx.receivable.create({
          data: {
            workspaceId: ctx.workspaceId,
            companyId: row.companyId!,
            description: row.description,
            amount,
            currency: row.currency,
            dueDate: row.dueDate!,
            status: calculateReceivableStatus(amount, new Prisma.Decimal(0), row.dueDate!),
            reference: row.reference,
            externalKey: row.externalKey,
            createdByUserId: ctx.userId,
          },
        })
      }

      for (const row of paymentRows) {
        const amount = new Prisma.Decimal(row.amount!)
        const open = await tx.receivable.findMany({
          where: {
            workspaceId: ctx.workspaceId,
            companyId: row.companyId!,
            currency: row.currency,
            status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
          },
          orderBy: { dueDate: 'asc' },
        })
        let remaining = amount
        const allocations: Array<{ receivable: typeof open[number]; amount: Prisma.Decimal }> = []
        for (const receivable of open) {
          if (remaining.lte(0)) break
          const outstanding = receivable.amount.minus(receivable.paidAmount)
          const applied = Prisma.Decimal.min(remaining, outstanding)
          if (applied.gt(0)) allocations.push({ receivable, amount: applied })
          remaining = remaining.minus(applied)
        }
        if (!remaining.eq(0)) throw new ValidationError('Un pago importado supera el saldo abierto')

        const payment = await tx.payment.create({
          data: {
            workspaceId: ctx.workspaceId,
            companyId: row.companyId!,
            externalKey: row.externalKey,
            amount,
            currency: row.currency,
            paidAt: row.dueDate!,
            method: row.method,
            reference: row.reference,
            notes: row.notes,
            createdByUserId: ctx.userId,
          },
        })
        for (const allocation of allocations) {
          const paidAmount = allocation.receivable.paidAmount.plus(allocation.amount)
          await tx.paymentAllocation.create({
            data: { paymentId: payment.id, receivableId: allocation.receivable.id, amount: allocation.amount },
          })
          await tx.receivable.update({
            where: { id: allocation.receivable.id },
            data: {
              paidAmount,
              status: calculateReceivableStatus(allocation.receivable.amount, paidAmount, allocation.receivable.dueDate),
            },
          })
        }
      }
    })
    await this.eventBus?.emit('collection.updated', {
      workspaceId: ctx.workspaceId,
      action: 'movements.imported',
      receivables: receivableRows.length,
      payments: paymentRows.length,
    })
    return {
      rows: reviewed,
      total: reviewed.length,
      valid: valid.length,
      invalid: 0,
      committed: valid.length,
      receivablesCommitted: receivableRows.length,
      paymentsCommitted: paymentRows.length,
    }
  }

  private async ensureFinancialWrite(ctx: WorkspaceContext, companyId: string) {
    const client = await ensureClientAccess(ctx, companyId, 'write')
    if (ctx.role === 'owner' || ctx.role === 'admin' || client.ownerId === ctx.userId) return client
    const assignment = await db.clientAssignment.findFirst({
      where: { workspaceId: ctx.workspaceId, companyId, userId: ctx.userId },
      select: { id: true },
    })
    if (!assignment) throw new ForbiddenError('Tomá el cliente antes de registrar movimientos')
    return client
  }

  private async refreshOverdue(workspaceId: string) {
    await db.receivable.updateMany({
      where: {
        workspaceId,
        status: { in: ['PENDING', 'PARTIAL'] },
        dueDate: { lt: startOfParaguayDay() },
      },
      data: { status: 'OVERDUE' },
    })
  }

  private async emitUpdate(workspaceId: string, companyId: string, action: string, entityId: string) {
    await this.eventBus?.emit('collection.updated', { workspaceId, companyId, action, entityId })
  }
}
