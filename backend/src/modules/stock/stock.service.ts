import { Prisma } from '@prisma/client'
import { db } from '../../core/database'
import {
  AppError,
  ConflictError,
  NotFoundError,
  paginate,
  type PaginatedResult,
} from '../../types'

export type StockMovementType = 'IN' | 'OUT' | 'SALE' | 'ADJUSTMENT'
export type StockCashTransactionType = 'INCOME' | 'EXPENSE'

export interface ProductFilters {
  search?: string
  categoryId?: string
  stockState?: 'all' | 'low' | 'out' | 'active'
  page?: number
  limit?: number
}

export interface MovementFilters {
  productId?: string
  type?: StockMovementType
  page?: number
  limit?: number
}

export interface CashFilters {
  type?: StockCashTransactionType
  page?: number
  limit?: number
}

export interface CreateProductDto {
  name: string
  description?: string
  sku?: string
  categoryId?: string
  price?: number
  cost?: number
  image?: string
  images?: string[]
  featured?: boolean
  stockQuantity?: number
  minStock?: number
}

export interface UpdateProductDto extends Partial<CreateProductDto> {}

export interface CreateMovementDto {
  productId: string
  type: StockMovementType
  quantity: number
  reason: string
  note?: string
  batchCode?: string
}

export interface CreateCashTransactionDto {
  type: StockCashTransactionType
  category: string
  amount: number
  paymentMethod?: string
  reference?: string
  note?: string
  occurredAt?: Date
}

const productInclude = {
  category: true,
} satisfies Prisma.StockProductInclude

export class StockService {
  async dashboard(workspaceId: string) {
    const [
      products,
      recentMovements,
      cashTotals,
      recentCashTransactions,
    ] = await Promise.all([
      db.stockProduct.findMany({
        where: { workspaceId, isArchived: false },
        include: productInclude,
        orderBy: { updatedAt: 'desc' },
      }),
      db.stockMovement.findMany({
        where: { workspaceId },
        include: { product: { select: { id: true, name: true, sku: true } } },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      db.stockCashTransaction.groupBy({
        by: ['type'],
        where: { workspaceId },
        _sum: { amount: true },
      }),
      db.stockCashTransaction.findMany({
        where: { workspaceId },
        orderBy: { occurredAt: 'desc' },
        take: 5,
      }),
    ])

    const lowStockProducts = products.filter((p) => p.stockQuantity > 0 && p.stockQuantity <= p.minStock)
    const outOfStockProducts = products.filter((p) => p.stockQuantity <= 0)
    const unitsInStock = products.reduce((sum, p) => sum + p.stockQuantity, 0)
    const inventoryValue = products.reduce((sum, p) => sum + Number(p.price) * p.stockQuantity, 0)
    const inventoryCost = products.reduce((sum, p) => sum + Number(p.cost ?? 0) * p.stockQuantity, 0)
    const income = cashTotals.find((t) => t.type === 'INCOME')?._sum.amount ?? 0
    const expense = cashTotals.find((t) => t.type === 'EXPENSE')?._sum.amount ?? 0

    return {
      metrics: {
        totalProducts: products.length,
        unitsInStock,
        lowStockProducts: lowStockProducts.length,
        outOfStockProducts: outOfStockProducts.length,
        inventoryValue,
        inventoryCost,
        netCash: Number(income) - Number(expense),
      },
      lowStockProducts: lowStockProducts
        .sort((a, b) => a.stockQuantity - b.stockQuantity)
        .slice(0, 8)
        .map((p) => this.mapProduct(p)),
      recentMovements: recentMovements.map((m) => this.mapMovement(m)),
      recentCashTransactions: recentCashTransactions.map((t) => this.mapCashTransaction(t)),
    }
  }

  async listCategories(workspaceId: string) {
    const categories = await db.stockCategory.findMany({
      where: { workspaceId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { products: true } },
      },
    })

    return categories.map((category) => ({
      id: category.id,
      workspaceId: category.workspaceId,
      name: category.name,
      description: category.description,
      productCount: category._count.products,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    }))
  }

  async createCategory(workspaceId: string, data: { name: string; description?: string }) {
    const existing = await db.stockCategory.findFirst({
      where: { workspaceId, name: data.name },
    })
    if (existing) throw new ConflictError('Ya existe una categoria con ese nombre')

    const category = await db.stockCategory.create({
      data: {
        workspaceId,
        name: data.name,
        description: data.description,
      },
    })

    return {
      ...category,
      productCount: 0,
    }
  }

  async listProducts(
    workspaceId: string,
    filters: ProductFilters
  ): Promise<PaginatedResult<ReturnType<StockService['mapProduct']>>> {
    const page = filters.page ?? 0
    const limit = Math.min(filters.limit ?? 25, 100)
    const where: Prisma.StockProductWhereInput = {
      workspaceId,
      isArchived: false,
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { sku: { contains: filters.search, mode: 'insensitive' } },
      ]
    }

    if (filters.categoryId) {
      where.categoryId = filters.categoryId
    }

    if (filters.stockState === 'out') {
      where.stockQuantity = { lte: 0 }
    } else if (filters.stockState === 'active') {
      where.stockQuantity = { gt: 0 }
    }

    if (filters.stockState === 'low') {
      const allItems = await db.stockProduct.findMany({
        where,
        include: productInclude,
        orderBy: [{ featured: 'desc' }, { updatedAt: 'desc' }],
      })

      const lowItems = allItems
        .map((product) => this.mapProduct(product))
        .filter((product) => product.stockQuantity > 0 && product.stockQuantity <= product.minStock)

      return paginate(lowItems.slice(page * limit, page * limit + limit), lowItems.length, page, limit)
    }

    const [items, total] = await Promise.all([
      db.stockProduct.findMany({
        where,
        include: productInclude,
        orderBy: [{ featured: 'desc' }, { updatedAt: 'desc' }],
        take: limit,
        skip: page * limit,
      }),
      db.stockProduct.count({ where }),
    ])

    return paginate(items.map((product) => this.mapProduct(product)), total, page, limit)
  }

