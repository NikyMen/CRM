'use client'

import { useDeferredValue, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCheck, Download, Loader2, MessageCircle, Paperclip, Play, Search, Settings, X } from 'lucide-react'
import clsx from 'clsx'
import { collectionsWhatsAppApi } from '@/lib/api'
import { formatDateTime, fullName, getErrorMessage } from '@/lib/format'
import type { CollectionWhatsAppChat, CollectionWhatsAppMessage, WhatsAppLinkSession } from '@/types'
import { WhatsAppLogo } from '@/components/WhatsAppLogo'
import { EmptyState } from '@/components/romez/OperationalUI'
import { TicketComposer, type ComposerPayload } from '@/components/romez/TicketComposer'
import { WhatsAppLinkDialog } from '@/components/romez/WhatsAppLinkDialog'

export const COLLECTIONS_WHATSAPP_SESSION_KEY = 'collections-whatsapp-session'

function chatTitle(chat: CollectionWhatsAppChat) {
  return chat.company?.name || chat.displayName || (chat.phoneNumber ? `+${chat.phoneNumber}` : 'Contacto sin nombre')
}

/** Botón y popup para vincular el WhatsApp de Cobranzas por QR. */
export function CollectionsWhatsAppLinkDialog({ canManage, onClose }: { canManage: boolean; onClose: () => void }) {
  return <WhatsAppLinkDialog
    title="WhatsApp de Cobranzas"
    description="Un número aparte del de Tickets, para escribirle a los clientes por sus cobros."
    queryKey={COLLECTIONS_WHATSAPP_SESSION_KEY}
    getSession={() => collectionsWhatsAppApi.getSession().then((response) => response.data)}
    connect={() => collectionsWhatsAppApi.connect()}
    disconnect={() => collectionsWhatsAppApi.disconnect()}
    disconnectConfirm="¿Desvincular el WhatsApp de Cobranzas? Para volver a usarlo vas a tener que escanear un QR nuevo."
    canManage={canManage}
    onClose={onClose}
  />
}

