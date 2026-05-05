import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ContactService } from './contact.service'
import type { EventBus } from '../../core/event-bus'
import { authenticate } from '../../core/auth/auth.service'
import { requireRole } from '../../core/auth/require-role'

// Schemas de validación con Zod
// Zod valida los datos que llegan en el body del request
// Si algo no cumple las reglas, responde automáticamente con 422

const createContactSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName:  z.string().max(100).optional(),
  email:     z.union([z.string().email(), z.literal('')]).optional().transform(e => e === '' ? undefined : e),
  phone:     z.union([z.string().max(30), z.literal('')]).optional().transform(e => e === '' ? undefined : e),
  avatar:    z.string().url().optional(),
  status:    z.enum([
    'LEAD', 'QUALIFIED', 'ACTIVE', 'CUSTOMER', 'CHURNED', 'ARCHIVED'
  ]).optional(),
  source:     z.string().optional(),
  tags:       z.array(z.string()).optional(),
  companyId:  z.string().optional(),
  ownerId:    z.string().optional(),
  customData: z.record(z.unknown()).optional(),
})

const updateContactSchema = createContactSchema.partial()

const filtersSchema = z.object({
  search:    z.string().optional(),
  status:    z.union([z.string(), z.array(z.string())]).optional(),
  source:    z.union([z.string(), z.array(z.string())]).optional(),
  ownerId:   z.string().optional(),
  companyId: z.string().optional(),
  tags:      z.array(z.string()).optional(),
  scoreMin:  z.coerce.number().min(0).max(100).optional(),
  scoreMax:  z.coerce.number().min(0).max(100).optional(),
  page:      z.coerce.number().min(0).default(0),
  limit:     z.coerce.number().min(1).max(100).default(25),
  sortBy:    z.string().optional(),
  sortDir:   z.enum(['asc', 'desc']).optional(),
})

export async function contactRoutes(
  app: FastifyInstance,
  options: { eventBus: EventBus }
) {
  const service = new ContactService(options.eventBus)

  // Todas las rutas de este módulo requieren autenticación
  app.addHook('onRequest', async (req) => {
    await authenticate(req)
  })

  // ─── GET /contacts ─────────────────────────────────────────────
  // Todos los roles pueden leer contactos
  app.get('/', async (req, reply) => {
    const ctx = req.user as { workspaceId: string; userId: string }
    const filters = filtersSchema.parse(req.query)
    const result = await service.search(ctx.workspaceId, filters)
    return reply.send(result)
  })

  // ─── POST /contacts ────────────────────────────────────────────
  // viewer no puede crear contactos
  app.post('/', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string; userId: string }
    const body = createContactSchema.parse(req.body) as Parameters<typeof service.create>[1]
    const contact = await service.create(ctx.workspaceId, body, ctx.userId)
    return reply.status(201).send(contact)
  })

  // ─── GET /contacts/:id ─────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const contact = await service.findById(ctx.workspaceId, req.params.id)
    return reply.send(contact)
  })

  // ─── PATCH /contacts/:id ───────────────────────────────────────
  // viewer no puede editar contactos
  app.patch<{ Params: { id: string } }>('/:id', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string; userId: string }
    const body = updateContactSchema.parse(req.body)
    const contact = await service.update(
      ctx.workspaceId,
      req.params.id,
      body,
      ctx.userId
    )
    return reply.send(contact)
  })

  // ─── DELETE /contacts/:id ──────────────────────────────────────
  // Solo owner y admin pueden borrar contactos
  app.delete<{ Params: { id: string } }>('/:id', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string; userId: string }
    await service.delete(ctx.workspaceId, req.params.id, ctx.userId)
    return reply.status(204).send()
  })

  // ─── POST /contacts/:id/merge ──────────────────────────────────
  // Solo owner y admin pueden mergear contactos
  app.post<{ Params: { id: string } }>('/:id/merge', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string; userId: string }
    const { loserId } = z.object({
      loserId: z.string()
    }).parse(req.body)

    const merged = await service.merge(
      ctx.workspaceId,
      req.params.id,
      loserId,
      ctx.userId
    )
    return reply.send(merged)
  })
}