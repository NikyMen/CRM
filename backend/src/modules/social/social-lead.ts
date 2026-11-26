import { db } from '../../core/database'
import { ActivityType } from '../../types'
import { createWithUniqueLeadNumber } from '../deals/lead-number'

/**
 * Leads del tablero que nacen de una conversación de Instagram o de Facebook
 * (Messenger). El vínculo va en `customData.socialConversationId` y la red en
 * `customData.sourceChannel`, igual que los del WhatsApp comercial (sin migración).
 */
export type SocialNetwork = 'instagram' | 'facebook'

/** Canal del módulo de bandeja (`conversations.channel`) de cada red. */
export const NETWORK_CHANNEL: Record<SocialNetwork, string> = { instagram: 'instagram', facebook: 'messenger' }

export function networkOfChannel(channel: string): SocialNetwork | null {
  if (channel === 'instagram') return 'instagram'
  if (channel === 'messenger') return 'facebook'
  return null
}

export function readSocialConversationId(customData: unknown) {
  if (!customData || typeof customData !== 'object' || Array.isArray(customData)) return null
  const value = (customData as Record<string, unknown>).socialConversationId
  return typeof value === 'string' && value ? value : null
}

/**
 * Crea el lead de la conversación en la primera etapa abierta del embudo principal,
 * si todavía no tiene uno. Devuelve null cuando ya existe o no hay embudo.
 */
export async function ensureSocialLead(workspaceId: string, conversationId: string) {
  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, workspaceId },
    select: { id: true, channel: true, contactId: true, contact: { select: { firstName: true, lastName: true, companyId: true } } },
  })
  const network = conversation ? networkOfChannel(conversation.channel) : null
  if (!conversation || !network) return null

  const existing = await db.deal.findFirst({
    where: { workspaceId, isArchived: false, customData: { path: ['socialConversationId'], equals: conversation.id } },
    select: { id: true },
  })
  if (existing) return null

  const pipeline =
    await db.pipeline.findFirst({ where: { workspaceId, isDefault: true }, include: { stages: { orderBy: { position: 'asc' } } } }) ??
    await db.pipeline.findFirst({ where: { workspaceId }, include: { stages: { orderBy: { position: 'asc' } } }, orderBy: { createdAt: 'asc' } })
  const stage = pipeline?.stages.find((item) => !item.isWon && !item.isLost) ?? pipeline?.stages[0]
  if (!pipeline || !stage) return null

  const title = [conversation.contact.firstName, conversation.contact.lastName].filter(Boolean).join(' ').trim()
    || (network === 'instagram' ? 'Contacto de Instagram' : 'Contacto de Facebook')
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
        companyId: conversation.contact.companyId ?? null,
        customData: { leadNumber, sourceChannel: network, autoCreated: true, socialConversationId: conversation.id } as any,
      },
    })
    await tx.dealContact.create({ data: { dealId: lead.id, contactId: conversation.contactId } })
    await tx.activity.create({
      data: {
        workspaceId,
        type: ActivityType.DEAL_CREATED,
        entityType: 'deal',
        entityId: lead.id,
        dealId: lead.id,
        contactId: conversation.contactId,
        source: network,
        title: network === 'instagram' ? 'Lead creado desde Instagram' : 'Lead creado desde Facebook',
        metadata: { socialConversationId: conversation.id, stageId: stage.id, pipelineId: pipeline.id, leadNumber } as any,
      },
    })
    return lead
  }))
}
