import type { FastifyInstance } from 'fastify'
import { db } from '../../core/database'
import { z } from 'zod'
import { authenticate } from '../../core/auth/auth.service'
import { requireRole } from '../../core/auth/require-role'
import {
  contactPortfolioWhere,
  noteDeleteWhere,
  notePortfolioWhere,
} from '../../core/auth/portfolio-visibility'
import { NotFoundError, type WorkspaceContext } from '../../types'

export async function noteRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req) => {
    await authenticate(req)
  })

  // GET /notes?contactId=xxx
  app.get('/', async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { contactId } = z.object({
      contactId: z.string().optional(),
    }).parse(req.query)

    const notes = await db.note.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        ...notePortfolioWhere(ctx),
        ...(contactId && { contactId }),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return reply.send(notes)
  })

  // POST /notes
  app.post('/', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { contactId, content } = z.object({
      contactId: z.string(),
      content:   z.string().min(1),
    }).parse(req.body)

    const contact = await db.contact.findFirst({
      where: {
        id: contactId,
        isArchived: false,
        ...contactPortfolioWhere(ctx),
      },
      select: { id: true },
    })
    if (!contact) throw new NotFoundError('Contact', contactId)

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
  app.delete<{ Params: { id: string } }>('/:id', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext

    const deleted = await db.note.deleteMany({
      where: noteDeleteWhere(ctx, req.params.id),
    })
    if (deleted.count === 0) throw new NotFoundError('Note', req.params.id)

    return reply.code(204).send()
  })
}
