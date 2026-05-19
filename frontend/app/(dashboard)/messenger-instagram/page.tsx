'use client'

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Image as ImageIcon,
  Instagram,
  Loader2,
  MessageCircle,
  MessagesSquare,
  RefreshCcw,
  Search,
  SendHorizontal,
  Settings2,
  ShieldAlert,
  WifiOff,
} from 'lucide-react'
import { chatwootApi } from '@/lib/api'
import { auth } from '@/lib/auth'
import { canDo, type ChatwootChannel, type ChatwootConversation, type ChatwootMessage, type Role } from '@/types'

type ChannelFilter = 'all' | ChatwootChannel
type StatusFilter = 'open' | 'pending' | 'resolved' | 'all'

const ALLOWED_ROLES: Role[] = ['owner', 'admin', 'member']
const REFRESH_MS = 10000

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

function statusLabel(status: StatusFilter) {
  if (status === 'open') return 'Abiertas'
  if (status === 'pending') return 'Pendientes'
  if (status === 'resolved') return 'Resueltas'
  return 'Todo'
}

function ChannelBadge({ channel }: { channel: ChatwootChannel }) {
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

function conversationName(conversation: ChatwootConversation) {
  return conversation.contact.name?.trim() || `Conversacion #${conversation.id}`
}

function messagePreview(conversation: ChatwootConversation) {
  const content = conversation.latestMessage?.content?.trim()
  if (content) return content
  return conversation.latestMessage ? 'Mensaje sin texto visible' : 'Sin mensajes'
}

function SetupState({
  missing,
  baseUrl,
  error,
}: {
  missing: string[]
  baseUrl?: string
  error?: string
}) {
  return (
    <div className="mx-auto flex min-h-full max-w-5xl items-center justify-center p-6">
      <section className="interactive-card w-full overflow-hidden">
        <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-200">
              <Settings2 size={14} />
              Chatwoot
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50">
              Messenger / Instagram
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-600 dark:text-slate-300">
              Falta conectar el backend con Chatwoot self-hosted.
            </p>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-200">
            <ShieldAlert size={34} />
          </div>
        </div>

        <div className="grid gap-4 border-t border-slate-200 p-6 dark:border-slate-700 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-900/45">
            <p className="section-label">Variables faltantes</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {missing.length ? missing.map((item) => (
                <span key={item} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {item}
                </span>
              )) : (
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Variables presentes</span>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-900/45">
            <p className="section-label">Estado</p>
            <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
              {error || (baseUrl ? 'No se pudo validar Chatwoot.' : 'Chatwoot todavia no tiene URL configurada.')}
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

function MessageAttachments({ message }: { message: ChatwootMessage }) {
  if (!message.attachments.length) return null

  return (
    <div className="mt-3 space-y-2">
      {message.attachments.map((attachment) => (
        <a
          key={String(attachment.id)}
          href={attachment.url ?? attachment.thumbUrl ?? undefined}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold"
        >
          <ImageIcon size={14} />
          <span className="truncate">{attachment.fileName || attachment.type || 'Adjunto'}</span>
          {attachment.url || attachment.thumbUrl ? <ExternalLink size={12} className="ml-auto shrink-0" /> : null}
        </a>
      ))}
    </div>
  )
}

export default function MessengerInstagramPage() {
  const queryClient = useQueryClient()
  const messagesViewportRef = useRef<HTMLDivElement | null>(null)
  const [userReady, setUserReady] = useState(false)
  const [canAccess, setCanAccess] = useState(false)
  const [channel, setChannel] = useState<ChannelFilter>('all')
  const [status, setStatus] = useState<StatusFilter>('open')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const deferredSearch = useDeferredValue(search)

  useEffect(() => {
    const user = auth.get()
    setCanAccess(canDo(user?.role, ALLOWED_ROLES))
    setUserReady(true)
  }, [])

  const statusQuery = useQuery({
    queryKey: ['chatwoot-status'],
    queryFn: () => chatwootApi.status().then((response) => response.data),
    enabled: userReady && canAccess,
    retry: false,
  })

  const chatwootStatus = statusQuery.data
  const isReady = Boolean(chatwootStatus?.configured && chatwootStatus.reachable)

  const conversationsQuery = useQuery({
    queryKey: ['chatwoot-conversations', channel, status, deferredSearch],
    queryFn: () => chatwootApi.listConversations({
      channel,
      status,
      q: deferredSearch.trim() || undefined,
      page: 0,
      limit: 80,
    }).then((response) => response.data),
    enabled: userReady && canAccess && isReady,
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: 'always',
  })

  const conversations = useMemo(
    () => conversationsQuery.data?.items ?? [],
    [conversationsQuery.data?.items]
  )

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
    queryKey: ['chatwoot-messages', selectedConversation?.id],
    queryFn: () => chatwootApi.listMessages(selectedConversation!.id).then((response) => response.data),
    enabled: userReady && canAccess && isReady && Boolean(selectedConversation?.id),
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: 'always',
  })

  const messages = messagesQuery.data ?? []
  const unreadTotal = conversations.reduce((sum, item) => sum + item.unreadCount, 0)
  const openTotal = conversations.filter((item) => item.status === 'open').length

  useEffect(() => {
    const viewport = messagesViewportRef.current
    if (!viewport) return
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' })
  }, [selectedConversation?.id, messages.length])

  const sendMutation = useMutation({
    mutationFn: (payload: { conversationId: number; content: string }) =>
      chatwootApi.sendMessage(payload.conversationId, { content: payload.content }).then((response) => response.data),
    onSuccess: async (_message, payload) => {
      setDraft('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['chatwoot-conversations'] }),
        queryClient.invalidateQueries({ queryKey: ['chatwoot-messages', payload.conversationId] }),
      ])
    },
    onError: (error) => {
      alert(toErrorMessage(error))
    },
  })

  function handleSend() {
    const content = draft.trim()
    if (!selectedConversation || !content || sendMutation.isPending || !selectedConversation.canReply) return

    sendMutation.mutate({
      conversationId: selectedConversation.id,
      content,
    })
  }

  if (!userReady || statusQuery.isLoading) {
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

  if (!chatwootStatus?.configured || !chatwootStatus.reachable) {
    return (
      <SetupState
        missing={chatwootStatus?.missing ?? []}
        baseUrl={chatwootStatus?.baseUrl}
        error={chatwootStatus?.error || (statusQuery.error ? toErrorMessage(statusQuery.error) : undefined)}
      />
    )
  }

  return (
    <div className="flex min-h-full flex-col gap-5 p-6">
      <section className="interactive-card static-card overflow-hidden">
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-sky-800 dark:border-sky-400/30 dark:bg-sky-500/15 dark:text-sky-200">
              <MessagesSquare size={14} />
              Chatwoot
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50">
              Messenger / Instagram
            </h1>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/45">
              <p className="section-label">Conversaciones</p>
              <p className="mt-2 text-3xl font-black text-slate-900 dark:text-slate-50">{conversations.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/45">
              <p className="section-label">Abiertas</p>
              <p className="mt-2 text-3xl font-black text-slate-900 dark:text-slate-50">{openTotal}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/45">
              <p className="section-label">Sin leer</p>
              <p className="mt-2 text-3xl font-black text-slate-900 dark:text-slate-50">{unreadTotal}</p>
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

          <div className="flex rounded-2xl p-1" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-0)' }}>
            {(['open', 'pending', 'resolved', 'all'] as StatusFilter[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setStatus(item)}
                className="rounded-xl px-3 py-2 text-xs font-semibold transition-colors"
                style={{
                  background: status === item ? 'var(--surface-0)' : 'transparent',
                  color: status === item ? 'var(--ink-primary)' : 'var(--ink-secondary)',
                  border: status === item ? '1px solid var(--border-1)' : '1px solid transparent',
                }}
              >
                {statusLabel(item)}
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

          <a
            href={chatwootStatus.portalUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-primary h-10 px-3 text-xs"
          >
            <ExternalLink size={14} />
            Abrir Chatwoot
          </a>
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
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Sin conversaciones para este filtro.</p>
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
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 text-sm font-black text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                          {conversation.contact.thumbnail ? (
                            <img src={conversation.contact.thumbnail} alt={conversationName(conversation)} className="h-full w-full object-cover" />
                          ) : (
                            conversationName(conversation).slice(0, 2).toUpperCase()
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-slate-900 dark:text-slate-50">
                                {conversationName(conversation)}
                              </p>
                              <p className="mt-0.5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                                {conversation.inbox.name}
                              </p>
                            </div>
                            <span className="shrink-0 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                              {formatDate(conversation.lastActivityAt)}
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
              <p className="text-base font-semibold text-slate-800 dark:text-slate-100">Selecciona una conversacion</p>
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary-100 text-sm font-black text-primary-700 dark:bg-slate-800 dark:text-slate-100">
                      {selectedConversation.contact.thumbnail ? (
                        <img src={selectedConversation.contact.thumbnail} alt={conversationName(selectedConversation)} className="h-full w-full object-cover" />
                      ) : (
                        conversationName(selectedConversation).slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-xl font-black tracking-tight text-slate-900 dark:text-slate-50">
                        {conversationName(selectedConversation)}
                      </h2>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <ChannelBadge channel={selectedConversation.channel} />
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                          {selectedConversation.status}
                        </span>
                        {selectedConversation.assignee?.name ? (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                            {selectedConversation.assignee.name}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <a href={selectedConversation.webUrl} target="_blank" rel="noreferrer" className="btn-secondary h-10 px-3 text-xs">
                    <ExternalLink size={14} />
                    Ver en Chatwoot
                  </a>
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
                    const activity = message.direction === 'activity'

                    return (
                      <div key={message.id} className={clsx('flex', outbound ? 'justify-end' : 'justify-start')}>
                        <div
                          className={clsx(
                            'max-w-[82%] rounded-[20px] px-4 py-3 text-sm shadow-sm sm:max-w-[70%]',
                            outbound
                              ? 'bg-primary-700 text-white'
                              : activity
                                ? 'border border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                : 'border border-white/80 bg-white/95 text-slate-900 dark:border-slate-600/70 dark:bg-slate-800/95 dark:text-slate-50'
                          )}
                        >
                          {message.sender?.name ? (
                            <p className={clsx('mb-1 text-[11px] font-black uppercase tracking-[0.14em]', outbound ? 'text-white/75' : 'text-slate-500 dark:text-slate-400')}>
                              {message.sender.name}
                            </p>
                          ) : null}
                          <p className="whitespace-pre-wrap leading-6">{message.content || 'Mensaje sin texto'}</p>
                          <MessageAttachments message={message} />
                          <div className={clsx('mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold', outbound ? 'text-white/75' : 'text-slate-500 dark:text-slate-400')}>
                            <span>{formatDate(message.createdAt)}</span>
                            {message.private ? <span>Privado</span> : null}
                            {message.status ? <span>{message.status}</span> : null}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              <div className="shrink-0 border-t border-slate-200 bg-white/80 px-5 py-4 dark:border-slate-700 dark:bg-slate-900/50">
                {!selectedConversation.canReply ? (
                  <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-200">
                    Chatwoot indica que esta conversacion no admite respuesta.
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
                    placeholder="Escribe una respuesta"
                    disabled={!selectedConversation.canReply || sendMutation.isPending}
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!draft.trim() || !selectedConversation.canReply || sendMutation.isPending}
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

      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
        {chatwootStatus.channels.messenger ? <span className="inline-flex items-center gap-1"><CheckCircle2 size={13} />Messenger</span> : <span className="inline-flex items-center gap-1"><AlertCircle size={13} />Messenger sin inbox</span>}
        {chatwootStatus.channels.instagram ? <span className="inline-flex items-center gap-1"><CheckCircle2 size={13} />Instagram</span> : <span className="inline-flex items-center gap-1"><AlertCircle size={13} />Instagram sin inbox</span>}
      </div>
    </div>
  )
}
