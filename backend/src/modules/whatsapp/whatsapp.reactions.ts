import { z } from 'zod'

/**
 * Reacciones de WhatsApp. Cada emisor tiene a lo sumo una reacción por mensaje:
 * una nueva reemplaza a la anterior y un emoji vacío la quita, igual que en el teléfono.
 */
export type StoredReaction = { emoji: string; fromMe: boolean; sender: string; at: string }

export const ME_SENDER = 'me'

export const reactionSchema = z.object({
  // Vacío quita la reacción. Sin letras, números ASCII ni espacios: sólo emojis.
  emoji: z.string().max(16).refine((value) => value === '' || /^[^\sA-Za-z0-9]+$/u.test(value), 'Elegí un emoji.'),
})

export function readReactions(value: unknown): StoredReaction[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is StoredReaction =>
    Boolean(item) && typeof item === 'object' && typeof item.emoji === 'string' && item.emoji !== '' && typeof item.sender === 'string'
  )
}

export function mergeReaction(current: unknown, input: { emoji: string | null | undefined; fromMe: boolean; sender: string; at: Date }): StoredReaction[] {
  const sender = input.fromMe ? ME_SENDER : input.sender
  const others = readReactions(current).filter((item) => item.sender !== sender)
  if (!input.emoji) return others
  return [...others, { emoji: input.emoji, fromMe: input.fromMe, sender, at: input.at.toISOString() }]
}

/** Datos de un mensaje de reacción de Baileys: a qué mensaje apunta y con qué emoji. */
export function readReactionMessage(message: any) {
  const content = message?.message?.reactionMessage
    ?? message?.message?.ephemeralMessage?.message?.reactionMessage
    ?? message?.message?.viewOnceMessage?.message?.reactionMessage
  const targetId = content?.key?.id
  if (!content || typeof targetId !== 'string' || !targetId) return null
  return {
    targetId,
    emoji: typeof content.text === 'string' ? content.text : '',
    fromMe: Boolean(message?.key?.fromMe),
    sender: String(message?.key?.participant || message?.key?.remoteJid || 'contact'),
  }
}
