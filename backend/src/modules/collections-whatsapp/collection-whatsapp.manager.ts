import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { db } from '../../core/database'
import { config } from '../../core/config'
import { AppError, NotFoundError, ValidationError } from '../../types'
import {
  extractMessageDetails,
  extractPhoneNumberFromJid,
  inferOutboundMessageType,
  isDownloadableMediaMessage,
  isLidJid,
  isPersistableMessage,
  isPhoneUserJid,
  mediaExtension,
  messagePreview,
  normalizeMessageStatus,
  safeFileName,
  selectChatDisplayName,
  toDate,
  WHATSAPP_OUTBOUND_FILE_MAX_BYTES,
} from '../whatsapp/whatsapp.manager'
import { normalizeCollectionPhone, phoneMatchKey } from './collection-whatsapp.phone'

/**
 * Segundo número de WhatsApp, sólo para Cobranzas. Es un chat compartido: no
 * crea tickets, leads ni contactos, y vive en tablas, credenciales y medios
 * propios para no tocar la sesión de la bandeja de Tickets.
 */

type SocketEntry = { sock: any; saveCreds: () => Promise<void>; state: any }
type SessionPatch = Partial<{
  status: 'DISCONNECTED' | 'CONNECTING' | 'PAIRING' | 'CONNECTED' | 'ERROR'
  phoneJid: string | null
  pushName: string | null
  qrCode: string | null
  lastConnectedAt: Date | null
  lastDisconnectedAt: Date | null
  lastDisconnectCode: number | null
  lastError: string | null
}>
export type CollectionOutboundFile = { fileName: string; mimeType: string; buffer: Buffer; sizeBytes: number }

const BASE_AUTH_ROOT = config.WHATSAPP_AUTH_DIR
  ? path.resolve(config.WHATSAPP_AUTH_DIR)
  : path.resolve(process.cwd(), '.data', 'whatsapp-auth')
const BASE_MEDIA_ROOT = config.WHATSAPP_MEDIA_DIR
  ? path.resolve(config.WHATSAPP_MEDIA_DIR)
  : path.resolve(process.cwd(), '.data', 'whatsapp-media')
const AUTH_ROOT = path.join(path.dirname(BASE_AUTH_ROOT), 'whatsapp-collections-auth')
const MEDIA_ROOT = path.join(path.dirname(BASE_MEDIA_ROOT), 'whatsapp-collections-media')

const chatSelect = {
  id: true,
  jid: true,
  phoneNumber: true,
  displayName: true,
  companyId: true,
  unreadCount: true,
  lastMessageAt: true,
  lastMessagePreview: true,
  lastMessageFromMe: true,
  company: { select: { id: true, name: true, ruc: true, dv: true, isArchived: true } },
} as const

const messageSelect = {
  id: true,
  chatId: true,
  messageId: true,
  fromMe: true,
  pushName: true,
  messageType: true,
  text: true,
  status: true,
  mediaMimeType: true,
  mediaFileName: true,
  mediaSizeBytes: true,
  sentAt: true,
  sentBy: { select: { id: true, firstName: true, lastName: true } },
} as const

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isSupportedChatJid(jid?: string | null) {
  return isPhoneUserJid(jid) || isLidJid(jid)
}

export class CollectionWhatsAppManager {
  private sockets = new Map<string, SocketEntry>()
  private booting = new Map<string, Promise<SocketEntry>>()
  private reconnectTimers = new Map<string, NodeJS.Timeout>()
  private reconnectAttempts = new Map<string, number>()
  private manualDisconnects = new Set<any>()
  private lidAliases = new Map<string, Map<string, string>>()
  private watchdogTimer: NodeJS.Timeout | null = null
  private baileysModule: any | null = null
  private baileysVersion: number[] | null = null

  // ── Sesión ────────────────────────────────────────────────────────────────

  async getSessionSnapshot(workspaceId: string) {
    const session = await this.ensureSessionRecord(workspaceId)
    const authAvailable = await this.hasAuthState(workspaceId)
    if (authAvailable && !this.sockets.has(workspaceId) && !this.booting.has(workspaceId) && ['CONNECTED', 'CONNECTING', 'PAIRING'].includes(session.status)) {
      void this.connect(workspaceId).catch(() => {})
    }
    return {
      status: session.status,
      phoneNumber: extractPhoneNumberFromJid(session.phoneJid?.replace(/:\d+@/, '@')) ?? null,
      pushName: session.pushName,
      qrCode: session.qrCode,
      lastConnectedAt: session.lastConnectedAt,
      lastError: session.lastError,
      authAvailable,
      hasActiveSocket: Boolean(this.sockets.get(workspaceId)?.sock),
      packageInstalled: this.isPackageInstalled(),
      runtimeCompatible: true,
    }
  }

