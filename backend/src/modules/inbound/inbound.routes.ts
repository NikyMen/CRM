import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AuthService } from '../../core/auth/auth.service'
import { ContactService } from '../contacts/contact.service'
import { db } from '../../core/database'
import { config } from '../../core/config'
import { UnauthorizedError, ActivityType } from '../../types'
import type { EventBus } from '../../core/event-bus'
import { DealService } from '../deals/deal.service'
import {
  BOT_STAGES,
  findCommercialLeadByPhone,
  lastStageChange,
  resolveBotStageMove,
} from '../deals/commercial-lead-stage'
import { isAssistantPausedForPhone, pausedCommercialPhones } from '../collections-whatsapp/commercial-assistant'
import {
  assertInboundChannelAllowed,
  createValidatedInboundActivity,
  findInboundContactById,
  type ValidatedInboundActivityInput,
} from './inbound-security'

const authService = new AuthService()

// Verificar API Key en el header X-API-Key
async function requireApiKey(
  req: any
): Promise<{ workspaceId: string }> {
  const key = req.headers['x-api-key'] as string | undefined
  if (!key) throw new UnauthorizedError('Falta el header X-API-Key')

  const result = await authService.verifyApiKey(key)
  if (!result) throw new UnauthorizedError('API Key inválida o expirada')

  return result
}

