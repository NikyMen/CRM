import type { Prisma } from '@prisma/client'
import { db } from '../../core/database'
import { phoneMatchKey } from '../collections-whatsapp/collection-whatsapp.phone'

/**
 * Etapas del lead del WhatsApp comercial: las mueve el asistente de n8n a medida que avanza la
 * charla, y el equipo puede cambiarlas a mano desde el chat. El asistente lee la etapa actual
 * para saber en qué punto está cada cliente.
 *
 * Reglas del movimiento automático (pensadas para no pisar al equipo):
 * - Solo avanza: nunca devuelve un lead a una etapa anterior del tablero.
 * - No toca leads ganados ni perdidos: esos los cierra una persona.
 * - Si la etapa destino no existe en el embudo (alguien la renombró), no hace nada.
 */

/** Etapa del asistente → nombres posibles de la columna del tablero (sin tildes ni mayúsculas). */
export const BOT_STAGE_TARGETS: Record<string, string[]> = {
  COSTOS_ENVIADOS: ['propuesta enviada'],
  DOCUMENTACION: ['negociacion'],
  LISTO_PARA_INICIAR: ['negociacion'],
}

export const BOT_STAGES = ['NUEVO', 'CALIFICANDO', 'COSTOS_ENVIADOS', 'DOCUMENTACION', 'LISTO_PARA_INICIAR', 'DERIVADO', 'DESCARTADO'] as const

export type StageRow = { id: string; name: string; position: number; isWon: boolean; isLost: boolean }

export function normalizeStageName(name: string) {
  return name.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')
}

/** Columna a la que el asistente movería el lead, o null si no corresponde moverlo. */
export function resolveBotStageMove(current: StageRow, stages: StageRow[], botStage: string): StageRow | null {
  const names = BOT_STAGE_TARGETS[botStage]
  if (!names) return null
  if (current.isWon || current.isLost) return null
  const target = stages.find((stage) => names.includes(normalizeStageName(stage.name)) && !stage.isWon && !stage.isLost)
  if (!target || target.id === current.id) return null
  if (target.position <= current.position) return null
  return target
}

/** Lead del tablero que corresponde al chat comercial de ese teléfono (o null). */
export async function findCommercialLeadByPhone(workspaceId: string, phone: string) {
  const key = phoneMatchKey(phone)
  if (!key) return null
  const chats = await db.collectionWhatsAppChat.findMany({
    where: { workspaceId, line: 'commercial', phoneNumber: { endsWith: key } },
    select: { id: true },
    orderBy: { lastMessageAt: 'desc' },
  })
  for (const chat of chats) {
    const lead = await findCommercialLeadByChat(workspaceId, chat.id)
    if (lead) return lead
  }
  return null
}

/** Lead del tablero vinculado a un chat comercial, con su etapa y las columnas de su embudo. */
export async function findCommercialLeadByChat(workspaceId: string, chatId: string, visibility: Prisma.DealWhereInput = {}) {
  const deal = await db.deal.findFirst({
    where: { workspaceId, isArchived: false, customData: { path: ['commercialChatId'], equals: chatId }, ...visibility },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, leadNumber: true, title: true, stageId: true, stageEnteredAt: true, status: true,
      pipeline: {
        select: {
          id: true, name: true,
          stages: { orderBy: { position: 'asc' }, select: { id: true, name: true, position: true, color: true, isWon: true, isLost: true } },
        },
      },
    },
  })
  if (!deal) return null
  const stage = deal.pipeline.stages.find((item) => item.id === deal.stageId) ?? null
  return { ...deal, stage }
}

/** Último cambio de etapa: si lo hizo una persona (userId) o el asistente (sin usuario). */
export async function lastStageChange(workspaceId: string, dealId: string) {
  const activity = await db.activity.findFirst({
    where: { workspaceId, dealId, type: 'DEAL_STAGE_CHANGED' },
    orderBy: { createdAt: 'desc' },
    select: { userId: true, createdAt: true, user: { select: { firstName: true } } },
  })
  if (!activity) return null
  return { byPerson: Boolean(activity.userId), by: activity.user?.firstName ?? (activity.userId ? 'equipo' : 'asistente'), at: activity.createdAt }
}
