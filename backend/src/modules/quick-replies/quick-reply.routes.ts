import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../core/auth/auth.service'
import { requireRole } from '../../core/auth/require-role'
import type { WorkspaceContext } from '../../types'
import { QuickReplyService, type QuickReplyInput } from './quick-reply.service'
import { normalizeShortcut } from './quick-reply.shortcut'

const quickReplySchema = z.object({
  shortcut: z.string().trim().min(1).max(40).refine((value) => normalizeShortcut(value).length > 0, {
    message: 'El atajo debe tener letras o números.',
  }),
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(4096),
})

export async function quickReplyRoutes(app: FastifyInstance) {
  const service = new QuickReplyService()
  app.addHook('onRequest', async (req) => authenticate(req))

  app.get('/', async (req, reply) => reply.send(await service.list(req.user as WorkspaceContext)))

  app.post('/', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const input = quickReplySchema.parse(req.body) as QuickReplyInput
    return reply.status(201).send(await service.create(req.user as WorkspaceContext, input))
  })

  app.put<{ Params: { id: string } }>('/:id', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const input = quickReplySchema.parse(req.body) as QuickReplyInput
    return reply.send(await service.update(req.user as WorkspaceContext, req.params.id, input))
  })

  app.delete<{ Params: { id: string } }>('/:id', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    await service.remove(req.user as WorkspaceContext, req.params.id)
    return reply.status(204).send()
  })
}
