import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../core/auth/auth.service'
import { requireRole } from '../../core/auth/require-role'
import {
  StockService,
  type CreateCashTransactionDto,
  type CreateMovementDto,
  type CreateProductDto,
} from './stock.service'

const emptyToUndefined = (value: unknown) =>
  value === '' || value === null ? undefined : value

const productFiltersSchema = z.object({
  search: z.string().optional(),
  categoryId: z.preprocess(emptyToUndefined, z.string().optional()),
  stockState: z.enum(['all', 'low', 'out', 'active']).default('all'),
  page: z.coerce.number().min(0).default(0),
  limit: z.coerce.number().min(1).max(100).default(25),
})

const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500).optional(),
})

const createProductSchema = z.object({
  name: z.string().trim().min(1).max(180),
  description: z.string().max(2000).optional(),
  sku: z.preprocess(emptyToUndefined, z.string().trim().max(80).optional()),
  categoryId: z.preprocess(emptyToUndefined, z.string().optional()),
  price: z.coerce.number().min(0).default(0),
  cost: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  image: z.preprocess(emptyToUndefined, z.string().url().optional()),
  images: z.array(z.string().url()).optional(),
  featured: z.boolean().optional(),
  stockQuantity: z.coerce.number().int().min(0).default(0),
  minStock: z.coerce.number().int().min(0).default(3),
})

const updateProductSchema = createProductSchema.partial()

const movementFiltersSchema = z.object({
  productId: z.preprocess(emptyToUndefined, z.string().optional()),
  type: z.enum(['IN', 'OUT', 'SALE', 'ADJUSTMENT']).optional(),
  page: z.coerce.number().min(0).default(0),
  limit: z.coerce.number().min(1).max(100).default(25),
})

const createMovementSchema = z.object({
  productId: z.string().min(1),
  type: z.enum(['IN', 'OUT', 'SALE', 'ADJUSTMENT']),
  quantity: z.coerce.number().int().min(1),
  reason: z.string().trim().min(1).max(180),
  note: z.string().max(1000).optional(),
  batchCode: z.preprocess(emptyToUndefined, z.string().max(64).optional()),
})

const quickSaleSchema = z.object({
  quantity: z.coerce.number().int().min(1).default(1),
  paymentMethod: z.preprocess(emptyToUndefined, z.string().max(100).optional()),
  reference: z.preprocess(emptyToUndefined, z.string().max(180).optional()),
  note: z.string().max(1000).optional(),
})

const cashFiltersSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']).optional(),
  page: z.coerce.number().min(0).default(0),
  limit: z.coerce.number().min(1).max(100).default(25),
})

const createCashTransactionSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  category: z.string().trim().min(1).max(120),
  amount: z.coerce.number().positive(),
  paymentMethod: z.preprocess(emptyToUndefined, z.string().max(100).optional()),
  reference: z.preprocess(emptyToUndefined, z.string().max(180).optional()),
  note: z.string().max(1000).optional(),
  occurredAt: z.coerce.date().optional(),
})

export async function stockRoutes(app: FastifyInstance) {
  const service = new StockService()

  app.addHook('onRequest', async (req) => {
    await authenticate(req)
  })

  app.get('/dashboard', async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    return reply.send(await service.dashboard(ctx.workspaceId))
  })

  app.get('/categories', async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    return reply.send(await service.listCategories(ctx.workspaceId))
  })

  app.post('/categories', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const body = createCategorySchema.parse(req.body) as { name: string; description?: string }
    const category = await service.createCategory(ctx.workspaceId, body)
    return reply.status(201).send(category)
  })

  app.get('/products', async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const filters = productFiltersSchema.parse(req.query)
    return reply.send(await service.listProducts(ctx.workspaceId, filters))
  })

  app.post('/products', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string; userId: string }
    const body = createProductSchema.parse(req.body) as CreateProductDto
    const product = await service.createProduct(ctx.workspaceId, body, ctx.userId)
    return reply.status(201).send(product)
  })

  app.patch('/products/:id', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const { id } = req.params as { id: string }
    const body = updateProductSchema.parse(req.body)
    return reply.send(await service.updateProduct(ctx.workspaceId, id, body))
  })

  app.delete('/products/:id', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const { id } = req.params as { id: string }
    await service.archiveProduct(ctx.workspaceId, id)
    return reply.status(204).send()
  })

  app.post('/products/:id/quick-sale', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string; userId: string }
    const { id } = req.params as { id: string }
    const body = quickSaleSchema.parse(req.body) as { quantity: number; paymentMethod?: string; reference?: string; note?: string }
    return reply.send(await service.quickSale(ctx.workspaceId, id, body, ctx.userId))
  })

  app.get('/movements', async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const filters = movementFiltersSchema.parse(req.query)
    return reply.send(await service.listMovements(ctx.workspaceId, filters))
  })

  app.post('/movements', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string; userId: string }
    const body = createMovementSchema.parse(req.body) as CreateMovementDto
    const movement = await service.createMovement(ctx.workspaceId, body, ctx.userId)
    return reply.status(201).send(movement)
  })

  app.get('/cash', async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const filters = cashFiltersSchema.parse(req.query)
    return reply.send(await service.listCashTransactions(ctx.workspaceId, filters))
  })

  app.post('/cash', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const body = createCashTransactionSchema.parse(req.body) as CreateCashTransactionDto
    const transaction = await service.createCashTransaction(ctx.workspaceId, body)
    return reply.status(201).send(transaction)
  })

  app.delete('/cash/:id', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const { id } = req.params as { id: string }
    await service.deleteCashTransaction(ctx.workspaceId, id)
    return reply.status(204).send()
  })
}
