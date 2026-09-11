import { Prisma, SaleStatus } from '@prisma/client'
import { db } from '../../core/database'
import type { EventBus } from '../../core/event-bus'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  paginate,
  type WorkspaceContext,
} from '../../types'
import { clientVisibilityWhere, ensureClientAccess } from '../clients/client-access'
import { calculateSaleTotals, type SaleItemInput } from './sale-calculations'

export interface SaleInput {
  companyId: string
  soldAt?: Date
  currency?: string
  discount?: string | number | null
  taxAmount?: string | number | null
  reference?: string | null
  notes?: string | null
  items: SaleItemInput[]
}

export interface SaleFilters {
  companyId?: string
  status?: SaleStatus
  currency?: string
  from?: Date
  to?: Date
  page: number
  limit: number
}

const SALE_INCLUDE = {
  company: { select: { id: true, name: true, ruc: true, tradeName: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  items: { orderBy: { position: 'asc' } },
} satisfies Prisma.SaleInclude

export class SaleService {
  constructor(private readonly eventBus?: EventBus) {}

  /** Restringe siempre por workspace y por la cartera de clientes visible para el rol. */
  private scope(ctx: WorkspaceContext, filters?: Partial<SaleFilters>): Prisma.SaleWhereInput {
    const where: Prisma.SaleWhereInput = {
      workspaceId: ctx.workspaceId,
      company: { isArchived: false, ...clientVisibilityWhere(ctx) },
    }
    if (filters?.companyId) where.companyId = filters.companyId
    if (filters?.status) where.status = filters.status
    if (filters?.currency) where.currency = filters.currency.toUpperCase()
    if (filters?.from || filters?.to) {
      where.soldAt = {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      }
    }
    return where
  }

  async list(ctx: WorkspaceContext, filters: SaleFilters) {
    const where = this.scope(ctx, filters)
    const [items, total] = await Promise.all([
      db.sale.findMany({
        where,
        include: SALE_INCLUDE,
        orderBy: [{ soldAt: 'desc' }, { number: 'desc' }],
        skip: filters.page * filters.limit,
        take: filters.limit,
      }),
      db.sale.count({ where }),
    ])
    return paginate(items, total, filters.page, filters.limit)
  }

  async get(ctx: WorkspaceContext, id: string) {
    const sale = await db.sale.findFirst({ where: { id, ...this.scope(ctx) }, include: SALE_INCLUDE })
    if (!sale) throw new NotFoundError('Venta', id)
    return sale
  }

  /** Totales por moneda, contando solo las ventas confirmadas. */
  async summary(ctx: WorkspaceContext, filters?: { from?: Date; to?: Date }) {
    const where = this.scope(ctx, { ...filters, status: SaleStatus.CONFIRMED })
    const [grouped, draftCount] = await Promise.all([
      db.sale.groupBy({
        by: ['currency'],
        where,
        _sum: { total: true },
        _count: { _all: true },
      }),
      db.sale.count({ where: this.scope(ctx, { ...filters, status: SaleStatus.DRAFT }) }),
    ])

    return {
      draftCount,
      currencies: grouped.map((row) => ({
        currency: row.currency,
        confirmedCount: row._count._all,
        confirmedTotal: (row._sum.total ?? new Prisma.Decimal(0)).toString(),
      })),
    }
  }

  private assertWritable(ctx: WorkspaceContext) {
    if (ctx.role === 'viewer') throw new ForbiddenError('El rol viewer solo puede consultar ventas')
  }

  private itemsPayload(workspaceId: string, items: ReturnType<typeof calculateSaleTotals>['items']) {
    return items.map((item) => ({
      workspaceId,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
      position: item.position,
    }))
  }

  async create(ctx: WorkspaceContext, input: SaleInput) {
    this.assertWritable(ctx)
    await ensureClientAccess(ctx, input.companyId, 'write')
    const totals = calculateSaleTotals(input)

    const sale = await this.createWithNextNumber(ctx, async (number) => db.sale.create({
      data: {
        workspaceId: ctx.workspaceId,
        companyId: input.companyId,
        number,
        soldAt: input.soldAt ?? new Date(),
        currency: totals.currency,
        subtotal: totals.subtotal,
        discount: totals.discount,
        taxAmount: totals.taxAmount,
        total: totals.total,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        createdByUserId: ctx.userId,
        items: { create: this.itemsPayload(ctx.workspaceId, totals.items) },
      },
      include: SALE_INCLUDE,
    }))

    await this.eventBus?.emit('sale.created', {
      workspaceId: ctx.workspaceId,
      saleId: sale.id,
      total: sale.total.toString(),
    })
    return sale
  }

  /**
   * La numeracion es correlativa por workspace. El indice unico cubre la
   * carrera entre dos cargas simultaneas: si choca, se reintenta con el
   * siguiente numero libre.
   */
  private async createWithNextNumber<T>(ctx: WorkspaceContext, create: (number: number) => Promise<T>) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const last = await db.sale.findFirst({
        where: { workspaceId: ctx.workspaceId },
        orderBy: { number: 'desc' },
        select: { number: true },
      })
      try {
        return await create((last?.number ?? 0) + 1 + attempt)
      } catch (error) {
        const isDuplicate = error instanceof Prisma.PrismaClientKnownRequestError
          && error.code === 'P2002'
          && String(error.meta?.target ?? '').includes('number')
        if (!isDuplicate) throw error
      }
    }
    throw new ConflictError('No se pudo asignar un numero de venta; reintenta')
  }

  async update(ctx: WorkspaceContext, id: string, input: Partial<SaleInput>) {
    this.assertWritable(ctx)
    const sale = await this.get(ctx, id)
    if (sale.status !== SaleStatus.DRAFT) {
      throw new ConflictError('Solo se puede editar una venta en borrador')
    }
    await ensureClientAccess(ctx, sale.companyId, 'write')
    if (input.companyId && input.companyId !== sale.companyId) {
      await ensureClientAccess(ctx, input.companyId, 'write')
    }

    const items = input.items ?? sale.items.map((item) => ({
      description: item.description,
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
    }))
    const totals = calculateSaleTotals({
      items,
      currency: input.currency ?? sale.currency,
      discount: input.discount ?? sale.discount.toString(),
      taxAmount: input.taxAmount ?? sale.taxAmount.toString(),
    })

    return db.$transaction(async (tx) => {
      await tx.saleItem.deleteMany({ where: { saleId: sale.id } })
      return tx.sale.update({
        where: { id: sale.id },
        data: {
          companyId: input.companyId ?? sale.companyId,
          soldAt: input.soldAt ?? sale.soldAt,
          currency: totals.currency,
          subtotal: totals.subtotal,
          discount: totals.discount,
          taxAmount: totals.taxAmount,
          total: totals.total,
          reference: input.reference === undefined ? sale.reference : input.reference,
          notes: input.notes === undefined ? sale.notes : input.notes,
          items: { create: this.itemsPayload(ctx.workspaceId, totals.items) },
        },
        include: SALE_INCLUDE,
      })
    })
  }

  async confirm(ctx: WorkspaceContext, id: string) {
    this.assertWritable(ctx)
    const sale = await this.get(ctx, id)
    if (sale.status === SaleStatus.CANCELLED) throw new ConflictError('La venta esta anulada')
    if (sale.status === SaleStatus.CONFIRMED) return sale
    await ensureClientAccess(ctx, sale.companyId, 'write')

    const confirmed = await db.sale.update({
      where: { id: sale.id },
      data: { status: SaleStatus.CONFIRMED, confirmedAt: new Date() },
      include: SALE_INCLUDE,
    })
    await this.eventBus?.emit('sale.confirmed', {
      workspaceId: ctx.workspaceId,
      saleId: sale.id,
      total: confirmed.total.toString(),
    })
    return confirmed
  }

  /** Las ventas confirmadas no se borran: se anulan, para no romper la trazabilidad. */
  async cancel(ctx: WorkspaceContext, id: string, reason?: string | null) {
    if (ctx.role !== 'owner' && ctx.role !== 'admin') {
      throw new ForbiddenError('Solo un owner o admin puede anular ventas')
    }
    const sale = await this.get(ctx, id)
    if (sale.status === SaleStatus.CANCELLED) return sale

    const previousNotes = sale.notes ? sale.notes + '\n' : ''
    const cancelled = await db.sale.update({
      where: { id: sale.id },
      data: {
        status: SaleStatus.CANCELLED,
        cancelledAt: new Date(),
        notes: reason ? previousNotes + 'Anulada: ' + reason : sale.notes,
      },
      include: SALE_INCLUDE,
    })
    await this.eventBus?.emit('sale.cancelled', { workspaceId: ctx.workspaceId, saleId: sale.id })
    return cancelled
  }

  async remove(ctx: WorkspaceContext, id: string) {
    if (ctx.role !== 'owner' && ctx.role !== 'admin') {
      throw new ForbiddenError('Solo un owner o admin puede eliminar ventas')
    }
    const sale = await this.get(ctx, id)
    if (sale.status !== SaleStatus.DRAFT) {
      throw new ConflictError('Solo se puede eliminar una venta en borrador; usa anular')
    }
    await db.sale.delete({ where: { id: sale.id } })
    return { id: sale.id }
  }

  async exportCsv(ctx: WorkspaceContext, filters: Omit<SaleFilters, 'page' | 'limit'>) {
    const sales = await db.sale.findMany({
      where: this.scope(ctx, filters),
      include: SALE_INCLUDE,
      orderBy: [{ soldAt: 'desc' }, { number: 'desc' }],
      take: 5000,
    })
    const escape = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"'
    const header = ['Numero', 'Fecha', 'Cliente', 'RUC', 'Estado', 'Moneda', 'Subtotal', 'Descuento', 'Impuesto', 'Total', 'Referencia']
    const rows = sales.map((sale) => [
      sale.number,
      sale.soldAt.toISOString().slice(0, 10),
      sale.company.name,
      sale.company.ruc ?? '',
      sale.status,
      sale.currency,
      sale.subtotal.toString(),
      sale.discount.toString(),
      sale.taxAmount.toString(),
      sale.total.toString(),
      sale.reference ?? '',
    ].map(escape).join(','))
    return [header.map(escape).join(','), ...rows].join('\n')
  }
}
