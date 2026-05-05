'use client'

import { Suspense, startTransition, useDeferredValue, useEffect, useEffectEvent, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import clsx from 'clsx'
import {
  AlertCircle,
  CheckCheck,
  ChevronDown,
  Circle,
  Clock3,
  ExternalLink,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Inbox,
  Loader2,
  MessageSquareText,
  Phone,
  RefreshCw,
  Search,
  SendHorizontal,
  ShieldAlert,
  Sparkles,
  WifiOff,
} from 'lucide-react'
import { inboxApi } from '@/lib/api'
import { auth } from '@/lib/auth'
import { canDo, type InboxConversation, type InboxMessage, type InboxMessageAttachment, type PaginatedResult, type Role } from '@/types'

const ALLOWED_ROLES: Role[] = ['owner', 'admin', 'member']
const CONVERSATION_LIMIT = 100
const MESSAGE_LIMIT = 100
const CONVERSATIONS_REFRESH_MS = 12_000
const MESSAGES_REFRESH_MS = 6_000
const BOTTOM_LOCK_THRESHOLD_PX = 96

function formatStamp(value?: string | null) {
  if (!value) return 'Sin fecha'

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatSyncStamp(value?: number) {
  if (!value) return 'Sin sincronizar'

  return new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

function formatMessagePreview(conversation: InboxConversation) {
  const latest = conversation.messages[0]
  if (!latest) return 'Sin mensajes todavia'
  if (latest.text?.trim()) return latest.text.trim()
  if (latest.attachments.length > 0) return 'Adjunto recibido'
  return latest.type === 'text' ? 'Mensaje sin contenido visible' : `Mensaje ${latest.type}`
}

function formatConversationName(conversation: InboxConversation) {
  const fullName = [conversation.contact.firstName, conversation.contact.lastName]
    .filter(Boolean)
    .join(' ')
    .trim()

  return fullName || conversation.connection.externalAccountLabel || conversation.externalUserId || 'Contacto sin nombre'
}

function resolveMessageState(message: InboxMessage) {
  if (message.failedAt || message.status === 'failed') {
    return { label: 'Error', tone: 'text-rose-600 dark:text-rose-300' }
  }

  if (message.readAt) {
    return { label: 'Leido', tone: 'text-emerald-600 dark:text-emerald-300' }
  }

  if (message.deliveredAt) {
    return { label: 'Entregado', tone: 'text-sky-600 dark:text-sky-300' }
  }

  if (message.sentAt || message.status === 'sent') {
    return { label: 'Enviado', tone: 'text-slate-500 dark:text-slate-300' }
  }

  return { label: 'Pendiente', tone: 'text-amber-600 dark:text-amber-300' }
}

function formatFileSize(sizeBytes?: number | null) {
  if (!sizeBytes || sizeBytes < 1) return null

  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (sizeBytes >= 1024) {
    return `${Math.round(sizeBytes / 1024)} KB`
  }

  return `${sizeBytes} B`
}

function resolveAttachmentKind(attachment: InboxMessageAttachment) {
  const mimeType = attachment.mimeType?.toLowerCase() ?? ''
  const type = attachment.type.toLowerCase()

  if (mimeType.startsWith('image/') || ['image', 'photo', 'sticker'].includes(type)) return 'image'
  if (mimeType.startsWith('audio/') || ['audio', 'voice', 'ptt'].includes(type)) return 'audio'
  if (mimeType.startsWith('video/') || ['video'].includes(type)) return 'video'
  if (mimeType.startsWith('application/') || ['document', 'file', 'pdf'].includes(type)) return 'document'
  return 'generic'
}

function renderAttachmentIcon(kind: ReturnType<typeof resolveAttachmentKind>) {
  if (kind === 'image') return <FileImage size={16} />
  if (kind === 'audio') return <FileAudio size={16} />
  if (kind === 'video') return <FileVideo size={16} />
  return <FileText size={16} />
}

function MessageAttachments({
  attachments,
  isOutbound,
}: {
  attachments: InboxMessageAttachment[]
  isOutbound: boolean
}) {
  const shellClassName = isOutbound
    ? 'border-white/20 bg-white/10 text-white/90'
    : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-200'

  return (
    <div className="mt-3 space-y-3">
      {attachments.map((attachment) => {
        const kind = resolveAttachmentKind(attachment)
        const sizeLabel = formatFileSize(attachment.sizeBytes)
        const title = attachment.fileName || attachment.mimeType || attachment.type || 'Adjunto'

        return (
          <div
            key={attachment.id}
            className={clsx('overflow-hidden rounded-2xl border', shellClassName)}
          >
            {kind === 'image' && attachment.url && (
              <a href={attachment.url} target="_blank" rel="noreferrer" className="block">
                <img
                  src={attachment.url}
                  alt={title}
                  className="max-h-72 w-full bg-slate-900/10 object-cover"
                />
              </a>
            )}

            <div className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em]">
                    {renderAttachmentIcon(kind)}
                    {kind}
                  </div>
                  <p className="mt-2 truncate text-sm font-semibold">{title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium opacity-80">
                    {attachment.mimeType && <span>{attachment.mimeType}</span>}
                    {sizeLabel && <span>{sizeLabel}</span>}
                  </div>
                </div>

                {attachment.url && (
                  <a
                    href={attachment.url}
                    target="_blank"
                    rel="noreferrer"
                    className={clsx(
                      'inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em]',
                      isOutbound
                        ? 'bg-white/15 text-white'
                        : 'bg-white text-slate-700 dark:bg-slate-800 dark:text-slate-100'
                    )}
                  >
                    Abrir
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>

              {kind === 'audio' && attachment.url && (
                <audio controls src={attachment.url} className="mt-3 w-full" />
              )}

              {kind === 'video' && attachment.url && (
                <video controls src={attachment.url} className="mt-3 max-h-72 w-full rounded-2xl bg-black/70" />
              )}

              {!attachment.url && (
                <p className="mt-3 text-xs font-medium opacity-80">
                  Este adjunto existe en la base, pero no tiene URL publica para vista previa todavia.
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function InboxPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const messagesViewportRef = useRef<HTMLDivElement | null>(null)
  const previousConversationIdRef = useRef<string | null>(null)
  const previousMessageCountRef = useRef(0)
  const markingReadConversationRef = useRef<string | null>(null)

  const [user, setUser] = useState<ReturnType<typeof auth.get>>(null)
  const [userReady, setUserReady] = useState(false)
  const [isPageVisible, setIsPageVisible] = useState(true)
  const [isOnline, setIsOnline] = useState(true)
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [hasPendingNewMessages, setHasPendingNewMessages] = useState(false)
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState('')
  const deferredSearch = useDeferredValue(search)

  useEffect(() => {
    setUser(auth.get())
    setUserReady(true)
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return

    const syncRuntimeState = () => {
      setIsPageVisible(document.visibilityState === 'visible')
      setIsOnline(window.navigator.onLine)
    }

    syncRuntimeState()
    document.addEventListener('visibilitychange', syncRuntimeState)
    window.addEventListener('online', syncRuntimeState)
    window.addEventListener('offline', syncRuntimeState)

    return () => {
      document.removeEventListener('visibilitychange', syncRuntimeState)
      window.removeEventListener('online', syncRuntimeState)
      window.removeEventListener('offline', syncRuntimeState)
    }
  }, [])

  const canAccessInbox = canDo(user?.role, ALLOWED_ROLES)
  const selectedConversationId = searchParams.get('conversation')
  const canAutoRefresh = userReady && canAccessInbox && isPageVisible && isOnline

  const conversationsQuery = useQuery<PaginatedResult<InboxConversation>>({
    queryKey: ['inbox-conversations', 'whatsapp'],
    queryFn: () => inboxApi.listConversations({
      channel: 'whatsapp',
      page: 0,
      limit: CONVERSATION_LIMIT,
    }).then((response) => response.data),
    enabled: userReady && canAccessInbox,
    refetchInterval: canAutoRefresh ? CONVERSATIONS_REFRESH_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
  })

  const conversations = conversationsQuery.data?.items ?? []
  const selectedConversation = conversations.find((conversation) => conversation.id === selectedConversationId) ?? null

  const filteredConversations = conversations.filter((conversation) => {
    const term = deferredSearch.trim().toLowerCase()
    if (!term) return true

    return [
      formatConversationName(conversation),
      conversation.contact.email ?? '',
      conversation.contact.phone ?? '',
      conversation.externalUserId ?? '',
      conversation.connection.name,
      formatMessagePreview(conversation),
    ].some((value) => value.toLowerCase().includes(term))
  })

  const messagesQuery = useQuery<PaginatedResult<InboxMessage>>({
    queryKey: ['inbox-messages', selectedConversation?.id],
    queryFn: () => inboxApi.listMessages(selectedConversation!.id, {
      page: 0,
      limit: MESSAGE_LIMIT,
    }).then((response) => response.data),
    enabled: userReady && canAccessInbox && !!selectedConversation?.id,
    refetchInterval: canAutoRefresh && selectedConversation?.id ? MESSAGES_REFRESH_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
  })
  const messages = messagesQuery.data?.items ?? []
  const totalUnread = conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0)
  const connectedCount = conversations.filter((conversation) => conversation.connection.status === 'connected').length
  const lastSyncAt = Math.max(conversationsQuery.dataUpdatedAt || 0, messagesQuery.dataUpdatedAt || 0)
  const syncLabel = !isOnline
    ? 'Sin conexion'
    : !isPageVisible
      ? 'Refresco en pausa'
      : conversationsQuery.isFetching || messagesQuery.isFetching
        ? 'Actualizando'
        : 'Auto refresh activo'

  const scrollToBottom = useEffectEvent((behavior: ScrollBehavior = 'auto') => {
    const viewport = messagesViewportRef.current
    if (!viewport) return

    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior,
    })
  })

  const refreshInbox = useEffectEvent(async () => {
    await conversationsQuery.refetch()

    if (selectedConversation?.id) {
      await messagesQuery.refetch()
    }
  })

  const markReadMutation = useMutation({
    mutationFn: (conversationId: string) => inboxApi.markConversationRead(conversationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] })
    },
  })

  const sendMutation = useMutation({
    mutationFn: (payload: { conversationId: string; text: string }) =>
      inboxApi.sendConversationMessage(payload.conversationId, {
        text: payload.text,
        previewUrl: false,
      }).then((response) => response.data),
    onSuccess: async (_message, payload) => {
      setDraft('')
      setHasPendingNewMessages(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] }),
        queryClient.invalidateQueries({ queryKey: ['inbox-messages', payload.conversationId] }),
      ])
      scrollToBottom('smooth')
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || error.message || 'No se pudo enviar el mensaje')
    },
  })

  useEffect(() => {
    const firstConversationId = conversations[0]?.id
    if (!canAccessInbox || !firstConversationId) return
    if (selectedConversationId && conversations.some((conversation) => conversation.id === selectedConversationId)) return

    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.set('conversation', firstConversationId)

    startTransition(() => {
      router.replace(`/inbox?${nextParams.toString()}`)
    })
  }, [canAccessInbox, conversations, router, searchParams, selectedConversationId])

  useEffect(() => {
    const conversationId = selectedConversation?.id
    if (!conversationId || selectedConversation.unreadCount < 1) return
    if (markingReadConversationRef.current === conversationId) return

    markingReadConversationRef.current = conversationId
    markReadMutation.mutate(conversationId, {
      onSettled: () => {
        if (markingReadConversationRef.current === conversationId) {
          markingReadConversationRef.current = null
        }
      },
    })
  }, [markReadMutation, selectedConversation?.id, selectedConversation?.unreadCount])

  useEffect(() => {
    const viewport = messagesViewportRef.current
    if (!viewport) return

    const updateScrollState = () => {
      const remaining = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
      const nextNearBottom = remaining <= BOTTOM_LOCK_THRESHOLD_PX

      setIsNearBottom((current) => current === nextNearBottom ? current : nextNearBottom)
      if (nextNearBottom) {
        setHasPendingNewMessages(false)
      }
    }

    updateScrollState()
    viewport.addEventListener('scroll', updateScrollState, { passive: true })

    return () => {
      viewport.removeEventListener('scroll', updateScrollState)
    }
  }, [selectedConversation?.id, messages.length])

  useEffect(() => {
    const conversationId = selectedConversation?.id ?? null

    if (!conversationId) {
      previousConversationIdRef.current = null
      previousMessageCountRef.current = 0
      setHasPendingNewMessages(false)
      return
    }

    if (previousConversationIdRef.current !== conversationId) {
      previousConversationIdRef.current = conversationId
      previousMessageCountRef.current = messages.length
      setHasPendingNewMessages(false)
      scrollToBottom()
      return
    }

    if (messages.length > previousMessageCountRef.current) {
      const latestMessage = messages[messages.length - 1]

      if (latestMessage.direction === 'outbound' || isNearBottom) {
        setHasPendingNewMessages(false)
        scrollToBottom(latestMessage.direction === 'outbound' ? 'smooth' : 'auto')
      } else if (latestMessage.direction === 'inbound') {
        setHasPendingNewMessages(true)
      }
    }

    previousMessageCountRef.current = messages.length
  }, [isNearBottom, messages, scrollToBottom, selectedConversation?.id])

  function selectConversation(conversationId: string) {
    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.set('conversation', conversationId)

    startTransition(() => {
      router.replace(`/inbox?${nextParams.toString()}`)
    })
  }

  function handleSendMessage() {
    const text = draft.trim()
    if (!selectedConversation?.id || !text || sendMutation.isPending || !isOnline) return

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

  if (!canAccessInbox) {
    return (
      <div className="mx-auto flex min-h-full max-w-5xl items-center justify-center p-6">
        <div className="interactive-card w-full max-w-2xl border-l-4 border-l-amber-500 p-8">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-amber-100 p-3 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200">
              <ShieldAlert size={24} strokeWidth={2.4} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-50">Acceso restringido</h1>
              <p className="mt-2 max-w-xl text-sm font-medium text-slate-600 dark:text-slate-300">
                El inbox operativo solo esta habilitado para owner, admin y member. No abri permiso para viewer porque leer conversaciones reales sin contexto comercial es mala idea.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col gap-6 p-6">
      <section className="interactive-card overflow-hidden">
        <div className="grid gap-6 bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.18),_transparent_34%),linear-gradient(135deg,_rgba(239,246,255,0.92),_rgba(255,255,255,0.96))] p-6 dark:bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.22),_transparent_28%),linear-gradient(135deg,_rgba(30,41,59,0.94),_rgba(15,23,42,0.98))] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white/70 px-3 py-1 text-xs font-black uppercase tracking-[0.24em] text-primary-700 shadow-sm dark:border-slate-500/70 dark:bg-slate-900/30 dark:text-slate-200">
              <Sparkles size={14} strokeWidth={2.5} />
              WhatsApp Inbox
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50">Bandeja operativa de conversaciones</h1>
            <p className="mt-2 max-w-3xl text-sm font-medium text-slate-600 dark:text-slate-300">
              Este paso vuelve la bandeja menos torpe: refresca sola cuando la pestaña esta visible y online, sin venderte realtime falso ni pegarle al backend cuando no hace falta.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm dark:border-slate-500/60 dark:bg-slate-900/35">
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Conversaciones</div>
              <div className="mt-2 text-3xl font-black text-slate-900 dark:text-slate-50">{conversations.length}</div>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm dark:border-slate-500/60 dark:bg-slate-900/35">
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Pendientes</div>
              <div className="mt-2 text-3xl font-black text-amber-600 dark:text-amber-300">{totalUnread}</div>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm dark:border-slate-500/60 dark:bg-slate-900/35">
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Conectadas</div>
              <div className="mt-2 text-3xl font-black text-emerald-600 dark:text-emerald-300">{connectedCount}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid min-h-0 flex-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="interactive-card flex min-h-[620px] flex-col overflow-hidden">
          <div className="border-b border-slate-200/80 p-5 dark:border-slate-700/70">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-slate-50">Hilos abiertos</h2>
                <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">WhatsApp solamente en esta etapa</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void refreshInbox()
                }}
                className="btn-secondary h-10 w-10 rounded-xl p-0"
                aria-label="Actualizar inbox"
              >
                <RefreshCw size={16} className={clsx((conversationsQuery.isFetching || messagesQuery.isFetching || sendMutation.isPending) && 'animate-spin')} />
              </button>
            </div>

            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} strokeWidth={2.4} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nombre, telefono o ultimo mensaje"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-[3px] focus:ring-primary-500/20 dark:border-slate-600/70 dark:bg-slate-800/90 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className={clsx(
                'inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em]',
                !isOnline
                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200'
                  : !isPageVisible
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200'
              )}>
                {!isOnline ? <WifiOff size={12} /> : <Circle size={10} className="fill-current" />}
                {syncLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 dark:border-slate-600/70 dark:bg-slate-800/90 dark:text-slate-300">
                Lista {CONVERSATIONS_REFRESH_MS / 1000}s
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 dark:border-slate-600/70 dark:bg-slate-800/90 dark:text-slate-300">
                Hilo {MESSAGES_REFRESH_MS / 1000}s
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 dark:border-slate-600/70 dark:bg-slate-800/90 dark:text-slate-300">
                Ult. sync {formatSyncStamp(lastSyncAt)}
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {conversationsQuery.isLoading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="animate-spin text-primary-600" size={28} />
              </div>
            ) : conversationsQuery.isError ? (
              <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-rose-200 bg-rose-50/70 p-6 text-center dark:border-rose-400/30 dark:bg-rose-950/20">
                <AlertCircle className="mb-3 text-rose-500 dark:text-rose-300" size={28} />
                <p className="text-sm font-semibold text-rose-700 dark:text-rose-200">No pude cargar conversaciones.</p>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-center dark:border-slate-600/70 dark:bg-slate-800/50">
                <Inbox className="mb-3 text-slate-400 dark:text-slate-500" size={32} strokeWidth={1.8} />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {search ? 'No encontre conversaciones con ese filtro.' : 'Todavia no entraron conversaciones por WhatsApp.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredConversations.map((conversation) => {
                  const latest = conversation.messages[0]
                  const isActive = conversation.id === selectedConversation?.id
                  const preview = formatMessagePreview(conversation)

                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => selectConversation(conversation.id)}
                      className={clsx(
                        'w-full rounded-2xl border px-4 py-3 text-left transition-all duration-200',
                        isActive
                          ? 'border-primary-300 bg-primary-50 shadow-sm shadow-primary-500/10 dark:border-slate-500 dark:bg-slate-800/90'
                          : 'border-slate-200 bg-white hover:border-primary-200 hover:bg-primary-50/60 dark:border-slate-700/70 dark:bg-slate-900/40 dark:hover:border-slate-500 dark:hover:bg-slate-800/90'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-sm font-black text-white shadow-sm shadow-emerald-500/25">
                          {formatConversationName(conversation).slice(0, 2).toUpperCase()}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-slate-900 dark:text-slate-50">
                                {formatConversationName(conversation)}
                              </p>
                              <p className="mt-0.5 truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                                {conversation.connection.externalAccountLabel || conversation.connection.name}
                              </p>
                            </div>
                            <span className="shrink-0 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                              {formatStamp(conversation.lastMessageAt || latest?.sentAt || latest?.createdAt)}
                            </span>
                          </div>

                          <p className="mt-2 line-clamp-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                            {preview}
                          </p>

                          <div className="mt-3 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                              {conversation.connection.status === 'connected' ? (
                                <CheckCheck size={14} className="text-emerald-500 dark:text-emerald-300" />
                              ) : (
                                <WifiOff size={14} className="text-rose-500 dark:text-rose-300" />
                              )}
                              {conversation.connection.status}
                            </div>

                            {conversation.unreadCount > 0 && (
                              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                                {conversation.unreadCount} sin leer
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="interactive-card flex min-h-[620px] flex-col overflow-hidden">
          {!selectedConversation ? (
            <div className="flex h-full flex-col items-center justify-center px-8 text-center">
              <MessageSquareText className="mb-4 text-slate-400 dark:text-slate-500" size={42} strokeWidth={1.8} />
              <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-50">Selecciona una conversacion</h2>
              <p className="mt-2 max-w-lg text-sm font-medium text-slate-600 dark:text-slate-300">
                La columna izquierda ya lista los hilos reales que entraron por webhook. Cuando elijas uno, vas a ver historial y podras responder texto desde el CRM.
              </p>
            </div>
          ) : (
            <>
              <div className="border-b border-slate-200/80 px-6 py-5 dark:border-slate-700/70">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-sm font-black text-white shadow-sm shadow-primary-700/30">
                        {formatConversationName(selectedConversation).slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h2 className="truncate text-xl font-black tracking-tight text-slate-900 dark:text-slate-50">
                          {formatConversationName(selectedConversation)}
                        </h2>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          <span className="inline-flex items-center gap-1.5">
                            <Phone size={13} />
                            {selectedConversation.contact.phone || selectedConversation.externalUserId || 'Sin telefono interno'}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Circle size={10} className={clsx(selectedConversation.connection.status === 'connected' ? 'fill-emerald-500 text-emerald-500' : 'fill-rose-500 text-rose-500')} />
                            {selectedConversation.connection.externalAccountLabel || selectedConversation.connection.name}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-200">
                      WhatsApp
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                      {selectedConversation.status}
                    </span>
                    <span className={clsx(
                      'rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em]',
                      !isOnline
                        ? 'border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/15 dark:text-rose-200'
                        : !isPageVisible
                          ? 'border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-200'
                          : 'border-sky-200 bg-sky-100 text-sky-800 dark:border-sky-400/30 dark:bg-sky-500/15 dark:text-sky-200'
                    )}>
                      {syncLabel}
                    </span>
                  </div>
                </div>
              </div>

              <div className="relative min-h-0 flex-1">
                <div ref={messagesViewportRef} className="h-full space-y-4 overflow-y-auto bg-[linear-gradient(180deg,_rgba(255,255,255,0.36),_transparent_22%),radial-gradient(circle_at_top,_rgba(59,130,246,0.08),_transparent_32%)] px-5 py-5 dark:bg-[linear-gradient(180deg,_rgba(30,41,59,0.3),_transparent_22%),radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_32%)]">
                  {messagesQuery.isLoading ? (
                    <div className="flex h-full items-center justify-center py-16">
                      <Loader2 className="animate-spin text-primary-600" size={28} />
                    </div>
                  ) : messagesQuery.isError ? (
                    <div className="rounded-2xl border border-dashed border-rose-200 bg-rose-50/70 p-6 text-center dark:border-rose-400/30 dark:bg-rose-950/20">
                      <AlertCircle className="mx-auto mb-3 text-rose-500 dark:text-rose-300" size={28} />
                      <p className="text-sm font-semibold text-rose-700 dark:text-rose-200">No pude cargar el historial de mensajes.</p>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/70 p-8 text-center dark:border-slate-600/70 dark:bg-slate-900/30">
                      <Inbox className="mb-4 text-slate-400 dark:text-slate-500" size={36} strokeWidth={1.8} />
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">La conversacion existe, pero todavia no tiene mensajes guardados.</p>
                    </div>
                  ) : (
                    messages.map((message) => {
                      const state = resolveMessageState(message)
                      const isOutbound = message.direction === 'outbound'

                      return (
                        <div key={message.id} className={clsx('flex', isOutbound ? 'justify-end' : 'justify-start')}>
                          <div
                            className={clsx(
                              'max-w-[82%] rounded-3xl border px-4 py-3 shadow-sm',
                              isOutbound
                                ? 'border-primary-200 bg-primary-600 text-white shadow-primary-500/20 dark:border-primary-400/30 dark:bg-primary-500'
                                : 'border-white/80 bg-white/90 text-slate-900 dark:border-slate-600/70 dark:bg-slate-800/95 dark:text-slate-50'
                            )}
                          >
                            {message.text?.trim() ? (
                              <p className="whitespace-pre-wrap text-sm font-medium leading-6">{message.text}</p>
                            ) : (
                              <p className="text-sm font-medium italic opacity-80">Mensaje sin texto visible</p>
                            )}

                            {message.attachments.length > 0 && (
                              <MessageAttachments
                                attachments={message.attachments}
                                isOutbound={isOutbound}
                              />
                            )}

                            <div className={clsx(
                              'mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold',
                              isOutbound ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'
                            )}>
                              <span className="inline-flex items-center gap-1.5">
                                <Clock3 size={12} />
                                {formatStamp(message.sentAt || message.createdAt)}
                              </span>
                              {isOutbound && (
                                <span className={clsx('inline-flex items-center gap-1.5', state.tone, isOutbound && 'text-white/90 dark:text-white/90')}>
                                  <CheckCheck size={12} />
                                  {state.label}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                {hasPendingNewMessages && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
                    <button
                      type="button"
                      onClick={() => {
                        setHasPendingNewMessages(false)
                        scrollToBottom('smooth')
                      }}
                      className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white px-4 py-2 text-sm font-black text-primary-700 shadow-lg shadow-primary-500/10 dark:border-slate-500 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <ChevronDown size={16} />
                      Hay mensajes nuevos. Ir al final
                    </button>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200/80 bg-white/80 px-5 py-4 dark:border-slate-700/70 dark:bg-slate-900/50">
                {!isOnline && (
                  <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 dark:border-rose-400/30 dark:bg-rose-500/15 dark:text-rose-200">
                    Estas offline. El inbox deja de refrescar y no envio mensajes hasta que vuelva la conexion.
                  </div>
                )}

                {isOnline && !isPageVisible && (
                  <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-200">
                    El auto refresh se pausa cuando cambias de pestaña. Lo hago a proposito para no gastar requests sin sentido.
                  </div>
                )}

                {selectedConversation.connection.status !== 'connected' && (
                  <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-200">
                    La conexion esta en estado {selectedConversation.connection.status}. El backend intentara enviar igual, pero si la credencial esta rota va a fallar. Prefiero avisartelo antes que dibujarte una UI optimista falsa.
                  </div>
                )}
                <div className="flex items-end gap-3">
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        handleSendMessage()
                      }
                    }}
                    placeholder={isOnline ? 'Escribe una respuesta y presiona Enter' : 'Sin conexion. Puedes seguir escribiendo, pero no enviar'}
                    rows={3}
                    className="min-h-[84px] flex-1 resize-none rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-[3px] focus:ring-primary-500/20 dark:border-slate-600/70 dark:bg-slate-800/90 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                  <button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={!draft.trim() || sendMutation.isPending || !isOnline}
                    className="btn-primary h-14 min-w-14 rounded-2xl px-4 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sendMutation.isPending ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <SendHorizontal size={18} strokeWidth={2.4} />
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

export default function InboxPage() {
  return (
    <Suspense
      fallback={(
        <div className="flex min-h-full items-center justify-center p-6">
          <Loader2 className="animate-spin text-primary-600" size={30} />
        </div>
      )}
    >
      <InboxPageContent />
    </Suspense>
  )
}
