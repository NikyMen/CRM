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

    const pipeline = await db.pipeline.create({
      data: {
        workspaceId: ctx.workspaceId,
        name:        body.name,
      },
      include: { stages: true },
    })
    return reply.status(201).send(pipeline)
  })

  // ─── Actualizar pipeline ──────────────────────────────────────
  app.patch('/:id', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx    = req.user as { workspaceId: string }
    const { id } = req.params as { id: string }
    const body   = z.object({
      name: z.string().min(1),
    }).parse(req.body)

    const pipeline = await db.pipeline.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
    })
    if (!pipeline) throw new AppError(404, 'Pipeline no encontrado')

    const updated = await db.pipeline.update({
      where:   { id },
      data:    { name: body.name },
      include: { stages: { orderBy: { position: 'asc' } } },
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

  // ─── Eliminar stage ───────────────────────────────────────────
  app.delete('/:id/stages/:stageId', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const { id, stageId } = req.params as { id: string; stageId: string }

    const pipeline = await db.pipeline.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
    })
    if (!pipeline) throw new AppError( 404, 'Pipeline no encontrado')

    await db.stage.delete({ where: { id: stageId } })
    return reply.status(204).send()
  })
}
