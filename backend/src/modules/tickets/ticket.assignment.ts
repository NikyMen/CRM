import { db } from '../../core/database'
import { AppError, ValidationError } from '../../types'

type Actor = {
  userId: string
  role: string
}

type AssignmentContext = {
  workspaceId: string
  chatId: string
  expectedAssignedToUserId: string | null
  assignedToUserId: string | null
  expectedTicketId?: string
}

const prisma = db as any

export function isManagerRole(role: string) {
  return role === 'owner' || role === 'admin'
}

export function assertAssignmentAllowed(
  actor: Actor,
  currentAssignedToUserId: string | null,
  assignedToUserId: string | null
) {
  if (isManagerRole(actor.role)) return

  const canClaim = assignedToUserId === actor.userId && currentAssignedToUserId === null
  const canRelease = assignedToUserId === null && currentAssignedToUserId === actor.userId
  const unchanged = assignedToUserId === currentAssignedToUserId
  if (!canClaim && !canRelease && !unchanged) {
    throw new AppError(
      403,
      'Solo podes tomar un registro libre o liberar uno propio.',
      'FORBIDDEN'
    )
  }
}

export async function validateAssignee(workspaceId: string, assignedToUserId: string | null) {
  if (!assignedToUserId) return

  const target = await db.workspaceUser.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: assignedToUserId } },
    select: { role: true },
  })
  if (!target || !['owner', 'admin', 'member'].includes(target.role)) {
    throw new ValidationError('El responsable debe ser un miembro activo del equipo.')
  }
}

/**
 * La fila del chat funciona como lock compartido entre WhatsApp y Tickets.
 * El compare-and-set evita que dos usuarios tomen el mismo ticket libre.
 */
export async function assignChatAndRelatedRecords(input: AssignmentContext, database: any = prisma) {
  return database.$transaction(async (tx: any) => {
    const chatUpdate = await tx.whatsAppChat.updateMany({
      where: {
        id: input.chatId,
        workspaceId: input.workspaceId,
        assignedToUserId: input.expectedAssignedToUserId,
      },
      data: { assignedToUserId: input.assignedToUserId },
    })
    if (chatUpdate.count !== 1) {
      throw new AppError(409, 'Otro usuario tomo este ticket antes.', 'ASSIGNMENT_CONFLICT')
    }

    const chat = await tx.whatsAppChat.findFirst({
      where: { id: input.chatId, workspaceId: input.workspaceId },
      select: {
        id: true,
        jid: true,
        contactId: true,
        contact: { select: { companyId: true } },
      },
    })
    if (!chat) {
      throw new AppError(404, 'Chat no encontrado.', 'NOT_FOUND')
    }

    if (input.expectedTicketId) {
      const ticketUpdate = await tx.ticket.updateMany({
        where: {
          id: input.expectedTicketId,
          workspaceId: input.workspaceId,
          assignedToUserId: input.expectedAssignedToUserId,
          activeKey: { not: null },
        },
        data: { assignedToUserId: input.assignedToUserId },
      })
      if (ticketUpdate.count !== 1) {
        throw new AppError(409, 'El ticket cambio antes de completar la asignacion.', 'ASSIGNMENT_CONFLICT')
      }
    } else {
      await tx.ticket.updateMany({
        where: {
          workspaceId: input.workspaceId,
          whatsappChatId: chat.id,
          activeKey: { not: null },
        },
        data: { assignedToUserId: input.assignedToUserId },
      })
    }

    const companyId = chat.contact?.companyId ?? null
    if (chat.contactId) {
      await tx.contact.updateMany({
        where: { id: chat.contactId, workspaceId: input.workspaceId },
        data: { ownerId: input.assignedToUserId },
      })
    }
    if (companyId) {
      await tx.company.updateMany({
        where: { id: companyId, workspaceId: input.workspaceId },
        data: { ownerId: input.assignedToUserId },
      })
    }

    if (chat.contactId || companyId) {
      await tx.deal.updateMany({
        where: {
          workspaceId: input.workspaceId,
          status: 'OPEN',
          isArchived: false,
          OR: [
            ...(companyId ? [{ companyId }] : []),
            ...(chat.contactId ? [{ contacts: { some: { contactId: chat.contactId } } }] : []),
          ],
        },
        data: { ownerId: input.assignedToUserId },
      })
    }

    return chat
  })
}

export async function assignContactAndRelatedRecords(input: {
  workspaceId: string
  contactId: string
  expectedOwnerId: string | null
  ownerId: string | null
  contactData?: Record<string, unknown>
}, database: any = prisma) {
  return database.$transaction(async (tx: any) => {
    const contact = await tx.contact.findFirst({
      where: { id: input.contactId, workspaceId: input.workspaceId },
      select: { companyId: true, whatsappChats: { select: { id: true, jid: true } } },
    })
    if (!contact) throw new AppError(404, 'Contacto no encontrado.', 'NOT_FOUND')

    const chatIds = contact.whatsappChats.map((chat: { id: string }) => chat.id)
    if (chatIds.length) {
      await tx.whatsAppChat.updateMany({
        where: { workspaceId: input.workspaceId, id: { in: chatIds } },
        data: { assignedToUserId: input.ownerId },
      })
    }

    const contactUpdate = await tx.contact.updateMany({
      where: {
        id: input.contactId,
        workspaceId: input.workspaceId,
        ownerId: input.expectedOwnerId,
      },
      data: { ...input.contactData, ownerId: input.ownerId },
    })
    if (contactUpdate.count !== 1) {
      throw new AppError(409, 'El responsable cambio antes de completar la operacion.', 'ASSIGNMENT_CONFLICT')
    }

    if (chatIds.length) {
      await tx.ticket.updateMany({
        where: {
          workspaceId: input.workspaceId,
          whatsappChatId: { in: chatIds },
          activeKey: { not: null },
        },
        data: { assignedToUserId: input.ownerId },
      })
    }

    if (contact.companyId) {
      await tx.company.updateMany({
        where: { id: contact.companyId, workspaceId: input.workspaceId },
        data: { ownerId: input.ownerId },
      })
    }

    await tx.deal.updateMany({
      where: {
        workspaceId: input.workspaceId,
        status: 'OPEN',
        isArchived: false,
        OR: [
          ...(contact.companyId ? [{ companyId: contact.companyId }] : []),
          { contacts: { some: { contactId: input.contactId } } },
        ],
      },
      data: { ownerId: input.ownerId },
    })

    return contact
  })
}
