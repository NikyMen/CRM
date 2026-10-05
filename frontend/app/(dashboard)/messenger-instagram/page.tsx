'use client'

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  Clock,
  ExternalLink,
  Image as ImageIcon,
  Instagram,
  Loader2,
  MessageCircle,
  MessagesSquare,
  RefreshCcw,
  Search,
  SendHorizontal,
  ShieldAlert,
  WifiOff,
} from 'lucide-react'
import { inboxApi, resolveApiAssetUrl } from '@/lib/api'
import { auth } from '@/lib/auth'
import { canDo, type InboxConversation, type InboxMessage, type PaginatedResult, type Role } from '@/types'

type MetaChannel = 'messenger' | 'instagram'
type ChannelFilter = 'all' | MetaChannel

const ALLOWED_ROLES: Role[] = ['owner', 'admin', 'member']
const REFRESH_MS = 10000
const MESSAGES_PAGE_SIZE = 100
// Meta solo deja responder libremente dentro de las 24 h posteriores al ultimo mensaje del cliente.
const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000

function toErrorMessage(error: any) {
  return error?.response?.data?.message ?? error?.response?.data?.error ?? error?.message ?? 'Error inesperado'
}

function formatDate(value?: string | null) {
  if (!value) return 'Sin actividad'
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function channelLabel(channel: ChannelFilter) {
  if (channel === 'instagram') return 'Instagram'
  if (channel === 'messenger') return 'Messenger'
  return 'Todo'
}

function statusLabel(status: string) {
  switch (status) {
    case 'pending': return 'Enviando'
    case 'sent': return 'Enviado'
    case 'delivered': return 'Entregado'
    case 'read': return 'Leído'
    case 'failed': return 'Falló'
    default: return null
  }
}

function ChannelBadge({ channel }: { channel: string }) {
  const isInstagram = channel === 'instagram'

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.16em]',
        isInstagram
          ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200'
          : 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200'
      )}
    >
      {isInstagram ? <Instagram size={12} /> : <MessageCircle size={12} />}
      {isInstagram ? 'Instagram' : 'Messenger'}
    </span>
  )
}

function conversationName(conversation: InboxConversation) {
  const { firstName, lastName } = conversation.contact
  return [firstName, lastName].filter(Boolean).join(' ').trim() || 'Contacto sin nombre'
}

function ContactAvatar({ conversation, className }: { conversation: InboxConversation; className: string }) {
  const name = conversationName(conversation)

  return (
    <div className={clsx('flex shrink-0 items-center justify-center overflow-hidden rounded-2xl text-sm font-black', className)}>
      {conversation.contact.avatar ? (
        <img src={conversation.contact.avatar} alt={name} className="h-full w-full object-cover" />
      ) : (
        name.slice(0, 2).toUpperCase()
      )}
    </div>
  )
}

function messagePreview(conversation: InboxConversation) {
  const latest = conversation.messages[0]
  if (!latest) return 'Sin mensajes'

  const prefix = latest.direction === 'outbound' ? 'Vos: ' : ''
  const text = latest.text?.trim()
  if (text) return `${prefix}${text}`
  if (latest.attachments.length) return `${prefix}Adjunto (${latest.attachments[0].type})`
  return `${prefix}Mensaje sin texto visible`
}

function isReplyWindowOpen(conversation: InboxConversation) {
  if (!conversation.lastInboundAt) return false
  return Date.now() - new Date(conversation.lastInboundAt).getTime() < REPLY_WINDOW_MS
}

// Los mensajes vienen ordenados del mas viejo al mas nuevo; para un chat largo se traen las dos
// ultimas paginas, asi siempre se ven los mensajes recientes.
async function fetchLatestMessages(conversationId: string): Promise<InboxMessage[]> {
  const first = (await inboxApi.listMessages(conversationId, { page: 0, limit: MESSAGES_PAGE_SIZE })).data
  if (first.totalPages <= 1) return first.items

  const lastPage = first.totalPages - 1
  const pages = await Promise.all(
    [lastPage - 1, lastPage].map((page) =>
      page === 0
        ? Promise.resolve(first)
        : inboxApi.listMessages(conversationId, { page, limit: MESSAGES_PAGE_SIZE }).then((response) => response.data)
    )
  )

  return pages.flatMap((page: PaginatedResult<InboxMessage>) => page.items)
}