/** Chat compartido del WhatsApp de Cobranzas: lista de conversaciones y chat, sin tickets ni responsables. */
export function CollectionsWhatsAppPanel({ initialChatId, canWrite, canManage, currentUserId, onClose }: { initialChatId?: string | null; canWrite: boolean; canManage: boolean; currentUserId?: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(initialChatId ?? null)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search.trim())
  const [linkOpen, setLinkOpen] = useState(false)

  useEffect(() => { if (initialChatId) setSelectedId(initialChatId) }, [initialChatId])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !linkOpen) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, linkOpen])

  const sessionQuery = useQuery<WhatsAppLinkSession>({ queryKey: [COLLECTIONS_WHATSAPP_SESSION_KEY], queryFn: () => collectionsWhatsAppApi.getSession().then((response) => response.data), refetchInterval: 15_000 })
  const chatsQuery = useQuery<CollectionWhatsAppChat[]>({ queryKey: ['collections-whatsapp-chats', deferredSearch], queryFn: () => collectionsWhatsAppApi.listChats(deferredSearch).then((response) => response.data), refetchInterval: 5_000 })
  const chats = chatsQuery.data ?? []
  const selected = chats.find((chat) => chat.id === selectedId)
  const connected = sessionQuery.data?.status === 'CONNECTED'

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 p-0 sm:p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="WhatsApp de Cobranzas" className="flex w-full max-w-6xl flex-col overflow-hidden bg-[var(--paper)] shadow-2xl sm:rounded-xl sm:border sm:border-[var(--line)]">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--line)] bg-[#1f8f4e] px-4 text-white">
          <WhatsAppLogo size={22} />
          <div className="min-w-0 flex-1"><p className="truncate font-display text-sm font-extrabold">WhatsApp de Cobranzas</p><p className="truncate text-[11px] text-white/80">{connected ? [sessionQuery.data?.pushName, sessionQuery.data?.phoneNumber ? `+${sessionQuery.data.phoneNumber}` : null].filter(Boolean).join(' · ') || 'Conectado' : 'Sin conexión: vinculá el número con el botón de configuración'}</p></div>
          <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 px-3 py-1.5 text-xs font-bold hover:bg-white/10" onClick={() => setLinkOpen(true)}><Settings size={15} /> <span className="hidden sm:inline">Configuración</span></button>
          <button type="button" className="rounded-lg p-1.5 hover:bg-white/10" onClick={onClose} aria-label="Cerrar WhatsApp de Cobranzas"><X size={19} /></button>
        </header>
        <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(280px,340px)_1fr]">
          <section className={clsx('min-h-0 flex-col border-r border-[var(--line)]', selectedId ? 'hidden md:flex' : 'flex')}>
            <div className="border-b border-[var(--line-soft)] p-3"><label className="relative block"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="ctrl-input pl-9" placeholder="Cliente, RUC o teléfono…" /></label></div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {chatsQuery.isLoading ? <p className="p-6 text-center text-xs text-[var(--ink-tertiary)]">Cargando chats…</p> : chatsQuery.isError ? <p className="p-6 text-center text-xs font-semibold text-[var(--danger)]">{getErrorMessage(chatsQuery.error)}</p> : chats.length ? chats.map((chat) => (
                <button type="button" key={chat.id} onClick={() => setSelectedId(chat.id)} className={clsx('block w-full border-b border-[var(--line-soft)] px-4 py-3 text-left', selectedId === chat.id ? 'bg-[var(--brand-paper)]' : 'hover:bg-[var(--paper-soft)]')}>
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#1f8f4e] text-xs font-extrabold text-white">{chatTitle(chat).replace('+', '').slice(0, 2).toUpperCase()}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><p className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--ink-primary)]">{chatTitle(chat)}</p>{chat.unreadCount ? <span className="rounded-full bg-[#1f8f4e] px-1.5 text-[10px] font-extrabold text-white">{chat.unreadCount}</span> : null}</div>
                      <p className="mt-0.5 truncate text-xs text-[var(--ink-tertiary)]">{chat.lastMessageFromMe ? 'Vos: ' : ''}{chat.lastMessagePreview || 'Sin mensajes todavía'}</p>
                      {chat.lastMessageAt ? <p className="mt-1 text-[10px] font-semibold text-[var(--ink-muted)]">{formatDateTime(chat.lastMessageAt)}</p> : null}
                    </div>
                  </div>
                </button>
              )) : <EmptyState icon={MessageCircle} title="Sin chats" description={deferredSearch ? 'No hay chats que coincidan con la búsqueda.' : 'Cuando un cliente escriba al número de Cobranzas, o le escribas desde la tabla, va a aparecer acá.'} />}
            </div>
          </section>
          <section className={clsx('min-h-0 flex-col', selectedId ? 'flex' : 'hidden md:flex')}>
            {selectedId ? <ChatView key={selectedId} chatId={selectedId} chat={selected} connected={connected} canWrite={canWrite} canManage={canManage} currentUserId={currentUserId} back={() => setSelectedId(null)} onSent={() => queryClient.invalidateQueries({ queryKey: ['collections-whatsapp-chats'] })} /> : <EmptyState icon={MessageCircle} title="Elegí un chat" description="Abrí una conversación para leerla y responder desde el número de Cobranzas." />}
          </section>
        </div>
      </div>
      {linkOpen ? <CollectionsWhatsAppLinkDialog canManage={canManage} onClose={() => setLinkOpen(false)} /> : null}
    </div>
  )
}

