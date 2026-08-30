import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../core/auth/auth.service'
import { requireRole } from '../../core/auth/require-role'
import type { EventBus } from '../../core/event-bus'
import type { WorkspaceContext } from '../../types'
import { normalizeParaguayDateInput } from '../collections/collection-calculations'
import { ChecklistService, type ChecklistTemplateInput } from './checklist.service'

const nullableText = z.preprocess((value) => value === '' ? null : value, z.string().trim().max(1000).nullable().optional())

const itemSchema = z.object({
  title: z.string().trim().min(1).max(250),
  description: nullableText,
  isRequired: z.boolean().default(true),
})

const templateSchema = z.object({
  name: z.string().trim().min(1).max(180),
  description: nullableText,
  periodicity: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY', 'ON_DEMAND']).default('MONTHLY'),
  isActive: z.boolean().default(true),
  items: z.array(itemSchema).min(1).max(200),
})

const paginationSchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

const checklistFiltersSchema = paginationSchema.extend({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE']).optional(),
  periodKey: z.string().trim().max(30).optional(),
})

export async function checklistRoutes(app: FastifyInstance, options: { eventBus?: EventBus }) {
  const service = new ChecklistService(options.eventBus)
  app.addHook('onRequest', async (req) => authenticate(req))

  app.get('/checklists/summary', async (req, reply) => {
    return reply.send(await service.summary(req.user as WorkspaceContext))
  })

  app.get('/checklist-templates', async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const query = paginationSchema.extend({ includeInactive: z.preprocess((value) => value === 'true', z.boolean()).default(false) }).parse(req.query)
    return reply.send(await service.listTemplates(ctx.workspaceId, query.page, query.limit, query.includeInactive))
  })

  app.post('/checklist-templates', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const input = templateSchema.parse(req.body) as ChecklistTemplateInput
    return reply.status(201).send(await service.createTemplate(ctx.workspaceId, input))
  })

  app.patch('/checklist-templates/:id', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { id } = req.params as { id: string }
    const input = templateSchema.partial().parse(req.body) as Partial<ChecklistTemplateInput>
    return reply.send(await service.updateTemplate(ctx.workspaceId, id, input))
  })

  app.delete('/checklist-templates/:id', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { id } = req.params as { id: string }
    await service.archiveTemplate(ctx.workspaceId, id)
    return reply.status(204).send()
  })

  app.get('/clients/:clientId/checklists', async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { clientId } = req.params as { clientId: string }
    const filters = checklistFiltersSchema.parse(req.query) as {
      status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE'
      periodKey?: string
      page: number
      limit: number
    }
    return reply.send(await service.listClientChecklists(ctx, clientId, filters))
  })

  app.post('/clients/:clientId/checklists', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { clientId } = req.params as { clientId: string }
    const input = z.object({
      templateId: z.string().min(1),
      periodKey: z.string().trim().min(1).max(30),
      dueDate: z.preprocess(normalizeParaguayDateInput, z.coerce.date().nullable().optional()),
      assignedToUserId: z.string().nullable().optional(),
    }).parse(req.body) as { templateId: string; periodKey: string; dueDate?: Date | null; assignedToUserId?: string | null }
    return reply.status(201).send(await service.createClientChecklist(ctx, clientId, input))
  })

  app.patch('/clients/:clientId/checklists/:checklistId', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { clientId, checklistId } = req.params as { clientId: string; checklistId: string }
    const input = z.object({
      dueDate: z.preprocess(normalizeParaguayDateInput, z.coerce.date().nullable().optional()),
      assignedToUserId: z.string().nullable().optional(),
    }).parse(req.body)
    return reply.send(await service.updateClientChecklist(ctx, clientId, checklistId, input))
  })

  app.patch('/clients/:clientId/checklists/:checklistId/items/:itemId', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { clientId, checklistId, itemId } = req.params as { clientId: string; checklistId: string; itemId: string }
    const input = z.object({
      isCompleted: z.boolean().optional(),
      notes: z.preprocess((value) => value === '' ? null : value, z.string().max(2000).nullable().optional()),
    }).refine((value) => value.isCompleted !== undefined || value.notes !== undefined, 'No hay cambios').parse(req.body)
    return reply.send(await service.updateItem(ctx, clientId, checklistId, itemId, input))
  })
}
