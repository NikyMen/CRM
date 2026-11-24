'use client'

import { Fragment, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Bot, CalendarClock, Check, CheckCheck, FolderOpen, Loader2, MessageCircle, Search, Settings, Sparkles, ThumbsDown, ThumbsUp, Trash2, UserRound, X } from 'lucide-react'
import clsx from 'clsx'
import { collectionsWhatsAppApi, commercialWhatsAppApi, dealsApi, type LineWhatsAppApi } from '@/lib/api'
import { fullName, getErrorMessage } from '@/lib/format'
import type { CollectionWhatsAppChat, CollectionWhatsAppMessage, WhatsAppLinkSession } from '@/types'
import { WhatsAppLogo } from '@/components/WhatsAppLogo'
import { useConfirmDelete } from '@/components/romez/ConfirmDelete'
import { TicketComposer, type ComposerPayload } from '@/components/romez/TicketComposer'
import { WhatsAppLinkDialog } from '@/components/romez/WhatsAppLinkDialog'
import { ContactName } from '@/components/romez/ContactName'
import { ChatMedia, isMediaType, MessageReactions, myReaction, ReactionButton, visibleMessageText } from '@/components/romez/ChatMessageParts'
import { PaymentPromiseDialog, type PromiseTarget } from '@/components/romez/PaymentPromiseDialog'
import { chatListTime, dayKey, dayLabel, MessageTicks, messageTime, WaAvatar } from '@/components/romez/WaChatBits'
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

