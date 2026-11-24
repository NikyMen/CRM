import { db } from '../../core/database'
import { config } from '../../core/config'
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../types'
import { phoneMatchKey } from './collection-whatsapp.phone'

/**
 * Control del asistente de n8n desde el chat comercial del CRM:
 * - «Atiende una persona»: el chat queda marcado y el asistente no responde ni manda seguimientos
 *   (n8n lo lee en GET /inbound/commercial-leads/stage y /inbound/commercial-chats/assistant-paused).
 * - «Forzar IA»: devuelve el chat al asistente y le manda a n8n los mensajes del cliente que
 *   quedaron sin respuesta, por el mismo webhook que usa wppia, para que conteste ya.
 */

type PendingMessage = { fromMe: boolean; messageType: string; text: string | null; mediaFileName: string | null }

const MEDIA_LABEL: Record<string, string> = {
  image: 'Imagen', video: 'Video', audio: 'Audio', document: 'Documento', sticker: 'Sticker',
}
const MAX_FORCED_MESSAGES = 10
const MAX_FORCED_CHARS = 3000

/** Texto de un mensaje para el asistente: el texto o una marca del adjunto. */
function messageForAssistant(message: PendingMessage) {
  const text = message.text?.trim() ?? ''
  const label = MEDIA_LABEL[message.messageType]
  if (!label) return text
  const placeholder = /^\[(Imagen|Video|Audio|Documento|Sticker)\]$/.test(text) || text === message.mediaFileName
  return placeholder || !text ? `[${label}${message.mediaFileName && message.messageType === 'document' ? `: ${message.mediaFileName}` : ''}]` : `[${label}] ${text}`
}

/**
 * Mensajes del cliente que quedaron sin respuesta (los posteriores al último mensaje nuestro),
 * en orden y unidos en un solo texto. `messages` viene del más viejo al más nuevo.
 */
export function unansweredText(messages: PendingMessage[]) {
  const lastMine = messages.map((message) => message.fromMe).lastIndexOf(true)
  const pending = messages.slice(lastMine + 1).filter((message) => !message.fromMe).slice(-MAX_FORCED_MESSAGES)
  const lines = pending.map(messageForAssistant).filter(Boolean)
  return { count: lines.length, text: lines.join('\n').slice(-MAX_FORCED_CHARS) }
}

/** Cuerpo con la forma del webhook de wppia (messages.upsert), marcado como forzado. */
export function buildForcePayload(input: { phone: string; name?: string | null; text: string; id: string; at: number }) {
  return {
    event: 'messages.upsert',
    force: true,
    data: {
      messages: [{
        key: { id: input.id, remoteJid: `${input.phone}@s.whatsapp.net`, fromMe: false, senderPn: `${input.phone}@s.whatsapp.net` },
        pushName: input.name ?? '',
        messageBody: input.text,
        messageTimestamp: Math.floor(input.at / 1000),
      }],
    },
  }
}

/** Si el teléfono está en una lista de la configuración del asistente (comparando los últimos 9 dígitos). */
export function phoneInList(phone: string, list: string[]) {
  const key = phoneMatchKey(phone)
  return Boolean(key) && list.some((item) => phoneMatchKey(item) === key)
}

async function commercialChat(workspaceId: string, chatId: string) {
  const chat = await db.collectionWhatsAppChat.findFirst({
    where: { id: chatId, workspaceId, line: 'commercial' },
    select: { id: true, phoneNumber: true, displayName: true, assistantPaused: true },
  })
  if (!chat) throw new NotFoundError('Chat', chatId)
  return chat
}

export async function setAssistantPaused(workspaceId: string, chatId: string, paused: boolean) {
  await commercialChat(workspaceId, chatId)
  const chat = await db.collectionWhatsAppChat.update({
    where: { id: chatId },
    data: { assistantPaused: paused, assistantPausedAt: paused ? new Date() : null },
    select: { id: true, assistantPaused: true, assistantPausedAt: true },
  })
  return chat
}

/** Hace que el asistente responda ahora los mensajes pendientes del chat (y lo deja activo). */
export async function forceAssistantReply(workspaceId: string, chatId: string) {
  const url = config.ASSISTANT_WEBHOOK_URL
  const secret = config.ASSISTANT_WEBHOOK_SECRET
  if (!url || !secret) throw new AppError(503, 'Forzar IA no está configurado en el servidor (faltan ASSISTANT_WEBHOOK_URL y ASSISTANT_WEBHOOK_SECRET).', 'ASSISTANT_FORCE_NOT_CONFIGURED')

  const chat = await commercialChat(workspaceId, chatId)
  const phone = chat.phoneNumber?.replace(/\D/g, '') ?? ''
  if (!phone) throw new ValidationError('Este chat no tiene un teléfono conocido: el asistente no le puede responder.')

  const settings = await db.assistantSettings.findUnique({ where: { workspaceId }, select: { enabled: true, testOnlyPhones: true, excludedPhones: true, notifyTo: true } })
  if (!settings?.enabled) throw new ConflictError('El asistente está apagado en el panel Asistente IA: encendelo para poder forzarlo.')
  if (settings.testOnlyPhones.length && !phoneInList(phone, settings.testOnlyPhones)) throw new ConflictError('El asistente está en modo prueba y este número no está en la lista de teléfonos de prueba.')
  if (phoneInList(phone, settings.excludedPhones) || (settings.notifyTo && phoneInList(phone, [settings.notifyTo]))) throw new ConflictError('Este número está excluido del asistente en el panel Asistente IA.')

  const recent = await db.collectionWhatsAppMessage.findMany({
    where: { workspaceId, chatId },
    orderBy: { sentAt: 'desc' },
    take: 40,
    select: { fromMe: true, messageType: true, text: true, mediaFileName: true },
  })
  const pending = unansweredText(recent.reverse())
  if (!pending.count) throw new ConflictError('No hay mensajes del cliente sin responder: el último mensaje del chat es nuestro.')

  // Primero se devuelve el chat al asistente: si no, n8n lo vería pausado y no contestaría.
  await db.collectionWhatsAppChat.update({ where: { id: chat.id }, data: { assistantPaused: false, assistantPausedAt: null } })

  const now = Date.now()
  const body = buildForcePayload({ phone, name: chat.displayName, text: pending.text, id: `crm-force-${chat.id}-${now}`, at: now })
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-webhook-secret': secret },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new AppError(502, 'No se pudo contactar al asistente (n8n). Probá de nuevo en un momento.', 'ASSISTANT_UNREACHABLE')
  }
  if (!response.ok) throw new AppError(502, `El asistente (n8n) respondió con error ${response.status}.`, 'ASSISTANT_ERROR')
  return { forced: true, messages: pending.count }
}

/** Teléfonos de los chats comerciales que hoy atiende una persona (para los seguimientos de n8n). */
export async function pausedCommercialPhones(workspaceId: string) {
  const chats = await db.collectionWhatsAppChat.findMany({
    where: { workspaceId, line: 'commercial', assistantPaused: true, phoneNumber: { not: null } },
    select: { phoneNumber: true },
  })
  return chats.map((chat) => chat.phoneNumber!).filter(Boolean)
}

/** Si el chat comercial de ese teléfono lo atiende una persona. */
export async function isAssistantPausedForPhone(workspaceId: string, phone: string) {
  const key = phoneMatchKey(phone)
  if (!key) return false
  const chat = await db.collectionWhatsAppChat.findFirst({
    where: { workspaceId, line: 'commercial', phoneNumber: { endsWith: key }, assistantPaused: true },
    select: { id: true },
  })
  return Boolean(chat)
}
