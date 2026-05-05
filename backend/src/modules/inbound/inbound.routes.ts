import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AuthService } from '../../core/auth/auth.service'
import { ContactService } from '../contacts/contact.service'
import { db } from '../../core/database'
import { UnauthorizedError, ActivityType } from '../../types'
import type { EventBus } from '../../core/event-bus'
import { type Prisma } from '@prisma/client'

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

    const body = schema.parse(req.body)

    const activity = await db.activity.create({
      data: {
        workspaceId,
        type:        body.type,
        entityType:  body.entityType,
        entityId:    body.entityId,
        source:      body.source,
        title:       body.title,
        description: body.description,
        metadata:    (body.metadata ?? null) as Prisma.InputJsonValue,
        ...(body.entityType === 'contact' && { contactId: body.entityId }),
        ...(body.entityType === 'deal'    && { dealId:    body.entityId }),
      },
    })

    // Si es actividad de contacto, actualizar lastContactedAt
    if (body.entityType === 'contact') {
      await db.contact.update({
        where: { id: body.entityId },
        data: { lastContactedAt: new Date() },
      })
    }

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

    // Resolver a qué contacto pertenece el mensaje
    let contactId = body.contactId

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

    const activity = await db.activity.create({
      data: {
        workspaceId,
        type:        activityType,
        entityType:  'contact',
        entityId:    contactId,
        contactId,
        source:      body.channel,
        title:       `${body.channel} ${body.direction === 'inbound' ? 'recibido' : 'enviado'}`,
        description: body.content.substring(0, 500),
        metadata:    (body.metadata ?? null) as Prisma.InputJsonValue,
      },
    })

    // Actualizar lastContactedAt del contacto
    if (contactId) {
      await db.contact.update({
        where: { id: contactId },
        data: { lastContactedAt: new Date() },
      })
    }

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