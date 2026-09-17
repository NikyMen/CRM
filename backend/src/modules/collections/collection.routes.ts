import multipart from '@fastify/multipart'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../core/auth/auth.service'
import { requireRole } from '../../core/auth/require-role'
import type { EventBus } from '../../core/event-bus'
import { config } from '../../core/config'
import { ValidationError, type WorkspaceContext } from '../../types'
import { parseCollectionSpreadsheet } from './collection-import'
import { normalizeParaguayDateInput } from './collection-calculations'
import { renderPaymentSummary } from './payment-summary'
import { ensureClientAccess } from '../clients/client-access'
import { db } from '../../core/database'
import { Prisma } from '@prisma/client'
import {
  CollectionService,
  type PaymentInput,
  type ReceivableInput,
  type RecurringChargeInput,
} from './collection.service'

const amountSchema = z.union([
  z.number().positive(),
  z.string().trim().regex(/^\d+(?:[.,]\d{1,2})?$/, 'Monto inválido'),
])

const nullableText = (max: number) => z.preprocess(
  (value) => value === '' ? null : value,
  z.string().trim().max(max).nullable().optional()
)

const businessDateSchema = z.preprocess(normalizeParaguayDateInput, z.coerce.date())

const paginationSchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

const receivableSchema = z.object({
  companyId: z.string().min(1),
  description: z.string().trim().min(1).max(250),
  amount: amountSchema,
  currency: z.string().trim().length(3).default('PYG'),
  dueDate: businessDateSchema,
  periodKey: nullableText(30),
  reference: nullableText(180),
  externalKey: nullableText(180),
})

const paymentSchema = z.object({
  companyId: z.string().min(1),
  amount: amountSchema,
  currency: z.string().trim().length(3).default('PYG'),
  paidAt: z.preprocess(normalizeParaguayDateInput, z.coerce.date().optional()),
  method: nullableText(100),
  reference: nullableText(180),
  notes: nullableText(2000),
  allocations: z.array(z.object({
    receivableId: z.string().min(1),
    amount: amountSchema,
  })).max(200).optional(),
})

const recurringSchema = z.object({
  companyId: z.string().min(1),
  name: z.string().trim().min(1).max(180),
  description: nullableText(1000),
  amount: amountSchema,
  currency: z.string().trim().length(3).default('PYG'),
  frequency: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']).default('MONTHLY'),
  dayOfMonth: z.coerce.number().int().min(1).max(28).default(1),
  startDate: businessDateSchema,
  endDate: z.preprocess(normalizeParaguayDateInput, z.coerce.date().nullable().optional()),
  isActive: z.boolean().default(true),
})

