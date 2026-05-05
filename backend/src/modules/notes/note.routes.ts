import type { FastifyInstance } from 'fastify'
import { db } from '../../core/database'
import { z } from 'zod'
import { authenticate } from '../../core/auth/auth.service'

export async function noteRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req) => {
    await authenticate(req)
  })

  // GET /notes?contactId=xxx
  app.get('/', async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const { contactId } = z.object({
      contactId: z.string().optional(),
    }).parse(req.query)

    const notes = await db.note.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        ...(contactId && { contactId }),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return reply.send(notes)
  })

  // POST /notes
  app.post('/', async (req, reply) => {
    const ctx = req.user as { workspaceId: string; userId: string }
    const { contactId, content } = z.object({
      contactId: z.string(),
      content:   z.string().min(1),
    }).parse(req.body)

    const note = await db.note.create({
        data: {
            workspaceId: ctx.workspaceId,
            userId:      ctx.userId,
            contactId,
            entityType:  'contact',
            entityId:    contactId,
            content,
        },
    })

    return reply.status(201).send(note)
  })

  // DELETE /notes/:id
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const ctx = req.user as { workspaceId: string }

    await db.note.deleteMany({
      where: { id: req.params.id, workspaceId: ctx.workspaceId },
    })

    return reply.code(204).send()
  })
}