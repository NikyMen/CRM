import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { RegionService } from './regions.service'
import { authenticate } from '../../core/auth/auth.service'
import { requireRole } from '../../core/auth/require-role'

const createRegionSchema = z.object({
  name: z.string().min(1).max(100),
})

export async function regionRoutes(app: FastifyInstance) {
  const service = new RegionService()

  app.addHook('onRequest', async (req) => {
    await authenticate(req)
  })

  // GET /regions — Accessible by all authenticated users
  app.get('/', async (req, reply) => {
    const ctx = req.user as any
    const regions = await service.list(ctx.workspaceId)
    return reply.send(regions)
  })

  // POST /regions — Only owners can create regions
  app.post('/', { preHandler: requireRole('owner') }, async (req, reply) => {
    const ctx = req.user as any
    const { name } = createRegionSchema.parse(req.body)
    const region = await service.create(ctx.workspaceId, name)
    return reply.status(201).send(region)
  })

  // PATCH /regions/:id — Only owners can update regions
  app.patch<{ Params: { id: string } }>('/:id', { preHandler: requireRole('owner') }, async (req, reply) => {
    const ctx = req.user as any
    const { name } = createRegionSchema.parse(req.body)
    const region = await service.update(ctx.workspaceId, req.params.id, name)
    return reply.send(region)
  })

  // DELETE /regions/:id — Only owners can delete regions
  app.delete<{ Params: { id: string } }>('/:id', { preHandler: requireRole('owner') }, async (req, reply) => {
    const ctx = req.user as any
    await service.delete(ctx.workspaceId, req.params.id)
    return reply.status(204).send()
  })
}
