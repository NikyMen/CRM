'use client'

import { useDeferredValue, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CalendarClock, CheckCheck, MessageCircle, Search, Settings, Trash2, X } from 'lucide-react'
import clsx from 'clsx'
import { collectionsWhatsAppApi, commercialWhatsAppApi, type LineWhatsAppApi } from '@/lib/api'
import { formatDateTime, fullName, getErrorMessage } from '@/lib/format'
import type { CollectionWhatsAppChat, CollectionWhatsAppMessage, WhatsAppLinkSession } from '@/types'
import { WhatsAppLogo } from '@/components/WhatsAppLogo'
import { EmptyState } from '@/components/romez/OperationalUI'
import { useConfirmDelete } from '@/components/romez/ConfirmDelete'
import { TicketComposer, type ComposerPayload } from '@/components/romez/TicketComposer'
import { WhatsAppLinkDialog } from '@/components/romez/WhatsAppLinkDialog'
import { ContactName } from '@/components/romez/ContactName'
import { ChatMedia, isMediaType, MessageReactions, myReaction, ReactionButton, visibleMessageText } from '@/components/romez/ChatMessageParts'
import { PaymentPromiseDialog, type PromiseTarget } from '@/components/romez/PaymentPromiseDialog'
import { brand } from '@/lib/brand'

/** Un número de WhatsApp propio de un módulo, aparte del de Tickets. */
export type WhatsAppLineConfig = {
  key: string
  title: string
  linkDescription: string
  teamLabel: string
  emptyDescription: string
  api: LineWhatsAppApi
  /** Permite agendar promesas de pago desde el chat (sólo Cobranzas). */
  promises?: boolean
}

export const COLLECTIONS_WHATSAPP: WhatsAppLineConfig = {
  key: 'collections-whatsapp',
  title: 'WhatsApp de Cobranzas',
  linkDescription: 'Un número aparte del de Tickets, para escribirle a los clientes por sus cobros.',
  teamLabel: `Cobranzas ${brand.shortName}`,
  emptyDescription: 'Cuando un cliente escriba al número de Cobranzas, o le escribas desde la tabla, va a aparecer acá.',
  api: collectionsWhatsAppApi,
  promises: true,
}

export const COMMERCIAL_WHATSAPP: WhatsAppLineConfig = {
  key: 'commercial-whatsapp',
  title: 'WhatsApp de Gestión comercial',
  linkDescription: 'Un número aparte del de Tickets y del de Cobranzas, para la atención comercial y los prospectos.',
  teamLabel: `Comercial ${brand.shortName}`,
  emptyDescription: 'Cuando alguien escriba al número comercial va a aparecer acá.',
  api: commercialWhatsAppApi,
}

function sessionKey(line: WhatsAppLineConfig) {
  return `${line.key}-session`
}

function chatTitle(chat: CollectionWhatsAppChat) {
  return chat.company?.name || chat.displayName || (chat.phoneNumber ? `+${chat.phoneNumber}` : 'Contacto sin nombre')
}

/** Estado del número de la línea, para mostrarlo en el botón de la página. */
export function useLineWhatsAppSession(line: WhatsAppLineConfig) {
  return useQuery<WhatsAppLinkSession>({ queryKey: [sessionKey(line)], queryFn: () => line.api.getSession().then((response) => response.data), refetchInterval: 15_000 })
}

/** Popup para ver el estado, vincular por QR, reconectar o desvincular el número de la línea. */
export function LineWhatsAppLinkDialog({ line, canManage, onClose }: { line: WhatsAppLineConfig; canManage: boolean; onClose: () => void }) {
  return <WhatsAppLinkDialog
    title={line.title}
    description={line.linkDescription}
    queryKey={sessionKey(line)}
    getSession={() => line.api.getSession().then((response) => response.data)}
    connect={() => line.api.connect()}
    disconnect={() => line.api.disconnect()}
    disconnectConfirm={`¿Desvincular el ${line.title}? Para volver a usarlo vas a tener que escanear un QR nuevo.`}
    canManage={canManage}
    onClose={onClose}
  />
}

