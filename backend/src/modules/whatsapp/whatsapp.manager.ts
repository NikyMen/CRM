import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { db } from '../../core/database'
import { config } from '../../core/config'
import { ActivityType, AppError, ValidationError } from '../../types'

const prisma = db as any

type SocketEntry = {
  sock: any
  saveCreds: () => Promise<void>
  state: any
}

type SessionStatus =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'PAIRING'
  | 'CONNECTED'
  | 'ERROR'

type ConnectOptions = {
  mode?: 'qr'
}

type PersistMessageOptions = {
  allowHistorical?: boolean
  recoveryCutoff?: Date | null
}

type ProfilePhotoCacheEntry = {
  url: string | null
  expiresAt: number
}

type SessionRecord = Awaited<ReturnType<WhatsAppManager['readSessionRecord']>>
type HistoryContactMap = Map<string, string>

const AUTH_ROOT = config.WHATSAPP_AUTH_DIR
  ? path.resolve(config.WHATSAPP_AUTH_DIR)
  : path.resolve(process.cwd(), '.data', 'whatsapp-auth')

const MEDIA_ROOT = config.WHATSAPP_MEDIA_DIR
  ? path.resolve(config.WHATSAPP_MEDIA_DIR)
  : path.resolve(process.cwd(), '.data', 'whatsapp-media')

const MAINTENANCE_ROOT = path.resolve(process.cwd(), '.data', 'maintenance')
const WHATSAPP_PRUNE_ONCE_MARKER = path.resolve(MAINTENANCE_ROOT, 'whatsapp-prune-once.json')
const RECOVERY_SYNC_SKEW_MS = 15 * 60 * 1000
const RECOVERY_SYNC_MAX_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000
const APP_STATE_SYNC_COLLECTIONS = [
  'critical_block',
  'critical_unblock_low',
  'regular_high',
  'regular_low',
  'regular',
] as const

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isServerlessRuntime() {
  return Boolean(
    process.env.VERCEL === '1' ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.AWS_EXECUTION_ENV?.startsWith('AWS_Lambda') ||
    process.env.LAMBDA_TASK_ROOT
  )
}

function normalizePhoneNumber(value?: string | null) {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  return digits.length >= 10 ? digits : null
}

function normalizeLabel(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizePersonName(value?: string | null) {
  const normalized = normalizeLabel(value)
  return normalized ? normalized.replace(/\s+/g, ' ').toLowerCase() : null
}

function hasReadableDisplayName(value?: string | null, fallback?: string | null) {
  const normalized = normalizeLabel(value)
  if (!normalized) return false
  if (fallback && normalized === fallback) return false
  return /[^\d\s()+-]/.test(normalized)
}

function selectChatDisplayName(...candidates: Array<string | null | undefined>) {
  const cleaned = candidates
    .map(normalizeLabel)
    .filter((value): value is string => Boolean(value))

  if (!cleaned.length) return null

  return cleaned.find((value) => /[^\d\s()+-]/.test(value)) ?? cleaned[0]
}

function splitContactName(value?: string | null) {
  const normalized = normalizeLabel(value)
  if (!normalized) {
    return { firstName: 'Nuevo lead', lastName: null as string | null }
  }

  const parts = normalized.split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] ?? 'Nuevo lead',
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : null,
  }
}

function buildContactName(contact?: { firstName?: string | null; lastName?: string | null } | null) {
  if (!contact?.firstName) return null
  return `${contact.firstName}${contact.lastName ? ` ${contact.lastName}` : ''}`
}

function buildHistoryContactMap(contacts: any[]): HistoryContactMap {
  const map: HistoryContactMap = new Map()

  for (const contact of contacts) {
    const jid = normalizeLabel(contact?.id)
    const label = selectChatDisplayName(
      contact?.name,
      contact?.notify,
      contact?.verifiedName,
      contact?.status
    )

    if (jid && label) {
      map.set(jid, label)
    }
  }

  return map
}

function extractPhoneNumberFromJid(jid?: string | null) {
  if (!jid) return null
  if (jid.endsWith('@lid')) return null
  const match = jid.match(/^(\d+)(?=@)/)
  return match?.[1] ?? null
}

function isLidJid(jid?: string | null) {
  return Boolean(jid?.endsWith('@lid'))
}

function isPhoneUserJid(jid?: string | null) {
  return Boolean(jid?.endsWith('@s.whatsapp.net'))
}

function ensureJidServer(jid: string | null | undefined, server: '@lid' | '@s.whatsapp.net') {
  const normalized = normalizeLabel(jid)
  if (!normalized) return null
  if (normalized.endsWith('@lid') || normalized.endsWith('@s.whatsapp.net')) return normalized

  const digits = normalizePhoneNumber(normalized)
  return digits ? `${digits}${server}` : null
}

function supportsChat(jid?: string | null) {
  if (!jid) return false
  return !jid.includes('status@broadcast')
}

function toDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'number') {
    return new Date(value > 1_000_000_000_000 ? value : value * 1000)
  }
  if (typeof value === 'string') {
    const asNumber = Number(value)
    if (!Number.isNaN(asNumber)) {
      return new Date(asNumber > 1_000_000_000_000 ? asNumber : asNumber * 1000)
    }
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (typeof value === 'object') {
    const maybeNumber =
      (value as any).toNumber?.() ??
      (value as any).low ??
      (value as any).value
    if (typeof maybeNumber === 'number') {
      return new Date(maybeNumber > 1_000_000_000_000 ? maybeNumber : maybeNumber * 1000)
    }
  }
  return null
}

function toNullableNumber(value: unknown) {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  if (typeof value === 'object') {
    const maybeNumber =
      (value as any).toNumber?.() ??
      (value as any).low ??
      (value as any).value
    return typeof maybeNumber === 'number' && Number.isFinite(maybeNumber) ? maybeNumber : null
  }
  return null
}

function normalizeMessageStatus(value: unknown, fromMe = false) {
  if (value == null) {
    return fromMe ? 'sent' : null
  }

  const asNumber =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^-?\d+$/.test(value.trim())
        ? Number(value.trim())
        : null

  if (asNumber != null) {
    switch (asNumber) {
      case 0:
        return 'error'
      case 1:
      case 2:
        return fromMe ? 'sent' : 'pending'
      case 3:
        return 'delivered'
      case 4:
      case 5:
        return 'read'
      default:
        return fromMe ? 'sent' : String(value)
    }
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()

    if (!normalized) {
      return fromMe ? 'sent' : null
    }

    if (['error', 'failed'].includes(normalized)) return 'error'
    if (['sending', 'processing'].includes(normalized)) return 'sending'
    if (['delivered', 'delivery_ack', 'delivery-ack'].includes(normalized)) return 'delivered'
    if (['read', 'played'].includes(normalized)) return 'read'
    if (['pending', 'queued', 'server_ack', 'server-ack', 'ack', 'sent', 'success'].includes(normalized)) {
      return fromMe ? 'sent' : normalized
    }
  }

  return fromMe ? 'sent' : String(value)
}

function unwrapMessage(message: any): any {
  let current = message

  while (current) {
    if (current.ephemeralMessage?.message) {
      current = current.ephemeralMessage.message
      continue
    }
    if (current.viewOnceMessage?.message) {
      current = current.viewOnceMessage.message
      continue
    }
    if (current.viewOnceMessageV2?.message) {
      current = current.viewOnceMessageV2.message
      continue
    }
    if (current.viewOnceMessageV2Extension?.message) {
      current = current.viewOnceMessageV2Extension.message
      continue
    }
    if (current.documentWithCaptionMessage?.message) {
      current = current.documentWithCaptionMessage.message
      continue
    }
    return current
  }

  return null
}

function extractContextInfo(content: any) {
  return (
    content?.extendedTextMessage?.contextInfo ??
    content?.imageMessage?.contextInfo ??
    content?.videoMessage?.contextInfo ??
    content?.audioMessage?.contextInfo ??
    content?.documentMessage?.contextInfo ??
    content?.stickerMessage?.contextInfo ??
    content?.contactMessage?.contextInfo ??
    content?.locationMessage?.contextInfo ??
    null
  )
}

function extractQuotedReference(contextInfo: any) {
  const quotedMessageId = normalizeLabel(contextInfo?.stanzaId)
  const quotedPayload = contextInfo?.quotedMessage
    ? extractMessageDetails({ message: contextInfo.quotedMessage, key: { fromMe: false } })
    : null

  return {
    quotedMessageId,
    quotedText: quotedPayload?.text ?? (quotedPayload?.messageType ? messagePreview(quotedPayload.messageType, null) : null),
    quotedMessageType: quotedPayload?.messageType ?? null,
  }
}