  async connect(workspaceId: string) {
    const existing = await this.ensureSessionRecord(workspaceId)
    if (existing.status === 'CONNECTED' && this.sockets.get(workspaceId)?.sock) return this.getSessionSnapshot(workspaceId)

    let entry: SocketEntry
    try {
      entry = await this.ensureSocket(workspaceId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo iniciar WhatsApp.'
      await this.updateSession(workspaceId, { status: 'ERROR', qrCode: null, lastError: message }).catch(() => {})
      if (error instanceof AppError) throw error
      throw new AppError(502, message, 'COLLECTION_WHATSAPP_INIT_FAILED')
    }

    if (!entry.state?.creds?.registered) {
      await this.updateSession(workspaceId, { status: 'PAIRING', lastError: null })
      const deadline = Date.now() + 20_000
      while (Date.now() < deadline) {
        const session = await this.ensureSessionRecord(workspaceId)
        if (session.qrCode || session.status === 'CONNECTED') break
        await sleep(400)
      }
    }
    return this.getSessionSnapshot(workspaceId)
  }

  /** Cierra la sesión en WhatsApp y borra las credenciales: para volver a usarlo hay que escanear un QR nuevo. */
  async disconnect(workspaceId: string) {
    const timer = this.reconnectTimers.get(workspaceId)
    if (timer) clearTimeout(timer)
    this.reconnectTimers.delete(workspaceId)
    const entry = this.sockets.get(workspaceId)
    if (entry?.sock) {
      this.manualDisconnects.add(entry.sock)
      try { await entry.sock.logout?.() } catch { /* la sesión puede estar caída */ }
      try { entry.sock.end?.(new Error('manual disconnect')) } catch { /* noop */ }
    }
    this.sockets.delete(workspaceId)
    await this.clearAuthState(workspaceId)
    await this.updateSession(workspaceId, { status: 'DISCONNECTED', qrCode: null, phoneJid: null, pushName: null, lastError: null, lastDisconnectedAt: new Date() })
  }

  async startBackgroundRuntime() {
    if (!this.isPackageInstalled()) return
    if (!this.watchdogTimer) this.watchdogTimer = setInterval(() => void this.restorePersistedSessions(), 20_000)
    await this.restorePersistedSessions()
  }

  stopBackgroundRuntime() {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer)
    this.watchdogTimer = null
    for (const timer of this.reconnectTimers.values()) clearTimeout(timer)
    this.reconnectTimers.clear()
  }

  // ── Chats y mensajes ──────────────────────────────────────────────────────

  async listChats(workspaceId: string, search?: string) {
    const term = search?.trim()
    const digits = term?.replace(/\D/g, '')
    return db.collectionWhatsAppChat.findMany({
      where: {
        workspaceId,
        ...(term ? {
          OR: [
            { displayName: { contains: term, mode: 'insensitive' } },
            { company: { is: { name: { contains: term, mode: 'insensitive' } } } },
            { company: { is: { ruc: { contains: term } } } },
            ...(digits ? [{ phoneNumber: { contains: digits } }] : []),
          ],
        } : {}),
      },
      select: chatSelect,
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 200,
    })
  }

  async getChat(workspaceId: string, chatId: string) {
    const chat = await db.collectionWhatsAppChat.findFirst({ where: { id: chatId, workspaceId }, select: chatSelect })
    if (!chat) throw new NotFoundError('Chat', chatId)
    return chat
  }

  async listMessages(workspaceId: string, chatId: string, limit = 150) {
    await this.getChat(workspaceId, chatId)
    const items = await db.collectionWhatsAppMessage.findMany({
      where: { workspaceId, chatId },
      select: messageSelect,
      orderBy: { sentAt: 'desc' },
      take: limit,
    })
    return items.reverse()
  }

  async markRead(workspaceId: string, chatId: string) {
    await db.collectionWhatsAppChat.updateMany({ where: { id: chatId, workspaceId }, data: { unreadCount: 0 } })
  }