export async function inboundRoutes(
  app: FastifyInstance,
  options: { eventBus: EventBus }
) {
  const contactService = new ContactService(options.eventBus)
  const dealService = new DealService(options.eventBus)

  // ─── GET /inbound/commercial-leads/stage?phone= ─────────────────
  // El asistente de WhatsApp lee en qué etapa del tablero está el cliente (y si la puso
  // una persona) para no contradecir al equipo.
  app.get('/commercial-leads/stage', async (req, reply) => {
    const { workspaceId } = await requireApiKey(req)
    const { phone } = z.object({ phone: z.string().trim().min(6).max(40) }).parse(req.query)
    // `assistantPaused`: una persona tomó el chat desde el CRM y el asistente no debe responder.
    const [lead, assistantPaused] = await Promise.all([
      findCommercialLeadByPhone(workspaceId, phone),
      isAssistantPausedForPhone(workspaceId, phone),
    ])
    if (!lead || !lead.stage) return reply.send({ found: false, assistantPaused })
    const change = await lastStageChange(workspaceId, lead.id)
    return reply.send({
      found: true,
      assistantPaused,
      dealId: lead.id,
      leadNumber: lead.leadNumber,
      stage: lead.stage.name,
      isWon: lead.stage.isWon,
      isLost: lead.stage.isLost,
      stageEnteredAt: lead.stageEnteredAt,
      changedByPerson: change?.byPerson ?? false,
      changedBy: change?.by ?? null,
    })
  })

  // ─── GET /inbound/commercial-chats/assistant-paused ─────────────
  // Teléfonos de los chats comerciales que atiende una persona: el asistente no les manda
  // seguimientos.
  app.get('/commercial-chats/assistant-paused', async (req, reply) => {
    const { workspaceId } = await requireApiKey(req)
    reply.header('cache-control', 'no-store')
    return reply.send({ phones: await pausedCommercialPhones(workspaceId) })
  })

  // ─── POST /inbound/commercial-leads/stage ───────────────────────
  // El asistente informa la etapa de la charla; el lead avanza en el tablero sólo si
  // corresponde (reglas en deals/commercial-lead-stage.ts).
  app.post('/commercial-leads/stage', async (req, reply) => {
    const { workspaceId } = await requireApiKey(req)
    const body = z.object({
      phone: z.string().trim().min(6).max(40),
      botStage: z.enum(BOT_STAGES),
    }).parse(req.body)
    const lead = await findCommercialLeadByPhone(workspaceId, body.phone)
    if (!lead || !lead.stage) return reply.send({ moved: false, reason: 'sin_lead' })
    const target = resolveBotStageMove(lead.stage, lead.pipeline.stages, body.botStage)
    if (!target) return reply.send({ moved: false, reason: 'sin_cambio', stage: lead.stage.name })
    await dealService.move({ workspaceId, userId: '', role: 'admin' }, lead.id, { stageId: target.id })
    return reply.send({ moved: true, from: lead.stage.name, stage: target.name })
  })

  // ─── POST /inbound/contacts ────────────────────────────────────
  // Crear o actualizar contacto desde n8n
  // Ejemplo de uso en n8n:
  // POST http://tu-crm.com/api/v1/inbound/contacts
  // Headers: X-API-Key: crm_abc123...
  app.post('/contacts', async (req, reply) => {
    const { workspaceId } = await requireApiKey(req)

    const schema = z.object({
      firstName:  z.string(),
      lastName:   z.string().optional(),
      email:      z.string().email().optional(),
      phone:      z.string().optional(),
      status:     z.string().optional(),
      source:     z.string().default('N8N'),
      tags:       z.array(z.string()).optional(),
      customData: z.record(z.unknown()).optional(),
      // Si upsert es true y ya existe el email/phone, actualiza
      // en vez de crear un duplicado
      upsert: z.boolean().default(false),
    })

    const body = schema.parse(req.body)

    // Upsert: buscar si ya existe y actualizar
    if (body.upsert && (body.email || body.phone)) {
      const existing = await db.contact.findFirst({
        where: {
          workspaceId,
          isArchived: false,
          OR: [
            ...(body.email ? [{ email: body.email }] : []),
            ...(body.phone ? [{ phone: body.phone }] : []),
          ],
        },
      })

      if (existing) {
        const updated = await contactService.update(
          workspaceId,
          existing.id,
          body
        )
        return reply.send({ action: 'updated', contact: updated })
      }
    }

    const contact = await contactService.create(workspaceId, body as Parameters<typeof contactService.create>[1])
    return reply.status(201).send({ action: 'created', contact })
  })

  // ─── GET /inbound/contacts/lookup ─────────────────────────────
  // Buscar contacto por email o teléfono
  // Útil en n8n para verificar si un contacto ya existe
  // antes de crear uno nuevo
  app.get('/contacts/lookup', async (req, reply) => {
    const { workspaceId } = await requireApiKey(req)

    const { email, phone } = z.object({
      email: z.string().email().optional(),
      phone: z.string().optional(),
    }).parse(req.query)

    if (!email && !phone) {
      return reply.status(400).send({
        error: 'Proporcioná email o teléfono para buscar'
      })
    }

    const contact = await db.contact.findFirst({
      where: {
        workspaceId,
        isArchived: false,
        OR: [
          ...(email ? [{ email }] : []),
          ...(phone ? [{ phone }] : []),
        ],
      },
    })

    if (!contact) return reply.send({ found: false })
    return reply.send({ found: true, contact })
  })

  // ─── POST /inbound/activities ──────────────────────────────────
  // Registrar una actividad desde n8n
  // Por ejemplo: "llamada realizada", "email enviado", etc.
  app.post('/activities', async (req, reply) => {
    const { workspaceId } = await requireApiKey(req)

    const schema = z.object({
      type:        z.string(),
      entityType:  z.enum(['contact', 'deal', 'company', 'task']),
      entityId:    z.string(),
      title:       z.string(),
      description: z.string().optional(),
      metadata:    z.record(z.unknown()).optional(),
      source:      z.string().default('N8N'),
    })

    const body = schema.parse(req.body) as Omit<ValidatedInboundActivityInput, 'workspaceId'>

    const activity = await createValidatedInboundActivity(db, {
      workspaceId,
      ...body,
    })

    await options.eventBus.emit('automation.triggered', {
      workspaceId,
      activityType: body.type,
      entityType:   body.entityType,
      entityId:     body.entityId,
    })

    return reply.status(201).send(activity)
  })

  // ─── POST /inbound/messages ────────────────────────────────────
  // Recibir un mensaje de WhatsApp, Facebook, etc. procesado por n8n
  // Este es el puente entre los canales de comunicación y el CRM
  app.post('/messages', async (req, reply) => {
    const { workspaceId } = await requireApiKey(req)

    const schema = z.object({
      channel:      z.enum(['whatsapp', 'facebook', 'instagram', 'telegram', 'email']),
      direction:    z.enum(['inbound', 'outbound']),
      from:         z.string(),
      content:      z.string(),
      contactId:    z.string().optional(),
      contactEmail: z.string().email().optional(),
      contactPhone: z.string().optional(),
      metadata:     z.record(z.unknown()).optional(),
    })

    const body = schema.parse(req.body)
    assertInboundChannelAllowed(body.channel, config.ENABLE_LEGACY_CHANNELS)

    // Resolver a qué contacto pertenece el mensaje
    let contactId: string | undefined

    if (body.contactId) {
      const suppliedContact = await findInboundContactById(db, workspaceId, body.contactId)
      if (!suppliedContact) {
        return reply.status(422).send({
          error: 'CONTACT_NOT_FOUND',
          message: 'El contactId no pertenece al espacio de trabajo de esta API key.',
        })
      }
      contactId = suppliedContact.id
    }

    if (!contactId) {
      const contact = await db.contact.findFirst({
        where: {
          workspaceId,
          isArchived: false,
          OR: [
            ...(body.contactEmail ? [{ email: body.contactEmail }] : []),
            ...(body.contactPhone ? [{ phone: body.contactPhone }] : []),
            // Para WhatsApp, el "from" es el número de teléfono
            ...(body.channel === 'whatsapp' ? [{ phone: body.from }] : []),
          ],
        },
      })
      contactId = contact?.id
    }

    // Si el mensaje es entrante y no existe el contacto,
    // crearlo automáticamente con los datos disponibles.
    if (!contactId && body.direction === 'inbound') {
      // Si `from` parece un número de teléfono (solo dígitos y +),
      // no usarlo como nombre — queda ilegible en el listado.
      const fromIsPhone = /^[+\d\s\-()]+$/.test(body.from)
      const channel = body.channel.charAt(0).toUpperCase() + body.channel.slice(1)

      const newContact = await contactService.create(workspaceId, {
        firstName: fromIsPhone ? `Contacto ${channel}` : body.from,
        phone:     body.channel === 'whatsapp' ? body.from : undefined,
        source:    body.channel.toUpperCase(),
      })
      contactId = newContact.id
    }

    // Si el mensaje es outbound y no hay contactId conocido, no se puede
    // registrar la actividad sin corromper la DB con un entityId inválido.
    // El cliente debe proporcionar contactId, contactEmail o contactPhone.
    if (!contactId) {
      return reply.status(422).send({
        error: 'CONTACT_NOT_FOUND',
        message:
          'No se encontró el contacto. Proporcioná contactId, contactEmail o contactPhone válidos.',
      })
    }

    // Determinar el tipo de actividad según canal y dirección
    const activityType =
      body.channel === 'whatsapp'
        ? body.direction === 'inbound'
          ? ActivityType.WHATSAPP_RECEIVED
          : ActivityType.WHATSAPP_SENT
        : body.direction === 'inbound'
        ? ActivityType.EMAIL_RECEIVED
        : ActivityType.EMAIL_SENT

    const activity = await createValidatedInboundActivity(db, {
      workspaceId,
      type: activityType,
      entityType: 'contact',
      entityId: contactId,
      source: body.channel,
      title: `${body.channel} ${body.direction === 'inbound' ? 'recibido' : 'enviado'}`,
      description: body.content.substring(0, 500),
      metadata: body.metadata,
    })

    await options.eventBus.emit('message.received', {
      workspaceId,
      channel:   body.channel,
      direction: body.direction,
      contactId,
      content:   body.content,
      from:      body.from,
    })

    return reply.status(201).send({ activity, contactId })
  })
}
