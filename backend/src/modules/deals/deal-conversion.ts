import { Prisma } from '@prisma/client'
import { db } from '../../core/database'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  type WorkspaceContext,
} from '../../types'
import { dealVisibilityWhere, isDealManager } from './deal-access'

type JsonRecord = Record<string, unknown>

export interface ConvertWonDealInput extends WorkspaceContext {
  dealId: string
  clientId?: string
}

export interface ClientSeed {
  name: string
  personType: 'INDIVIDUAL' | 'LEGAL_ENTITY'
  ruc: string | null
  dv: string | null
  legalName: string | null
  tradeName: string | null
  email: string | null
  phone: string | null
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {}
}

function text(record: JsonRecord, key: string) {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function splitRuc(value: string | null, explicitDv: string | null) {
  if (!value) return { ruc: null, dv: explicitDv?.replace(/\D/g, '') || null }
  const parts = value.split('-')
  return {
    ruc: parts[0]?.replace(/\D/g, '') || null,
    dv: explicitDv?.replace(/\D/g, '') || parts[1]?.replace(/\D/g, '') || null,
  }
}

export function buildClientSeed(deal: {
  title: string
  customData?: unknown
  contacts?: Array<{
    contact: {
      firstName: string
      lastName?: string | null
      email?: string | null
      phone?: string | null
      customData?: unknown
    }
  }>
}): ClientSeed {
  const contact = deal.contacts?.[0]?.contact
  const dealData = asRecord(deal.customData)
  const contactData = asRecord(contact?.customData)
  const fullName = contact
    ? [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim()
    : ''
  const personTypeValue = text(contactData, 'personType') ?? text(dealData, 'personType')
  const personType = personTypeValue === 'LEGAL_ENTITY'
    ? 'LEGAL_ENTITY'
    : personTypeValue === 'INDIVIDUAL' || contact
      ? 'INDIVIDUAL'
      : 'LEGAL_ENTITY'
  const rawRuc = text(contactData, 'ruc') ?? text(dealData, 'ruc')
  const explicitDv = text(contactData, 'dv') ?? text(dealData, 'dv')
  const { ruc, dv } = splitRuc(rawRuc, explicitDv)
  const name = fullName || deal.title.trim() || 'Cliente convertido'

  return {
    name,
    personType,
    ruc,
    dv,
    legalName: personType === 'LEGAL_ENTITY' ? name : null,
    tradeName: deal.title.trim() && deal.title.trim() !== name ? deal.title.trim() : null,
    email: contact?.email?.trim() || null,
    phone: contact?.phone?.trim() || null,
  }
}

function assertConversionWriteAccess(
  ctx: WorkspaceContext,
  ownerId: string | null,
  hasClientAssignment = false
) {
  if (isDealManager(ctx)) return
  if (ctx.role !== 'member' || (ownerId !== ctx.userId && !hasClientAssignment)) {
    throw new ForbiddenError('Solo podés convertir oportunidades bajo tu responsabilidad')
  }
}

async function assertClientPortfolioAccess(
  ctx: WorkspaceContext,
  client: { id: string; ownerId: string | null },
  database: any
) {
  if (isDealManager(ctx)) return
  if (ctx.role === 'member' && (client.ownerId === null || client.ownerId === ctx.userId)) return
  const assignment = await database.clientAssignment.findFirst({
    where: { workspaceId: ctx.workspaceId, companyId: client.id, userId: ctx.userId },
    select: { id: true },
  })
  if (!assignment) throw new NotFoundError('Cliente', client.id)
}

/**
 * Convierte una oportunidad ganada en un cliente contable. La fila del deal se
 * bloquea para que dos solicitudes simultáneas no creen dos legajos.
 */
export async function convertWonDealToClient(
  input: ConvertWonDealInput,
  database: any = db
) {
  return database.$transaction(async (tx: any) => {
    if (typeof tx.$queryRaw === 'function') {
      await tx.$queryRaw`
        SELECT "id" FROM "deals"
        WHERE "id" = ${input.dealId} AND "workspaceId" = ${input.workspaceId}
        FOR UPDATE
      `
    }

    const deal = await tx.deal.findFirst({
      where: {
        id: input.dealId,
        workspaceId: input.workspaceId,
        isArchived: false,
        ...dealVisibilityWhere(input),
      },
      include: {
        contacts: {
          include: { contact: true },
        },
      },
    })
    if (!deal) throw new NotFoundError('Oportunidad', input.dealId)
    const clientAssignment = deal.companyId && input.role === 'member'
      ? await tx.clientAssignment.findFirst({
          where: {
            workspaceId: input.workspaceId,
            companyId: deal.companyId,
            userId: input.userId,
          },
          select: { id: true },
        })
      : null
    assertConversionWriteAccess(input, deal.ownerId, Boolean(clientAssignment))
    if (deal.status !== 'WON') {
      throw new ValidationError('La oportunidad debe estar ganada antes de crear el cliente')
    }

    if (deal.companyId && input.clientId && deal.companyId !== input.clientId) {
      throw new ConflictError('La oportunidad ya está vinculada a otro cliente')
    }

    let client = deal.companyId
      ? await tx.company.findFirst({
          where: { id: deal.companyId, workspaceId: input.workspaceId, isArchived: false },
        })
      : null
    let created = false
    if (client) await assertClientPortfolioAccess(input, client, tx)
    if (
      client &&
      deal.companyId === client.id &&
      text(asRecord(deal.customData), 'convertedClientId') === client.id
    ) {
      return { client, deal, created: false, changed: false }
    }

    if (!client && input.clientId) {
      client = await tx.company.findFirst({
        where: {
          id: input.clientId,
          workspaceId: input.workspaceId,
          isArchived: false,
        },
      })
      if (!client) throw new NotFoundError('Cliente', input.clientId)
      await assertClientPortfolioAccess(input, client, tx)
    }

    const contactIds = deal.contacts.map((link: any) => link.contactId)
    const contactCompanyId = deal.contacts.find((link: any) => link.contact.companyId)?.contact.companyId
    if (!client && contactCompanyId) {
      client = await tx.company.findFirst({
        where: {
          id: contactCompanyId,
          workspaceId: input.workspaceId,
          isArchived: false,
        },
      })
      if (!client) throw new NotFoundError('Cliente', contactCompanyId)
      await assertClientPortfolioAccess(input, client, tx)
    }

    const seed = buildClientSeed(deal)
    if (!client && seed.ruc) {
      const rucMatch = await tx.company.findFirst({
        where: {
          workspaceId: input.workspaceId,
          ruc: seed.ruc,
        },
      })
      if (rucMatch?.isArchived) {
        throw new ConflictError('El RUC pertenece a un cliente archivado')
      }
      client = rucMatch
      if (client) await assertClientPortfolioAccess(input, client, tx)
    }

    if (!client) {
      const initialOwnerId = deal.ownerId ?? (input.role === 'member' ? input.userId : null)
      client = await tx.company.create({
        data: {
          workspaceId: input.workspaceId,
          ...seed,
          country: 'Paraguay',
          status: 'ACTIVE',
          ownerId: initialOwnerId,
          customData: {
            source: 'commercial',
            convertedFromDealId: deal.id,
          } as Prisma.InputJsonValue,
        },
      })
      created = true
    }

    const conflictingContact = deal.contacts.find((link: any) =>
      link.contact.companyId && link.contact.companyId !== client.id
    )
    if (conflictingContact) {
      throw new ConflictError('Un contacto de la oportunidad ya pertenece a otro cliente')
    }

    const ownerId = client.ownerId ?? deal.ownerId ?? (input.role === 'member' ? input.userId : null)
    if (!client.ownerId && ownerId) {
      client = await tx.company.update({
        where: { id: client.id },
        data: { ownerId },
      })
    }

    const updatedDeal = await tx.deal.update({
      where: { id: deal.id, workspaceId: input.workspaceId },
      data: {
        companyId: client.id,
        ownerId,
        customData: {
          ...asRecord(deal.customData),
          convertedClientId: client.id,
        } as Prisma.InputJsonValue,
      },
    })

    if (contactIds.length) {
      await Promise.all([
        tx.contact.updateMany({
          where: { workspaceId: input.workspaceId, id: { in: contactIds } },
          data: { companyId: client.id, ownerId },
        }),
        tx.whatsAppChat.updateMany({
          where: { workspaceId: input.workspaceId, contactId: { in: contactIds } },
          data: { assignedToUserId: ownerId },
        }),
        tx.ticket.updateMany({
          where: {
            workspaceId: input.workspaceId,
            contactId: { in: contactIds },
            status: { in: ['NEW', 'OPEN', 'WAITING_CUSTOMER'] },
          },
          data: { companyId: client.id, assignedToUserId: ownerId },
        }),
        tx.deal.updateMany({
          where: {
            workspaceId: input.workspaceId,
            id: { not: deal.id },
            status: 'OPEN',
            isArchived: false,
            contacts: { some: { contactId: { in: contactIds } } },
          },
          data: { companyId: client.id, ownerId },
        }),
      ])
    }

    return { client, deal: updatedDeal, created, changed: true }
  })
}