  /**
   * Borra el chat, sus mensajes y sus archivos sólo en el CRM: en el teléfono
   * la conversación sigue. Si el cliente vuelve a escribir, el chat se crea de nuevo.
   */
  async deleteChat(workspaceId: string, chatId: string) {
    await this.getChat(workspaceId, chatId)
    const media = await db.collectionWhatsAppMessage.findMany({ where: { workspaceId, chatId, mediaPath: { not: null } }, select: { mediaPath: true } })
    await db.collectionWhatsAppChat.delete({ where: { id: chatId } })
    const root = path.resolve(MEDIA_ROOT)
    for (const { mediaPath } of media) {
      const absolutePath = path.resolve(root, mediaPath!)
      if (absolutePath.startsWith(root + path.sep)) await fs.rm(absolutePath, { force: true }).catch(() => {})
    }
  }

  /** Abre (o crea) el chat con el teléfono del cliente para poder escribirle primero. */
  async startChatForClient(workspaceId: string, company: { id: string; name: string; phone?: string | null }) {
    const existing = await db.collectionWhatsAppChat.findFirst({ where: { workspaceId, companyId: company.id }, orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } }, select: chatSelect })
    if (existing) return existing

    const contacts = await db.contact.findMany({ where: { workspaceId, companyId: company.id, phone: { not: null } }, select: { phone: true }, orderBy: { createdAt: 'asc' } })
    const candidates = [company.phone, ...contacts.map((contact) => contact.phone)]
      .map((value) => normalizeCollectionPhone(value))
      .filter((value): value is string => Boolean(value))
    if (!candidates.length) {
      throw new AppError(422, 'El cliente no tiene un teléfono cargado. Agregalo en su legajo para poder escribirle.', 'CLIENT_PHONE_MISSING')
    }

    const entry = await this.requireConnectedSocket(workspaceId)
    let jid: string | null = null
    for (const phone of [...new Set(candidates)]) {
      const [result] = await entry.sock.onWhatsApp(phone).catch(() => [])
      if (result?.exists) { jid = isPhoneUserJid(result.jid) ? result.jid : `${phone}@s.whatsapp.net`; break }
    }
    if (!jid) throw new AppError(422, 'Ningún teléfono del cliente tiene WhatsApp.', 'CLIENT_PHONE_WITHOUT_WHATSAPP')

    const chat = await db.collectionWhatsAppChat.upsert({
      where: { workspaceId_jid: { workspaceId, jid } },
      create: { workspaceId, jid, phoneNumber: extractPhoneNumberFromJid(jid), displayName: company.name, companyId: company.id },
      update: { companyId: company.id },
      select: chatSelect,
    })
    return chat
  }

  async sendMessage(workspaceId: string, chatId: string, userId: string, input: { text?: string; file?: CollectionOutboundFile }) {
    const text = input.text?.trim() ?? ''
    const file = input.file
    if (!text && !file) throw new ValidationError('Escribí un mensaje o adjuntá un archivo.')
    if (file && file.sizeBytes > WHATSAPP_OUTBOUND_FILE_MAX_BYTES) throw new ValidationError('El archivo supera el límite de 8 MB.')
    const messageType = file ? inferOutboundMessageType(file.mimeType) : 'text'
    if (messageType === 'audio' && text) throw new ValidationError('WhatsApp no admite texto junto a un audio. Enviá el audio solo.')

    const chat = await db.collectionWhatsAppChat.findFirst({ where: { id: chatId, workspaceId } })
    if (!chat) throw new NotFoundError('Chat', chatId)
    const entry = await this.requireConnectedSocket(workspaceId)
    const sent = await entry.sock.sendMessage(chat.jid, this.buildOutboundContent(text, file))
    const messageId = sent?.key?.id ?? `local-${Date.now()}`
    const sentAt = toDate(sent?.messageTimestamp) ?? new Date()
    const preview = messagePreview(messageType, text || (file ? safeFileName(file.fileName) : null))

    const record = await db.collectionWhatsAppMessage.upsert({
      where: { chatId_messageId: { chatId: chat.id, messageId } },
      create: { workspaceId, chatId: chat.id, messageId, fromMe: true, messageType, text: text || (file ? safeFileName(file.fileName) : null), status: 'sent', sentByUserId: userId, sentAt },
      update: { sentByUserId: userId },
      select: { id: true },
    })
    if (file) await this.storeMedia(workspaceId, record.id, file.buffer, { messageType, mimeType: file.mimeType, fileName: safeFileName(file.fileName) })
    await db.collectionWhatsAppChat.update({ where: { id: chat.id }, data: { lastMessageAt: sentAt, lastMessagePreview: preview, lastMessageFromMe: true, unreadCount: 0 } })
    return db.collectionWhatsAppMessage.findUniqueOrThrow({ where: { id: record.id }, select: messageSelect })
  }

  async getMessageMedia(workspaceId: string, messageId: string) {
    const message = await db.collectionWhatsAppMessage.findFirst({ where: { id: messageId, workspaceId }, select: { mediaPath: true, mediaMimeType: true, mediaFileName: true } })
    if (!message?.mediaPath) throw new AppError(404, 'Ese mensaje no tiene un archivo descargado.', 'COLLECTION_WHATSAPP_MEDIA_NOT_FOUND')
    const root = path.resolve(MEDIA_ROOT)
    const absolutePath = path.resolve(root, message.mediaPath)
    const relative = path.relative(root, absolutePath)
    if (relative.startsWith('..') || path.isAbsolute(relative) || !existsSync(absolutePath)) {
      throw new AppError(404, 'No encontramos el archivo en el servidor.', 'COLLECTION_WHATSAPP_MEDIA_MISSING')
    }
    return { buffer: await fs.readFile(absolutePath), mimeType: message.mediaMimeType || 'application/octet-stream', fileName: message.mediaFileName || path.basename(absolutePath) }
  }

  // ── Socket ────────────────────────────────────────────────────────────────

  private isPackageInstalled() {
    try {
      require.resolve('baileys')
      return true
    } catch {
      return false
    }
  }

  private async requireConnectedSocket(workspaceId: string) {
    let entry = this.sockets.get(workspaceId)
    if (!entry) {
      if (!await this.hasAuthState(workspaceId)) throw new AppError(409, 'El WhatsApp de Cobranzas no está vinculado. Vinculalo desde el botón de configuración.', 'COLLECTION_WHATSAPP_NOT_LINKED')
      await this.connect(workspaceId)
    }
    const deadline = Date.now() + 12_000
    while (Date.now() < deadline) {
      const session = await this.ensureSessionRecord(workspaceId)
      entry = this.sockets.get(workspaceId)
      if (session.status === 'CONNECTED' && entry?.sock) return entry
      if (session.status === 'DISCONNECTED') break
      await sleep(300)
    }
    throw new AppError(409, 'El WhatsApp de Cobranzas todavía no está conectado. Esperá unos segundos y reintentá.', 'COLLECTION_WHATSAPP_NOT_CONNECTED')
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

  private async loadBaileys() {
    if (this.baileysModule) return this.baileysModule
    try {
      this.baileysModule = await import('baileys')
      return this.baileysModule
    } catch {
      throw new AppError(503, 'Baileys no está instalado en el backend.', 'WHATSAPP_DEPENDENCY_MISSING')
    }
  }

  private async createSocket(workspaceId: string) {
    const baileys = await this.loadBaileys()
    if (!this.baileysVersion) {
      try {
        const latest = await baileys.fetchLatestBaileysVersion?.()
        if (Array.isArray(latest?.version) && latest.version.length === 3) this.baileysVersion = latest.version
      } catch { /* usa la versión por defecto de Baileys */ }
    }
    const authDir = this.getAuthDir(workspaceId)
    await fs.mkdir(authDir, { recursive: true })
    const { state, saveCreds } = await baileys.useMultiFileAuthState(authDir)
    const makeWASocket = baileys.makeWASocket ?? baileys.default
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      defaultQueryTimeoutMs: 60_000,
      connectTimeoutMs: 20_000,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      ...(this.baileysVersion ? { version: this.baileysVersion } : {}),
      getMessage: async () => undefined,
    })
    const entry: SocketEntry = { sock, saveCreds, state }
    this.sockets.set(workspaceId, entry)
    await this.updateSession(workspaceId, { status: state?.creds?.registered ? 'CONNECTING' : 'PAIRING', lastError: null })

    sock.ev.on('creds.update', () => { void saveCreds().catch(() => {}) })
    sock.ev.on('connection.update', (update: any) => { void this.handleConnectionUpdate(workspaceId, entry, update) })
    sock.ev.on('messages.upsert', (payload: any) => {
      void (async () => {
        for (const message of payload?.messages ?? []) {
          try {
            await this.persistIncoming(workspaceId, message, payload?.type === 'notify')
          } catch (error) {
            console.error('[whatsapp-cobranzas] no se pudo guardar un mensaje:', error)
          }
        }
      })()
    })
    sock.ev.on('messages.update', (updates: any[]) => { void this.applyStatusUpdates(workspaceId, updates ?? []) })
    sock.ev.on('chats.phoneNumberShare', (payload: any) => { void this.rememberLid(workspaceId, payload?.lid, payload?.jid) })
    sock.ev.on('lid-mapping.update', (payload: any) => {
      const mappings = Array.isArray(payload) ? payload : payload?.mapping ?? payload?.mappings ?? [payload]
      for (const mapping of mappings) void this.rememberLid(workspaceId, mapping?.lid ?? mapping?.lidJid, mapping?.pn ?? mapping?.phoneNumber ?? mapping?.jid)
    })
    return entry
  }

  private async handleConnectionUpdate(workspaceId: string, entry: SocketEntry, update: any) {
    if (update?.qr) await this.updateSession(workspaceId, { status: 'PAIRING', qrCode: update.qr, lastError: null })
    if (update?.connection === 'connecting') await this.updateSession(workspaceId, { status: 'CONNECTING', lastError: null })
    if (update?.connection === 'open') {
      this.reconnectAttempts.delete(workspaceId)
      await this.updateSession(workspaceId, {
        status: 'CONNECTED',
        phoneJid: entry.sock.user?.id ?? null,
        pushName: entry.sock.user?.name ?? entry.sock.user?.notify ?? null,
        lastConnectedAt: new Date(),
        qrCode: null,
        lastError: null,
      })
      return
    }
    if (update?.connection !== 'close') return

    const disconnectCode = Number(update?.lastDisconnect?.error?.output?.statusCode ?? update?.lastDisconnect?.error?.statusCode) || null
    const loggedOut = disconnectCode === 401
    const manual = this.manualDisconnects.has(entry.sock)
    this.manualDisconnects.delete(entry.sock)
    if (this.sockets.get(workspaceId)?.sock === entry.sock) this.sockets.delete(workspaceId)
    if (manual) return
    if (loggedOut) await this.clearAuthState(workspaceId)
    await this.updateSession(workspaceId, {
      status: loggedOut ? 'DISCONNECTED' : 'CONNECTING',
      lastDisconnectedAt: new Date(),
      lastDisconnectCode: disconnectCode,
      qrCode: null,
      lastError: loggedOut ? 'La sesión se cerró desde el teléfono. Hay que vincular el número de nuevo.' : (update?.lastDisconnect?.error?.message ?? 'Se cortó la conexión con WhatsApp.'),
    })
    if (!loggedOut) this.scheduleReconnect(workspaceId)
  }

  private scheduleReconnect(workspaceId: string, immediate = false) {
    if (this.reconnectTimers.has(workspaceId)) return
    const attempt = this.reconnectAttempts.get(workspaceId) ?? 0
    const delay = immediate ? 500 : Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5))
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(workspaceId)
      void this.connect(workspaceId).catch(() => {
        this.reconnectAttempts.set(workspaceId, attempt + 1)
        this.scheduleReconnect(workspaceId)
      })
    }, delay)
    this.reconnectTimers.set(workspaceId, timer)
  }

  private async restorePersistedSessions() {
    const sessions = await db.collectionWhatsAppSession.findMany({ where: { status: { in: ['CONNECTED', 'CONNECTING', 'ERROR'] } }, select: { workspaceId: true } })
    for (const { workspaceId } of sessions) {
      if (!this.sockets.has(workspaceId) && !this.booting.has(workspaceId) && !this.reconnectTimers.has(workspaceId) && await this.hasAuthState(workspaceId)) {
        this.scheduleReconnect(workspaceId, true)
      }
    }
  }

  // ── Persistencia ──────────────────────────────────────────────────────────

  private aliases(workspaceId: string) {
    let map = this.lidAliases.get(workspaceId)
    if (!map) { map = new Map(); this.lidAliases.set(workspaceId, map) }
    return map
  }

  /** Une el chat abierto con el identificador LID de WhatsApp con el chat del número de teléfono. */
  private async rememberLid(workspaceId: string, lid?: string | null, phone?: string | null) {
    if (!isLidJid(lid) || !isPhoneUserJid(phone)) return
    this.aliases(workspaceId).set(lid!, phone!)
    const [lidChat, phoneChat] = await Promise.all([
      db.collectionWhatsAppChat.findUnique({ where: { workspaceId_jid: { workspaceId, jid: lid! } } }),
      db.collectionWhatsAppChat.findUnique({ where: { workspaceId_jid: { workspaceId, jid: phone! } } }),
    ])
    if (lidChat && !phoneChat) {
      await db.collectionWhatsAppChat.update({ where: { id: lidChat.id }, data: { jid: phone!, lidJid: lid, phoneNumber: extractPhoneNumberFromJid(phone) } })
    } else if (lidChat && phoneChat) {
      await db.$transaction([
        db.collectionWhatsAppMessage.updateMany({ where: { chatId: lidChat.id }, data: { chatId: phoneChat.id } }),
        db.collectionWhatsAppChat.update({ where: { id: phoneChat.id }, data: { lidJid: lid, unreadCount: { increment: lidChat.unreadCount } } }),
        db.collectionWhatsAppChat.delete({ where: { id: lidChat.id } }),
      ]).catch(() => {})
    } else if (phoneChat && !phoneChat.lidJid) {
      await db.collectionWhatsAppChat.update({ where: { id: phoneChat.id }, data: { lidJid: lid } })
    }
  }

  private async resolveRemoteJid(workspaceId: string, message: any) {
    const raw: string | undefined = message?.key?.remoteJid
    if (!raw || !isSupportedChatJid(raw)) return null
    if (!isLidJid(raw)) return raw
    const alternate = message?.key?.remoteJidAlt ?? message?.key?.senderPn
    const phone = isPhoneUserJid(alternate) ? alternate : this.aliases(workspaceId).get(raw)
    if (phone) {
      await this.rememberLid(workspaceId, raw, phone)
      return phone
    }
    const known = await db.collectionWhatsAppChat.findFirst({ where: { workspaceId, lidJid: raw }, select: { jid: true } })
    return known?.jid ?? raw
  }

  private async findCompanyForPhone(workspaceId: string, phone?: string | null) {
    const key = phoneMatchKey(phone)
    if (!key) return null
    const [companies, contacts] = await Promise.all([
      db.company.findMany({ where: { workspaceId, isArchived: false, phone: { not: null } }, select: { id: true, phone: true } }),
      db.contact.findMany({ where: { workspaceId, companyId: { not: null }, phone: { not: null } }, select: { companyId: true, phone: true } }),
    ])
    const company = companies.find((item) => phoneMatchKey(item.phone) === key)
    if (company) return company.id
    return contacts.find((item) => phoneMatchKey(item.phone) === key)?.companyId ?? null
  }

  private async persistIncoming(workspaceId: string, message: any, isNew: boolean) {
    const messageId = message?.key?.id
    if (!messageId || message?.messageStubType != null) return
    const jid = await this.resolveRemoteJid(workspaceId, message)
    if (!jid) return
    const details: any = extractMessageDetails(message)
    if (!isPersistableMessage(details, message) || details.messageType === 'reaction') return
    const fromMe = Boolean(message?.key?.fromMe)
    const sentAt = toDate(message?.messageTimestamp) ?? new Date()

    let chat = await db.collectionWhatsAppChat.findUnique({ where: { workspaceId_jid: { workspaceId, jid } } })
    if (!chat) {
      if (fromMe && isLidJid(jid)) return
      const phoneNumber = extractPhoneNumberFromJid(jid)
      chat = await db.collectionWhatsAppChat.create({
        data: {
          workspaceId,
          jid,
          phoneNumber,
          displayName: fromMe ? null : selectChatDisplayName(message?.pushName),
          companyId: await this.findCompanyForPhone(workspaceId, phoneNumber),
        },
      })
    }

    const existing = await db.collectionWhatsAppMessage.findUnique({ where: { chatId_messageId: { chatId: chat.id, messageId } }, select: { id: true } })
    const record = existing ?? await db.collectionWhatsAppMessage.create({
      data: {
        workspaceId,
        chatId: chat.id,
        messageId,
        fromMe,
        pushName: message?.pushName ?? null,
        messageType: details.messageType,
        text: details.text ?? null,
        status: details.status ?? null,
        mediaMimeType: details.mediaMimeType ?? null,
        mediaFileName: details.mediaFileName ?? null,
        mediaSizeBytes: details.mediaSizeBytes ?? null,
        sentAt,
      },
      select: { id: true },
    })
    if (existing) return

    if (isDownloadableMediaMessage(details.messageType)) {
      const entry = this.sockets.get(workspaceId)
      try {
        const baileys = await this.loadBaileys()
        const buffer = await baileys.downloadMediaMessage(message, 'buffer', {}, entry?.sock?.updateMediaMessage ? { reuploadRequest: entry.sock.updateMediaMessage.bind(entry.sock) } : undefined)
        if (buffer?.length) await this.storeMedia(workspaceId, record.id, buffer, { messageType: details.messageType, mimeType: details.mediaMimeType, fileName: details.mediaFileName })
      } catch (error) {
        console.error('[whatsapp-cobranzas] no se pudo descargar un archivo:', error)
      }
    }

    await db.collectionWhatsAppChat.update({
      where: { id: chat.id },
      data: {
        lastMessageAt: sentAt,
        lastMessagePreview: messagePreview(details.messageType, details.text),
        lastMessageFromMe: fromMe,
        ...(!fromMe && message?.pushName && !chat.displayName ? { displayName: selectChatDisplayName(message.pushName) } : {}),
        ...(!fromMe && isNew ? { unreadCount: { increment: 1 } } : {}),
      },
    })
  }

  private async applyStatusUpdates(workspaceId: string, updates: any[]) {
    for (const item of updates) {
      const messageId = item?.key?.id
      if (!messageId || item?.update?.status === undefined) continue
      await db.collectionWhatsAppMessage.updateMany({
        where: { workspaceId, messageId, fromMe: true },
        data: { status: normalizeMessageStatus(item.update.status, true) },
      }).catch(() => {})
    }
  }

  private buildOutboundContent(text: string, file?: CollectionOutboundFile) {
    if (!file) return { text }
    const type = inferOutboundMessageType(file.mimeType)
    if (type === 'image') return { image: file.buffer, mimetype: file.mimeType, ...(text && { caption: text }) }
    if (type === 'video') return { video: file.buffer, mimetype: file.mimeType, ...(text && { caption: text }) }
    if (type === 'audio') return { audio: file.buffer, mimetype: file.mimeType }
    return { document: file.buffer, mimetype: file.mimeType, fileName: safeFileName(file.fileName), ...(text && { caption: text }) }
  }

  private async storeMedia(workspaceId: string, recordId: string, buffer: Buffer, meta: { messageType: string; mimeType?: string | null; fileName?: string | null }) {
    const relativePath = path.join(workspaceId, `${recordId}${mediaExtension(meta.messageType, meta.mimeType, meta.fileName)}`)
    const root = path.resolve(MEDIA_ROOT)
    const absolutePath = path.resolve(root, relativePath)
    if (!absolutePath.startsWith(root + path.sep)) return
    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, buffer)
    await db.collectionWhatsAppMessage.update({
      where: { id: recordId },
      data: { mediaPath: relativePath, mediaMimeType: meta.mimeType ?? undefined, mediaFileName: meta.fileName ?? path.basename(absolutePath), mediaSizeBytes: buffer.length },
    })
  }

  private async ensureSessionRecord(workspaceId: string) {
    return db.collectionWhatsAppSession.upsert({ where: { workspaceId }, create: { workspaceId }, update: {} })
  }

  private async updateSession(workspaceId: string, patch: SessionPatch) {
    await db.collectionWhatsAppSession.upsert({ where: { workspaceId }, create: { workspaceId, ...patch }, update: patch })
  }

  private getAuthDir(workspaceId: string) {
    return path.join(AUTH_ROOT, workspaceId)
  }

  private async hasAuthState(workspaceId: string) {
    return existsSync(path.join(this.getAuthDir(workspaceId), 'creds.json'))
  }

  private async clearAuthState(workspaceId: string) {
    await fs.rm(this.getAuthDir(workspaceId), { recursive: true, force: true })
  }
}

export const collectionWhatsAppManager = new CollectionWhatsAppManager()