  async createProduct(workspaceId: string, data: CreateProductDto, userId?: string) {
    await this.assertCategory(workspaceId, data.categoryId)
    await this.assertSkuAvailable(workspaceId, data.sku)

    const product = await db.$transaction(async (tx) => {
      const created = await tx.stockProduct.create({
        data: {
          workspaceId,
          categoryId: data.categoryId,
          name: data.name,
          description: data.description ?? '',
          sku: data.sku,
          price: data.price ?? 0,
          cost: data.cost,
          image: data.image,
          images: data.images ?? [],
          featured: data.featured ?? false,
          stockQuantity: data.stockQuantity ?? 0,
          minStock: data.minStock ?? 3,
        },
        include: productInclude,
      })

      if (created.stockQuantity > 0) {
        await tx.stockMovement.create({
          data: {
            workspaceId,
            productId: created.id,
            type: 'IN',
            quantity: created.stockQuantity,
            reason: 'Stock inicial',
            userId,
          },
        })
      }

      return created
    })

    return this.mapProduct(product)
  }

  async updateProduct(workspaceId: string, id: string, data: UpdateProductDto) {
    await this.findProduct(workspaceId, id)
    await this.assertCategory(workspaceId, data.categoryId)
    await this.assertSkuAvailable(workspaceId, data.sku, id)

    const product = await db.stockProduct.update({
      where: { id },
      data: {
        ...(data.categoryId !== undefined && { categoryId: data.categoryId || null }),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.sku !== undefined && { sku: data.sku || null }),
        ...(data.price !== undefined && { price: data.price }),
        ...(data.cost !== undefined && { cost: data.cost }),
        ...(data.image !== undefined && { image: data.image || null }),
        ...(data.images !== undefined && { images: data.images }),
        ...(data.featured !== undefined && { featured: data.featured }),
        ...(data.stockQuantity !== undefined && { stockQuantity: data.stockQuantity }),
        ...(data.minStock !== undefined && { minStock: data.minStock }),
      },
      include: productInclude,
    })

