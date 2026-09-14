import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../core/auth/auth.service'
import { requireRole } from '../../core/auth/require-role'
import { requireModule } from '../../core/modules/require-module'
import type { EventBus } from '../../core/event-bus'
import type { WorkspaceContext } from '../../types'
import { normalizeParaguayDateInput } from '../collections/collection-calculations'
import { SaleService, type SaleFilters, type SaleInput } from './sale.service'

const nullableText = (max: number) => z.preprocess(
  (value) => value === '' ? null : value,
  z.string().trim().max(max).nullable().optional()
)

const numericSchema = z.union([
  z.number(),
  z.string().trim().regex(/^\d+(?:[.,]\d{1,3})?$/, 'Valor numerico invalido'),
])

const businessDate = z.preprocess(normalizeParaguayDateInput, z.coerce.date())

const itemSchema = z.object({
  description: z.string().trim().min(1).max(250),
  quantity: numericSchema,
  unitPrice: numericSchema,
})

const saleSchema = z.object({
  companyId: z.string().min(1),
  soldAt: businessDate.optional(),
  currency: z.string().trim().length(3).default('PYG'),
  discount: numericSchema.optional(),
  taxAmount: numericSchema.optional(),
  reference: nullableText(180),
  notes: nullableText(2000),
  items: z.array(itemSchema).min(1).max(200),
})

const statusSchema = z.enum(['DRAFT', 'CONFIRMED', 'CANCELLED'])

const filterSchema = z.object({
  companyId: z.string().optional(),
  status: statusSchema.optional(),
  currency: z.string().length(3).optional(),
  from: businessDate.optional(),
  to: businessDate.optional(),
  includeDeleted: z.preprocess((value) => value === 'true', z.boolean()).default(false),
})

const paginationSchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

export async function saleRoutes(app: FastifyInstance, options: { eventBus?: EventBus }) {
  const service = new SaleService(options.eventBus)
  app.addHook('onRequest', async (req) => authenticate(req))
  app.addHook('onRequest', requireModule('sales'))

  app.get('/summary', async (req, reply) => {
    const range = z.object({ from: businessDate.optional(), to: businessDate.optional() }).parse(req.query)
    return reply.send(await service.summary(req.user as WorkspaceContext, range))
  })

  app.get('/', async (req, reply) => {
    const query = filterSchema.merge(paginationSchema).parse(req.query) as SaleFilters
    return reply.send(await service.list(req.user as WorkspaceContext, query))
  })

  app.get('/export', async (req, reply) => {
    const query = filterSchema.parse(req.query)
    const csv = await service.exportCsv(req.user as WorkspaceContext, query)
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date())
    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', 'attachment; filename="ventas-romez-' + date + '.csv"')
    reply.header('X-Content-Type-Options', 'nosniff')
    return reply.send(csv)
  })

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    return reply.send(await service.get(req.user as WorkspaceContext, id))
  })

  app.get('/:id/history', async (req, reply) => {
    const { id } = req.params as { id: string }
    return reply.send(await service.history(req.user as WorkspaceContext, id))
  })

  app.post('/', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const input = saleSchema.parse(req.body) as SaleInput
    return reply.status(201).send(await service.create(req.user as WorkspaceContext, input))
  })

  app.patch('/:id', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const input = saleSchema.partial().parse(req.body) as Partial<SaleInput>
    return reply.send(await service.update(req.user as WorkspaceContext, id, input))
  })

  app.post('/:id/confirm', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const { id } = req.params as { id: string }
    return reply.send(await service.confirm(req.user as WorkspaceContext, id))
  })

  app.post('/:id/cancel', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = z.object({ reason: nullableText(500) }).parse(req.body ?? {})
    return reply.send(await service.cancel(req.user as WorkspaceContext, id, body.reason as string | null))
  })

  app.delete('/:id', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const { id } = req.params as { id: string }
    return reply.send(await service.remove(req.user as WorkspaceContext, id))
  })

  app.post('/:id/restore', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const { id } = req.params as { id: string }
    return reply.send(await service.restore(req.user as WorkspaceContext, id))
  })
}