function extractMessageDetails(payload: any) {
  const content = unwrapMessage(payload?.message)
  const fromMe = Boolean(payload?.key?.fromMe)
  const status = normalizeMessageStatus(payload?.status, fromMe)

  if (!content) {
    return {
      messageType: 'unknown',
      text: payload?.messageStubParameters?.join?.(', ') ?? null,
      status,
      quotedMessageId: null,
      quotedText: null,
      quotedMessageType: null,
    }
  }

  const quoted = extractQuotedReference(extractContextInfo(content))

  if (content.conversation) return { messageType: 'text', text: content.conversation, status, ...quoted }
  if (content.extendedTextMessage?.text) return { messageType: 'text', text: content.extendedTextMessage.text, status, ...quoted }
  if (content.imageMessage) {
    return {
      messageType: 'image',
      text: content.imageMessage.caption ?? '[Imagen]',
      status,
      ...quoted,
      mediaMimeType: content.imageMessage.mimetype ?? null,
      mediaFileName: null,
      mediaSizeBytes: toNullableNumber(content.imageMessage.fileLength),
      mediaDurationSeconds: null,
    }
  }
  if (content.videoMessage) {
    return {
      messageType: 'video',
      text: content.videoMessage.caption ?? '[Video]',
      status,
      ...quoted,
      mediaMimeType: content.videoMessage.mimetype ?? null,
      mediaFileName: null,
      mediaSizeBytes: toNullableNumber(content.videoMessage.fileLength),
      mediaDurationSeconds: toNullableNumber(content.videoMessage.seconds),
    }
  }
  if (content.audioMessage) {
    return {
      messageType: 'audio',
      text: '[Audio]',
      status,
      ...quoted,
      mediaMimeType: content.audioMessage.mimetype ?? null,
      mediaFileName: null,
      mediaSizeBytes: toNullableNumber(content.audioMessage.fileLength),
      mediaDurationSeconds: toNullableNumber(content.audioMessage.seconds),
    }
  }
  if (content.documentMessage) {
    return {
      messageType: 'document',
      text: content.documentMessage.fileName ?? '[Documento]',
      status,
      ...quoted,
      mediaMimeType: content.documentMessage.mimetype ?? null,
      mediaFileName: content.documentMessage.fileName ?? null,
      mediaSizeBytes: toNullableNumber(content.documentMessage.fileLength),
      mediaDurationSeconds: null,
    }
  }
  if (content.stickerMessage) return { messageType: 'sticker', text: '[Sticker]', status, ...quoted }
  if (content.contactMessage) return { messageType: 'contact', text: '[Contacto]', status, ...quoted }
  if (content.locationMessage) return { messageType: 'location', text: '[Ubicacion]', status, ...quoted }
  if (content.reactionMessage) {
    return {
      messageType: 'reaction',
      text: content.reactionMessage.text ? `[Reaccion ${content.reactionMessage.text}]` : '[Reaccion]',
      status,
      ...quoted,
    }
  }

  const firstKey = Object.keys(content)[0] ?? 'unknown'
  return { messageType: firstKey, text: `[${firstKey}]`, status, ...quoted }
}

function messagePreview(messageType: string, text?: string | null) {
  if (text && text.trim()) return text.trim()

  switch (messageType) {
    case 'image':
      return '[Imagen]'
    case 'video':
      return '[Video]'
    case 'audio':
      return '[Audio]'
    case 'document':
      return '[Documento]'
    case 'sticker':
      return '[Sticker]'
    case 'reaction':
      return '[Reaccion]'
    default:
      return '[Mensaje]'
  }
}

function mediaExtension(messageType: string, mimeType?: string | null, fileName?: string | null) {
  const fromName = fileName ? path.extname(fileName) : ''
  if (fromName) return fromName

  const normalizedMime = mimeType?.split(';')[0]?.trim().toLowerCase()
  if (!normalizedMime) {
    if (messageType === 'audio') return '.ogg'
    if (messageType === 'image') return '.jpg'
    if (messageType === 'video') return '.mp4'
    return ''
  }

  const directMap: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'audio/ogg': '.ogg',
    'audio/opus': '.opus',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'video/mp4': '.mp4',
    'application/pdf': '.pdf',
  }

  if (directMap[normalizedMime]) return directMap[normalizedMime]

  const [, subtype] = normalizedMime.split('/')
  return subtype ? `.${subtype.replace(/[^a-z0-9]/gi, '')}` : ''
}

function isDownloadableMediaMessage(messageType: string) {
  return ['image', 'audio', 'video', 'document'].includes(messageType)
}

function padLeadPart(value: number | string, size: number) {
  return String(value).padStart(size, '0')
}

function buildLeadNumberBase(phoneNumber: string, sentAt: Date) {
  const lastDigits = phoneNumber.slice(-6).padStart(6, '0')
  return [
    padLeadPart(sentAt.getFullYear() % 100, 2),
    padLeadPart(sentAt.getMonth() + 1, 2),
    padLeadPart(sentAt.getDate(), 2),
    padLeadPart(sentAt.getHours(), 2),
    padLeadPart(sentAt.getMinutes(), 2),
    padLeadPart(sentAt.getSeconds(), 2),
    lastDigits,
  ].join('')
}

function isPersistableMessage(details: { messageType: string; text?: string | null }, message: any) {
  if (message?.messageStubType != null) return false

  const ignoredTypes = new Set([
    'unknown',
    'protocolMessage',
    'senderKeyDistributionMessage',
    'messageContextInfo',
    'fastRatchetKeySenderKeyDistributionMessage',
  ])

  if (ignoredTypes.has(details.messageType)) {
    return false
  }

  if (!details.text && !['audio', 'sticker', 'reaction'].includes(details.messageType)) {
    return false
  }

  return true
}

export class WhatsAppManager {
  private sockets = new Map<string, SocketEntry>()
  private booting = new Map<string, Promise<SocketEntry>>()
  private reconnectTimers = new Map<string, NodeJS.Timeout>()
  private manualDisconnects = new Map<string, any>()
  private baileysModule: any | null = null
  private baileysVersion: number[] | null = null
  private messageSchemaCapabilitiesPromise: Promise<{ quoted: boolean }> | null = null
  private devMaintenancePromise: Promise<void> | null = null
  private lidAliases = new Map<string, Map<string, string>>()
  private profilePhotoCache = new Map<string, Map<string, ProfilePhotoCacheEntry>>()

  isRuntimeCompatible() {
    if (isServerlessRuntime()) {
      return false
    }

    if (config.NODE_ENV === 'development') {
      return true
    }

    return true
  }

  isPackageInstalled() {
    try {
      require.resolve('baileys')
      return true
    } catch {
      return false
    }
  }

  async getSessionSnapshot(workspaceId: string) {
    await this.ensureDevMaintenanceAppliedOnce()
    const session = await this.readSessionRecord(workspaceId)

    const [authAvailable, chatCount] = await Promise.all([
      this.hasAuthState(workspaceId),
      prisma.whatsAppChat.count({
        where: {
          workspaceId,
          isGroup: false,
          messages: {
            some: {},
          },
        },
      }),
    ])

    return {
      ...session,
      packageInstalled: this.isPackageInstalled(),
      runtimeCompatible: this.isRuntimeCompatible(),
      authAvailable,
      hasActiveSocket: Boolean(this.sockets.get(workspaceId)?.sock),
      chatCount,
    }
  }

  async connect(workspaceId: string, options?: ConnectOptions) {
    this.assertRuntimeReady()

    const authAvailable = await this.hasAuthState(workspaceId)

    const existing = await this.ensureSessionRecord(workspaceId)
    if (existing.status === 'CONNECTED' && this.sockets.get(workspaceId)?.sock) {
      return this.getSessionSnapshot(workspaceId)
    }

    let entry: SocketEntry
    try {
      entry = await this.ensureSocket(workspaceId)
    } catch (error) {
      const message = this.formatStartupError(error)
      await this.updateSession(workspaceId, {
        status: 'ERROR',
        qrCode: null,
        pairingCode: null,
        pairingCodeIssuedAt: null,
        lastError: message,
      }).catch(() => {})

      if (error instanceof AppError) {
        throw error
      }

      throw new AppError(502, message, 'WHATSAPP_SOCKET_INIT_FAILED')
    }

    if (!entry.state?.creds?.registered) {
      await this.updateSession(workspaceId, {
        status: 'PAIRING',
        phoneNumber: null,
        pairingCode: null,
        pairingCodeIssuedAt: null,
        lastError: null,
      })

      const session = await this.waitForSessionQr(workspaceId, 20_000)

      if (session.status !== 'CONNECTED' && !session.qrCode) {
        throw new AppError(
          502,
          session.lastError ?? 'Baileys no pudo emitir el QR. Reintenta en unos segundos.',
          'WHATSAPP_QR_INIT_FAILED'
        )
      }
    }

    return this.getSessionSnapshot(workspaceId)
  }

  async disconnect(workspaceId: string) {
    const entry = this.sockets.get(workspaceId)
    const timer = this.reconnectTimers.get(workspaceId)

    if (timer) {
      clearTimeout(timer)
      this.reconnectTimers.delete(workspaceId)
    }

    if (entry?.sock) {
      this.manualDisconnects.set(workspaceId, entry.sock)
      try {
        entry.sock.end?.(new Error('manual disconnect'))
      } catch {
        try {
          entry.sock.end?.(new Error('manual disconnect'))
        } catch {
          // noop
        }
      }
    }

    this.sockets.delete(workspaceId)

    await this.updateSession(workspaceId, {
      status: 'DISCONNECTED',
      pairingCode: null,
      pairingCodeIssuedAt: null,
      qrCode: null,
      lastError: null,
      lastDisconnectedAt: new Date(),
    })
  }