function ChatView({ chatId, chat, connected, canWrite, canManage, currentUserId, back, onSent }: { chatId: string; chat?: CollectionWhatsAppChat; connected: boolean; canWrite: boolean; canManage: boolean; currentUserId?: string; back: () => void; onSent: () => void }) {
  const queryClient = useQueryClient()
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const messagesQuery = useQuery<CollectionWhatsAppMessage[]>({ queryKey: ['collections-whatsapp-messages', chatId], queryFn: () => collectionsWhatsAppApi.listMessages(chatId).then((response) => response.data), refetchInterval: 4_000 })
  const markRead = useMutation({ mutationFn: () => collectionsWhatsAppApi.markRead(chatId), onSuccess: onSent })
  const messages = messagesQuery.data ?? []
  const lastId = messages[messages.length - 1]?.id

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }) }, [lastId])
  const unread = chat?.unreadCount ?? 0
  const { mutate: markAsRead } = markRead
  useEffect(() => { if (unread > 0) markAsRead() }, [unread, lastId, markAsRead])

  const send = async (payload: ComposerPayload) => {
    await collectionsWhatsAppApi.send(chatId, payload)
    await queryClient.invalidateQueries({ queryKey: ['collections-whatsapp-messages', chatId] })
    onSent()
  }
  const canReply = canWrite && connected

  return <>
    <header className="flex items-center gap-3 border-b border-[var(--line-soft)] px-4 py-3">
      <button type="button" onClick={back} className="rounded-lg border border-[var(--line)] p-2 text-[var(--ink-secondary)] md:hidden" aria-label="Volver a los chats"><ArrowLeft size={16} /></button>
      <div className="min-w-0 flex-1"><p className="truncate font-display text-base font-extrabold text-[var(--ink-primary)]">{chat ? chatTitle(chat) : 'Chat'}</p><p className="truncate text-xs text-[var(--ink-tertiary)]">{chat?.phoneNumber ? `+${chat.phoneNumber}` : 'Sin teléfono'}{chat?.company?.ruc ? ` · RUC ${chat.company.ruc}${chat.company.dv ? `-${chat.company.dv}` : ''}` : ''}</p></div>
      {chat?.company && !chat.company.isArchived ? <Link href={`/clients/${chat.company.id}`} className="btn-secondary hidden sm:inline-flex">Ver legajo</Link> : null}
    </header>
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[var(--chat-surface)] p-4 sm:p-6">
      {messagesQuery.isLoading ? <p className="text-center text-xs text-[var(--ink-tertiary)]">Cargando mensajes…</p> : messagesQuery.isError ? <p className="text-center text-xs font-semibold text-[var(--danger)]">{getErrorMessage(messagesQuery.error)}</p> : messages.length ? messages.map((message) => <Bubble key={message.id} message={message} />) : <EmptyState icon={MessageCircle} title="Conversación nueva" description="Todavía no hay mensajes con este contacto en el número de Cobranzas." />}
      <div ref={bottomRef} />
    </div>
    <TicketComposer
      canReply={canReply}
      canManage={canManage}
      currentUserId={currentUserId}
      send={send}
      placeholder={canReply ? 'Escribir por el WhatsApp de Cobranzas…' : !connected ? 'El WhatsApp de Cobranzas no está conectado' : 'Tu rol solo puede leer los chats'}
      hint={canReply ? 'Enter para enviar · Shift + Enter para nueva línea · 📎 adjuntar · ⚡ respuestas rápidas' : !connected ? 'Vinculá el número desde Configuración para poder enviar.' : 'Solo lectura.'}
    />
  </>
}

