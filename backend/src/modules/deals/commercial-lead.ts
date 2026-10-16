import { db } from '../../core/database'
import { ActivityType } from '../../types'
import { phoneMatchKey } from '../collections-whatsapp/collection-whatsapp.phone'
import { createWithUniqueLeadNumber } from './lead-number'

/**
 * Leads del tablero de Gestión comercial que nacen del WhatsApp comercial. El
 * vínculo con el chat va en `customData.commercialChatId` (sin migración).
 */
export const COMMERCIAL_LEAD_SOURCE = 'commercial-whatsapp'

export function readCommercialChatId(customData: unknown) {
  if (!customData || typeof customData !== 'object' || Array.isArray(customData)) return null
  const value = (customData as Record<string, unknown>).commercialChatId
  return typeof value === 'string' && value ? value : null
}

type CommercialChat = { id: string; jid: string; phoneNumber: string | null; displayName: string | null; companyId: string | null }

/** Contacto de quien escribe: reutiliza el que tenga el mismo teléfono o crea uno nuevo. */
async function ensureLeadContact(workspaceId: string, chat: CommercialChat, name: string) {
  const key = phoneMatchKey(chat.phoneNumber)
  if (!key) return null
  const contacts = await db.contact.findMany({
    where: { workspaceId, isArchived: false, phone: { not: null } },
    select: { id: true, phone: true, companyId: true },
  })
  const existing = contacts.find((contact) => phoneMatchKey(contact.phone) === key)
  if (existing) return existing
  return db.contact.create({
    data: {
      workspaceId,
      firstName: name,
      phone: chat.phoneNumber,
      status: 'LEAD',
      source: 'WHATSAPP',
      tags: ['whatsapp', 'comercial'],
      companyId: chat.companyId,
      channels: [{ type: 'whatsapp', identifier: chat.phoneNumber, metadata: { jid: chat.jid, line: 'commercial' } }] as any,
    },
    select: { id: true, phone: true, companyId: true },
  })
}

/**
 * Crea el lead del chat comercial en la primera etapa del embudo principal, si
 * ese chat todavía no tiene uno en el tablero. Si el lead se borró del tablero
 * y la persona vuelve a escribir, aparece uno nuevo.
 */
export async function ensureCommercialLead(workspaceId: string, chat: CommercialChat, pushName?: string | null) {
  const existing = await db.deal.findFirst({
    where: { workspaceId, isArchived: false, customData: { path: ['commercialChatId'], equals: chat.id } },
    select: { id: true },
  })
  if (existing) return null

  const pipeline =
    await db.pipeline.findFirst({ where: { workspaceId, isDefault: true }, include: { stages: { orderBy: { position: 'asc' } } } }) ??
    await db.pipeline.findFirst({ where: { workspaceId }, include: { stages: { orderBy: { position: 'asc' } } }, orderBy: { createdAt: 'asc' } })
  const stage =
    pipeline?.stages.find((item) => item.name.trim().toLowerCase() === 'nuevo lead') ??
    pipeline?.stages.find((item) => !item.isWon && !item.isLost) ??
    pipeline?.stages[0]
  if (!pipeline || !stage) return null

  const title = chat.displayName?.trim() || pushName?.trim() || (chat.phoneNumber ? `+${chat.phoneNumber}` : 'Contacto de WhatsApp')
  const contact = await ensureLeadContact(workspaceId, chat, title)
  const last = await db.deal.findFirst({
    where: { workspaceId, stageId: stage.id, status: 'OPEN', isArchived: false },
    orderBy: { position: 'desc' },
    select: { position: true },
  })

  return createWithUniqueLeadNumber(workspaceId, (leadNumber) => db.$transaction(async (tx) => {
    const lead = await tx.deal.create({
      data: {
        workspaceId,
        leadNumber,
        title,
        pipelineId: pipeline.id,
        stageId: stage.id,
        position: (last?.position ?? -1) + 1,
        probability: stage.probability,
        status: 'OPEN',
        companyId: chat.companyId ?? contact?.companyId ?? null,
        customData: { leadNumber, sourceChannel: COMMERCIAL_LEAD_SOURCE, autoCreated: true, commercialChatId: chat.id } as any,
      },
    })
    if (contact) await tx.dealContact.create({ data: { dealId: lead.id, contactId: contact.id } })
    await tx.activity.create({
      data: {
        workspaceId,
        type: ActivityType.DEAL_CREATED,
        entityType: 'deal',
        entityId: lead.id,
        dealId: lead.id,
        contactId: contact?.id ?? null,
        source: 'whatsapp',
        title: 'Lead creado desde el WhatsApp comercial',
        metadata: { commercialChatId: chat.id, stageId: stage.id, pipelineId: pipeline.id, leadNumber } as any,
      },
    })
    return lead
  }))
}
