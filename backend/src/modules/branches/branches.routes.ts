import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { BranchService } from './branches.service'
import { authenticate } from '../../core/auth/auth.service'
import { requireRole } from '../../core/auth/require-role'

const createBranchSchema = z.object({
  regionId: z.string().min(1),
  name: z.string().min(1).max(100),
  address: z.string().max(250).optional().nullable(),
})

const updateBranchSchema = z.object({
  regionId: z.string().min(1).optional(),
  name: z.string().min(1).max(100).optional(),
  address: z.string().max(250).optional().nullable(),
  isActive: z.boolean().optional(),
})

export async function branchRoutes(app: FastifyInstance) {
  const service = new BranchService()

  app.addHook('onRequest', async (req) => {
    await authenticate(req)
  })

  // GET /branches — Accessible by all authenticated users
  app.get('/', async (req, reply) => {
    const ctx = req.user as any
    const { regionId } = z.object({
      regionId: z.string().optional(),
    }).parse(req.query)

    const branches = await service.list(ctx.workspaceId, regionId)
    return reply.send(branches)
  })

  // POST /branches — Only owners can create branches
  app.post('/', { preHandler: requireRole('owner') }, async (req, reply) => {
    const ctx = req.user as any
    const body = createBranchSchema.parse(req.body) as { regionId: string; name: string; address?: string | null }
    const branch = await service.create(ctx.workspaceId, body)
    return reply.status(201).send(branch)
  })

  // PATCH /branches/:id — Only owners can update branches
  app.patch<{ Params: { id: string } }>('/:id', { preHandler: requireRole('owner') }, async (req, reply) => {
    const ctx = req.user as any
    const body = updateBranchSchema.parse(req.body) as { regionId?: string; name?: string; address?: string | null; isActive?: boolean }
    const branch = await service.update(ctx.workspaceId, req.params.id, body)
    return reply.send(branch)
  })

  // DELETE /branches/:id — Only owners can delete branches
  app.delete<{ Params: { id: string } }>('/:id', { preHandler: requireRole('owner') }, async (req, reply) => {
    const ctx = req.user as any
    await service.delete(ctx.workspaceId, req.params.id)
    return reply.status(204).send()
  })
}