type ChatFilter = 'all' | 'unread' | 'client' | 'prospect'

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
  const [filter, setFilter] = useState<ChatFilter>('all')
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
    // Un Esc que ya atendió un popup (reacciones, plantillas, emojis) no cierra el panel.
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !linkOpen && !event.defaultPrevented) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, linkOpen])

  const sessionQuery = useLineWhatsAppSession(line)
  const chatsQuery = useQuery<CollectionWhatsAppChat[]>({ queryKey: [chatsKey, deferredSearch], queryFn: () => line.api.listChats(deferredSearch).then((response) => response.data), refetchInterval: 5_000 })
  const chats = useMemo(() => chatsQuery.data ?? [], [chatsQuery.data])
  const counts = useMemo(() => ({
    unread: chats.filter((chat) => chat.unreadCount > 0).length,
    client: chats.filter((chat) => chat.company).length,
    prospect: chats.filter((chat) => !chat.company).length,
  }), [chats])
  const visibleChats = useMemo(() => chats.filter((chat) => filter === 'all' ? true : filter === 'unread' ? chat.unreadCount > 0 : filter === 'client' ? Boolean(chat.company) : !chat.company), [chats, filter])
  const selected = chats.find((chat) => chat.id === selectedId)
  const connected = sessionQuery.data?.status === 'CONNECTED'
  const sessionLabel = connected ? [sessionQuery.data?.pushName, sessionQuery.data?.phoneNumber ? `+${sessionQuery.data.phoneNumber}` : null].filter(Boolean).join(' · ') || 'Conectado' : 'Sin conexión: vinculá el número desde Configuración'

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/45 p-0 backdrop-blur-[2px] sm:p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={line.title} className="ast-rise flex w-full max-w-7xl flex-col overflow-hidden bg-[var(--paper)] shadow-[var(--ast-float-shadow)] sm:rounded-[1.5rem] sm:border sm:border-[var(--line-soft)]">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-[var(--line-soft)] px-4 sm:px-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--wa-green)] text-white shadow-sm"><WhatsAppLogo size={20} /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[15px] font-semibold text-[var(--ink-primary)]">{line.title}</p>
            <p className="flex items-center gap-1.5 truncate text-xs text-[var(--ink-tertiary)]">
              <span aria-hidden className={clsx('h-2 w-2 shrink-0 rounded-full', connected ? 'ast-pulse bg-[var(--success)]' : 'bg-[var(--danger)]')} />
              <span className="truncate">{sessionLabel}</span>
            </p>
          </div>
          <button type="button" className="btn-secondary !min-h-9 !px-3" onClick={() => setLinkOpen(true)} title="Vincular, reconectar o desvincular el número (QR)"><Settings size={15} /> <span className="hidden sm:inline">Configuración</span></button>
          <button type="button" className="grid h-9 w-9 place-items-center rounded-full text-[var(--ink-tertiary)] hover:bg-[var(--paper-soft)] hover:text-[var(--ink-primary)]" onClick={onClose} aria-label={`Cerrar ${line.title}`}><X size={19} /></button>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(290px,360px)_minmax(0,1fr)]">
          <aside className={clsx('min-h-0 flex-col border-r border-[var(--line-soft)] bg-[var(--paper)]', selectedId ? 'hidden md:flex' : 'flex')}>
            <div className="space-y-2.5 border-b border-[var(--line-soft)] p-3">
              <div className="flex items-baseline justify-between px-1">
                <h2 className="text-sm font-semibold text-[var(--ink-primary)]">Conversaciones</h2>
                <span className="text-xs text-[var(--ink-muted)]">{visibleChats.length === chats.length ? chats.length : `${visibleChats.length} de ${chats.length}`}</span>
              </div>
              <label className="relative block"><Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="ctrl-input !rounded-full pl-9" placeholder="Cliente, RUC o teléfono…" /></label>
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Filtrar conversaciones">
                <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>Todas</FilterChip>
                <FilterChip active={filter === 'unread'} onClick={() => setFilter('unread')}>Sin leer{counts.unread ? <b className="ml-0.5">{counts.unread}</b> : null}</FilterChip>
                <FilterChip active={filter === 'client'} onClick={() => setFilter('client')}>Clientes{counts.client ? <span className="ml-0.5 opacity-70">{counts.client}</span> : null}</FilterChip>
                <FilterChip active={filter === 'prospect'} onClick={() => setFilter('prospect')}>Sin legajo{counts.prospect ? <span className="ml-0.5 opacity-70">{counts.prospect}</span> : null}</FilterChip>
              </div>
              {removeChat.isError ? <p role="alert" className="px-1 text-xs font-semibold text-[var(--danger)]">{getErrorMessage(removeChat.error, 'No se pudo eliminar el chat.')}</p> : null}
            </div>
            <ul className="min-h-0 flex-1 divide-y divide-[var(--line-soft)] overflow-y-auto">
              {chatsQuery.isLoading ? <li className="flex items-center justify-center gap-2 p-8 text-xs text-[var(--ink-tertiary)]"><Loader2 size={14} className="animate-spin" /> Cargando chats…</li> : chatsQuery.isError ? <li className="p-6 text-center text-xs font-semibold text-[var(--danger)]">{getErrorMessage(chatsQuery.error)}</li> : visibleChats.length ? visibleChats.map((chat) => (
                <li key={chat.id} className="group relative">
                  <button type="button" onClick={() => setSelectedId(chat.id)} className={clsx('flex w-full items-center gap-3 border-l-4 py-3 pl-3 text-left transition', canManage ? 'pr-11' : 'pr-3', selectedId === chat.id ? 'border-l-[var(--wa-green)] bg-[var(--wa-green-soft)]' : 'border-l-transparent hover:bg-[var(--paper-soft)]')}>
                    <span className="relative">
                      <WaAvatar id={chat.id} name={chatTitle(chat)} />
                      {chat.unreadCount ? <span aria-hidden className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-[var(--wa-green)] ring-2 ring-[var(--paper)]" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={clsx('truncate text-sm text-[var(--ink-primary)]', chat.unreadCount ? 'font-bold' : 'font-medium')}>{chatTitle(chat)}</span>
                        <span className={clsx('shrink-0 text-[11px]', chat.unreadCount ? 'font-semibold text-[var(--wa-green)]' : 'text-[var(--ink-muted)]')}>{chatListTime(chat.lastMessageAt)}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className={clsx('min-w-0 flex-1 truncate text-xs', chat.unreadCount ? 'text-[var(--ink-secondary)]' : 'text-[var(--ink-tertiary)]')}>
                          {chat.lastMessageFromMe ? <CheckCheck size={13} className="mr-1 inline -translate-y-px text-[var(--ink-muted)]" aria-label="Vos:" /> : null}
                          {chat.lastMessagePreview || 'Sin mensajes todavía'}
                        </span>
                        {chat.unreadCount ? <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[var(--wa-green)] px-1.5 text-[10px] font-bold text-white">{chat.unreadCount}</span> : null}
                      </span>
                      {chat.company || chat.assistantPaused ? <span className="mt-1 flex flex-wrap items-center gap-1">
                        {chat.company ? <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-[var(--ast-accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ast-accent)]"><FolderOpen size={10} className="shrink-0" /> <span className="truncate">{chat.displayName && chat.displayName !== chat.company.name ? chat.displayName : 'Cliente con legajo'}</span></span> : null}
                        {chat.assistantPaused ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--warning-paper)] px-2 py-0.5 text-[10px] font-semibold text-[var(--warning)]" title="Lo atiende una persona: el asistente no contesta"><UserRound size={10} /> Persona</span> : null}
                      </span> : null}
                    </span>
                  </button>
                  {canManage ? <button type="button" className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-[var(--danger)] opacity-0 hover:bg-[var(--danger-paper)] focus-visible:opacity-100 disabled:opacity-40 group-hover:opacity-100" disabled={removeChat.isPending && removeChat.variables === chat.id} onClick={() => askRemove(chat)} aria-label={`Eliminar chat con ${chatTitle(chat)}`} title="Eliminar chat"><Trash2 size={15} /></button> : null}
                </li>
              )) : <li className="px-6 py-12 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--paper-inset)] text-[var(--ink-muted)]"><MessageCircle size={22} /></span><p className="mt-3 text-sm font-semibold text-[var(--ink-primary)]">Sin chats</p><p className="mt-1 text-xs text-[var(--ink-tertiary)]">{deferredSearch ? 'No hay chats que coincidan con la búsqueda.' : filter !== 'all' ? 'No hay chats con ese filtro.' : line.emptyDescription}</p></li>}
            </ul>
          </aside>
          <section className={clsx('min-h-0 flex-col', selectedId ? 'flex' : 'hidden md:flex')}>
            {selectedId ? <ChatView key={selectedId} line={line} chatId={selectedId} chat={selected} connected={connected} canWrite={canWrite} canManage={canManage} currentUserId={currentUserId} back={() => setSelectedId(null)} onDelete={selected && canManage ? () => askRemove(selected) : undefined} deleting={removeChat.isPending} onSent={() => queryClient.invalidateQueries({ queryKey: [chatsKey] })} /> : (
              <div className="wa-thread flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <span className="grid h-16 w-16 place-items-center rounded-3xl bg-[var(--paper)] text-[var(--wa-green)] shadow-[var(--ast-card-shadow)]"><MessageCircle size={28} /></span>
                <p className="font-display text-base font-semibold text-[var(--ink-primary)]">Elegí una conversación</p>
                <p className="max-w-sm text-sm text-[var(--ink-tertiary)]">Desde acá leés y respondés por el {line.title}{line.key === COMMERCIAL_WHATSAPP.key ? ', y movés al lead de etapa sin salir del chat' : ''}.</p>
              </div>
            )}
          </section>
        </div>
      </div>
      {linkOpen ? <LineWhatsAppLinkDialog line={line} canManage={canManage} onClose={() => setLinkOpen(false)} /> : null}
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={clsx('inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition', active ? 'bg-[var(--wa-green-soft)] text-[var(--wa-green)] ring-1 ring-[var(--wa-green)]/30' : 'bg-[var(--paper-inset)] text-[var(--ink-tertiary)] hover:text-[var(--ink-primary)]')}>{children}</button>
}

function ChatView({ line, chatId, chat, connected, canWrite, canManage, currentUserId, back, onSent, onDelete, deleting }: { line: WhatsAppLineConfig; chatId: string; chat?: CollectionWhatsAppChat; connected: boolean; canWrite: boolean; canManage: boolean; currentUserId?: string; back: () => void; onSent: () => void; onDelete?: () => void; deleting: boolean }) {
  const queryClient = useQueryClient()
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const messagesKey = [`${line.key}-messages`, chatId]
  const messagesQuery = useQuery<CollectionWhatsAppMessage[]>({ queryKey: messagesKey, queryFn: () => line.api.listMessages(chatId).then((response) => response.data), refetchInterval: 4_000 })
  const markRead = useMutation({ mutationFn: () => line.api.markRead(chatId), onSuccess: onSent })
  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data])
  const lastId = messages[messages.length - 1]?.id

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }) }, [lastId])
  // Las fotos y videos cargan después: si el usuario está al final, el hilo sigue pegado abajo.
  const threadRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const stickToBottom = useRef(true)
  useEffect(() => {
    const thread = threadRef.current
    const content = contentRef.current
    if (!thread || !content) return
    const onScroll = () => { stickToBottom.current = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 120 }
    const observer = new ResizeObserver(() => { if (stickToBottom.current) thread.scrollTop = thread.scrollHeight })
    thread.addEventListener('scroll', onScroll, { passive: true })
    observer.observe(content)
    return () => { thread.removeEventListener('scroll', onScroll); observer.disconnect() }
  }, [])
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
  const title = chat ? chatTitle(chat) : 'Chat'

  // Asistente de WhatsApp (sólo la línea comercial): «Atiende una persona» lo calla en este chat y
  // «Forzar IA» le hace contestar ya lo que quedó sin respuesta.
  const commercial = line.key === COMMERCIAL_WHATSAPP.key
  const paused = Boolean(chat?.assistantPaused)
  const [assistantNote, setAssistantNote] = useState<{ tone: 'info' | 'error'; text: string } | null>(null)
  const [waitingAi, setWaitingAi] = useState<{ ids: Set<string>; until: number } | null>(null)
  const [tick, setTick] = useState(0)
  const togglePause = useMutation({
    mutationFn: (next: boolean) => line.api.setAssistantPaused(chatId, next),
    onSuccess: () => { setAssistantNote(null); onSent() },
    onError: (error) => setAssistantNote({ tone: 'error', text: getErrorMessage(error, 'No se pudo cambiar quién atiende el chat.') }),
  })
  const force = useMutation({
    mutationFn: () => line.api.forceAssistant(chatId),
    onSuccess: (response) => {
      const count = response.data.messages
      setAssistantNote({ tone: 'info', text: `El asistente está contestando ${count === 1 ? 'el último mensaje' : `los últimos ${count} mensajes`}; en unos segundos aparece acá.` })
      setWaitingAi({ ids: new Set(messages.map((message) => message.id)), until: Date.now() + 120_000 })
      onSent()
    },
    onError: (error) => setAssistantNote({ tone: 'error', text: getErrorMessage(error, 'No se pudo forzar al asistente.') }),
  })
  const aiReplied = Boolean(waitingAi && messages.some((message) => message.fromMe && !waitingAi.ids.has(message.id)))
  const { refetch: refetchMessages } = messagesQuery
  // Mientras la IA contesta se relee el chat cada 3 s, hasta que aparece su respuesta o pasan 2 min.
  useEffect(() => {
    if (!waitingAi) return
    if (aiReplied) { setWaitingAi(null); setAssistantNote(null); return }
    const left = waitingAi.until - Date.now()
    if (left <= 0) {
      setWaitingAi(null)
      setAssistantNote({ tone: 'error', text: 'La respuesta del asistente todavía no llegó. Puede tardar un poco más: revisá el chat en un rato.' })
      return
    }
    const timer = window.setTimeout(() => { void refetchMessages(); setTick((value) => value + 1) }, Math.min(3_000, left))
    return () => window.clearTimeout(timer)
  }, [waitingAi, aiReplied, tick, refetchMessages])
  const aiWorking = force.isPending || Boolean(waitingAi)

  return <>
    <header className="flex items-center gap-3 border-b border-[var(--line-soft)] bg-[var(--paper)] px-3 py-2.5 sm:px-4">
      <button type="button" onClick={back} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--ink-secondary)] hover:bg-[var(--paper-soft)] md:hidden" aria-label="Volver a los chats"><ArrowLeft size={18} /></button>
      <WaAvatar id={chatId} name={title} className="h-10 w-10 text-sm" />
      <div className="min-w-0 flex-1">
        {!chat ? <p className="truncate font-display text-[15px] font-semibold text-[var(--ink-primary)]">Chat</p> : chat.company ? <>
          <p className="truncate font-display text-[15px] font-semibold leading-tight text-[var(--ink-primary)]">{chat.company.name}</p>
          <div className="flex items-center gap-1 text-xs text-[var(--ink-tertiary)]">Contacto: <ContactName key={chat.id} name={chat.displayName ?? ''} canEdit={canWrite} save={rename} className="font-medium text-[var(--ink-secondary)]" /></div>
        </> : <ContactName key={chat.id} name={chat.displayName || (chat.phoneNumber ? `+${chat.phoneNumber}` : '')} canEdit={canWrite} save={rename} className="font-display text-[15px] font-semibold text-[var(--ink-primary)]" />}
        <p className="truncate text-xs text-[var(--ink-tertiary)]">{chat?.phoneNumber ? `+${chat.phoneNumber}` : 'Sin teléfono'}{chat?.company?.ruc ? ` · RUC ${chat.company.ruc}${chat.company.dv ? `-${chat.company.dv}` : ''}` : ''}</p>
      </div>
      {line.promises && canWrite && chat ? <button type="button" className="btn-secondary !min-h-9 !px-3" onClick={() => setPromiseTarget({ client: chat.company && !chat.company.isArchived ? chat.company : null, chatId: chat.id })} title="El cliente dijo que paga tal día: agendalo para que te lo recuerde"><CalendarClock size={15} /> <span className="hidden sm:inline">Promesa de pago</span></button> : null}
      {commercial && chat ? <>
        <button
          type="button"
          onClick={() => togglePause.mutate(!paused)}
          disabled={!canWrite || togglePause.isPending}
          aria-pressed={paused}
          title={!canWrite ? 'Tu rol no puede cambiar quién atiende el chat' : paused ? 'Devolver el chat al asistente: vuelve a contestar los mensajes que lleguen' : 'Pasar el chat a una persona: el asistente deja de contestar y no manda seguimientos'}
          className={clsx('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition hover:brightness-95 disabled:cursor-default disabled:opacity-60', paused ? 'bg-[var(--warning-paper)] text-[var(--warning)]' : 'bg-[var(--success-paper)] text-[var(--success)]')}
        >
          {togglePause.isPending ? <Loader2 size={14} className="animate-spin" /> : paused ? <UserRound size={14} /> : <Bot size={14} />}
          <span className="hidden lg:inline">{paused ? 'Atiende una persona' : 'Atiende el asistente'}</span>
        </button>
        <button
          type="button"
          onClick={() => force.mutate()}
          disabled={!canWrite || aiWorking}
          title={canWrite ? 'El asistente contesta ya los mensajes sin responder (todos juntos) y queda activo en este chat' : 'Tu rol no puede forzar al asistente'}
          className={clsx('relative inline-flex h-9 shrink-0 items-center gap-1.5 overflow-hidden rounded-full px-3 text-xs font-semibold transition hover:brightness-95 disabled:cursor-default', aiWorking ? 'bg-[var(--wa-ai)] text-white' : 'bg-[var(--wa-ai-soft)] text-[var(--wa-ai)]', !canWrite && 'opacity-60')}
        >
          {aiWorking ? <span aria-hidden className="absolute inset-0 animate-pulse bg-white/15" /> : null}
          {aiWorking ? <Loader2 size={14} className="relative animate-spin" /> : <Sparkles size={14} />}
          <span className="relative hidden lg:inline">{aiWorking ? 'La IA está respondiendo…' : 'Forzar IA'}</span>
        </button>
      </> : null}
      {chat?.company && !chat.company.isArchived ? <Link href={`/clients/${chat.company.id}`} className="btn-secondary !min-h-9 hidden !px-3 sm:inline-flex"><FolderOpen size={15} /> Ver legajo</Link> : null}
      {onDelete ? <button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--danger)] hover:bg-[var(--danger-paper)] disabled:opacity-40" disabled={deleting} onClick={onDelete} aria-label="Eliminar este chat" title="Eliminar chat"><Trash2 size={16} /></button> : null}
    </header>
    {commercial ? <LeadStageBar line={line} chatId={chatId} /> : null}
    {assistantNote ? <p role={assistantNote.tone === 'error' ? 'alert' : 'status'} className={clsx('flex items-center gap-2 px-4 py-2 text-xs font-semibold', assistantNote.tone === 'error' ? 'bg-[var(--danger-paper)] text-[var(--danger)]' : 'bg-[var(--wa-ai-soft)] text-[var(--wa-ai)]')}>
      <span className="min-w-0 flex-1">{assistantNote.text}</span>
      <button type="button" onClick={() => setAssistantNote(null)} className="shrink-0 rounded-full p-0.5 hover:bg-black/5" aria-label="Cerrar aviso"><X size={13} /></button>
    </p> : null}
    <div ref={threadRef} className="wa-thread min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-8">
      <div ref={contentRef}>
      {messagesQuery.isLoading ? <p className="flex items-center justify-center gap-2 py-10 text-xs text-[var(--ink-tertiary)]"><Loader2 size={14} className="animate-spin" /> Cargando mensajes…</p> : messagesQuery.isError ? <p className="py-10 text-center text-xs font-semibold text-[var(--danger)]">{getErrorMessage(messagesQuery.error)}</p> : messages.length ? messages.map((message, index) => {
        const previous = messages[index - 1]
        const newDay = !previous || dayKey(previous.sentAt) !== dayKey(message.sentAt)
        const sameSender = !newDay && previous?.fromMe === message.fromMe
        return <Fragment key={message.id}>
          {newDay ? <p className="my-3 text-center"><span className="inline-block rounded-lg bg-[var(--wa-day)] px-3 py-1 text-[11px] font-medium text-[var(--ink-tertiary)] shadow-sm first-letter:uppercase">{dayLabel(message.sentAt)}</span></p> : null}
          <Bubble line={line} message={message} tail={!sameSender} onReact={canReply ? (emoji) => react(message.id, emoji) : undefined} />
        </Fragment>
      }) : <div className="mx-auto mt-10 max-w-sm rounded-2xl bg-[var(--wa-day)] px-5 py-4 text-center shadow-sm"><p className="text-sm font-semibold text-[var(--ink-primary)]">Conversación nueva</p><p className="mt-1 text-xs text-[var(--ink-tertiary)]">Todavía no hay mensajes con este contacto en el {line.title}.</p></div>}
      {waitingAi ? <div className="mt-2.5 flex justify-end" aria-live="polite">
        <div className="flex items-center gap-2 rounded-xl rounded-tr-sm bg-[var(--wa-out)] px-3 py-2 text-xs font-semibold text-[var(--wa-ai)] shadow-sm">
          <Bot size={13} /> Asistente escribiendo
          <span className="flex gap-0.5" aria-hidden>
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--wa-ai)] [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--wa-ai)] [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--wa-ai)]" />
          </span>
        </div>
      </div> : null}
      <div ref={bottomRef} />
      </div>
    </div>
    {commercial && canReply && !paused ? <p className="border-t border-[var(--line-soft)] bg-[var(--paper)] px-4 pt-2 text-[11px] text-[var(--ink-tertiary)]">El asistente sigue contestando a este cliente. Si lo vas a atender vos, pasalo a una persona.</p> : null}
    <TicketComposer
      variant="whatsapp"
      canReply={canReply}
      canManage={canManage}
      currentUserId={currentUserId}
      send={send}
      placeholder={canReply ? 'Escribí un mensaje' : !connected ? `El ${line.title} no está conectado` : 'Tu rol solo puede leer los chats'}
      hint={canReply ? `Enter envía · Shift + Enter nueva línea · 😊 emojis · 📎 adjuntar · ⚡ o "/" plantillas · pasá el mouse por un mensaje para reaccionar · sale por el ${line.title}` : !connected ? 'Vinculá el número desde Configuración para poder enviar.' : 'Solo lectura.'}
    />
    <PaymentPromiseDialog target={promiseTarget} onClose={() => setPromiseTarget(null)} />
  </>
}