/** Chat compartido de la línea: lista de conversaciones y chat, sin tickets ni responsables. */
export function LineWhatsAppPanel({ line, initialChatId, canWrite, canManage, currentUserId, onClose }: { line: WhatsAppLineConfig; initialChatId?: string | null; canWrite: boolean; canManage: boolean; currentUserId?: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(initialChatId ?? null)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search.trim())
  const [linkOpen, setLinkOpen] = useState(false)
  const confirmDelete = useConfirmDelete()
  const chatsKey = `${line.key}-chats`
  const removeChat = useMutation({
    mutationFn: (chatId: string) => line.api.deleteChat(chatId),
    onSuccess: (_, chatId) => {
      setSelectedId((current) => current === chatId ? null : current)
      queryClient.removeQueries({ queryKey: [`${line.key}-messages`, chatId] })
      queryClient.invalidateQueries({ queryKey: [chatsKey] })
    },
  })
  const askRemove = async (chat: CollectionWhatsAppChat) => {
    const confirmed = await confirmDelete({
      title: 'Eliminar chat',
      message: `Se eliminará el chat con ${chatTitle(chat)} y todos sus mensajes y archivos del CRM. En el teléfono la conversación no se borra, y si el contacto vuelve a escribir el chat aparece de nuevo.`,
      confirmLabel: 'Eliminar chat',
    })
    if (confirmed) removeChat.mutate(chat.id)
  }

  useEffect(() => { if (initialChatId) setSelectedId(initialChatId) }, [initialChatId])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !linkOpen) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, linkOpen])

  const sessionQuery = useLineWhatsAppSession(line)
  const chatsQuery = useQuery<CollectionWhatsAppChat[]>({ queryKey: [chatsKey, deferredSearch], queryFn: () => line.api.listChats(deferredSearch).then((response) => response.data), refetchInterval: 5_000 })
  const chats = chatsQuery.data ?? []
  const selected = chats.find((chat) => chat.id === selectedId)
  const connected = sessionQuery.data?.status === 'CONNECTED'

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 p-0 sm:p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={line.title} className="flex w-full max-w-6xl flex-col overflow-hidden bg-[var(--paper)] shadow-2xl sm:rounded-xl sm:border sm:border-[var(--line)]">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--line)] bg-[#1f8f4e] px-4 text-white">
          <WhatsAppLogo size={22} />
          <div className="min-w-0 flex-1"><p className="truncate font-display text-sm font-extrabold">{line.title}</p><p className="truncate text-[11px] text-white/80">{connected ? [sessionQuery.data?.pushName, sessionQuery.data?.phoneNumber ? `+${sessionQuery.data.phoneNumber}` : null].filter(Boolean).join(' · ') || 'Conectado' : 'Sin conexión: vinculá el número con el botón de configuración'}</p></div>
          <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 px-3 py-1.5 text-xs font-bold hover:bg-white/10" onClick={() => setLinkOpen(true)}><Settings size={15} /> <span className="hidden sm:inline">Configuración</span></button>
          <button type="button" className="rounded-lg p-1.5 hover:bg-white/10" onClick={onClose} aria-label={`Cerrar ${line.title}`}><X size={19} /></button>
        </header>
        <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(280px,340px)_1fr]">
          <section className={clsx('min-h-0 flex-col border-r border-[var(--line)]', selectedId ? 'hidden md:flex' : 'flex')}>
            <div className="border-b border-[var(--line-soft)] p-3"><label className="relative block"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="ctrl-input pl-9" placeholder="Cliente, RUC o teléfono…" /></label>{removeChat.isError ? <p role="alert" className="mt-2 text-xs font-semibold text-[var(--danger)]">{getErrorMessage(removeChat.error, 'No se pudo eliminar el chat.')}</p> : null}</div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {chatsQuery.isLoading ? <p className="p-6 text-center text-xs text-[var(--ink-tertiary)]">Cargando chats…</p> : chatsQuery.isError ? <p className="p-6 text-center text-xs font-semibold text-[var(--danger)]">{getErrorMessage(chatsQuery.error)}</p> : chats.length ? chats.map((chat) => (
                <div key={chat.id} className={clsx('group relative border-b border-[var(--line-soft)]', selectedId === chat.id ? 'bg-[var(--brand-paper)]' : 'hover:bg-[var(--paper-soft)]')}>
                <button type="button" onClick={() => setSelectedId(chat.id)} className={clsx('block w-full px-4 py-3 text-left', canManage && 'pr-12')}>
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#1f8f4e] text-xs font-extrabold text-white">{chatTitle(chat).replace('+', '').slice(0, 2).toUpperCase()}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><p className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--ink-primary)]">{chatTitle(chat)}</p>{chat.unreadCount ? <span className="rounded-full bg-[#1f8f4e] px-1.5 text-[10px] font-extrabold text-white">{chat.unreadCount}</span> : null}</div>
                      <p className="mt-0.5 truncate text-xs text-[var(--ink-tertiary)]">{chat.lastMessageFromMe ? 'Vos: ' : ''}{chat.lastMessagePreview || 'Sin mensajes todavía'}</p>
                      {chat.lastMessageAt ? <p className="mt-1 text-[10px] font-semibold text-[var(--ink-muted)]">{formatDateTime(chat.lastMessageAt)}</p> : null}
                    </div>
                  </div>
                </button>
                {canManage ? <button type="button" className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-[var(--danger)] opacity-60 hover:bg-[var(--danger-paper)] hover:opacity-100 focus-visible:opacity-100 disabled:opacity-40 group-hover:opacity-100" disabled={removeChat.isPending && removeChat.variables === chat.id} onClick={() => askRemove(chat)} aria-label={`Eliminar chat con ${chatTitle(chat)}`} title="Eliminar chat"><Trash2 size={15} /></button> : null}
                </div>
              )) : <EmptyState icon={MessageCircle} title="Sin chats" description={deferredSearch ? 'No hay chats que coincidan con la búsqueda.' : line.emptyDescription} />}
            </div>
          </section>
          <section className={clsx('min-h-0 flex-col', selectedId ? 'flex' : 'hidden md:flex')}>
            {selectedId ? <ChatView key={selectedId} line={line} chatId={selectedId} chat={selected} connected={connected} canWrite={canWrite} canManage={canManage} currentUserId={currentUserId} back={() => setSelectedId(null)} onDelete={selected && canManage ? () => askRemove(selected) : undefined} deleting={removeChat.isPending} onSent={() => queryClient.invalidateQueries({ queryKey: [chatsKey] })} /> : <EmptyState icon={MessageCircle} title="Elegí un chat" description={`Abrí una conversación para leerla y responder desde el ${line.title}.`} />}
          </section>
        </div>
      </div>
      {linkOpen ? <LineWhatsAppLinkDialog line={line} canManage={canManage} onClose={() => setLinkOpen(false)} /> : null}
    </div>
  )
}