    return this.mapProduct(product)
  }

  async archiveProduct(workspaceId: string, id: string) {
    await this.findProduct(workspaceId, id)
    await db.stockProduct.update({
      where: { id },
      data: { isArchived: true },
    })
  }

  async quickSale(
    workspaceId: string,
    id: string,
    data: { quantity: number; paymentMethod?: string; reference?: string; note?: string },
    userId?: string
  ) {
    const product = await this.findProduct(workspaceId, id)
    const amount = Number(product.price) * data.quantity

    return db.$transaction(async (tx) => {
      await this.decrementStock(tx, workspaceId, id, data.quantity)

      const movement = await tx.stockMovement.create({
        data: {
          workspaceId,
          productId: id,
          type: 'SALE',
          quantity: data.quantity,
          reason: 'Venta rapida',
          note: data.note,
          userId,
        },
        include: { product: { select: { id: true, name: true, sku: true } } },
      })

      const cashTransaction = await tx.stockCashTransaction.create({
        data: {
          workspaceId,
          type: 'INCOME',
          category: 'Venta de productos',
          amount,
          paymentMethod: data.paymentMethod,
          reference: data.reference,
          note: data.note,
        },
      })

      const updatedProduct = await tx.stockProduct.findFirstOrThrow({
        where: { id, workspaceId },
        include: productInclude,
      })

      return {
        product: this.mapProduct(updatedProduct),
        movement: this.mapMovement(movement),
        cashTransaction: this.mapCashTransaction(cashTransaction),
      }
    })
  }

  async listMovements(
    workspaceId: string,
    filters: MovementFilters
  ): Promise<PaginatedResult<ReturnType<StockService['mapMovement']>>> {
    const page = filters.page ?? 0
    const limit = Math.min(filters.limit ?? 25, 100)
    const where: Prisma.StockMovementWhereInput = {
      workspaceId,
      ...(filters.productId && { productId: filters.productId }),
      ...(filters.type && { type: filters.type }),
    }

    const [items, total] = await Promise.all([
      db.stockMovement.findMany({
        where,
        include: { product: { select: { id: true, name: true, sku: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: page * limit,
      }),
      db.stockMovement.count({ where }),
    ])

    return paginate(items.map((item) => this.mapMovement(item)), total, page, limit)
  }

  async createMovement(workspaceId: string, data: CreateMovementDto, userId?: string) {
    await this.findProduct(workspaceId, data.productId)

    const movement = await db.$transaction(async (tx) => {
      if (data.type === 'IN' || data.type === 'ADJUSTMENT') {
        await tx.stockProduct.update({
          where: { id: data.productId },
          data: { stockQuantity: { increment: data.quantity } },
        })
      } else {
        await this.decrementStock(tx, workspaceId, data.productId, data.quantity)
      }

      return tx.stockMovement.create({
        data: {
          workspaceId,
          productId: data.productId,
          type: data.type,
          quantity: data.quantity,
          reason: data.reason,
          note: data.note,
          batchCode: data.batchCode,
          userId,
        },
        include: { product: { select: { id: true, name: true, sku: true } } },
      })
    })

    return this.mapMovement(movement)
  }

  async listCashTransactions(
    workspaceId: string,
    filters: CashFilters
  ): Promise<PaginatedResult<ReturnType<StockService['mapCashTransaction']>>> {
    const page = filters.page ?? 0
    const limit = Math.min(filters.limit ?? 25, 100)
    const where: Prisma.StockCashTransactionWhereInput = {
      workspaceId,
      ...(filters.type && { type: filters.type }),
    }

    const [items, total] = await Promise.all([
      db.stockCashTransaction.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        take: limit,
        skip: page * limit,
      }),
      db.stockCashTransaction.count({ where }),
    ])

    return paginate(items.map((item) => this.mapCashTransaction(item)), total, page, limit)
  }

  async createCashTransaction(workspaceId: string, data: CreateCashTransactionDto) {
    const transaction = await db.stockCashTransaction.create({
      data: {
        workspaceId,
        type: data.type,
        category: data.category,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        reference: data.reference,
        note: data.note,
        occurredAt: data.occurredAt,
      },
    })

    return this.mapCashTransaction(transaction)
  }

  async deleteCashTransaction(workspaceId: string, id: string) {
    const transaction = await db.stockCashTransaction.findFirst({
      where: { id, workspaceId },
    })
    if (!transaction) throw new NotFoundError('Movimiento de caja', id)

    await db.stockCashTransaction.delete({ where: { id } })
  }

  private async findProduct(workspaceId: string, id: string) {
    const product = await db.stockProduct.findFirst({
      where: { id, workspaceId, isArchived: false },
      include: productInclude,
    })
    if (!product) throw new NotFoundError('Producto', id)
    return product
  }

  private async assertCategory(workspaceId: string, categoryId?: string) {
    if (!categoryId) return

    const category = await db.stockCategory.findFirst({
      where: { id: categoryId, workspaceId },
    })
    if (!category) throw new NotFoundError('Categoria', categoryId)
  }

  private async assertSkuAvailable(workspaceId: string, sku?: string, excludeId?: string) {
    if (!sku) return

    const existing = await db.stockProduct.findFirst({
      where: {
        workspaceId,
        sku,
        ...(excludeId && { id: { not: excludeId } }),
      },
    })
    if (existing) throw new ConflictError('Ya existe un producto con ese SKU')
  }

  private async decrementStock(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    productId: string,
    quantity: number
  ) {
    const updated = await tx.stockProduct.updateMany({
      where: {
        id: productId,
        workspaceId,
        isArchived: false,
        stockQuantity: { gte: quantity },
      },
      data: {
        stockQuantity: { decrement: quantity },
      },
    })

    if (updated.count !== 1) {
      throw new AppError(409, 'Stock insuficiente para completar la operacion', 'INSUFFICIENT_STOCK')
    }
  }

  private mapProduct(product: any) {
    return {
      id: product.id,
      workspaceId: product.workspaceId,
      categoryId: product.categoryId,
      category: product.category ? {
        id: product.category.id,
        name: product.category.name,
      } : null,
      name: product.name,
      description: product.description ?? '',
      sku: product.sku ?? null,
      price: Number(product.price ?? 0),
      cost: product.cost == null ? null : Number(product.cost),
      image: product.image ?? null,
      images: Array.isArray(product.images) ? product.images : [],
      featured: Boolean(product.featured),
      stockQuantity: Number(product.stockQuantity ?? 0),
      minStock: Number(product.minStock ?? 0),
      isArchived: Boolean(product.isArchived),
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    }
  }

  private mapMovement(movement: any) {
    return {
      id: movement.id,
      workspaceId: movement.workspaceId,
      productId: movement.productId,
      product: movement.product ? {
        id: movement.product.id,
        name: movement.product.name,
        sku: movement.product.sku ?? null,
      } : null,
      type: movement.type,
      quantity: Number(movement.quantity),
      reason: movement.reason,
      note: movement.note ?? null,
      batchCode: movement.batchCode ?? null,
      userId: movement.userId ?? null,
      createdAt: movement.createdAt,
    }
  }

  private mapCashTransaction(transaction: any) {
    return {
      id: transaction.id,
      workspaceId: transaction.workspaceId,
      type: transaction.type,
      category: transaction.category,
      amount: Number(transaction.amount ?? 0),
      paymentMethod: transaction.paymentMethod ?? null,
      reference: transaction.reference ?? null,
      note: transaction.note ?? null,
      occurredAt: transaction.occurredAt,
      createdAt: transaction.createdAt,
    }
  }
}
