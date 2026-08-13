import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../core/database'
import { authenticate } from '../../core/auth/auth.service'
import { AppError } from '../../types'
import { requireRole } from '../../core/auth/require-role'

export async function pipelineRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req) => {
    await authenticate(req)
  })

  // ─── Listar pipelines ─────────────────────────────────────────
  app.get('/', async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const pipelines = await db.pipeline.findMany({
      where:   { workspaceId: ctx.workspaceId },
      include: { stages: { orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    })
    return reply.send(pipelines)
  })

  // ─── Crear pipeline ───────────────────────────────────────────
  app.post('/', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const body = z.object({
      name: z.string().min(1),
    }).parse(req.body)

    const existingCount = await db.pipeline.count({ where: { workspaceId: ctx.workspaceId } })
    const pipeline = await db.pipeline.create({
      data: {
        workspaceId: ctx.workspaceId,
        name:        body.name,
        isDefault: existingCount === 0,
        stages: {
          create: { name: 'Nuevos', color: '#c5ed1b', position: 0 },
        },
      },
      include: { stages: { orderBy: { position: 'asc' } } },
    })
    return reply.status(201).send(pipeline)
  })

  // ─── Actualizar pipeline ──────────────────────────────────────
  app.patch('/:id', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx    = req.user as { workspaceId: string }
    const { id } = req.params as { id: string }
    const body = z.object({
      name: z.string().min(1).optional(),
      isDefault: z.literal(true).optional(),
    }).refine((value) => value.name !== undefined || value.isDefault === true).parse(req.body)

    const pipeline = await db.pipeline.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
    })
    if (!pipeline) throw new AppError(404, 'Pipeline no encontrado')

    const updated = await db.$transaction(async (tx) => {
      if (body.isDefault) {
        await tx.pipeline.updateMany({ where: { workspaceId: ctx.workspaceId }, data: { isDefault: false } })
      }
      return tx.pipeline.update({
        where: { id },
        data: { ...(body.name !== undefined ? { name: body.name } : {}), ...(body.isDefault ? { isDefault: true } : {}) },
        include: { stages: { orderBy: { position: 'asc' } } },
      })
    })
    return reply.send(updated)
  })

  // ─── Eliminar pipeline ────────────────────────────────────────
  app.delete('/:id', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx    = req.user as { workspaceId: string }
    const { id } = req.params as { id: string }

    const pipeline = await db.pipeline.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
    })
    if (!pipeline) throw new AppError( 404, 'Pipeline no encontrado')

    const [dealCount, pipelineCount] = await Promise.all([
      db.deal.count({ where: { workspaceId: ctx.workspaceId, pipelineId: id, isArchived: false } }),
      db.pipeline.count({ where: { workspaceId: ctx.workspaceId } }),
    ])
    if (pipelineCount <= 1) throw new AppError(409, 'No podes eliminar el unico embudo del workspace')
    if (pipeline.isDefault) throw new AppError(409, 'Elegí otro embudo predeterminado antes de eliminar este')
    if (dealCount > 0) throw new AppError(409, `El embudo tiene ${dealCount} leads y no se puede eliminar`)

    await db.pipeline.delete({ where: { id } })
    return reply.status(204).send()
  })

  // ─── Crear stage ──────────────────────────────────────────────
  app.post('/:id/stages', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx    = req.user as { workspaceId: string }
    const { id } = req.params as { id: string }
    const body   = z.object({
      name:  z.string().min(1),
      color: z.string().default('#6366f1'),
    }).parse(req.body)

    const pipeline = await db.pipeline.findFirst({
      where:   { id, workspaceId: ctx.workspaceId },
      include: { stages: true },
    })
    if (!pipeline) throw new AppError( 404, 'Pipeline no encontrado')

    const position = Number(pipeline.stages.length)

    const stage = await db.stage.create({
      data: {
        pipelineId: id,
        name:       body.name,
        color:      body.color,
        position,
      },
    })
    return reply.status(201).send(stage)
  })

  // ─── Actualizar stage ─────────────────────────────────────────
  app.patch('/:id/stages/:stageId', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const { id, stageId } = req.params as { id: string; stageId: string }
    const body = z.object({
      name:  z.string().min(1).optional(),
      color: z.string().optional(),
    }).parse(req.body)

    // Verificar que el pipeline pertenece al workspace
    const pipeline = await db.pipeline.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
    })
    if (!pipeline) throw new AppError( 404, 'Pipeline no encontrado')

    const stage = await db.stage.update({
      where: { id: stageId },
      data:  body,
    })
    return reply.send(stage)
  })

  app.patch('/:id/stages/reorder', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const { id } = req.params as { id: string }
    const { stageIds } = z.object({ stageIds: z.array(z.string()).min(1) }).parse(req.body)
    const pipeline = await db.pipeline.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      include: { stages: { select: { id: true } } },
    })
    if (!pipeline) throw new AppError(404, 'Pipeline no encontrado')
    const current = new Set(pipeline.stages.map((stage) => stage.id))
    if (stageIds.length !== current.size || stageIds.some((stageId) => !current.has(stageId))) {
      throw new AppError(422, 'La lista debe contener todas las etapas una sola vez')
    }
    await db.$transaction(stageIds.map((stageId, position) => db.stage.update({ where: { id: stageId }, data: { position } })))
    return reply.send(await db.pipeline.findUnique({ where: { id }, include: { stages: { orderBy: { position: 'asc' } } } }))
  })

  // ─── Eliminar stage ───────────────────────────────────────────
  app.delete('/:id/stages/:stageId', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const { id, stageId } = req.params as { id: string; stageId: string }

    const pipeline = await db.pipeline.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
    })
    if (!pipeline) throw new AppError( 404, 'Pipeline no encontrado')

    const [stageCount, dealCount] = await Promise.all([
      db.stage.count({ where: { pipelineId: id } }),
      db.deal.count({ where: { workspaceId: ctx.workspaceId, stageId, isArchived: false } }),
    ])
    if (stageCount <= 1) throw new AppError(409, 'El embudo debe conservar al menos una etapa')
    if (dealCount > 0) throw new AppError(409, `La etapa contiene ${dealCount} leads; movelos antes de eliminarla`)
    await db.stage.delete({ where: { id: stageId } })
    return reply.status(204).send()
  })
}