function ChatView({ line, chatId, chat, connected, canWrite, canManage, currentUserId, back, onSent, onDelete, deleting }: { line: WhatsAppLineConfig; chatId: string; chat?: CollectionWhatsAppChat; connected: boolean; canWrite: boolean; canManage: boolean; currentUserId?: string; back: () => void; onSent: () => void; onDelete?: () => void; deleting: boolean }) {
  const queryClient = useQueryClient()
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const messagesKey = [`${line.key}-messages`, chatId]
  const messagesQuery = useQuery<CollectionWhatsAppMessage[]>({ queryKey: messagesKey, queryFn: () => line.api.listMessages(chatId).then((response) => response.data), refetchInterval: 4_000 })
  const markRead = useMutation({ mutationFn: () => line.api.markRead(chatId), onSuccess: onSent })
  const messages = messagesQuery.data ?? []
  const lastId = messages[messages.length - 1]?.id

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }) }, [lastId])
  const unread = chat?.unreadCount ?? 0
  const { mutate: markAsRead } = markRead
  useEffect(() => { if (unread > 0) markAsRead() }, [unread, lastId, markAsRead])

  const send = async (payload: ComposerPayload) => {
    await line.api.send(chatId, payload)
    await queryClient.invalidateQueries({ queryKey: messagesKey })
    onSent()
  }
  const react = async (messageId: string, emoji: string) => {
    const response = await line.api.react(chatId, messageId, emoji)
    queryClient.setQueryData<CollectionWhatsAppMessage[]>(messagesKey, (current) => current?.map((item) => item.id === messageId ? response.data : item))
  }
  const canReply = canWrite && connected
  const [promiseTarget, setPromiseTarget] = useState<PromiseTarget | null>(null)
  const rename = async (name: string) => {
    await line.api.renameChat(chatId, name)
    onSent()
  }

  return <>
    <header className="flex items-center gap-3 border-b border-[var(--line-soft)] px-4 py-3">
      <button type="button" onClick={back} className="rounded-lg border border-[var(--line)] p-2 text-[var(--ink-secondary)] md:hidden" aria-label="Volver a los chats"><ArrowLeft size={16} /></button>
      <div className="min-w-0 flex-1">{!chat ? <p className="truncate font-display text-base font-extrabold text-[var(--ink-primary)]">Chat</p> : chat.company ? <><p className="truncate font-display text-base font-extrabold text-[var(--ink-primary)]">{chat.company.name}</p><div className="flex items-center gap-1 text-xs text-[var(--ink-tertiary)]">Contacto: <ContactName key={chat.id} name={chat.displayName ?? ''} canEdit={canWrite} save={rename} className="font-semibold text-[var(--ink-secondary)]" /></div></> : <ContactName key={chat.id} name={chat.displayName || (chat.phoneNumber ? `+${chat.phoneNumber}` : '')} canEdit={canWrite} save={rename} className="font-display text-base font-extrabold text-[var(--ink-primary)]" />}<p className="truncate text-xs text-[var(--ink-tertiary)]">{chat?.phoneNumber ? `+${chat.phoneNumber}` : 'Sin teléfono'}{chat?.company?.ruc ? ` · RUC ${chat.company.ruc}${chat.company.dv ? `-${chat.company.dv}` : ''}` : ''}</p></div>
      {line.promises && canWrite && chat ? <button type="button" className="btn-secondary" onClick={() => setPromiseTarget({ client: chat.company && !chat.company.isArchived ? chat.company : null, chatId: chat.id })} title="El cliente dijo que paga tal día: agendalo para que te lo recuerde"><CalendarClock size={15} /> <span className="hidden sm:inline">Promesa de pago</span></button> : null}
      {chat?.company && !chat.company.isArchived ? <Link href={`/clients/${chat.company.id}`} className="btn-secondary hidden sm:inline-flex">Ver legajo</Link> : null}
      {onDelete ? <button type="button" className="btn-danger" disabled={deleting} onClick={onDelete} aria-label="Eliminar este chat" title="Eliminar chat"><Trash2 size={15} /></button> : null}
    </header>
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[var(--chat-surface)] p-4 sm:p-6">
      {messagesQuery.isLoading ? <p className="text-center text-xs text-[var(--ink-tertiary)]">Cargando mensajes…</p> : messagesQuery.isError ? <p className="text-center text-xs font-semibold text-[var(--danger)]">{getErrorMessage(messagesQuery.error)}</p> : messages.length ? messages.map((message) => <Bubble key={message.id} line={line} message={message} onReact={canReply ? (emoji) => react(message.id, emoji) : undefined} />) : <EmptyState icon={MessageCircle} title="Conversación nueva" description={`Todavía no hay mensajes con este contacto en el ${line.title}.`} />}
      <div ref={bottomRef} />
    </div>
    <TicketComposer
      canReply={canReply}
      canManage={canManage}
      currentUserId={currentUserId}
      send={send}
      placeholder={canReply ? `Escribir por el ${line.title}…` : !connected ? `El ${line.title} no está conectado` : 'Tu rol solo puede leer los chats'}
      hint={canReply ? 'Enter para enviar · Shift + Enter para nueva línea · 📎 adjuntar · ⚡ respuestas rápidas · 😊 reaccionar' : !connected ? 'Vinculá el número desde Configuración para poder enviar.' : 'Solo lectura.'}
    />
    <PaymentPromiseDialog target={promiseTarget} onClose={() => setPromiseTarget(null)} />
  </>
}

