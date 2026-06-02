import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { DealService } from './deal.service'
import type { EventBus } from '../../core/event-bus'
import { authenticate } from '../../core/auth/auth.service'
import { requireRole } from '../../core/auth/require-role'
import { getPipelineScopeFilter } from '../../core/scope'

const createDealSchema = z.object({
  title:             z.string().min(1).max(200),
  value:             z.number().positive().optional(),
  currency:          z.string().length(3).default('USD'),
  probability:       z.number().min(0).max(100).optional(),
  pipelineId:        z.string(),
  stageId:           z.string(),
  companyId:         z.string().optional(),
  ownerId:           z.string().optional(),
  contactIds:        z.array(z.string()).optional(),
  expectedCloseDate: z.coerce.date().optional(),
  customData:        z.record(z.unknown()).optional(),
})

const moveDealSchema = z.object({
  stageId:  z.string(),
  position: z.number().int().min(0).optional(),
})

const filtersSchema = z.object({
  pipelineId: z.string().optional(),
  stageId:    z.string().optional(),
  status:     z.string().optional(),
  ownerId:    z.string().optional(),
  companyId:  z.string().optional(),
  page:       z.coerce.number().min(0).default(0),
  limit:      z.coerce.number().min(1).max(100).default(25),
})

export async function dealRoutes(
  app: FastifyInstance,
  options: { eventBus: EventBus }
) {
  const service = new DealService(options.eventBus)

  app.addHook('onRequest', async (req) => {
    await authenticate(req)
  })

  // ─── GET /deals ────────────────────────────────────────────────
  app.get('/', async (req, reply) => {
    const ctx = req.user as any
    const filters = filtersSchema.parse(req.query)
    return reply.send(await service.search(ctx.workspaceId, filters, ctx.scopeFilter))
  })

  // ─── GET /deals/kanban/:pipelineId ─────────────────────────────
  // El endpoint más importante — devuelve el tablero completo
  app.get<{ Params: { pipelineId: string } }>(
    '/kanban/:pipelineId',
    async (req, reply) => {
      const ctx = req.user as any
      const pipelineScopeFilter = getPipelineScopeFilter({
        role: ctx.role,
        branchId: ctx.branchId,
        regionId: ctx.regionId,
      })
      const board = await service.getKanban(
        ctx.workspaceId,
        req.params.pipelineId,
        ctx.scopeFilter,
        pipelineScopeFilter
      )
      return reply.send(board)
    }
  )

  // ─── POST /deals ───────────────────────────────────────────────
  app.post('/', { preHandler: requireRole('owner', 'regional_manager', 'branch_manager') }, async (req, reply) => {
    const ctx = req.user as any
    const body = createDealSchema.parse(req.body) as Parameters<typeof service.create>[1]
    const deal = await service.create(ctx.workspaceId, body, ctx)
    return reply.status(201).send(deal)
  })

  // ─── GET /deals/:id ────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const ctx = req.user as any
    const deal = await service.findById(ctx.workspaceId, req.params.id, ctx)
    return reply.send(deal)
  })

  // ─── PATCH /deals/:id ──────────────────────────────────────────
  app.patch<{ Params: { id: string } }>('/:id', { preHandler: requireRole('owner', 'regional_manager', 'branch_manager') }, async (req, reply) => {
    const ctx = req.user as any
    const body = createDealSchema.partial().parse(req.body)
    return reply.send(
      await service.update(ctx.workspaceId, req.params.id, body, ctx)
    )
  })

  // ─── PATCH /deals/:id/move ─────────────────────────────────────
  // Drag & drop — mover una tarjeta entre columnas
  app.patch<{ Params: { id: string } }>('/:id/move', async (req, reply) => {
    const ctx = req.user as any
    const body = moveDealSchema.parse(req.body) as Parameters<typeof service.move>[2]
    const deal = await service.move(
      ctx.workspaceId,
      req.params.id,
      body,
      ctx
    )
    return reply.send(deal)
  })

  // ─── DELETE /deals/:id ─────────────────────────────────────────
  app.delete<{ Params: { id: string } }>('/:id', { preHandler: requireRole('owner', 'regional_manager', 'branch_manager') }, async (req, reply) => {
    const ctx = req.user as any
    await service.delete(ctx.workspaceId, req.params.id, ctx)
    return reply.status(204).send()
  })
}
