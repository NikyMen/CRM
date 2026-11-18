import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../core/auth/auth.service'
import { requireRole } from '../../core/auth/require-role'
import type { WorkspaceContext } from '../../types'
import { TASK_PRIORITIES, TASK_STATUSES } from './task.logic'
import { TaskService, type TaskInput } from './task.service'

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha con formato AAAA-MM-DD.')

const taskSchema = z.object({
  title: z.string().trim().min(1, 'La tarea necesita un título.').max(200),
  description: z.string().trim().max(5000).default(''),
  priority: z.enum(TASK_PRIORITIES).default('MEDIUM'),
  status: z.enum(TASK_STATUSES).default('PENDING'),
  assignedToUserId: z.string().min(1).nullable().default(null),
  companyId: z.string().min(1).nullable().default(null),
  dueDate: dateOnly.nullable().default(null),
}).strict()

const listSchema = z.object({
  status: z.enum([...TASK_STATUSES, 'open']).optional(),
  assignedToUserId: z.string().min(1).optional(),
  search: z.string().trim().max(200).optional().transform((value) => value || undefined),
})

const historySchema = z.object({
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

/**
 * Sección Tareas. Owner y admin crean, editan y borran; el responsable puede cambiar el estado de las suyas.
 * Cada cambio queda en el historial (task_events).
 */
export async function taskRoutes(app: FastifyInstance) {
  const service = new TaskService()
  app.addHook('onRequest', async (req) => authenticate(req))

  app.get('/', async (req, reply) => reply.send(await service.list(req.user as WorkspaceContext, listSchema.parse(req.query))))

  app.get('/history', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const query = historySchema.parse(req.query) as { before?: string; limit: number }
    return reply.send(await service.history(req.user as WorkspaceContext, query))
  })

  app.get<{ Params: { id: string } }>('/:id/history', async (req, reply) => {
    const query = historySchema.parse(req.query) as { before?: string; limit: number }
    return reply.send(await service.history(req.user as WorkspaceContext, { ...query, taskId: req.params.id }))
  })

  app.post('/', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    return reply.status(201).send(await service.create(req.user as WorkspaceContext, taskSchema.parse(req.body) as TaskInput))
  })

  app.put<{ Params: { id: string } }>('/:id', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    return reply.send(await service.update(req.user as WorkspaceContext, req.params.id, taskSchema.parse(req.body) as TaskInput))
  })

  app.patch<{ Params: { id: string } }>('/:id/status', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const { status } = z.object({ status: z.enum(TASK_STATUSES) }).strict().parse(req.body)
    return reply.send(await service.setStatus(req.user as WorkspaceContext, req.params.id, status))
  })

  app.delete<{ Params: { id: string } }>('/:id', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    await service.remove(req.user as WorkspaceContext, req.params.id)
    return reply.status(204).send()
  })
}
