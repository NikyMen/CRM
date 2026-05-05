import type { FastifyInstance } from 'fastify'
import { db } from '../../core/database'
import { z } from 'zod'
import { authenticate } from '../../core/auth/auth.service'

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
    const ctx = req.user as { workspaceId: string }
    const { contactId } = z.object({
      contactId: z.string().optional(),
    }).parse(req.query)

    const activities = await db.activity.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        ...(contactId && { contactId }),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return reply.send(activities)
  })

  // POST /activities
  app.post('/', async (req, reply) => {
    const ctx  = req.user as { workspaceId: string; userId: string }
    const body = createActivitySchema.parse(req.body)

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
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const ctx = req.user as { workspaceId: string }

    await db.activity.deleteMany({
      where: { id: req.params.id, workspaceId: ctx.workspaceId },
    })

    return reply.code(204).send()
  })
}