export async function collectionRoutes(app: FastifyInstance, options: { eventBus?: EventBus }) {
  const service = new CollectionService(options.eventBus)
  await app.register(multipart, { limits: { files: 1, fileSize: config.UPLOAD_MAX_BYTES, fields: 5 } })
  app.addHook('onRequest', async (req) => authenticate(req))

  app.get('/summary', async (req, reply) => {
    return reply.send(await service.summary(req.user as WorkspaceContext))
  })

  app.get('/insights', async (req, reply) => {
    const { currency } = z.object({ currency: z.string().length(3).default('PYG') }).parse(req.query)
    return reply.send(await service.insights(req.user as WorkspaceContext, currency))
  })

  app.get('/clients/:id/payments.pdf', async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { id } = req.params as { id: string }
    const client = await ensureClientAccess(ctx, id)
    const [payments, charges] = await db.$transaction([
      db.payment.findMany({ where: { workspaceId: ctx.workspaceId, companyId: id }, orderBy: [{ paidAt: 'asc' }, { id: 'asc' }] }),
      db.receivable.findMany({ where: { workspaceId: ctx.workspaceId, companyId: id, status: { not: 'VOID' } } }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
    return reply.header('Cache-Control', 'no-store').header('Content-Disposition', 'attachment; filename="resumen-pagos.pdf"')
      .type('application/pdf').send(renderPaymentSummary(client, payments, charges))
  })

  app.get('/receivables', async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const query = paginationSchema.extend({
      companyId: z.string().optional(),
      status: z.enum(['PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'VOID']).optional(),
      currency: z.string().length(3).optional(),
    }).parse(req.query) as { companyId?: string; status?: 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'VOID'; currency?: string; page: number; limit: number }
    return reply.send(await service.listReceivables(ctx, query))
  })

  app.get('/receivables/export', async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const query = z.object({
      companyId: z.string().optional(),
      status: z.enum(['PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'VOID']).optional(),
      currency: z.string().length(3).optional(),
    }).parse(req.query)
    const csv = await service.exportReceivables(ctx, query)
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date())
    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="cobranzas-romez-${date}.csv"`)
    reply.header('X-Content-Type-Options', 'nosniff')
    return reply.send(csv)
  })

  app.post('/receivables', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const input = receivableSchema.parse(req.body) as ReceivableInput
    return reply.status(201).send(await service.createReceivable(ctx, input))
  })

  app.delete('/receivables/:id', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { id } = req.params as { id: string }
    await service.voidReceivable(ctx, id)
    return reply.status(204).send()
  })

  app.patch('/receivables/:id', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { id } = req.params as { id: string }
    const input = z.object({
      description: z.string().trim().min(1).max(250).optional(),
      amount: amountSchema.optional(),
      dueDate: z.preprocess(normalizeParaguayDateInput, z.coerce.date().optional()),
      status: z.enum(['PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'VOID']).optional(),
      reference: nullableText(180),
    }).parse(req.body)
    return reply.send(await service.updateReceivable(ctx, id, input))
  })

  app.get('/payments', async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const query = paginationSchema.extend({
      companyId: z.string().optional(),
      currency: z.string().length(3).optional(),
      includeVoided: z.preprocess((value) => value === 'true', z.boolean()).default(false),
    }).parse(req.query) as { companyId?: string; currency?: string; includeVoided?: boolean; page: number; limit: number }
    return reply.send(await service.listPayments(ctx, query))
  })

  app.post('/payments', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const input = paymentSchema.parse(req.body) as PaymentInput
    return reply.status(201).send(await service.createPayment(ctx, input))
  })

  app.delete('/payments/:id', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { id } = req.params as { id: string }
    await service.voidPayment(ctx, id)
    return reply.status(204).send()
  })

  app.patch('/payments/:id/status', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const { status } = z.object({ status: z.enum(['RECEIVED', 'VOID']) }).parse(req.body)
    await service.setPaymentStatus(req.user as WorkspaceContext, (req.params as { id: string }).id, status)
    return reply.status(204).send()
  })

  app.get('/recurring-charges', async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const query = paginationSchema.extend({ companyId: z.string().optional() }).parse(req.query)
    return reply.send(await service.listRecurring(ctx, query.page, query.limit, query.companyId))
  })

  app.post('/recurring-charges', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const input = recurringSchema.parse(req.body) as RecurringChargeInput
    return reply.status(201).send(await service.createRecurring(ctx, input))
  })

  app.patch('/recurring-charges/:id', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { id } = req.params as { id: string }
    const input = recurringSchema.partial().parse(req.body) as Partial<RecurringChargeInput>
    return reply.send(await service.updateRecurring(ctx, id, input))
  })

  app.post('/recurring-charges/generate', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { periodKey } = z.object({ periodKey: z.string().regex(/^\d{4}-\d{2}$/) }).parse(req.body)
    return reply.send(await service.generateRecurring(ctx, periodKey))
  })

  app.post('/import', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { commit } = z.object({
      commit: z.preprocess((value) => value === 'true' || value === '1', z.boolean()).default(false),
    }).parse(req.query)
    const file = await req.file()
    if (!file) throw new ValidationError('Adjuntá un archivo .xlsx o .csv')
    if (!/\.(xlsx|csv)$/i.test(file.filename)) throw new ValidationError('Solo se admiten archivos .xlsx o .csv')
    const rows = await parseCollectionSpreadsheet(await file.toBuffer(), file.filename)
    if (rows.length === 0) throw new ValidationError('El archivo no contiene movimientos')
    return reply.send(await service.importRows(ctx, rows, commit))
  })
}
