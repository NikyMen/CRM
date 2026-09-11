import type { FastifyInstance } from 'fastify'
import { db } from '../../core/database'
import { z } from 'zod'
import { authenticate } from '../../core/auth/auth.service'
import { requireRole } from '../../core/auth/require-role'
import {
  activityDeleteWhere,
  activityPortfolioWhere,
  contactPortfolioWhere,
} from '../../core/auth/portfolio-visibility'
import { NotFoundError, type WorkspaceContext } from '../../types'

const createActivitySchema = z.object({
  contactId:  z.string(),
  type:       z.enum(['CALL', 'EMAIL', 'MEETING', 'NOTE', 'TASK', 'OTHER']),
  title:      z.string().min(1).max(200),
  description: z.string().optional(),
  dueAt:      z.string().datetime().optional(),
  doneAt:     z.string().datetime().optional(),
})

export async function activityRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req) => {
    await authenticate(req)
  })

  // GET /activities?contactId=xxx
  app.get('/', async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { contactId } = z.object({
      contactId: z.string().optional(),
    }).parse(req.query)

    const activities = await db.activity.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        ...activityPortfolioWhere(ctx),
        ...(contactId && { contactId }),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return reply.send(activities)
  })

  // POST /activities
  app.post('/', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const body = createActivitySchema.parse(req.body)

    const contact = await db.contact.findFirst({
      where: {
        id: body.contactId,
        isArchived: false,
        ...contactPortfolioWhere(ctx),
      },
      select: { id: true },
    })
    if (!contact) throw new NotFoundError('Contact', body.contactId)

    const activity = await db.activity.create({
        data: {
            workspaceId: ctx.workspaceId,
            userId:      ctx.userId,
            contactId:   body.contactId,
            entityType:  'contact',
            entityId:    body.contactId,
            type:        body.type,
            title:       body.title,
            description: body.description,
        },
    })

    return reply.status(201).send(activity)
  })

  // DELETE /activities/:id
  app.delete<{ Params: { id: string } }>('/:id', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext

    const deleted = await db.activity.deleteMany({
      where: activityDeleteWhere(ctx, req.params.id),
    })
    if (deleted.count === 0) throw new NotFoundError('Activity', req.params.id)

    return reply.code(204).send()
  })
}