/**
 * Etapas del lead en el tablero de Gestión comercial, cambiables desde el chat con un clic. El
 * asistente de WhatsApp las lee para saber en qué punto está el cliente; si una persona la
 * cambia, el asistente no la vuelve atrás.
 */
function LeadStageBar({ line, chatId }: { line: WhatsAppLineConfig; chatId: string }) {
  const queryClient = useQueryClient()
  const leadKey = [`${line.key}-lead`, chatId]
  const leadQuery = useQuery({ queryKey: leadKey, queryFn: () => line.api.getLead(chatId).then((response) => response.data.lead), refetchInterval: 30_000 })
  const move = useMutation({
    mutationFn: ({ dealId, stageId }: { dealId: string; stageId: string }) => dealsApi.move(dealId, stageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadKey })
      queryClient.invalidateQueries({ queryKey: ['kanban'] })
    },
  })
  const lead = leadQuery.data
  if (!lead) return null
  const stages = [...lead.stages].sort((a, b) => a.position - b.position)
  const open = stages.filter((stage) => !stage.isWon && !stage.isLost)
  const closed = stages.filter((stage) => stage.isWon || stage.isLost)
  const currentIndex = open.findIndex((stage) => stage.id === lead.stageId)
  const pendingStage = move.isPending ? move.variables?.stageId : null
  const disabled = !lead.canMove || move.isPending
  const pick = (stageId: string) => { if (stageId !== lead.stageId && !disabled) move.mutate({ dealId: lead.id, stageId }) }
  const chip = (stage: (typeof stages)[number], content: React.ReactNode, extra?: string) => {
    const current = stage.id === lead.stageId
    return <button
      key={stage.id}
      type="button"
      onClick={() => pick(stage.id)}
      disabled={disabled && !current}
      aria-pressed={current}
      title={current ? `Etapa actual: ${stage.name.trim()}` : lead.canMove ? `Mover a ${stage.name.trim()}` : 'Tu rol no puede mover este lead'}
      className={clsx('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition disabled:cursor-not-allowed', current ? 'text-[var(--ink-primary)] shadow-sm' : clsx('bg-[var(--paper)] text-[var(--ink-tertiary)] ring-1 ring-[var(--line-soft)] enabled:hover:text-[var(--ink-primary)] enabled:hover:ring-[var(--line)]', extra), disabled && !current && 'opacity-60')}
      style={current ? { background: `color-mix(in srgb, ${stage.color} 22%, var(--paper))`, boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${stage.color} 70%, transparent)` } : undefined}
    >
      {pendingStage === stage.id ? <Loader2 size={11} className="animate-spin" /> : content}
      {stage.name.trim()}
    </button>
  }
  return <div className="border-b border-[var(--line-soft)] bg-[var(--paper-soft)] px-3 py-2 sm:px-4">
    <div className="flex items-center gap-2">
      <span className="hidden shrink-0 text-[11px] font-medium text-[var(--ink-muted)] lg:inline" title="Etapa del lead en Gestión comercial">Lead #{lead.leadNumber}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-0.5" role="group" aria-label="Cambiar la etapa del lead">
        {open.map((stage, index) => chip(stage, currentIndex >= 0 && index < currentIndex ? <Check size={11} className="text-[var(--success)]" /> : <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: stage.color }} />))}
        {closed.length ? <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-[var(--line)]" /> : null}
        {closed.map((stage) => chip(stage, stage.isWon ? <ThumbsUp size={11} /> : <ThumbsDown size={11} />, stage.isWon ? 'text-[var(--success)]' : undefined))}
      </div>
    </div>
    {move.isError ? <p role="alert" className="mt-1 text-xs font-semibold text-[var(--danger)]">{getErrorMessage(move.error)}</p> : null}
  </div>
}

function SendStatus({ message }: { message: CollectionWhatsAppMessage }) {
  return <MessageTicks status={message.status} pending={message.messageId.startsWith('local-')} />
}

function Bubble({ line, message, tail, onReact }: { line: WhatsAppLineConfig; message: CollectionWhatsAppMessage; tail: boolean; onReact?: (emoji: string) => Promise<unknown> }) {
  const hasMedia = isMediaType(message.messageType)
  const text = visibleMessageText(message.text, message.messageType, message.mediaFileName)
  const canReact = Boolean(onReact) && !message.messageId.startsWith('local-')
  const mine = message.fromMe
  return <div className={clsx('group flex items-end gap-1', mine ? 'flex-row-reverse' : 'flex-row', tail ? 'mt-2.5' : 'mt-0.5')}>
    <div className={clsx('flex max-w-[85%] flex-col sm:max-w-[70%]', mine ? 'items-end' : 'items-start')}>
      <div className={clsx('rounded-xl px-2.5 pb-1 pt-1.5 text-sm shadow-[0_1px_0.5px_rgba(11,20,26,.13)]', mine ? 'bg-[var(--wa-out)] text-[var(--wa-out-ink)]' : 'bg-[var(--wa-in)] text-[var(--ink-primary)]', tail && (mine ? 'rounded-tr-sm' : 'rounded-tl-sm'))}>
        {tail ? <p className={clsx('text-[11px] font-semibold', mine ? 'text-[var(--wa-green)]' : 'text-[var(--ink-tertiary)]')}>{mine ? (message.sentBy ? fullName(message.sentBy) : line.teamLabel) : message.pushName || 'Cliente'}</p> : null}
        {hasMedia ? <div className="max-w-[min(20rem,66vw)]"><ChatMedia messageType={message.messageType} mimeType={message.mediaMimeType} fileName={message.mediaFileName} sizeBytes={message.mediaSizeBytes} outgoing={false} load={() => line.api.getMedia(message.id).then((response) => response.data)} /></div> : null}
        {text ? <p className="mt-0.5 whitespace-pre-wrap break-words leading-5">{text}</p> : null}
        <p className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-[var(--wa-meta)]">{messageTime(message.sentAt)}{mine ? <SendStatus message={message} /> : null}</p>
      </div>
      <MessageReactions reactions={message.reactions} outgoing={mine} />
    </div>
    {canReact ? <ReactionButton current={myReaction(message.reactions)} onReact={onReact!} outgoing={mine} /> : null}
  </div>
}