function Bubble({ line, message, onReact }: { line: WhatsAppLineConfig; message: CollectionWhatsAppMessage; onReact?: (emoji: string) => Promise<unknown> }) {
  const hasMedia = isMediaType(message.messageType)
  const text = visibleMessageText(message.text, message.messageType, message.mediaFileName)
  const canReact = Boolean(onReact) && !message.messageId.startsWith('local-')
  return <div className={clsx('group flex items-end gap-1', message.fromMe ? 'flex-row-reverse' : 'flex-row')}>
    <div className={clsx('flex max-w-[82%] flex-col', message.fromMe ? 'items-end' : 'items-start')}>
      <div className={clsx('rounded-lg border px-3 py-2.5', message.fromMe ? 'border-[#1f8f4e] bg-[#1f8f4e] text-white' : 'border-[var(--chat-incoming-border)] bg-[var(--chat-incoming-bg)] text-[var(--ink-primary)]')}>
        <p className={clsx('text-[10px] font-bold', message.fromMe ? 'text-white/75' : 'text-[var(--ink-tertiary)]')}>{message.fromMe ? (message.sentBy ? fullName(message.sentBy) : line.teamLabel) : message.pushName || 'Cliente'}</p>
        {hasMedia ? <ChatMedia messageType={message.messageType} mimeType={message.mediaMimeType} fileName={message.mediaFileName} sizeBytes={message.mediaSizeBytes} outgoing={message.fromMe} load={() => line.api.getMedia(message.id).then((response) => response.data)} /> : null}
        {text ? <p className="mt-1 whitespace-pre-wrap text-sm leading-5">{text}</p> : null}
        <p className={clsx('mt-1.5 flex items-center justify-end gap-1 text-[10px]', message.fromMe ? 'text-white/70' : 'text-[var(--ink-muted)]')}>{formatDateTime(message.sentAt)}{message.fromMe ? <CheckCheck size={11} className={message.status === 'read' ? 'text-sky-200' : undefined} /> : null}</p>
      </div>
      <MessageReactions reactions={message.reactions} outgoing={message.fromMe} />
    </div>
    {canReact ? <ReactionButton current={myReaction(message.reactions)} onReact={onReact!} outgoing={message.fromMe} /> : null}
  </div>
}