function Bubble({ message }: { message: CollectionWhatsAppMessage }) {
  const hasMedia = ['image', 'audio', 'video', 'document'].includes(message.messageType)
  const placeholderText = hasMedia && /^\[(Imagen|Video|Audio|Documento)\]$/.test(message.text ?? '')
  return <div className={clsx('flex', message.fromMe ? 'justify-end' : 'justify-start')}>
    <div className={clsx('max-w-[82%] rounded-lg border px-3 py-2.5', message.fromMe ? 'border-[#1f8f4e] bg-[#1f8f4e] text-white' : 'border-[var(--chat-incoming-border)] bg-[var(--chat-incoming-bg)] text-[var(--ink-primary)]')}>
      <p className={clsx('text-[10px] font-bold', message.fromMe ? 'text-white/75' : 'text-[var(--ink-tertiary)]')}>{message.fromMe ? (message.sentBy ? fullName(message.sentBy) : 'Cobranzas ROMEZ') : message.pushName || 'Cliente'}</p>
      {message.text && !placeholderText && !(hasMedia && message.messageType === 'document' && message.text === message.mediaFileName) ? <p className="mt-1 whitespace-pre-wrap text-sm leading-5">{message.text}</p> : null}
      {hasMedia ? <Media message={message} /> : null}
      <p className={clsx('mt-1.5 flex items-center justify-end gap-1 text-[10px]', message.fromMe ? 'text-white/70' : 'text-[var(--ink-muted)]')}>{formatDateTime(message.sentAt)}{message.fromMe ? <CheckCheck size={11} className={message.status === 'read' ? 'text-sky-200' : undefined} /> : null}</p>
    </div>
  </div>
}

function Media({ message }: { message: CollectionWhatsAppMessage }) {
  const [url, setUrl] = useState<string | null>(null)
  const [type, setType] = useState(message.mediaMimeType ?? '')
  const [loading, setLoading] = useState<'preview' | 'download' | null>(null)
  const [error, setError] = useState('')
  const label = message.mediaFileName || (message.messageType === 'image' ? 'Imagen' : message.messageType === 'audio' ? 'Audio' : message.messageType === 'video' ? 'Video' : 'Documento')
  const playable = ['image', 'audio', 'video'].includes(message.messageType)

  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  async function fetchMedia() {
    if (url) return url
    const response = await collectionsWhatsAppApi.getMedia(message.id)
    const objectUrl = URL.createObjectURL(response.data)
    setType(response.data.type || message.mediaMimeType || '')
    setUrl(objectUrl)
    return objectUrl
  }
  async function run(kind: 'preview' | 'download') {
    setLoading(kind)
    setError('')
    try {
      const objectUrl = await fetchMedia()
      if (kind === 'download') { const anchor = document.createElement('a'); anchor.href = objectUrl; anchor.download = label; anchor.click() }
    } catch (candidate) {
      setError(getErrorMessage(candidate, 'No se pudo abrir el archivo.'))
    } finally {
      setLoading(null)
    }
  }
  const control = clsx('inline-flex max-w-full items-center gap-2 rounded-md border px-2.5 py-2 text-xs font-bold', message.fromMe ? 'border-white/25 bg-white/10 text-white' : 'border-[var(--line)] bg-[var(--paper-soft)] text-[var(--brand-navy)]')
  return <div className="mt-2 max-w-lg">
    {url && playable ? <div className="mb-2 overflow-hidden rounded-md">{type.startsWith('image/') || message.messageType === 'image' ? <Image src={url} alt={label} width={640} height={480} unoptimized className="h-auto max-h-80 w-auto max-w-full object-contain" /> : type.startsWith('audio/') || message.messageType === 'audio' ? <audio controls preload="metadata" src={url} className="h-10 w-full min-w-64" /> : <video controls preload="metadata" src={url} className="max-h-80 max-w-full" />}</div> : null}
    <div className="flex flex-wrap gap-2">
      {playable && !url ? <button type="button" disabled={loading !== null} onClick={() => run('preview')} className={control}>{loading === 'preview' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}<span className="truncate">{message.messageType === 'image' ? 'Ver imagen' : `Reproducir ${label}`}</span></button> : null}
      <button type="button" disabled={loading !== null} onClick={() => run('download')} className={control}>{loading === 'download' ? <Loader2 size={14} className="animate-spin" /> : playable ? <Download size={14} /> : <Paperclip size={14} />}<span className="truncate">Descargar {label}</span></button>
    </div>
    {error ? <p className={clsx('mt-1 text-[10px] font-semibold', message.fromMe ? 'text-white/80' : 'text-[var(--danger)]')}>{error}</p> : null}
  </div>
}
