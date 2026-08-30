import type { Prisma } from '@prisma/client'
import { NotFoundError, ValidationError } from '../../types'

export type InboundEntityType = 'contact' | 'deal' | 'company' | 'task'

export interface ValidatedInboundActivityInput {
  workspaceId: string
  type: string
  entityType: InboundEntityType
  entityId: string
  title: string
  description?: string
  source?: string
  metadata?: Record<string, unknown>
}

export function assertInboundChannelAllowed(
  channel: string,
  legacyChannelsEnabled: boolean
) {
  if (channel === 'whatsapp' && !legacyChannelsEnabled) {
    throw new ValidationError(
      'WhatsApp debe ingresar por la sesión QR de Gestión ROMEZ'
    )
  }
}

export async function findInboundContactById(
  database: any,
  workspaceId: string,
  contactId: string
) {
  return database.contact.findFirst({
    where: { id: contactId, workspaceId, isArchived: false },
    select: { id: true },
  })
}

export async function assertInboundEntityInWorkspace(
  database: any,
  workspaceId: string,
  entityType: InboundEntityType,
  entityId: string
) {
  if (entityType === 'task') {
    throw new ValidationError('Las actividades de tareas no están disponibles en esta instalación')
  }

  const entity = entityType === 'contact'
    ? await findInboundContactById(database, workspaceId, entityId)
    : entityType === 'deal'
      ? await database.deal.findFirst({
          where: { id: entityId, workspaceId, isArchived: false },
          select: { id: true },
        })
      : await database.company.findFirst({
          where: { id: entityId, workspaceId },
          select: { id: true },
        })

  if (!entity) throw new NotFoundError('Entidad', entityId)
  return entity
}

export async function createValidatedInboundActivity(
  database: any,
  input: ValidatedInboundActivityInput,
  contactedAt = new Date()
) {
  if (input.entityType === 'task') {
    throw new ValidationError('Las actividades de tareas no están disponibles en esta instalación')
  }

  return database.$transaction(async (tx: any) => {
    await assertInboundEntityInWorkspace(
      tx,
      input.workspaceId,
      input.entityType,
      input.entityId
    )

    const activity = await tx.activity.create({
      data: {
        workspaceId: input.workspaceId,
        type: input.type,
        entityType: input.entityType,
        entityId: input.entityId,
        source: input.source,
        title: input.title,
        description: input.description,
        metadata: (input.metadata ?? null) as Prisma.InputJsonValue,
        ...(input.entityType === 'contact' && { contactId: input.entityId }),
        ...(input.entityType === 'deal' && { dealId: input.entityId }),
      },
    })

    if (input.entityType === 'contact') {
      const updated = await tx.contact.updateMany({
        where: {
          id: input.entityId,
          workspaceId: input.workspaceId,
          isArchived: false,
        },
        data: { lastContactedAt: contactedAt },
      })
      if (updated.count !== 1) throw new NotFoundError('Contacto', input.entityId)
    }

    return activity
  })
}
