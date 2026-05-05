import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../core/database'
import type { CRMEvent } from '../../types'
import { authenticate } from '../../core/auth/auth.service'
import { requireRole } from '../../core/auth/require-role'

// Todos los eventos disponibles para suscribirse
// Cuando el usuario configura un webhook, elige cuáles le interesan
export const ALL_EVENTS: CRMEvent[] = [
  'contact.created',
  'contact.updated',
  'contact.deleted',
  'contact.merged',
  'deal.created',
  'deal.updated',
  'deal.stage_changed',
  'deal.won',
  'deal.lost',
  'deal.deleted',
  'task.created',
  'task.completed',
  'task.overdue',
  'note.created',
  'message.received',
  'message.sent',
  'automation.triggered',
]

const webhookSchema = z.object({
  name:   z.string().min(1).max(100),
  url:    z.string().url(),
  secret: z.string().min(8).max(100).optional(),
  events: z.array(z.string()).min(1),
})

export async function webhookRoutes(app: FastifyInstance) {
  // Autenticación requerida para todas las rutas
  app.addHook('onRequest', async (req) => {
    await authenticate(req)
  })

  // Todos los endpoints de webhooks son solo para owner y admin
  app.addHook('preHandler', requireRole('owner', 'admin'))

  // ─── GET /webhooks/events ──────────────────────────────────────
  // Lista todos los eventos disponibles — útil para el frontend
  // cuando el usuario está configurando un webhook nuevo
  app.get('/events', async (_, reply) => {
    return reply.send({ events: ALL_EVENTS })
  })

  // ─── GET /webhooks ─────────────────────────────────────────────
  app.get('/', async (req, reply) => {
    const ctx = req.user as { workspaceId: string }

    const webhooks = await db.webhookEndpoint.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: 'desc' },
    })

    // Nunca devolver el secret al cliente
    // Si el usuario lo pierde, debe regenerarlo
    return reply.send(
      webhooks.map(({ secret: _s, ...w }: any) => w)
    )
  })

  // ─── POST /webhooks ────────────────────────────────────────────
  app.post('/', async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const body = webhookSchema.parse(req.body)

    const webhook = await db.webhookEndpoint.create({
      data: {
        workspaceId: ctx.workspaceId,
        name:   body.name,
        url:    body.url,
        secret: body.secret,
        events: body.events,
      },
    })

    const { secret: _s, ...safeWebhook } = webhook
    return reply.status(201).send(safeWebhook)
  })

  // ─── PATCH /webhooks/:id ───────────────────────────────────────
  app.patch<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const body = webhookSchema.partial().parse(req.body)

    // Verificar que el webhook pertenece al workspace
    // Esto es seguridad multi-tenant — un workspace no puede
    // editar los webhooks de otro workspace
    const existing = await db.webhookEndpoint.findFirst({
      where: { id: req.params.id, workspaceId: ctx.workspaceId },
    })
    if (!existing) {
      return reply.status(404).send({ error: 'Webhook no encontrado' })
    }

    const updated = await db.webhookEndpoint.update({
      where: { id: req.params.id },
      data: body,
    })

    const { secret: _s, ...safeWebhook } = updated
    return reply.send(safeWebhook)
  })

  // ─── DELETE /webhooks/:id ──────────────────────────────────────
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const ctx = req.user as { workspaceId: string }

    await db.webhookEndpoint.deleteMany({
      where: { id: req.params.id, workspaceId: ctx.workspaceId },
    })

    return reply.status(204).send()
  })

  // ─── POST /webhooks/:id/test ───────────────────────────────────
  // Envía un evento de prueba a la URL configurada
  // Muy útil para verificar que n8n está escuchando correctamente
  app.post<{ Params: { id: string } }>('/:id/test', async (req, reply) => {
    const ctx = req.user as { workspaceId: string }

    const webhook = await db.webhookEndpoint.findFirst({
      where: { id: req.params.id, workspaceId: ctx.workspaceId },
    })
    if (!webhook) {
      return reply.status(404).send({ error: 'Webhook no encontrado' })
    }

    try {
      const res = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CRM-Event': 'test',
        },
        body: JSON.stringify({
          event: 'test',
          timestamp: new Date().toISOString(),
          data: {
            message: 'Test desde CRM',
            workspaceId: ctx.workspaceId,
          },
        }),
      })

      return reply.send({ success: res.ok, statusCode: res.status })
    } catch (err) {
      return reply.send({
        success: false,
        error: (err as Error).message,
      })
    }
  })
}