  async repairSchemaAndPruneOldMessages(maxAgeDays = 2) {
    const safeDays = Math.max(1, Math.min(30, Math.trunc(maxAgeDays) || 2))

    if (existsSync(WHATSAPP_PRUNE_ONCE_MARKER)) {
      throw new AppError(
        409,
        'La limpieza unica de WhatsApp ya fue ejecutada en este entorno. No vuelve a correr automaticamente.',
        'WHATSAPP_PRUNE_ALREADY_RUN'
      )
    }

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "public"."whatsapp_messages"
      ADD COLUMN IF NOT EXISTS "mediaPath" TEXT,
      ADD COLUMN IF NOT EXISTS "mediaMimeType" TEXT,
      ADD COLUMN IF NOT EXISTS "mediaFileName" TEXT,
      ADD COLUMN IF NOT EXISTS "mediaSizeBytes" INTEGER,
      ADD COLUMN IF NOT EXISTS "mediaDurationSeconds" INTEGER,
      ADD COLUMN IF NOT EXISTS "quotedMessageId" TEXT,
      ADD COLUMN IF NOT EXISTS "quotedText" TEXT,
      ADD COLUMN IF NOT EXISTS "quotedMessageType" TEXT
    `)

    this.messageSchemaCapabilitiesPromise = Promise.resolve({ quoted: true })

    const [{ count: beforeCountRaw } = { count: 0 }] = await prisma.$queryRawUnsafe(
      `
        SELECT COUNT(*)::bigint AS count
        FROM "public"."whatsapp_messages"
        WHERE "sentAt" < NOW() - ($1::text || ' days')::interval
      `,
      String(safeDays)
    )

    const deleted = await prisma.whatsAppMessage.deleteMany({
      where: {
        sentAt: {
          lt: new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000),
        },
      },
    })

    const [{ count: afterCountRaw } = { count: 0 }] = await prisma.$queryRawUnsafe(
      `
        SELECT COUNT(*)::bigint AS count
        FROM "public"."whatsapp_messages"
        WHERE "sentAt" < NOW() - ($1::text || ' days')::interval
      `,
      String(safeDays)
    )

    await fs.mkdir(MAINTENANCE_ROOT, { recursive: true })
    await fs.writeFile(
      WHATSAPP_PRUNE_ONCE_MARKER,
      JSON.stringify(
        {
          ranAt: new Date().toISOString(),
          maxAgeDays: safeDays,
          deletedCount: deleted.count,
        },
        null,
        2
      ),
      'utf8'
    )

    return {
      repairedColumns: true,
      maxAgeDays: safeDays,
      oldMessagesBefore: Number(beforeCountRaw),
      deletedCount: deleted.count,
      oldMessagesAfter: Number(afterCountRaw),
    }
  }

  private async ensureDevMaintenanceAppliedOnce() {
    if (config.NODE_ENV !== 'development') return
    if (existsSync(WHATSAPP_PRUNE_ONCE_MARKER)) return

    if (!this.devMaintenancePromise) {
      this.devMaintenancePromise = (async () => {
        try {
          await this.repairSchemaAndPruneOldMessages(2)
        } catch (error: any) {
          if (error?.code !== 'WHATSAPP_PRUNE_ALREADY_RUN') {
            console.error('[whatsapp] no se pudo ejecutar la reparacion/poda unica:', error?.message ?? error)
          }
        }
      })()
    }

    await this.devMaintenancePromise
  }

  async listChats(workspaceId: string, search?: string) {
    await this.ensureDevMaintenanceAppliedOnce()
    await this.linkChatsToContacts(workspaceId)
    await this.mergeDuplicateContactChats(workspaceId)
    const normalizedSearch = search?.trim()

    const chats = await prisma.whatsAppChat.findMany({
      where: {
        workspaceId,
        isGroup: false,
        messages: {
          some: {},
        },
        ...(normalizedSearch
          ? {
              OR: [
                { displayName: { contains: normalizedSearch, mode: 'insensitive' } },
                { phoneNumber: { contains: normalizedSearch } },
                {
                  contact: {
                    is: {
                      OR: [
                        { firstName: { contains: normalizedSearch, mode: 'insensitive' } },
                        { lastName: { contains: normalizedSearch, mode: 'insensitive' } },
                      ],
                    },
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        contact: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
      take: 150,
    })

    return Promise.all(chats.map(async (chat) => ({
      ...chat,
      phoneNumber: chat.phoneNumber ?? extractPhoneNumberFromJid(chat.jid),
      profileImageUrl: await this.getChatProfileImageUrl(workspaceId, chat.jid),
      contactName: chat.contact
        ? `${chat.contact.firstName}${chat.contact.lastName ? ` ${chat.contact.lastName}` : ''}`
        : null,
    })))
  }

  async listMessages(workspaceId: string, jid: string, limit = 60) {
    await this.ensureDevMaintenanceAppliedOnce()
    const canonicalJid = await this.resolveCanonicalJid(workspaceId, jid)
    const chat = await prisma.whatsAppChat.findUnique({
      where: { workspaceId_jid: { workspaceId, jid: canonicalJid } },
      include: {
        contact: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    })

    if (!chat) {
      return {
        chat: null,
        items: [],
        totalMessages: 0,
        historyAnchorAvailable: false,
      }
    }

    const limitValue = Math.min(Math.max(limit, 1), 120)
    const [items, totalMessages] = await Promise.all([
      this.readMessageRecords(workspaceId, chat.id, limitValue),
      prisma.whatsAppMessage.count({
        where: {
          workspaceId,
          chatId: chat.id,
        },
      }),
    ])

    return {
      chat: {
        ...chat,
        phoneNumber: chat.phoneNumber ?? extractPhoneNumberFromJid(chat.jid),
        profileImageUrl: await this.getChatProfileImageUrl(workspaceId, chat.jid),
        contactName: chat.contact
          ? `${chat.contact.firstName}${chat.contact.lastName ? ` ${chat.contact.lastName}` : ''}`
          : null,
      },
      items: items.reverse().map((item) => this.serializeMessageRecord(item)),
      totalMessages,
      historyAnchorAvailable: totalMessages > 0,
    }
  }

  async deleteChat(workspaceId: string, jid: string) {
    await this.ensureDevMaintenanceAppliedOnce()
    const canonicalJid = await this.resolveCanonicalJid(workspaceId, jid)
    const chat = await prisma.whatsAppChat.findUnique({
      where: { workspaceId_jid: { workspaceId, jid: canonicalJid } },
      select: { id: true, jid: true },
    })

    if (!chat) {
      throw new AppError(404, 'Chat no encontrado.', 'NOT_FOUND')
    }

    await prisma.whatsAppChat.delete({
      where: { id: chat.id },
    })

    this.getWorkspaceProfilePhotoCache(workspaceId).delete(chat.jid)
    this.getWorkspaceLidAliases(workspaceId).delete(chat.jid)
  }

  async requestHistorySync(workspaceId: string, jid: string, count = 40) {
    void workspaceId
    void jid
    void count
    throw new AppError(
      409,
      'La recuperacion de historial desde WhatsApp esta deshabilitada. Solo mostramos lo que esta persistido en esta app.',
      'WHATSAPP_HISTORY_DISABLED'
    )
  }

  async sendTextMessage(workspaceId: string, jid: string, text: string) {
    this.assertRuntimeReady()
    const sendJid = await this.resolveCanonicalJid(workspaceId, jid)

    let entry = this.sockets.get(workspaceId)
    if (!entry) {
      const authAvailable = await this.hasAuthState(workspaceId)
      if (!authAvailable) {
        throw new AppError(409, 'No hay una sesion de WhatsApp vinculada para este workspace.', 'WHATSAPP_NOT_LINKED')
      }
      await this.connect(workspaceId, { mode: 'qr' })
      entry = this.sockets.get(workspaceId)
    }

    const session = await this.ensureSessionRecord(workspaceId)
    if (session.status !== 'CONNECTED' || !entry?.sock) {
      throw new AppError(409, 'WhatsApp todavia no esta conectado. Espera unos segundos y reintenta.', 'WHATSAPP_NOT_CONNECTED')
    }

    const sent = await entry.sock.sendMessage(sendJid, { text })
    const persisted =
      (sent ? await this.persistMessage(workspaceId, sent) : null) ??
      await this.persistOutgoingFallback(workspaceId, sendJid, text, sent)
    return persisted ? this.serializeMessageRecord(persisted) : null
  }

  async getMessageMedia(workspaceId: string, messageDbId: string) {
    await this.ensureDevMaintenanceAppliedOnce()
    let message: any
    try {
      ;[message] = await prisma.$queryRawUnsafe(
        `
          SELECT id, "mediaPath", "mediaMimeType", "mediaFileName"
          FROM whatsapp_messages
          WHERE id = $1 AND "workspaceId" = $2
          LIMIT 1
        `,
        messageDbId,
        workspaceId
      )
    } catch {
      throw new AppError(404, 'La base todavia no tiene soporte de media para este mensaje.', 'WHATSAPP_MEDIA_NOT_AVAILABLE')
    }

    if (!message?.mediaPath) {
      throw new AppError(404, 'Ese mensaje no tiene media descargada.', 'WHATSAPP_MEDIA_NOT_FOUND')
    }

    const mediaRoot = path.resolve(MEDIA_ROOT)
    const absolutePath = path.resolve(mediaRoot, String(message.mediaPath))
    if (!absolutePath.startsWith(mediaRoot) || !existsSync(absolutePath)) {
      throw new AppError(404, 'No encontramos el archivo multimedia local.', 'WHATSAPP_MEDIA_FILE_MISSING')
    }

    return {
      fileName: (message.mediaFileName as string | null | undefined) ?? path.basename(absolutePath),
      mimeType: (message.mediaMimeType as string | null | undefined) ?? 'application/octet-stream',
      buffer: await fs.readFile(absolutePath),
    }
  }

  private async ensureSocket(workspaceId: string) {
    const existing = this.sockets.get(workspaceId)
    if (existing?.sock) return existing

    const pending = this.booting.get(workspaceId)
    if (pending) return pending

    const promise = this.createSocket(workspaceId)
    this.booting.set(workspaceId, promise)

    try {
      return await promise
    } finally {
      this.booting.delete(workspaceId)
    }
  }

  private async createSocket(workspaceId: string) {
    const baileys = await this.loadBaileys()
    const authDir = this.getAuthDir(workspaceId)
    const version = await this.resolveBaileysVersion(baileys)

    await fs.mkdir(authDir, { recursive: true })

    const { state, saveCreds } = await baileys.useMultiFileAuthState(authDir)
    const makeWASocket = baileys.makeWASocket ?? baileys.default
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      defaultQueryTimeoutMs: 60_000,
      connectTimeoutMs: 20_000,
      fireInitQueries: true,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => true,
      version,
      getMessage: async () => undefined,
    })

    const entry: SocketEntry = { sock, saveCreds, state }
    this.sockets.set(workspaceId, entry)

    await this.updateSession(workspaceId, {
      status: state?.creds?.registered ? 'CONNECTING' : 'PAIRING',
      lastError: null,
    })

    sock.ev.on('creds.update', () => {
      void saveCreds().catch(() => {})
    })
    sock.ev.on('connection.update', (update: any) => {
      void this.handleConnectionUpdate(workspaceId, entry, update)
    })
    sock.ev.on('messaging-history.set', (payload: any) => {
      void this.handleHistorySync(workspaceId, payload)
    })
    sock.ev.on('chats.upsert', (payload: any[]) => {
      void this.persistChats(workspaceId, payload ?? [])
    })
    sock.ev.on('chats.update', (payload: any[]) => {
      void this.applyChatUpdates(workspaceId, payload ?? [])
    })
    sock.ev.on('chats.phoneNumberShare', (payload: any) => {
      void this.rememberPhoneNumberShare(workspaceId, payload?.lid, payload?.jid)
    })
    sock.ev.on('contacts.upsert', (payload: any[]) => {
      void this.rememberContactAliases(workspaceId, payload ?? [])
    })
    sock.ev.on('contacts.update', (payload: any[]) => {
      void this.rememberContactAliases(workspaceId, payload ?? [])
    })
    sock.ev.on('messages.upsert', (payload: any) => {
      void this.persistMessages(workspaceId, payload?.messages ?? [])
    })
    sock.ev.on('messages.update', (updates: any[]) => {
      void this.applyMessageUpdates(workspaceId, updates ?? [])
    })
    sock.ev.on('messages.delete', (payload: any) => {
      void this.applyDeletedMessages(workspaceId, payload)
    })

    return entry
  }

  private async loadBaileys() {
    if (this.baileysModule) return this.baileysModule

    try {
      const loaded = await import('baileys')
      this.baileysModule = loaded
      return loaded
    } catch {
      throw new AppError(
        503,
        'Baileys no esta instalado en backend. Corre npm install dentro de backend antes de usar WhatsApp.',
        'WHATSAPP_DEPENDENCY_MISSING'
      )
    }
  }

  private async resolveBaileysVersion(baileys: any) {
    if (this.baileysVersion) {
      return this.baileysVersion
    }

    try {
      const latest = await baileys.fetchLatestBaileysVersion?.()
      if (Array.isArray(latest?.version) && latest.version.length === 3) {
        this.baileysVersion = latest.version
        return latest.version
      }
    } catch {
      // fallback to Baileys defaults
    }

    return undefined
  }

  private assertRuntimeReady() {
    if (!this.isRuntimeCompatible()) {
      throw new AppError(
        503,
        'Baileys no funciona de forma estable en este runtime serverless. Necesitas ejecutar el backend persistente.',
        'WHATSAPP_SERVERLESS_UNSUPPORTED'
      )
    }

    if (!this.isPackageInstalled()) {
      throw new AppError(
        503,
        'Baileys no esta instalado en backend. Corre npm install dentro de backend antes de usar WhatsApp.',
        'WHATSAPP_DEPENDENCY_MISSING'
      )
    }
  }

  private async handleConnectionUpdate(workspaceId: string, entry: SocketEntry, update: any) {
    if (update?.qr) {
      await this.updateSession(workspaceId, {
        status: 'PAIRING',
        qrCode: update.qr,
        lastError: null,
      })
    }

    if (update?.connection === 'connecting') {
      await this.updateSession(workspaceId, { status: 'CONNECTING', lastError: null })
    }

    if (update?.connection === 'open') {
      const currentSession = await this.readSessionRecord(workspaceId)
      const shouldResetInboxWindow =
        !currentSession.lastConnectedAt ||
        currentSession.status === 'DISCONNECTED' ||
        currentSession.status === 'PAIRING' ||
        currentSession.status === 'ERROR'

      await this.updateSession(workspaceId, {
        status: 'CONNECTED',
        phoneJid: entry.sock.user?.id ?? null,
        pushName: entry.sock.user?.name ?? entry.sock.user?.notify ?? null,
        lastConnectedAt: shouldResetInboxWindow ? new Date() : currentSession.lastConnectedAt,
        pairingCode: null,
        pairingCodeIssuedAt: null,
        qrCode: null,
        lastError: null,
      })
      void this.resyncRecentAppState(workspaceId, entry)
      return
    }

    if (update?.connection === 'close') {
      const disconnectCode = this.extractDisconnectCode(update?.lastDisconnect?.error)
      const loggedOut = disconnectCode === 401
      const manualDisconnectSock = this.manualDisconnects.get(workspaceId)
      const manuallyDisconnected = manualDisconnectSock === entry.sock
      if (manuallyDisconnected) {
        this.manualDisconnects.delete(workspaceId)
      }

      if (this.sockets.get(workspaceId)?.sock === entry.sock) {
        this.sockets.delete(workspaceId)
      }

      if (manuallyDisconnected) {
        await this.updateSession(workspaceId, {
          status: 'DISCONNECTED',
          lastDisconnectedAt: new Date(),
          lastDisconnectCode: disconnectCode,
          pairingCode: null,
          pairingCodeIssuedAt: null,
          qrCode: null,
          lastError: null,
        })
        return
      }

      if (loggedOut) {
        await this.clearAuthState(workspaceId)
      }

      await this.updateSession(workspaceId, {
        status: loggedOut ? 'DISCONNECTED' : 'CONNECTING',
        lastDisconnectedAt: new Date(),
        lastDisconnectCode: disconnectCode,
        pairingCode: null,
        pairingCodeIssuedAt: null,
        qrCode: null,
        lastError: loggedOut
          ? 'La sesion se cerro desde WhatsApp. Tenes que vincularla de nuevo.'
          : this.formatDisconnectError(update?.lastDisconnect?.error),
      })

      if (!loggedOut) {
        this.scheduleReconnect(workspaceId)
      }
    }
  }

  private scheduleReconnect(workspaceId: string) {
    if (this.reconnectTimers.has(workspaceId)) return

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(workspaceId)
      void this.connect(workspaceId, { mode: 'qr' }).catch(async (error) => {
        await this.updateSession(workspaceId, {
          status: 'ERROR',
          lastError: error instanceof Error ? error.message : 'No se pudo reconectar WhatsApp.',
        })
      })
    }, 3000)

    this.reconnectTimers.set(workspaceId, timer)
  }

  private async persistHistory(workspaceId: string, chats: any[], messages: any[], contacts: any[] = []) {
    const historyContacts = buildHistoryContactMap(contacts)
    await this.persistChats(workspaceId, chats, historyContacts)
    await this.persistMessages(workspaceId, messages)
  }

  private async persistChats(workspaceId: string, chats: any[], historyContacts?: HistoryContactMap) {
    for (const chat of chats) {
      try {
        await this.persistChat(workspaceId, chat, historyContacts)
      } catch {
        // noop
      }
    }
  }

  private async persistMessages(workspaceId: string, messages: any[], options?: PersistMessageOptions) {
    for (const message of messages) {
      try {
        await this.persistMessage(workspaceId, message, options)
      } catch {
        // noop
      }
    }
  }

  private buildRecoveryCutoff(session: SessionRecord) {
    const now = Date.now()
    const baseTimestamp = session.lastDisconnectedAt ?? session.lastConnectedAt
    if (!baseTimestamp) return null

    const recoveredAt = new Date(baseTimestamp).getTime()
    if (Number.isNaN(recoveredAt)) return null

    return new Date(
      Math.max(
        recoveredAt - RECOVERY_SYNC_SKEW_MS,
        now - RECOVERY_SYNC_MAX_LOOKBACK_MS
      )
    )
  }

  private async handleHistorySync(workspaceId: string, payload: any) {
    const session = await this.readSessionRecord(workspaceId)
    const recoveryCutoff = this.buildRecoveryCutoff(session)
    if (!recoveryCutoff) return

    const chats = Array.isArray(payload?.chats) ? payload.chats : []
    const messages = Array.isArray(payload?.messages) ? payload.messages : []
    const contacts = Array.isArray(payload?.contacts) ? payload.contacts : []
    await this.rememberContactAliases(workspaceId, contacts)
    const historyContacts = buildHistoryContactMap(contacts)

    const relevantChats = chats.filter((chat) => {
      const chatTimestamp = toDate(
        chat?.conversationTimestamp ??
        chat?.lastMessageRecvTimestamp ??
        chat?.lastMessage?.messageTimestamp
      )

      return !chatTimestamp || chatTimestamp >= recoveryCutoff
    })

    const relevantMessages = messages.filter((message) => {
      const sentAt = toDate(message?.messageTimestamp)
      return !sentAt || sentAt >= recoveryCutoff
    })

    if (!relevantChats.length && !relevantMessages.length) {
      return
    }

    await this.persistChats(workspaceId, relevantChats, historyContacts)
    await this.persistMessages(workspaceId, relevantMessages, {
      allowHistorical: true,
      recoveryCutoff,
    })
  }

  private async applyChatUpdates(workspaceId: string, chats: any[]) {
    await this.persistChats(
      workspaceId,
      chats.map((chat) => ({
        ...chat,
        id: chat?.id ?? chat?.jid,
      }))
    )
  }

  private getWorkspaceLidAliases(workspaceId: string) {
    let aliases = this.lidAliases.get(workspaceId)
    if (!aliases) {
      aliases = new Map()
      this.lidAliases.set(workspaceId, aliases)
    }
    return aliases
  }

  private getWorkspaceProfilePhotoCache(workspaceId: string) {
    let cache = this.profilePhotoCache.get(workspaceId)
    if (!cache) {
      cache = new Map()
      this.profilePhotoCache.set(workspaceId, cache)
    }
    return cache
  }

  async getChatProfileImageUrl(workspaceId: string, jid?: string | null) {
    const normalizedJid = normalizeLabel(jid)
    if (!normalizedJid || normalizedJid.endsWith('@g.us')) return null

    const cache = this.getWorkspaceProfilePhotoCache(workspaceId)
    const cached = cache.get(normalizedJid)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.url
    }

    const entry = this.sockets.get(workspaceId)
    if (!entry?.sock?.profilePictureUrl) {
      cache.set(normalizedJid, { url: null, expiresAt: Date.now() + 5 * 60 * 1000 })
      return null
    }

    try {
      const url = await entry.sock.profilePictureUrl(normalizedJid, 'image')
      cache.set(normalizedJid, { url: url ?? null, expiresAt: Date.now() + 30 * 60 * 1000 })
      return url ?? null
    } catch {
      cache.set(normalizedJid, { url: null, expiresAt: Date.now() + 5 * 60 * 1000 })
      return null
    }
  }

  private async rememberPhoneNumberShare(workspaceId: string, lid?: string | null, jid?: string | null) {
    const lidJid = ensureJidServer(lid, '@lid')
    const phoneJid = ensureJidServer(jid, '@s.whatsapp.net')

    if (!lidJid || !phoneJid || !isLidJid(lidJid) || !isPhoneUserJid(phoneJid)) return

    this.getWorkspaceLidAliases(workspaceId).set(lidJid, phoneJid)
    await this.mergeChatAlias(workspaceId, lidJid, phoneJid)
  }

  private async rememberContactAliases(workspaceId: string, contacts: any[]) {
    for (const contact of contacts) {
      const id = normalizeLabel(contact?.id)
      const lid = normalizeLabel(contact?.lid)
      const phoneJid = isPhoneUserJid(id) ? id : ensureJidServer(contact?.jid, '@s.whatsapp.net')
      const lidJid = isLidJid(lid) ? lid : ensureJidServer(lid, '@lid')

      if (phoneJid && lidJid) {
        await this.rememberPhoneNumberShare(workspaceId, lidJid, phoneJid)
      }
    }
  }

  private async resolveCanonicalJid(workspaceId: string, jid: string) {
    if (!isLidJid(jid)) return jid

    const canonical = this.getWorkspaceLidAliases(workspaceId).get(jid)
    if (!canonical) return jid

    await this.mergeChatAlias(workspaceId, jid, canonical)
    return canonical
  }

  private async mergeChatAlias(workspaceId: string, fromJid: string, toJid: string) {
    if (fromJid === toJid) return

    const [source, target] = await Promise.all([
      prisma.whatsAppChat.findUnique({
        where: { workspaceId_jid: { workspaceId, jid: fromJid } },
      }),
      prisma.whatsAppChat.findUnique({
        where: { workspaceId_jid: { workspaceId, jid: toJid } },
      }),
    ])

    if (!source) return

    const toPhoneNumber = extractPhoneNumberFromJid(toJid)

    if (!target) {
      await prisma.$transaction(async (tx: any) => {
        await tx.whatsAppMessage.updateMany({
          where: { workspaceId, chatId: source.id },
          data: { remoteJid: toJid },
        })
        await tx.whatsAppChat.update({
          where: { id: source.id },
          data: {
            jid: toJid,
            phoneNumber: toPhoneNumber ?? undefined,
          },
        })
      })
      return
    }

    const sourceIsNewer =
      source.lastMessageAt &&
      (!target.lastMessageAt || source.lastMessageAt > target.lastMessageAt)

    await prisma.$transaction(async (tx: any) => {
      await tx.$executeRawUnsafe(
        `
          DELETE FROM whatsapp_messages source
          WHERE source."workspaceId" = $1
            AND source."chatId" = $2
            AND EXISTS (
              SELECT 1
              FROM whatsapp_messages target
              WHERE target."workspaceId" = source."workspaceId"
                AND target."remoteJid" = $3
                AND target."messageId" = source."messageId"
            )
        `,
        workspaceId,
        source.id,
        toJid
      )

      await tx.whatsAppMessage.updateMany({
        where: { workspaceId, chatId: source.id },
        data: {
          chatId: target.id,
          remoteJid: toJid,
        },
      })

      await tx.whatsAppChat.update({
        where: { id: target.id },
        data: {
          displayName: target.displayName || source.displayName || undefined,
          phoneNumber: target.phoneNumber || toPhoneNumber || source.phoneNumber || undefined,
          contactId: target.contactId || source.contactId || undefined,
          lastMessageAt: sourceIsNewer ? source.lastMessageAt : undefined,
          lastMessagePreview: sourceIsNewer ? source.lastMessagePreview : undefined,
          lastMessageFromMe: sourceIsNewer ? source.lastMessageFromMe : undefined,
          unreadCount: target.unreadCount + source.unreadCount,
        },
      })

      await tx.whatsAppChat.delete({
        where: { id: source.id },
      })
    })
  }

  private chooseCanonicalContactChat<T extends {
    id: string
    jid: string
    lastMessageAt?: Date | null
    updatedAt?: Date | null
  }>(chats: T[]) {
    return [...chats].sort((a, b) => {
      const aIsPhone = isPhoneUserJid(a.jid) ? 1 : 0
      const bIsPhone = isPhoneUserJid(b.jid) ? 1 : 0
      if (aIsPhone !== bIsPhone) return bIsPhone - aIsPhone

      const aTime = (a.lastMessageAt ?? a.updatedAt ?? new Date(0)).getTime()
      const bTime = (b.lastMessageAt ?? b.updatedAt ?? new Date(0)).getTime()
      return bTime - aTime
    })[0]
  }

  private async mergeDuplicateContactChats(workspaceId: string, contactId?: string | null) {
    const chats = await prisma.whatsAppChat.findMany({
      where: {
        workspaceId,
        isGroup: false,
        contactId: contactId ? contactId : { not: null },
      },
      select: {
        id: true,
        jid: true,
        contactId: true,
        lastMessageAt: true,
        updatedAt: true,
      },
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
    })

    const byContact = new Map<string, typeof chats>()
    for (const chat of chats) {
      if (!chat.contactId) continue
      byContact.set(chat.contactId, [...(byContact.get(chat.contactId) ?? []), chat])
    }

    for (const group of byContact.values()) {
      if (group.length < 2) continue

      const target = this.chooseCanonicalContactChat(group)
      if (!target) continue

      for (const source of group) {
        if (source.id === target.id) continue
        await this.mergeChatAlias(workspaceId, source.jid, target.jid)
      }
    }
  }

  private async linkChatsToContacts(workspaceId: string) {
    const chats = await prisma.whatsAppChat.findMany({
      where: {
        workspaceId,
        isGroup: false,
        contactId: null,
      },
      select: {
        id: true,
        displayName: true,
        phoneNumber: true,
      },
      take: 150,
    })

    for (const chat of chats) {
      const phoneNumber = normalizePhoneNumber(chat.phoneNumber)
      const contact =
        (phoneNumber ? await this.findContactByPhone(workspaceId, phoneNumber) : null) ??
        await this.findUniqueContactByDisplayName(workspaceId, chat.displayName)
      if (!contact) continue

      await prisma.whatsAppChat.update({
        where: { id: chat.id },
        data: { contactId: contact.id },
      })

      await this.mergeDuplicateContactChats(workspaceId, contact.id)
    }
  }

  private async persistChat(workspaceId: string, chat: any, historyContacts?: HistoryContactMap) {
    const rawJid = chat?.id ?? chat?.jid
    if (!supportsChat(rawJid)) return null
    const jid = await this.resolveCanonicalJid(workspaceId, rawJid)

    const session = await this.ensureSessionRecord(workspaceId)
    const phoneNumber =
      extractPhoneNumberFromJid(jid) ??
      normalizePhoneNumber(chat?.phoneNumber ?? chat?.phone)
    const linkedContact =
      (phoneNumber ? await this.findContactByPhone(workspaceId, phoneNumber) : null) ??
      await this.findUniqueContactByDisplayName(
        workspaceId,
        selectChatDisplayName(
          historyContacts?.get(jid) ?? historyContacts?.get(rawJid) ?? null,
          chat?.name,
          chat?.notify
        )
      )
    const contactName = linkedContact
      ? `${linkedContact.firstName}${linkedContact.lastName ? ` ${linkedContact.lastName}` : ''}`
      : null
    const historyContactName = historyContacts?.get(jid) ?? historyContacts?.get(rawJid) ?? null
    const isGroup = jid.endsWith('@g.us')
    const groupName = isGroup ? await this.resolveGroupDisplayName(workspaceId, jid) : null
    const displayName = selectChatDisplayName(
      chat?.subject,
      groupName,
      historyContactName,
      chat?.name,
      chat?.notify,
      contactName,
      phoneNumber,
      jid
    )
    const lastMessageAt = toDate(
      chat?.conversationTimestamp ??
      chat?.lastMessageRecvTimestamp ??
      chat?.lastMessage?.messageTimestamp
    )
    const lastMessageData = chat?.lastMessage ? extractMessageDetails(chat.lastMessage) : null
    const lastMessagePreview =
      lastMessageData && isPersistableMessage(lastMessageData, chat.lastMessage)
        ? messagePreview(lastMessageData.messageType, lastMessageData.text)
        : null

    const persistedChat = await prisma.whatsAppChat.upsert({
      where: { workspaceId_jid: { workspaceId, jid } },
      create: {
        workspaceId,
        sessionId: session.id,
        jid,
        displayName: displayName || phoneNumber || jid,
        phoneNumber,
        isGroup,
        unreadCount: typeof chat?.unreadCount === 'number' ? chat.unreadCount : 0,
        archived: Boolean(chat?.archive),
        pinned: typeof chat?.pin === 'number' ? chat.pin > 0 : Boolean(chat?.pinned),
        mutedUntil: toDate(chat?.muteEndTime),
        lastMessageAt,
        lastMessagePreview,
        lastMessageFromMe: typeof chat?.lastMessage?.key?.fromMe === 'boolean' ? chat.lastMessage.key.fromMe : null,
        contactId: linkedContact?.id ?? null,
      },
      update: {
        sessionId: session.id,
        displayName: displayName || undefined,
        phoneNumber: phoneNumber ?? undefined,
        isGroup,
        unreadCount: typeof chat?.unreadCount === 'number' ? chat.unreadCount : undefined,
        archived: typeof chat?.archive === 'boolean' ? chat.archive : undefined,
        pinned: typeof chat?.pin === 'number'
          ? chat.pin > 0
          : typeof chat?.pinned === 'boolean'
            ? chat.pinned
            : undefined,
        mutedUntil: chat?.muteEndTime ? toDate(chat.muteEndTime) : undefined,
        lastMessageAt: lastMessageAt ?? undefined,
        contactId: linkedContact?.id ?? undefined,
      },
    })

    if (chat?.lastMessage?.key?.id) {
      await this.persistMessage(workspaceId, chat.lastMessage)
    }

    if (persistedChat.contactId) {
      await this.mergeDuplicateContactChats(workspaceId, persistedChat.contactId)
    }

    return persistedChat
  }

  private async persistMessage(workspaceId: string, message: any, options?: PersistMessageOptions) {
    const rawRemoteJid = message?.key?.remoteJid ?? message?.remoteJid
    const messageId = message?.key?.id
    if (!supportsChat(rawRemoteJid) || !messageId) return null
    const remoteJid = await this.resolveCanonicalJid(workspaceId, rawRemoteJid)

    let chat = await prisma.whatsAppChat.findUnique({
      where: { workspaceId_jid: { workspaceId, jid: remoteJid } },
    })

    if (!chat) {
      await this.persistChat(workspaceId, {
        id: remoteJid,
        name: message?.pushName,
        conversationTimestamp: message?.messageTimestamp,
      })

      chat = await prisma.whatsAppChat.findUnique({
        where: { workspaceId_jid: { workspaceId, jid: remoteJid } },
      })
    }

    if (!chat) return null

    const details = extractMessageDetails(message)
    if (!isPersistableMessage(details, message)) {
      return null
    }
    const sentAt = toDate(message?.messageTimestamp) ?? new Date()
    const recoveryCutoff = options?.recoveryCutoff ?? null

    if (options?.allowHistorical && recoveryCutoff && sentAt < recoveryCutoff) {
      return null
    }

    const persisted = await prisma.whatsAppMessage.upsert({
      where: {
        workspaceId_remoteJid_messageId: {
          workspaceId,
          remoteJid,
          messageId,
        },
      },
      create: {
        workspaceId,
        sessionId: chat.sessionId,
        chatId: chat.id,
        remoteJid,
        messageId,
        fromMe: Boolean(message?.key?.fromMe),
        participant: message?.key?.participant ?? null,
        pushName: message?.pushName ?? null,
        messageType: details.messageType,
        text: details.text ?? null,
        status: details.status ?? null,
        sentAt,
      },
      update: {
        chatId: chat.id,
        fromMe: Boolean(message?.key?.fromMe),
        participant: message?.key?.participant ?? null,
        pushName: message?.pushName ?? null,
        messageType: details.messageType,
        text: details.text ?? null,
        status: details.status ?? undefined,
        sentAt,
      },
    })

    const persistedWithQuote = await this.syncQuotedContext(persisted, details)
    const persistedWithMedia = isDownloadableMediaMessage(details.messageType)
      ? await this.ensureMessageMedia(workspaceId, persistedWithQuote, message, details)
      : persistedWithQuote

    const groupName = chat.isGroup ? await this.resolveGroupDisplayName(workspaceId, remoteJid) : null
    const chatDisplayName = chat.isGroup
      ? selectChatDisplayName(
          groupName,
          chat.displayName,
          chat.phoneNumber,
          remoteJid
        )
      : selectChatDisplayName(
          message?.pushName,
          chat.displayName,
          chat.phoneNumber,
          remoteJid
        )

    await prisma.whatsAppChat.update({
      where: { id: chat.id },
      data: {
        displayName: chatDisplayName ?? undefined,
        lastMessageAt: sentAt,
        lastMessagePreview: messagePreview(details.messageType, details.text),
        lastMessageFromMe: Boolean(message?.key?.fromMe),
      },
    })

    if (!message?.key?.fromMe && !chat.isGroup) {
      await this.ensureLeadForIncomingMessage(workspaceId, {
        id: chat.id,
        contactId: chat.contactId,
        displayName: chatDisplayName ?? chat.displayName,
        phoneNumber: chat.phoneNumber ?? extractPhoneNumberFromJid(remoteJid),
      }, remoteJid, sentAt, message?.pushName)
    }

    return persistedWithMedia
  }

  private async resolveGroupDisplayName(workspaceId: string, jid: string) {
    if (!jid.endsWith('@g.us')) return null

    const existing = await prisma.whatsAppChat.findUnique({
      where: { workspaceId_jid: { workspaceId, jid } },
      select: { displayName: true },
    })

    if (hasReadableDisplayName(existing?.displayName, jid)) {
      return existing?.displayName ?? null
    }

    const entry = this.sockets.get(workspaceId)
    if (!entry?.sock?.groupMetadata) return existing?.displayName ?? null

    try {
      const metadata = await entry.sock.groupMetadata(jid)
      return selectChatDisplayName(
        metadata?.subject,
        metadata?.name,
        existing?.displayName,
        jid
      )
    } catch {
      return existing?.displayName ?? null
    }
  }

  private serializeMessageRecord(record: any) {
    return {
      ...record,
      mediaUrl: record?.mediaPath ? `/api/v1/whatsapp/messages/${record.id}/media` : null,
    }
  }

  private async getMessageSchemaCapabilities() {
    if (!this.messageSchemaCapabilitiesPromise) {
      this.messageSchemaCapabilitiesPromise = (async () => {
        try {
          const rows = await prisma.$queryRawUnsafe(
            `
              SELECT column_name
              FROM information_schema.columns
              WHERE table_schema = 'public'
                AND table_name = 'whatsapp_messages'
                AND column_name IN ('quotedMessageId', 'quotedText', 'quotedMessageType')
            `
          )

          const columns = new Set(
            (rows as Array<{ column_name?: string | null }>)
              .map((row) => row?.column_name)
              .filter((value): value is string => Boolean(value))
          )

          return {
            quoted:
              columns.has('quotedMessageId') &&
              columns.has('quotedText') &&
              columns.has('quotedMessageType'),
          }
        } catch {
          return { quoted: false }
        }
      })()
    }

    return this.messageSchemaCapabilitiesPromise
  }

  private async syncQuotedContext(
    record: any,
    details: {
      quotedMessageId?: string | null
      quotedText?: string | null
      quotedMessageType?: string | null
    }
  ) {
    const quotedMessageId = details.quotedMessageId ?? null
    const quotedText = details.quotedText ?? null
    const quotedMessageType = details.quotedMessageType ?? null

    const capabilities = await this.getMessageSchemaCapabilities()
    if (!capabilities.quoted) {
      return {
        ...record,
        quotedMessageId,
        quotedText,
        quotedMessageType,
      }
    }

    try {
      await prisma.$executeRawUnsafe(
        `
          UPDATE whatsapp_messages
          SET
            "quotedMessageId" = $1,
            "quotedText" = $2,
            "quotedMessageType" = $3,
            "updatedAt" = NOW()
          WHERE id = $4
        `,
        quotedMessageId,
        quotedText,
        quotedMessageType,
        record.id
      )

      return {
        ...record,
        quotedMessageId,
        quotedText,
        quotedMessageType,
      }
    } catch {
      return {
        ...record,
        quotedMessageId: null,
        quotedText: null,
        quotedMessageType: null,
      }
    }
  }

  private async readMessageRecords(
    workspaceId: string,
    chatId: string,
    limitValue: number
  ) {
    const capabilities = await this.getMessageSchemaCapabilities()
    const args = [workspaceId, chatId, limitValue]

    if (capabilities.quoted) {
      try {
        return await prisma.$queryRawUnsafe(
          `
            SELECT
              id,
              "workspaceId",
              "sessionId",
              "chatId",
              "remoteJid",
              "messageId",
              "fromMe",
              participant,
              "pushName",
              "messageType",
              text,
              status,
              "quotedMessageId",
              "quotedText",
              "quotedMessageType",
              "mediaPath",
              "mediaMimeType",
              "mediaFileName",
              "mediaSizeBytes",
              "mediaDurationSeconds",
              "sentAt",
              "createdAt",
              "updatedAt"
            FROM whatsapp_messages
            WHERE "workspaceId" = $1
              AND "chatId" = $2
            ORDER BY "sentAt" DESC
            LIMIT $3
          `,
          ...args
        )
      } catch {
        this.messageSchemaCapabilitiesPromise = Promise.resolve({ quoted: false })
      }
    }

    try {
      return await prisma.$queryRawUnsafe(
        `
          SELECT
            id,
            "workspaceId",
            "sessionId",
            "chatId",
            "remoteJid",
            "messageId",
            "fromMe",
            participant,
            "pushName",
            "messageType",
            text,
            status,
            "mediaPath",
            "mediaMimeType",
            "mediaFileName",
            "mediaSizeBytes",
            "mediaDurationSeconds",
            "sentAt",
            "createdAt",
            "updatedAt"
          FROM whatsapp_messages
          WHERE "workspaceId" = $1
            AND "chatId" = $2
          ORDER BY "sentAt" DESC
          LIMIT $3
        `,
        ...args
      )
    } catch {
      const legacyItems = await prisma.$queryRawUnsafe(
        `
          SELECT
            id,
            "workspaceId",
            "sessionId",
            "chatId",
            "remoteJid",
            "messageId",
            "fromMe",
            participant,
            "pushName",
            "messageType",
            text,
            status,
            "sentAt",
            "createdAt",
            "updatedAt"
          FROM whatsapp_messages
          WHERE "workspaceId" = $1
            AND "chatId" = $2
          ORDER BY "sentAt" DESC
          LIMIT $3
        `,
        ...args
      )

      return legacyItems.map((item: any) => ({
        ...item,
        quotedMessageId: null,
        quotedText: null,
        quotedMessageType: null,
        mediaPath: null,
        mediaMimeType: null,
        mediaFileName: null,
        mediaSizeBytes: null,
        mediaDurationSeconds: null,
      }))
    }
  }

  private async persistOutgoingFallback(workspaceId: string, jid: string, text: string, sent?: any) {
    jid = await this.resolveCanonicalJid(workspaceId, jid)
    let chat = await prisma.whatsAppChat.findUnique({
      where: { workspaceId_jid: { workspaceId, jid } },
    })

    if (!chat) {
      await this.persistChat(workspaceId, {
        id: jid,
        conversationTimestamp: sent?.messageTimestamp ?? Date.now(),
      })

      chat = await prisma.whatsAppChat.findUnique({
        where: { workspaceId_jid: { workspaceId, jid } },
      })
    }

    if (!chat) return null

    const sentAt = toDate(sent?.messageTimestamp) ?? new Date()
    const messageId = sent?.key?.id ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const record = await prisma.whatsAppMessage.upsert({
      where: {
        workspaceId_remoteJid_messageId: {
          workspaceId,
          remoteJid: jid,
          messageId,
        },
      },
      create: {
        workspaceId,
        sessionId: chat.sessionId,
        chatId: chat.id,
        remoteJid: jid,
        messageId,
        fromMe: true,
        participant: null,
        pushName: null,
        messageType: 'text',
        text,
        status: 'sent',
        sentAt,
      },
      update: {
        chatId: chat.id,
        text,
        status: 'sent',
        sentAt,
      },
    })

    await prisma.whatsAppChat.update({
      where: { id: chat.id },
      data: {
        lastMessageAt: sentAt,
        lastMessagePreview: text,
        lastMessageFromMe: true,
      },
    })

    return record
  }

  private async ensureMessageMedia(
    workspaceId: string,
    record: any,
    message: any,
    details: {
      messageType: string
      mediaMimeType?: string | null
      mediaFileName?: string | null
      mediaSizeBytes?: number | null
      mediaDurationSeconds?: number | null
    }
  ) {
    if (record?.mediaPath) {
      const existingPath = path.resolve(MEDIA_ROOT, record.mediaPath)
      if (existingPath.startsWith(path.resolve(MEDIA_ROOT)) && existsSync(existingPath)) {
        return record
      }
    }

    const entry = this.sockets.get(workspaceId)
    if (!entry?.sock?.updateMediaMessage) {
      return record
    }

    try {
      const baileys = await this.loadBaileys()
      const extension = mediaExtension(details.messageType, details.mediaMimeType, details.mediaFileName)
      const relativePath = path.join(workspaceId, `${record.id}${extension}`)
      const absolutePath = path.resolve(MEDIA_ROOT, relativePath)
      const mediaRoot = path.resolve(MEDIA_ROOT)

      if (!absolutePath.startsWith(mediaRoot)) {
        return record
      }

      await fs.mkdir(path.dirname(absolutePath), { recursive: true })

      const buffer = await baileys.downloadMediaMessage(
        message,
        'buffer',
        {},
        {
          reuploadRequest: entry.sock.updateMediaMessage.bind(entry.sock),
        }
      )

      if (!buffer || !buffer.length) {
        return record
      }

      await fs.writeFile(absolutePath, buffer)

      await prisma.$executeRawUnsafe(
        `
          UPDATE whatsapp_messages
          SET
            "mediaPath" = $1,
            "mediaMimeType" = $2,
            "mediaFileName" = $3,
            "mediaSizeBytes" = $4,
            "mediaDurationSeconds" = $5,
            "updatedAt" = NOW()
          WHERE id = $6
        `,
        relativePath,
        details.mediaMimeType ?? record.mediaMimeType ?? null,
        details.mediaFileName ?? record.mediaFileName ?? path.basename(absolutePath),
        buffer.length,
        details.mediaDurationSeconds ?? record.mediaDurationSeconds ?? null,
        record.id
      )

      return {
        ...record,
        mediaPath: relativePath,
        mediaMimeType: details.mediaMimeType ?? record.mediaMimeType ?? null,
        mediaFileName: details.mediaFileName ?? record.mediaFileName ?? path.basename(absolutePath),
        mediaSizeBytes: buffer.length,
        mediaDurationSeconds: details.mediaDurationSeconds ?? record.mediaDurationSeconds ?? null,
      }
    } catch {
      return record
    }
  }

  private async applyMessageUpdates(workspaceId: string, updates: any[]) {
    for (const item of updates) {
      const rawRemoteJid = item?.key?.remoteJid
      const messageId = item?.key?.id
      const patch = item?.update ?? {}
      if (!rawRemoteJid || !messageId) continue
      const remoteJid = await this.resolveCanonicalJid(workspaceId, rawRemoteJid)

      const updateData: Record<string, unknown> = {}
      if (patch?.status !== undefined) {
        updateData.status = normalizeMessageStatus(patch.status, Boolean(item?.key?.fromMe))
      }
      if (patch?.message) {
        const details = extractMessageDetails({ ...item, message: patch.message })
        updateData.messageType = details.messageType
        updateData.text = details.text ?? null
      }
      if (Object.keys(updateData).length === 0) continue

      await prisma.whatsAppMessage.updateMany({
        where: { workspaceId, remoteJid, messageId },
        data: updateData,
      })

      if (patch?.message) {
        const record = await prisma.whatsAppMessage.findFirst({
          where: { workspaceId, remoteJid, messageId },
        })

        if (record) {
          const details = extractMessageDetails({ ...item, message: patch.message })
          const withQuotedContext = await this.syncQuotedContext(record, details)

          if (isDownloadableMediaMessage(details.messageType)) {
            await this.ensureMessageMedia(
              workspaceId,
              withQuotedContext,
              { ...item, message: patch.message },
              details
            )
          }
        }
      }
    }
  }

  private async applyDeletedMessages(workspaceId: string, payload: any) {
    if (!Array.isArray(payload?.keys)) return

    for (const key of payload.keys) {
      if (!key?.remoteJid || !key?.id) continue
      const remoteJid = await this.resolveCanonicalJid(workspaceId, key.remoteJid)
      await prisma.whatsAppMessage.deleteMany({
        where: {
          workspaceId,
          remoteJid,
          messageId: key.id,
        },
      })
    }
  }

  private async resyncRecentAppState(workspaceId: string, entry: SocketEntry) {
    const session = await this.readSessionRecord(workspaceId)
    if (!session.lastDisconnectedAt) return
    if (typeof entry.sock?.resyncAppState !== 'function') return

    try {
      await entry.sock.resyncAppState(APP_STATE_SYNC_COLLECTIONS, false)
    } catch {
      // noop
    }
  }

  private async readSessionRecord(workspaceId: string) {
    return (
      await prisma.whatsAppSession.findUnique({
        where: { workspaceId },
      })
    ) ?? this.buildEmptySession(workspaceId)
  }

  private async waitForSessionQr(workspaceId: string, timeoutMs: number) {
    const startedAt = Date.now()

    while (Date.now() - startedAt < timeoutMs) {
      const session = await this.readSessionRecord(workspaceId)
      if (session.qrCode || session.status === 'CONNECTED' || session.status === 'ERROR') {
        return session
      }
      await sleep(500)
    }

    const session = await this.readSessionRecord(workspaceId)

    throw new AppError(
      504,
      session.lastError ?? 'Baileys no emitio el QR a tiempo. Revisa tu conexion a internet y reintenta.',
      'WHATSAPP_QR_TIMEOUT'
    )
  }

  private async ensureLeadForIncomingMessage(
    workspaceId: string,
    chat: {
      id: string
      contactId?: string | null
      displayName?: string | null
      phoneNumber?: string | null
    },
    remoteJid: string,
    sentAt: Date,
    pushName?: string | null
  ) {
    const phoneNumber = normalizePhoneNumber(chat.phoneNumber)
    if (!phoneNumber) return

    const contact = await this.ensureInboundContact(workspaceId, {
      chatId: chat.id,
      contactId: chat.contactId,
      phoneNumber,
      remoteJid,
      displayName: selectChatDisplayName(pushName, chat.displayName, phoneNumber, remoteJid),
    })

    if (!contact) return

    await db.contact.updateMany({
      where: {
        id: contact.id,
        OR: [
          { lastContactedAt: null },
          { lastContactedAt: { lt: sentAt } },
        ],
      },
      data: { lastContactedAt: sentAt },
    })

    const defaultPipeline =
      await db.pipeline.findFirst({
        where: { workspaceId, isDefault: true },
        include: { stages: { orderBy: { position: 'asc' } } },
      }) ??
      await db.pipeline.findFirst({
        where: { workspaceId },
        include: { stages: { orderBy: { position: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      })

    if (!defaultPipeline) return

    const newLeadStage =
      defaultPipeline.stages.find((stage) => stage.name.trim().toLowerCase() === 'nuevo lead') ??
      defaultPipeline.stages.find((stage) => !stage.isWon && !stage.isLost) ??
      defaultPipeline.stages[0]

    if (!newLeadStage) return

    const existingLead = await this.findOpenLeadForContactOrPhone(
      workspaceId,
      defaultPipeline.id,
      contact.id,
      contact.phone ?? phoneNumber
    )

    if (existingLead) return

    const lastDeal = await db.deal.findFirst({
      where: {
        workspaceId,
        stageId: newLeadStage.id,
        status: 'OPEN',
        isArchived: false,
      },
      orderBy: { position: 'desc' },
      select: { position: true },
    })

    const leadTitle =
      buildContactName(contact) ??
      selectChatDisplayName(pushName, chat.displayName, phoneNumber, remoteJid) ??
      phoneNumber
    const leadNumber = await this.generateUniqueLeadNumber(workspaceId, contact.phone ?? phoneNumber, sentAt)

    const createdLead = await db.$transaction(async (tx) => {
      const lead = await tx.deal.create({
        data: {
          workspaceId,
          title: leadTitle,
          pipelineId: defaultPipeline.id,
          stageId: newLeadStage.id,
          position: (lastDeal?.position ?? -1) + 1,
          probability: newLeadStage.probability,
          status: 'OPEN',
          customData: {
            leadNumber,
            sourceChannel: 'whatsapp',
            autoCreated: true,
            whatsAppChatJid: remoteJid,
          } as any,
        },
      })

      await tx.dealContact.create({
        data: {
          dealId: lead.id,
          contactId: contact.id,
        },
      })

      await tx.activity.create({
        data: {
          workspaceId,
          type: ActivityType.DEAL_CREATED,
          entityType: 'deal',
          entityId: lead.id,
          dealId: lead.id,
          contactId: contact.id,
          source: 'whatsapp',
          title: 'Lead creado desde WhatsApp',
          metadata: {
            remoteJid,
            stageId: newLeadStage.id,
            pipelineId: defaultPipeline.id,
            leadNumber,
          } as any,
        },
      })

      return lead
    })

    await db.activity.create({
      data: {
        workspaceId,
        type: ActivityType.WHATSAPP_RECEIVED,
        entityType: 'contact',
        entityId: contact.id,
        contactId: contact.id,
        dealId: createdLead.id,
        source: 'whatsapp',
        title: 'Mensaje entrante de WhatsApp',
        metadata: {
          remoteJid,
          leadId: createdLead.id,
          leadNumber,
        } as any,
      },
    })
  }

  private async ensureInboundContact(
    workspaceId: string,
    input: {
      chatId: string
      contactId?: string | null
      phoneNumber: string
      remoteJid: string
      displayName?: string | null
    }
  ) {
    if (input.contactId) {
      const linked = await db.contact.findFirst({
        where: { id: input.contactId, workspaceId, isArchived: false },
        select: { id: true, firstName: true, lastName: true, phone: true },
      })

      if (linked) return linked
    }

    const existing = await this.findContactByPhone(workspaceId, input.phoneNumber)
    if (existing) {
      if (!existing.phone) {
        await db.contact.update({
          where: { id: existing.id },
          data: { phone: input.phoneNumber },
        })
      }

      await prisma.whatsAppChat.update({
        where: { id: input.chatId },
        data: { contactId: existing.id },
      })

      await this.mergeDuplicateContactChats(workspaceId, existing.id)

      return existing
    }

    const { firstName, lastName } = splitContactName(input.displayName ?? input.phoneNumber)

    const created = await db.contact.create({
      data: {
        workspaceId,
        firstName,
        lastName,
        phone: input.phoneNumber,
        status: 'LEAD',
        source: 'WHATSAPP',
        tags: ['whatsapp'],
        channels: [
          {
            type: 'whatsapp',
            identifier: input.phoneNumber,
            metadata: { jid: input.remoteJid },
          },
        ] as any,
      },
      select: { id: true, firstName: true, lastName: true, phone: true },
    })

    await prisma.whatsAppChat.update({
      where: { id: input.chatId },
      data: { contactId: created.id },
    })

    await this.mergeDuplicateContactChats(workspaceId, created.id)

    return created
  }

  private async findOpenLeadForContactOrPhone(
    workspaceId: string,
    pipelineId: string,
    contactId: string,
    phoneNumber?: string | null
  ) {
    const normalizedPhone = normalizePhoneNumber(phoneNumber)

    const openDeals = await db.deal.findMany({
      where: {
        workspaceId,
        pipelineId,
        status: 'OPEN',
        isArchived: false,
        contacts: {
          some: {},
        },
      },
      select: {
        id: true,
        contacts: {
          select: {
            contactId: true,
            contact: {
              select: {
                phone: true,
              },
            },
          },
        },
      },
    })

    return openDeals.find((deal) =>
      deal.contacts.some((link) => {
        if (link.contactId === contactId) return true
        if (!normalizedPhone) return false
        return normalizePhoneNumber(link.contact.phone) === normalizedPhone
      })
    ) ?? null
  }

  private async generateUniqueLeadNumber(workspaceId: string, phoneNumber: string, sentAt: Date) {
    const base = buildLeadNumberBase(phoneNumber, sentAt)

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}${attempt}`
      const existing = await db.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM deals
        WHERE "workspaceId" = ${workspaceId}
          AND "customData"->>'leadNumber' = ${candidate}
        LIMIT 1
      `

      if (existing.length === 0) {
        return candidate
      }
    }

    return `${base}${Date.now().toString().slice(-3)}`
  }

  private async ensureSessionRecord(workspaceId: string) {
    try {
      return await prisma.whatsAppSession.upsert({
        where: { workspaceId },
        create: { workspaceId, status: 'DISCONNECTED' },
        update: {},
      })
    } catch (error: any) {
      if (error?.code === 'P2003') {
        throw new AppError(
          401,
          'Tu sesion actual apunta a un workspace inexistente. Cierra sesion y vuelve a ingresar.',
          'WORKSPACE_CONTEXT_INVALID'
        )
      }

      if (error?.code === 'P2024') {
        throw new AppError(
          503,
          'La base de datos se quedo sin conexiones disponibles. Reinicia el backend y evita tener multiples procesos abiertos.',
          'DATABASE_POOL_EXHAUSTED'
        )
      }

      throw error
    }
  }

  private buildEmptySession(workspaceId: string) {
    const now = new Date()
    return {
      id: `virtual-${workspaceId}`,
      workspaceId,
      status: 'DISCONNECTED' as const,
      phoneNumber: null,
      phoneJid: null,
      pushName: null,
      pairingCode: null,
      pairingCodeIssuedAt: null,
      qrCode: null,
      lastConnectedAt: null,
      lastDisconnectedAt: null,
      lastDisconnectCode: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    }
  }

  private async updateSession(
    workspaceId: string,
    data: Partial<{
      status: SessionStatus
      phoneNumber: string | null
      phoneJid: string | null
      pushName: string | null
      pairingCode: string | null
      pairingCodeIssuedAt: Date | null
      qrCode: string | null
      lastConnectedAt: Date | null
      lastDisconnectedAt: Date | null
      lastDisconnectCode: number | null
      lastError: string | null
    }>
  ) {
    await this.ensureSessionRecord(workspaceId)
    return prisma.whatsAppSession.update({
      where: { workspaceId },
      data,
    })
  }

  private async hasAuthState(workspaceId: string) {
    return existsSync(this.getAuthDir(workspaceId))
  }

  private getAuthDir(workspaceId: string) {
    return path.join(AUTH_ROOT, workspaceId)
  }

  private async clearAuthState(workspaceId: string) {
    const authDir = path.resolve(this.getAuthDir(workspaceId))
    const root = path.resolve(AUTH_ROOT)
    if (!authDir.startsWith(root)) {
      throw new AppError(500, 'Ruta de auth invalida para WhatsApp.', 'WHATSAPP_AUTH_PATH_INVALID')
    }
    await fs.rm(authDir, { recursive: true, force: true })
  }

  private async findContactByPhone(workspaceId: string, phoneNumber: string) {
    const contacts = await db.contact.findMany({
      where: {
        workspaceId,
        isArchived: false,
        phone: { not: null },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
      },
      take: 5000,
    })

    const exact = contacts.find((contact) => normalizePhoneNumber(contact.phone) === phoneNumber)
    if (exact) return exact

    return contacts.find((contact) => {
      const normalized = normalizePhoneNumber(contact.phone)
      return normalized ? normalized.endsWith(phoneNumber) || phoneNumber.endsWith(normalized) : false
    }) ?? null
  }

  private async findUniqueContactByDisplayName(workspaceId: string, displayName?: string | null) {
    const normalizedDisplayName = normalizePersonName(displayName)
    if (!normalizedDisplayName) return null
    if (!/[^\d\s()+-]/.test(normalizedDisplayName)) return null

    const contacts = await db.contact.findMany({
      where: {
        workspaceId,
        isArchived: false,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
      },
      take: 5000,
    })

    const matches = contacts.filter((contact) => normalizePersonName(buildContactName(contact)) === normalizedDisplayName)
    return matches.length === 1 ? matches[0] : null
  }

  private extractDisconnectCode(error: any) {
    return (
      error?.output?.statusCode ??
      error?.output?.payload?.statusCode ??
      error?.statusCode ??
      error?.data?.statusCode ??
      error?.cause?.output?.statusCode ??
      null
    )
  }

  private formatDisconnectError(error: any) {
    const code = this.extractDisconnectCode(error)
    const reason =
      error?.data?.reason ??
      error?.output?.payload?.reason ??
      error?.output?.payload?.error ??
      error?.message

    if (code && reason && !String(reason).includes(String(code))) {
      return `${reason} (codigo ${code}). Reintentando...`
    }

    if (code) {
      return `Conexion rechazada por WhatsApp (codigo ${code}). Reintentando...`
    }

    return error?.message ?? 'Conexion perdida. Reintentando...'
  }

  private formatStartupError(error: any) {
    const message =
      error?.message ??
      error?.cause?.message ??
      error?.output?.payload?.message ??
      null

    if (message) {
      return `No se pudo iniciar Baileys: ${message}`
    }

    return 'No se pudo iniciar Baileys. Revisa el runtime, la red y las credenciales guardadas.'
  }
}

export const whatsAppManager = new WhatsAppManager()