function MessageAttachments({ message }: { message: InboxMessage }) {
  if (!message.attachments.length) return null

  return (
    <div className="mt-3 space-y-2">
      {message.attachments.map((attachment) => {
        const url = resolveApiAssetUrl(attachment.url)

        if (url && attachment.type === 'image') {
          return (
            <a key={attachment.id} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl">
              <img src={url} alt={attachment.fileName || 'Imagen'} className="max-h-72 w-full object-cover" />
            </a>
          )
        }

        return (
          <a
            key={attachment.id}
            href={url ?? undefined}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold"
          >
            <ImageIcon size={14} />
            <span className="truncate">{attachment.fileName || attachment.type || 'Adjunto'}</span>
            {url ? <ExternalLink size={12} className="ml-auto shrink-0" /> : null}
          </a>
        )
      })}
    </div>
  )
}

export default function MessengerInstagramPage() {
  const queryClient = useQueryClient()
  const messagesViewportRef = useRef<HTMLDivElement | null>(null)
  const [userReady, setUserReady] = useState(false)
  const [canAccess, setCanAccess] = useState(false)
  const [channel, setChannel] = useState<ChannelFilter>('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const deferredSearch = useDeferredValue(search)

  useEffect(() => {
    const user = auth.get()
    setCanAccess(canDo(user?.role, ALLOWED_ROLES))
    setUserReady(true)
  }, [])

  const conversationsQuery = useQuery({
    queryKey: ['meta-conversations', channel],
    queryFn: () => inboxApi.listConversations({
      ...(channel === 'all' ? { channels: 'messenger,instagram' } : { channel }),
      page: 0,
      limit: 100,
    }).then((response) => response.data),
    enabled: userReady && canAccess,
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: 'always',
  })

  // El backend no busca por nombre: se filtra sobre las conversaciones ya cargadas.
  const conversations = useMemo(() => {
    const items = conversationsQuery.data?.items ?? []
    const term = deferredSearch.trim().toLowerCase()
    if (!term) return items
    return items.filter((item) => conversationName(item).toLowerCase().includes(term))
  }, [conversationsQuery.data?.items, deferredSearch])

  const selectedConversation = conversations.find((item) => item.id === selectedId) ?? null

  useEffect(() => {
    if (!conversations.length) {
      setSelectedId(null)
      return
    }

    if (!selectedId || !conversations.some((item) => item.id === selectedId)) {
      setSelectedId(conversations[0].id)
    }
  }, [conversations, selectedId])

  const messagesQuery = useQuery({
    queryKey: ['meta-messages', selectedConversation?.id],
    queryFn: () => fetchLatestMessages(selectedConversation!.id),
    enabled: userReady && canAccess && Boolean(selectedConversation?.id),
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: 'always',
  })

  const messages = messagesQuery.data ?? []
  const totalConversations = conversationsQuery.data?.total ?? 0
  const unreadTotal = conversations.reduce((sum, item) => sum + item.unreadCount, 0)
  const messengerTotal = conversations.filter((item) => item.channel === 'messenger').length
  const instagramTotal = conversations.filter((item) => item.channel === 'instagram').length

  useEffect(() => {
    const viewport = messagesViewportRef.current
    if (!viewport) return
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' })
  }, [selectedConversation?.id, messages.length])

  const markReadMutation = useMutation({
    mutationFn: (conversationId: string) => inboxApi.markConversationRead(conversationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meta-conversations'] }),
  })

  const selectedUnread = selectedConversation?.unreadCount ?? 0
  useEffect(() => {
    if (selectedConversation?.id && selectedUnread > 0 && !markReadMutation.isPending) {
      markReadMutation.mutate(selectedConversation.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversation?.id, selectedUnread])

  const sendMutation = useMutation({
    mutationFn: (payload: { conversationId: string; text: string }) =>
      inboxApi.sendConversationMessage(payload.conversationId, { text: payload.text }).then((response) => response.data),
    onSuccess: async (_message, payload) => {
      setDraft('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['meta-conversations'] }),
        queryClient.invalidateQueries({ queryKey: ['meta-messages', payload.conversationId] }),
      ])
    },
    onError: async (error, payload) => {
      // El backend guarda el mensaje como fallido; se refresca para que se vea en el chat.
      await queryClient.invalidateQueries({ queryKey: ['meta-messages', payload.conversationId] })
      alert(toErrorMessage(error))
    },
  })

  const canReply = selectedConversation ? isReplyWindowOpen(selectedConversation) : false

  function handleSend() {
    const text = draft.trim()
    if (!selectedConversation || !text || sendMutation.isPending || !canReply) return

    sendMutation.mutate({
      conversationId: selectedConversation.id,
      text,
    })
  }

  if (!userReady) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <Loader2 className="animate-spin text-primary-600" size={30} />
      </div>
    )
  }

  if (!canAccess) {
    return (
      <div className="mx-auto flex min-h-full max-w-5xl items-center justify-center p-6">
        <div className="interactive-card w-full max-w-2xl border-l-4 border-l-amber-500 p-8">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-amber-100 p-3 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200">
              <ShieldAlert size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-50">Acceso restringido</h1>
              <p className="mt-2 max-w-xl text-sm font-medium text-slate-600 dark:text-slate-300">
                Messenger e Instagram quedan habilitados para owner, admin y member.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col gap-5 p-6">
      <section className="interactive-card static-card overflow-hidden">
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-sky-800 dark:border-sky-400/30 dark:bg-sky-500/15 dark:text-sky-200">
              <MessagesSquare size={14} />
              API oficial de Meta
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50">
              Messenger / Instagram
            </h1>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/45">
              <p className="section-label">Conversaciones</p>
              <p className="mt-2 text-3xl font-black text-slate-900 dark:text-slate-50">{totalConversations}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/45">
              <p className="section-label">Sin leer</p>
              <p className="mt-2 text-3xl font-black text-slate-900 dark:text-slate-50">{unreadTotal}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/45">
              <p className="section-label">Messenger / IG</p>
              <p className="mt-2 text-3xl font-black text-slate-900 dark:text-slate-50">{messengerTotal} / {instagramTotal}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
          <div className="flex rounded-2xl p-1" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-0)' }}>
            {(['all', 'messenger', 'instagram'] as ChannelFilter[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setChannel(item)}
                className="rounded-xl px-3 py-2 text-xs font-semibold transition-colors"
                style={{
                  background: channel === item ? 'var(--surface-0)' : 'transparent',
                  color: channel === item ? 'var(--ink-primary)' : 'var(--ink-secondary)',
                  border: channel === item ? '1px solid var(--border-1)' : '1px solid transparent',
                }}
              >
                {channelLabel(item)}
              </button>
            ))}
          </div>

          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="ctrl-input h-10 pl-9"
              placeholder="Buscar contacto"
            />
          </div>

          <button
            type="button"
            onClick={() => conversationsQuery.refetch()}
            className="btn-secondary h-10 px-3 text-xs"
          >
            <RefreshCcw size={14} />
            Actualizar
          </button>
        </div>
      </section>

      <div className="grid min-h-[680px] gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <section className="interactive-card static-card flex min-h-0 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <p className="text-sm font-black text-slate-900 dark:text-slate-50">Conversaciones</p>
            {conversationsQuery.isFetching ? <Loader2 size={16} className="animate-spin text-primary-600" /> : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {conversationsQuery.isLoading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="animate-spin text-primary-600" size={26} />
              </div>
            ) : conversationsQuery.isError ? (
              <div className="m-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/15 dark:text-rose-200">
                {toErrorMessage(conversationsQuery.error)}
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <WifiOff className="mb-3 text-slate-400" size={30} />
                {deferredSearch.trim() ? (
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Ningún contacto coincide con la búsqueda.</p>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Todavía no hay chats.</p>
                    <p className="mt-2 text-xs font-medium leading-5 text-slate-500 dark:text-slate-400">
                      Cuando alguien le escriba a tu Página o a tu Instagram aparece acá. Las cuentas se conectan en{' '}
                      <Link href="/api-meta" className="font-black text-primary-600 hover:underline">API Meta</Link>.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-700">
                {conversations.map((conversation) => {
                  const active = conversation.id === selectedConversation?.id

                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => setSelectedId(conversation.id)}
                      className="w-full px-4 py-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/70"
                      style={{
                        background: active ? 'rgba(37,99,235,0.08)' : 'transparent',
                        borderLeft: active ? '3px solid var(--primary-600)' : '3px solid transparent',
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <ContactAvatar
                          conversation={conversation}
                          className="h-11 w-11 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200"
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-slate-900 dark:text-slate-50">
                                {conversationName(conversation)}
                              </p>
                              <p className="mt-0.5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                                {conversation.connection.externalAccountLabel || conversation.connection.name}
                              </p>
                            </div>
                            <span className="shrink-0 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                              {formatDate(conversation.lastMessageAt)}
                            </span>
                          </div>

                          <p className="mt-2 line-clamp-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                            {messagePreview(conversation)}
                          </p>

                          <div className="mt-3 flex items-center justify-between gap-3">
                            <ChannelBadge channel={conversation.channel} />
                            {conversation.unreadCount > 0 ? (
                              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                                {conversation.unreadCount}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        <section className="interactive-card static-card flex min-h-0 flex-col overflow-hidden">
          {!selectedConversation ? (
            <div className="flex h-full flex-col items-center justify-center px-8 text-center">
              <MessagesSquare className="mb-4 text-slate-400" size={42} />
              <p className="text-base font-semibold text-slate-800 dark:text-slate-100">Seleccioná una conversación</p>
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <ContactAvatar
                      conversation={selectedConversation}
                      className="h-12 w-12 bg-primary-100 text-primary-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <div className="min-w-0">
                      <h2 className="truncate text-xl font-black tracking-tight text-slate-900 dark:text-slate-50">
                        {conversationName(selectedConversation)}
                      </h2>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <ChannelBadge channel={selectedConversation.channel} />
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                          {selectedConversation.connection.externalAccountLabel || selectedConversation.connection.name}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Link href={`/contacts/${selectedConversation.contact.id}`} className="btn-secondary h-10 px-3 text-xs">
                    <ExternalLink size={14} />
                    Ver contacto
                  </Link>
                </div>
              </div>

              <div
                ref={messagesViewportRef}
                className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5"
                style={{ background: 'var(--chat-pattern), var(--chat-surface)' }}
              >
                {messagesQuery.isLoading ? (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="animate-spin text-primary-600" size={26} />
                  </div>
                ) : messagesQuery.isError ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/15 dark:text-rose-200">
                    {toErrorMessage(messagesQuery.error)}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center px-8 text-center">
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Sin mensajes visibles.</p>
                  </div>
                ) : (
                  messages.map((message) => {
                    const outbound = message.direction === 'outbound'
                    const failed = message.status === 'failed'
                    const status = outbound ? statusLabel(message.status) : null

                    return (
                      <div key={message.id} className={clsx('flex', outbound ? 'justify-end' : 'justify-start')}>
                        <div
                          className={clsx(
                            'max-w-[82%] rounded-[20px] px-4 py-3 text-sm shadow-sm sm:max-w-[70%]',
                            outbound
                              ? failed ? 'bg-rose-700 text-white' : 'bg-primary-700 text-white'
                              : 'border border-white/80 bg-white/95 text-slate-900 dark:border-slate-600/70 dark:bg-slate-800/95 dark:text-slate-50'
                          )}
                        >
                          {message.text ? <p className="whitespace-pre-wrap leading-6">{message.text}</p> : null}
                          {!message.text && !message.attachments.length ? (
                            <p className="whitespace-pre-wrap leading-6 opacity-75">Mensaje sin texto ({message.type})</p>
                          ) : null}
                          <MessageAttachments message={message} />
                          <div className={clsx('mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold', outbound ? 'text-white/75' : 'text-slate-500 dark:text-slate-400')}>
                            <span>{formatDate(message.sentAt ?? message.createdAt)}</span>
                            {status ? <span>{status}</span> : null}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              <div className="shrink-0 border-t border-slate-200 bg-white/80 px-5 py-4 dark:border-slate-700 dark:bg-slate-900/50">
                {!canReply ? (
                  <div className="mb-3 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-200">
                    <Clock size={16} className="mt-0.5 shrink-0" />
                    Pasaron más de 24 h desde el último mensaje del cliente. Meta no deja responder hasta que vuelva a escribir.
                  </div>
                ) : null}
                <div className="flex items-end gap-3">
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        handleSend()
                      }
                    }}
                    rows={3}
                    className="ctrl-input min-h-[84px] resize-none"
                    placeholder="Escribí una respuesta"
                    disabled={!canReply || sendMutation.isPending}
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!draft.trim() || !canReply || sendMutation.isPending}
                    className="btn-primary h-14 min-w-14 rounded-2xl px-4 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sendMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <SendHorizontal size={18} />}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
