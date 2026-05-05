'use client'

import Link from 'next/link'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, resolveApiAssetUrl, whatsappApi } from '@/lib/api'
import { auth } from '@/lib/auth'
import type {
  WhatsAppChat,
  WhatsAppMessage,
  WhatsAppMessagesPayload,
  WhatsAppSessionSnapshot,
} from '@/types'
import { useToast } from '@/components/ui/toast'
import {
  AlertTriangle, ArrowUpRight, ChevronDown, ChevronUp,
  Loader2, MessageSquareText, RefreshCcw,
  Search, Send, Settings2, Smartphone, Trash2, Unplug, Wifi, WifiOff,
} from 'lucide-react'
import clsx from 'clsx'

type ChatFilter = 'all' | 'linked' | 'unread'

const STATUS_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  CONNECTED: { label: 'Conectado', bg: 'var(--semantic-success-bg)', color: 'var(--semantic-success)' },
  CONNECTING: { label: 'Conectando', bg: 'var(--gold-muted)', color: 'var(--gold)' },
  PAIRING: { label: 'Esperando vinculacion', bg: 'var(--accent-muted)', color: 'var(--accent)' },
  ERROR: { label: 'Con error', bg: 'var(--semantic-danger-bg)', color: 'var(--semantic-danger)' },
  DISCONNECTED: { label: 'Desconectado', bg: 'var(--surface-2)', color: 'var(--ink-secondary)' },
}

function toErrorMessage(error: any) {
  return error?.response?.data?.message ?? error?.response?.data?.error ?? error?.message ?? 'Ocurrio un error inesperado.'
}

function formatChatTimestamp(value?: string | null) {
  if (!value) return 'Sin actividad'
  const date = new Date(value)
  const now = new Date()
  return date.toDateString() === now.toDateString()
    ? new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(date)
    : new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit' }).format(date)
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Sin dato'
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function formatMessageDay(value: string) {
  return new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date(value))
}

function chatTitle(chat?: WhatsAppChat | null) {
  if (!chat) return 'Sin chat'
  if (chat.displayName && chat.displayName !== chat.jid) return chat.displayName
  if (chat.contactName) return chat.contactName
  return chat.phoneNumber ?? chat.jid
}

function chatInitial(chat?: WhatsAppChat | null) {
  return chatTitle(chat).slice(0, 1).toUpperCase()
}

function chatPrimaryName(chat?: WhatsAppChat | null) {
  if (!chat) return 'Sin chat'
  if (chat.contactName) return chat.contactName
  if (chat.displayName && chat.displayName !== chat.jid) return chat.displayName
  return chat.phoneNumber ?? chat.jid
}

function chatPhoneLine(chat?: WhatsAppChat | null) {
  if (!chat) return null
  if (chat.phoneNumber) return chat.phoneNumber
  const match = chat.jid.match(/^(\d+)(?=@s\.whatsapp\.net$)/)
  return match?.[1] ?? null
}

function messageSenderName(message: WhatsAppMessage, chat?: WhatsAppChat | null) {
  if (message.fromMe) return 'Tu'
  return message.pushName ?? chat?.displayName ?? chat?.contactName ?? chat?.phoneNumber ?? 'Contacto'
}

function formatMediaDuration(value?: number | null) {
  if (!value || value <= 0) return null
  const minutes = Math.floor(value / 60)
  const seconds = value % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function quotedPreview(message: WhatsAppMessage) {
  if (message.quotedText?.trim()) return message.quotedText.trim()

  switch (message.quotedMessageType) {
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
    default:
      return 'Mensaje citado'
  }
}

function formatOutgoingStatus(status?: string | null) {
  switch ((status ?? '').toLowerCase()) {
    case 'sending':
      return 'Enviando'
    case 'delivered':
      return 'Entregado'
    case 'read':
      return 'Leido'
    case 'error':
      return 'Error'
    case 'sent':
    default:
      return 'Enviado'
  }
}

function QuotedMessagePreview({ message, outgoing }: { message: WhatsAppMessage; outgoing: boolean }) {
  if (!message.quotedMessageId && !message.quotedText && !message.quotedMessageType) {
    return null
  }

  return (
    <div
      className="rounded-2xl border-l-[3px] px-3 py-2"
      style={{
        background: outgoing ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.05)',
        borderLeftColor: outgoing ? 'rgba(255,255,255,0.5)' : 'var(--accent)',
      }}
    >
      <p
        className="text-[10px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: outgoing ? 'rgba(255,255,255,0.75)' : 'var(--accent-text)' }}
      >
        Respuesta
      </p>
      <p
        className="mt-1 line-clamp-3 text-xs leading-5"
        style={{ color: outgoing ? 'rgba(255,255,255,0.88)' : 'var(--ink-secondary)' }}
      >
        {quotedPreview(message)}
      </p>
    </div>
  )
}

function sameMessage(a: WhatsAppMessage, b: WhatsAppMessage) {
  if (a.id === b.id) return true
  if (a.messageId === b.messageId && a.remoteJid === b.remoteJid) return true
  if (a.fromMe !== b.fromMe || a.messageType !== b.messageType || (a.text ?? '') !== (b.text ?? '')) return false
  return Math.abs(new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()) < 120000
}

function mergeLiveMessages(serverItems: WhatsAppMessage[], localItems: WhatsAppMessage[]) {
  const merged = [...serverItems]
  for (const local of localItems) {
    if (!serverItems.some((server) => sameMessage(server, local))) {
      merged.push(local)
    }
  }
  return merged.toSorted((left, right) => new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime())
}

function groupMessages(items: WhatsAppMessage[]) {
  const groups: Array<{ key: string; label: string; items: WhatsAppMessage[] }> = []
  for (const item of items) {
    const key = item.sentAt.slice(0, 10)
    const last = groups[groups.length - 1]
    if (!last || last.key !== key) {
      groups.push({ key, label: formatMessageDay(item.sentAt), items: [item] })
    } else {
      last.items.push(item)
    }
  }
  return groups
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--semantic-danger-bg)', border: '1px solid rgba(220,38,38,0.16)' }}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: 'rgba(220,38,38,0.1)', color: 'var(--semantic-danger)' }}>
          <AlertTriangle size={16} />
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--ink-primary)' }}>{title}</p>
          <p className="mt-1 text-xs leading-5" style={{ color: 'var(--ink-secondary)' }}>{body}</p>
        </div>
      </div>
    </div>
  )
}

function useProtectedMediaUrl(path?: string | null) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const assetUrl = resolveApiAssetUrl(path)
    if (!assetUrl) {
      setUrl(null)
      return
    }

    let active = true
    let objectUrl: string | null = null

    void api.get(assetUrl, { responseType: 'blob' }).then((response) => {
      if (!active) return
      objectUrl = URL.createObjectURL(response.data)
      setUrl(objectUrl)
    }).catch(() => {
      if (active) {
        setUrl(null)
      }
    })

    return () => {
      active = false
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [path])

  return url
}

function MessageBody({ message }: { message: WhatsAppMessage }) {
  const mediaUrl = useProtectedMediaUrl(message.mediaUrl)
  const quoted = <QuotedMessagePreview message={message} outgoing={message.fromMe} />
  const expectsMedia = ['image', 'audio', 'video', 'document'].includes(message.messageType)

  if (message.messageType === 'image' && mediaUrl) {
    return (
      <div className="space-y-3">
        {quoted}
        <a href={mediaUrl} target="_blank" rel="noreferrer">
          <img
            src={mediaUrl}
            alt={message.mediaFileName ?? 'Imagen de WhatsApp'}
            className="max-h-[360px] w-full rounded-2xl object-cover"
            style={{ background: 'rgba(15,23,42,0.08)' }}
          />
        </a>
        {message.text && message.text !== '[Imagen]' && (
          <p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p>
        )}
      </div>
    )
  }

  if (message.messageType === 'audio' && mediaUrl) {
    return (
      <div className="space-y-3">
        {quoted}
        <audio controls preload="metadata" className="w-full">
          <source src={mediaUrl} type={message.mediaMimeType ?? 'audio/ogg'} />
        </audio>
        <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'inherit', opacity: 0.8 }}>
          <span>{message.mediaFileName ?? 'Audio'}</span>
          {message.mediaDurationSeconds ? <span>{formatMediaDuration(message.mediaDurationSeconds)}</span> : null}
        </div>
      </div>
    )
  }

  if (message.messageType === 'video' && mediaUrl) {
    return (
      <div className="space-y-3">
        {quoted}
        <video controls preload="metadata" className="max-h-[360px] w-full rounded-2xl" style={{ background: '#000' }}>
          <source src={mediaUrl} type={message.mediaMimeType ?? 'video/mp4'} />
        </video>
        {message.text && message.text !== '[Video]' && (
          <p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p>
        )}
      </div>
    )
  }

  if (message.messageType === 'document' && mediaUrl) {
    return (
      <div className="space-y-3">
        {quoted}
        <a href={mediaUrl} target="_blank" rel="noreferrer" download={message.mediaFileName ?? undefined} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold" style={{ background: 'rgba(15,23,42,0.08)' }}>
          <ArrowUpRight size={14} />
          {message.mediaFileName ?? message.text ?? 'Documento'}
        </a>
        {message.text && message.mediaFileName !== message.text && (
          <p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p>
        )}
      </div>
    )
  }

  if (expectsMedia && message.mediaUrl) {
    return (
      <div className="space-y-3">
        {quoted}
        <p className="text-sm leading-6" style={{ opacity: 0.78 }}>
          Cargando adjunto...
        </p>
        {message.text && !['[Imagen]', '[Video]', '[Audio]'].includes(message.text) ? (
          <p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {quoted}
      <p className="whitespace-pre-wrap text-sm leading-6">{message.text ?? `[${message.messageType}]`}</p>
    </div>
  )
}

export default function ChatsPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const storedAuth = auth.get()
  const canManage = storedAuth?.role !== 'viewer'
  const canDeleteChat = storedAuth?.role === 'owner' || storedAuth?.role === 'admin'
  const [requestedJid, setRequestedJid] = useState<string | null>(null)
  const [chatSearch, setChatSearch] = useState('')
  const [chatFilter, setChatFilter] = useState<ChatFilter>('all')
  const [selectedJid, setSelectedJid] = useState<string | null>(null)
  const [messageText, setMessageText] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [localEchoesByJid, setLocalEchoesByJid] = useState<Record<string, WhatsAppMessage[]>>({})
  const deferredSearch = useDeferredValue(chatSearch)
  const messagesViewportRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setRequestedJid(new URLSearchParams(window.location.search).get('jid'))
  }, [])

  const sessionQuery = useQuery<WhatsAppSessionSnapshot>({
    queryKey: ['whatsapp-session'],
    queryFn: () => whatsappApi.getSession().then((r) => r.data),
    retry: false,
    refetchInterval: (query) => {
      if (query.state.error || !query.state.data) return false
      const data = query.state.data
      return data.hasActiveSocket || data.status === 'CONNECTING' || data.status === 'PAIRING' ? 4000 : false
    },
  })

  const session = sessionQuery.data

  const chatsQuery = useQuery<WhatsAppChat[]>({
    queryKey: ['whatsapp-chats', deferredSearch],
    queryFn: () => whatsappApi.listChats({ search: deferredSearch || undefined }).then((r) => r.data),
    enabled: Boolean(session),
    refetchInterval: session?.hasActiveSocket ? 1500 : false,
    refetchIntervalInBackground: true,
  })

  const chats = useMemo(() => (chatsQuery.data ?? []).filter((chat) => !chat.isGroup), [chatsQuery.data])
  const filteredChats = useMemo(() => chats.filter((chat) => {
    if (chatFilter === 'linked') return Boolean(chat.contactId)
    if (chatFilter === 'unread') return chat.unreadCount > 0
    return true
  }), [chatFilter, chats])

  useEffect(() => {
    if (filteredChats.length === 0) return void setSelectedJid(null)
    if (requestedJid && filteredChats.some((chat) => chat.jid === requestedJid)) {
      setSelectedJid(requestedJid)
      return
    }
    if (!selectedJid || !filteredChats.some((chat) => chat.jid === selectedJid)) {
      setSelectedJid(filteredChats[0].jid)
    }
  }, [filteredChats, requestedJid, selectedJid])

  useEffect(() => {
    if (session?.qrCode || session?.lastError) {
      setSettingsOpen(true)
    }
  }, [session?.lastError, session?.qrCode])

  const messagesQuery = useQuery<WhatsAppMessagesPayload>({
    queryKey: ['whatsapp-messages', selectedJid],
    queryFn: () => whatsappApi.listMessages(selectedJid!, { limit: 80 }).then((r) => r.data),
    enabled: Boolean(selectedJid),
    refetchInterval: session?.hasActiveSocket && selectedJid ? 1200 : false,
    refetchIntervalInBackground: true,
  })

  useEffect(() => {
    if (!selectedJid || !messagesQuery.data?.items?.length) return

    setLocalEchoesByJid((current) => {
      const existing = current[selectedJid]
      if (!existing?.length) return current
      const remaining = existing.filter((local) => !messagesQuery.data.items.some((server) => sameMessage(server, local)))
      if (remaining.length === existing.length) return current
      if (remaining.length === 0) {
        const next = { ...current }
        delete next[selectedJid]
        return next
      }
      return { ...current, [selectedJid]: remaining }
    })
  }, [messagesQuery.data?.items, selectedJid])

  const connectMutation = useMutation({
    mutationFn: () => whatsappApi.connect().then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-session'] })
      queryClient.invalidateQueries({ queryKey: ['whatsapp-chats'] })
    },
    onError: (error) => toast({ type: 'error', title: 'No se pudo conectar WhatsApp', description: toErrorMessage(error) }),
  })

  const disconnectMutation = useMutation({
    mutationFn: () => whatsappApi.disconnect(),
    onSuccess: () => {
      setMessageText('')
      queryClient.invalidateQueries({ queryKey: ['whatsapp-session'] })
      queryClient.invalidateQueries({ queryKey: ['whatsapp-chats'] })
      toast({ type: 'success', title: 'Sesion desconectada' })
    },
    onError: (error) => toast({ type: 'error', title: 'No se pudo desconectar', description: toErrorMessage(error) }),
  })

  const deleteChatMutation = useMutation({
    mutationFn: (jid: string) => whatsappApi.deleteChat(jid),
    onSuccess: (_data, jid) => {
      setMessageText('')
      setRequestedJid(null)
      setSelectedJid((current) => current === jid ? null : current)
      setLocalEchoesByJid((current) => {
        if (!current[jid]) return current
        const next = { ...current }
        delete next[jid]
        return next
      })
      queryClient.removeQueries({ queryKey: ['whatsapp-messages', jid] })
      queryClient.invalidateQueries({ queryKey: ['whatsapp-chats'] })
      queryClient.invalidateQueries({ queryKey: ['kanban'] })
      toast({ type: 'success', title: 'Chat eliminado del CRM' })
    },
    onError: (error) => {
      toast({ type: 'error', title: 'No se pudo eliminar el chat', description: toErrorMessage(error) })
    },
  })

  const sendMutation = useMutation({
    mutationFn: () => whatsappApi.sendMessage(selectedJid!, messageText.trim()).then((r) => r.data),
    onMutate: async () => {
      if (!selectedJid || !messageText.trim()) return null
      const optimisticMessage: WhatsAppMessage = {
        id: `optimistic-${Date.now()}`,
        workspaceId: '',
        sessionId: '',
        chatId: '',
        remoteJid: selectedJid,
        messageId: `optimistic-${Date.now()}`,
        fromMe: true,
        participant: null,
        pushName: null,
        messageType: 'text',
        text: messageText.trim(),
        status: 'sending',
        sentAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        mediaUrl: null,
        mediaMimeType: null,
        mediaFileName: null,
        mediaSizeBytes: null,
        mediaDurationSeconds: null,
        quotedMessageId: null,
        quotedText: null,
        quotedMessageType: null,
      }

      setLocalEchoesByJid((current) => ({
        ...current,
        [selectedJid]: [...(current[selectedJid] ?? []), optimisticMessage],
      }))

      return { optimisticId: optimisticMessage.id, optimisticMessage }
    },
    onSuccess: (created: WhatsAppMessage | null, _vars, context) => {
      setMessageText('')
      if (selectedJid && created) {
        setLocalEchoesByJid((current) => {
          const items = current[selectedJid] ?? []
          return {
            ...current,
            [selectedJid]: items.map((item) => item.id === context?.optimisticId ? created : item),
          }
        })

        queryClient.setQueryData<WhatsAppChat[] | undefined>(['whatsapp-chats', deferredSearch], (current) => {
          if (!current) return current
          return current.map((chat) =>
            chat.jid === selectedJid
              ? {
                  ...chat,
                  lastMessageAt: created.sentAt,
                  lastMessagePreview: created.text ?? `[${created.messageType}]`,
                  lastMessageFromMe: true,
                }
              : chat
          )
        })
      }

      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages', selectedJid] })
      queryClient.invalidateQueries({ queryKey: ['whatsapp-chats'] })
    },
    onError: (error, _vars, context) => {
      if (selectedJid && context?.optimisticId) {
        setLocalEchoesByJid((current) => {
          const items = current[selectedJid] ?? []
          const remaining = items.filter((item) => item.id !== context.optimisticId)
          if (remaining.length === 0) {
            const next = { ...current }
            delete next[selectedJid]
            return next
          }
          return { ...current, [selectedJid]: remaining }
        })
      }
      toast({ type: 'error', title: 'No se pudo enviar el mensaje', description: toErrorMessage(error) })
    },
  })

  const selectedChat = useMemo(() => chats.find((chat) => chat.jid === selectedJid) ?? null, [chats, selectedJid])
  const localEchoes = useMemo(() => selectedJid ? (localEchoesByJid[selectedJid] ?? []) : [], [localEchoesByJid, selectedJid])
  const liveItems = useMemo(() => mergeLiveMessages(messagesQuery.data?.items ?? [], localEchoes), [localEchoes, messagesQuery.data?.items])
  const grouped = useMemo(() => groupMessages(liveItems), [liveItems])
  const statusStyle = STATUS_STYLES[session?.status ?? 'DISCONNECTED']
  const qrImageUrl = session?.qrCode ? `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(session.qrCode)}` : null
  const showQrTools = session?.status !== 'CONNECTED' || Boolean(session?.qrCode)
  const sessionStatus = session?.status ?? 'DISCONNECTED'
  const sessionRuntimeReady = Boolean(session?.runtimeCompatible && session?.packageInstalled)
  const sessionIsBusy = connectMutation.isPending || disconnectMutation.isPending
  const canGenerateQr = Boolean(canManage && sessionRuntimeReady && !connectMutation.isPending)
  const canResumeSession = Boolean(
    canManage &&
    sessionRuntimeReady &&
    session?.authAvailable &&
    !session?.hasActiveSocket &&
    sessionStatus !== 'CONNECTED' &&
    !sessionIsBusy
  )
  const canDisconnectSession = Boolean(
    canManage &&
    session &&
    !sessionIsBusy &&
    (session.hasActiveSocket || ['CONNECTED', 'CONNECTING', 'PAIRING', 'ERROR'].includes(sessionStatus))
  )

  const handleQrSubmit = () => canGenerateQr && connectMutation.mutate()
  const handleResume = () => canResumeSession && connectMutation.mutate()
  const handleDisconnect = () => canDisconnectSession && disconnectMutation.mutate()
  const handleSendMessage = () => selectedJid && messageText.trim() && sendMutation.mutate()
  const handleDeleteChat = () => {
    if (!selectedChat || !canDeleteChat) return
    if (!window.confirm(`Vas a eliminar el chat local de "${chatPrimaryName(selectedChat)}". Los mensajes persistidos en este CRM se borran.`)) return
    deleteChatMutation.mutate(selectedChat.jid)
  }
  const handleReLogin = () => { auth.clear(); window.location.href = '/login' }

  useEffect(() => {
    if (!selectedJid) return

    const frame = window.requestAnimationFrame(() => {
      const viewport = messagesViewportRef.current
      if (!viewport) return
      viewport.scrollTop = viewport.scrollHeight
    })

    return () => window.cancelAnimationFrame(frame)
  }, [selectedJid, liveItems.length])

  return (
    <div className="animate-fade-in mx-auto max-w-[1680px] px-4 pb-20 pt-6 md:px-8 md:pb-8 md:pt-8">
      <div className="mb-4 flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div>
          <h1 className="page-title">Chats</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl px-2 py-2" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-0)' }}>
          <span className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: statusStyle.bg, color: statusStyle.color }}>
            {session?.status === 'CONNECTED' ? <Wifi size={13} /> : <WifiOff size={13} />}
            {statusStyle.label}
          </span>
          <button onClick={() => setSettingsOpen((current) => !current)} className="btn-secondary !h-9 !px-3 !py-0">
            <Settings2 size={14} />
            Sesion
            {settingsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {settingsOpen && (
        <div className="mb-4 interactive-card overflow-hidden p-4">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
            <div className="space-y-3">
              {!session?.runtimeCompatible && <Notice title="Runtime incompatible" body="Este backend esta corriendo en un contexto serverless. Baileys necesita un proceso Node persistente para que la conexion no se rompa." />}
              {session?.runtimeCompatible && !session?.packageInstalled && <Notice title="Dependencia faltante" body="El codigo ya esta preparado, pero Baileys no esta instalado en backend. Sin eso no se puede abrir la sesion real." />}
              {sessionQuery.isError && (
                <div className="space-y-3">
                  <Notice title="Sesion invalida" body={toErrorMessage(sessionQuery.error)} />
                  <button onClick={handleReLogin} className="btn-secondary"><RefreshCcw size={14} />Volver a ingresar</button>
                </div>
              )}
              {session?.lastError && <div className="rounded-xl px-3 py-3 text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-0)', color: 'var(--ink-secondary)' }}>{session.lastError}</div>}

              {(session?.qrCode || (session?.status === 'PAIRING' && !session?.lastError)) && (
                <div className="rounded-2xl px-4 py-5" style={{ background: 'linear-gradient(180deg, rgba(5,150,105,0.08), rgba(255,255,255,0.72))', border: '1px solid rgba(5,150,105,0.16)' }}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--accent-text)' }}>Codigo QR</p>
                  {qrImageUrl ? (
                    <>
                      <div className="mt-3 flex justify-center rounded-2xl bg-white p-4 shadow-sm">
                        <img src={qrImageUrl} alt="QR de vinculacion de WhatsApp" width={220} height={220} className="h-[220px] w-[220px]" />
                      </div>
                      <p className="mt-3 text-xs leading-5" style={{ color: 'var(--ink-secondary)' }}>Escanealo desde WhatsApp en Dispositivos vinculados. Si expira, genera uno nuevo.</p>
                    </>
                  ) : (
                    <div className="mt-3 flex items-center gap-3 rounded-xl bg-white/70 px-4 py-4">
                      <Loader2 size={18} className="animate-spin" style={{ color: 'var(--accent)' }} />
                      <p className="text-sm" style={{ color: 'var(--ink-secondary)' }}>Esperando que Baileys emita el QR...</p>
                    </div>
                  )}
                </div>
              )}

            </div>

            <div className="space-y-3 xl:w-[360px]">
              {showQrTools && (
                <div className="rounded-2xl p-3" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-0)' }}>
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-2">
                      <button onClick={handleQrSubmit} disabled={!canGenerateQr} className="btn-primary min-h-11">
                        {connectMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Smartphone size={14} />}Generar QR
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-2">
                <button
                  onClick={handleResume}
                  disabled={!canResumeSession}
                  className="btn-secondary min-h-11 !px-3 !py-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {connectMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
                  Reanudar
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={!canDisconnectSession}
                  className="btn-secondary min-h-11 !px-3 !py-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {disconnectMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Unplug size={15} />}
                  Desconectar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start xl:grid-cols-[390px_minmax(0,1fr)]">

        <section className="interactive-card flex min-h-[620px] flex-col overflow-hidden ring-1 ring-emerald-500/10 lg:h-[calc(100vh-10.5rem)] lg:min-h-0">
          <div className="shrink-0 border-b px-5 py-4" style={{ borderColor: 'var(--border-0)', background: 'var(--surface-0)' }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="section-label">Inbox</p>
                <h2 className="mt-1 text-lg font-bold" style={{ color: 'var(--ink-primary)' }}>Conversaciones</h2>
              </div>
              <p className="rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--ink-secondary)' }}>{filteredChats.length}</p>
            </div>

            <div className="relative mt-4">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-tertiary)' }} />
              <input value={chatSearch} onChange={(e) => setChatSearch(e.target.value)} placeholder="Buscar chat, telefono o contacto" className="ctrl-input !pl-10" />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-1 rounded-2xl p-1" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-0)' }}>
              {(['all', 'linked', 'unread'] as ChatFilter[]).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setChatFilter(filter)}
                  className="rounded-xl px-2 py-2 text-xs font-semibold transition-colors"
                  style={{
                    background: chatFilter === filter ? 'var(--surface-0)' : 'transparent',
                    color: chatFilter === filter ? 'var(--accent-text)' : 'var(--ink-secondary)',
                    border: chatFilter === filter ? '1px solid rgba(5,150,105,0.16)' : '1px solid transparent',
                    boxShadow: chatFilter === filter ? '0 8px 18px rgba(15,23,42,0.06)' : 'none',
                  }}
                >
                  {filter === 'all' ? 'Todo' : filter === 'linked' ? 'CRM' : 'Sin leer'}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {chatsQuery.isLoading ? (
              <div className="flex items-center justify-center py-20"><Loader2 size={18} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
            ) : filteredChats.length ? (
              <div className="divide-y" style={{ borderColor: 'var(--border-0)' }}>
                {filteredChats.map((chat) => {
                  const active = chat.jid === selectedJid
                  return (
                    <button
                      key={chat.id}
                      onClick={() => setSelectedJid(chat.jid)}
                      className="group w-full px-4 py-4 text-left transition-colors hover:bg-[rgba(5,150,105,0.04)]"
                      style={{
                        background: active ? 'rgba(5,150,105,0.08)' : 'transparent',
                        borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-sm font-bold" style={{ background: active ? 'rgba(5,150,105,0.16)' : 'var(--surface-2)', color: active ? 'var(--accent)' : 'var(--ink-secondary)', border: '1px solid var(--border-0)' }}>
                          {chat.profileImageUrl ? (
                            <img
                              src={chat.profileImageUrl}
                              alt={chatPrimaryName(chat)}
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            chatInitial(chat)
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold" style={{ color: 'var(--ink-primary)' }}>{chatPrimaryName(chat)}</p>
                              {chatPhoneLine(chat) ? (
                                <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--ink-tertiary)' }}>{chatPhoneLine(chat)}</p>
                              ) : null}
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-[11px]" style={{ color: 'var(--ink-tertiary)' }}>{formatChatTimestamp(chat.lastMessageAt)}</p>
                              {chat.unreadCount > 0 && <span className="mt-2 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: 'var(--accent)', color: '#fff' }}>{chat.unreadCount}</span>}
                            </div>
                          </div>
                          <p className="mt-2 line-clamp-2 text-xs leading-5" style={{ color: active ? 'var(--ink-primary)' : 'var(--ink-secondary)' }}>
                            {chat.lastMessageFromMe ? 'Tu: ' : ''}{chat.lastMessagePreview ?? 'Sin mensaje legible todavia.'}
                          </p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="px-6 py-20 text-center">
                <MessageSquareText size={30} className="mx-auto mb-3" style={{ color: 'var(--ink-muted)' }} />
                <p className="text-sm font-semibold" style={{ color: 'var(--ink-primary)' }}>Todavia no llegaron conversaciones reales</p>
                <p className="mt-1 text-xs leading-5" style={{ color: 'var(--ink-tertiary)' }}>Este inbox empieza vacio y solo muestra chats cuando alguien manda un mensaje persistible al WhatsApp conectado.</p>
              </div>
            )}
          </div>
        </section>

        <section className="interactive-card flex min-h-[620px] flex-col overflow-hidden ring-1 ring-emerald-500/10 lg:sticky lg:top-6 lg:h-[calc(100vh-10.5rem)] lg:min-h-0">
          {selectedChat ? (
            <>
              <div className="shrink-0 border-b px-5 py-4" style={{ borderColor: 'var(--border-0)' }}>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="flex min-w-0 items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-lg font-bold" style={{ background: 'rgba(5,150,105,0.12)', color: 'var(--accent)' }}>
                      {selectedChat.profileImageUrl ? (
                        <img
                          src={selectedChat.profileImageUrl}
                          alt={chatPrimaryName(selectedChat)}
                          className="h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        chatInitial(selectedChat)
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xl font-bold" style={{ color: 'var(--ink-primary)' }}>{chatPrimaryName(selectedChat)}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm" style={{ color: 'var(--ink-secondary)' }}>
                        {chatPhoneLine(selectedChat) ? (
                          <span className="truncate">{chatPhoneLine(selectedChat)}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                    <span className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: statusStyle.bg, color: statusStyle.color }}>
                      {session?.status === 'CONNECTED' ? <Wifi size={12} /> : <WifiOff size={12} />}{statusStyle.label}
                    </span>
                    {selectedChat.contactId && <Link href={`/contacts/${selectedChat.contactId}`} className="btn-secondary !h-9 !px-3 !py-0 text-xs"><ArrowUpRight size={13} />Abrir contacto</Link>}
                    {canDeleteChat ? (
                      <button
                        onClick={handleDeleteChat}
                        disabled={deleteChatMutation.isPending}
                        className="inline-flex h-9 items-center gap-2 rounded-xl border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deleteChatMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        Eliminar chat
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div
                ref={messagesViewportRef}
                className="min-h-0 flex-1 overflow-y-auto px-5 py-5"
                style={{
                  background: 'var(--chat-pattern), var(--chat-surface)',
                }}
              >
                {messagesQuery.isLoading ? (
                  <div className="flex items-center justify-center py-24">
                    <Loader2 size={18} className="animate-spin" style={{ color: 'var(--accent)' }} />
                  </div>
                ) : grouped.length ? (
                  <div className="space-y-6">
                    {grouped.map((group) => (
                      <div key={group.key}>
                        <div className="mb-4 flex items-center justify-center">
                          <span className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ background: 'var(--surface-2)', color: 'var(--ink-tertiary)' }}>
                            {group.label}
                          </span>
                        </div>

                        <div className="space-y-3">
                          {group.items.map((message) => (
                            <div key={message.id} className={clsx('flex', message.fromMe ? 'justify-end' : 'justify-start')}>
                              <div
                                className="max-w-[82%] rounded-[20px] px-4 py-3 sm:max-w-[70%]"
                                style={{
                                  background: message.fromMe ? 'var(--chat-outgoing-bg)' : 'var(--chat-incoming-bg)',
                                  color: message.fromMe ? 'var(--chat-outgoing-text)' : 'var(--ink-primary)',
                                  border: message.fromMe ? '1px solid rgba(255,255,255,0.16)' : '1px solid var(--chat-incoming-border)',
                                  boxShadow: message.fromMe
                                    ? '0 12px 28px rgba(4,120,87,0.2)'
                                    : '0 8px 20px rgba(15,23,42,0.06)',
                                }}
                              >
                                <p
                                  className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em]"
                                  style={{ color: message.fromMe ? 'var(--chat-outgoing-muted)' : 'var(--accent-text)' }}
                                >
                                  {messageSenderName(message, selectedChat)}
                                </p>

                                <MessageBody message={message} />

                                <div className="mt-2 flex items-center justify-end gap-2 text-[11px]" style={{ color: message.fromMe ? 'var(--chat-outgoing-muted)' : 'var(--ink-tertiary)' }}>
                                  <span>{formatMessageTime(message.sentAt)}</span>
                                  {message.fromMe ? <span>{formatOutgoingStatus(message.status)}</span> : null}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <div className="max-w-[420px] text-center">
                      <MessageSquareText size={34} className="mx-auto mb-4" style={{ color: 'var(--ink-muted)' }} />
                      <p className="text-base font-semibold" style={{ color: 'var(--ink-primary)' }}>
                        Todavia no hay mensajes persistidos para este chat
                      </p>
                      <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ink-tertiary)' }}>
                        Esta conversacion se alimenta con los mensajes que la app ya guardo para este contacto.
                      </p>

                      {selectedChat.lastMessagePreview && (
                        <div className="mt-5 rounded-2xl p-4 text-left" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-0)' }}>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--ink-tertiary)' }}>Ultimo mensaje conocido</p>
                          <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ink-primary)' }}>{selectedChat.lastMessagePreview}</p>
                          <p className="mt-2 text-xs" style={{ color: 'var(--ink-tertiary)' }}>{formatDateTime(selectedChat.lastMessageAt)}</p>
                        </div>
                      )}

                      <p className="mt-4 text-xs leading-5" style={{ color: 'var(--ink-tertiary)' }}>
                        No recuperamos historial viejo desde WhatsApp, pero lo persistido en CRM no se pierde.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t px-4 py-4" style={{ borderColor: 'rgba(5,150,105,0.2)', background: 'linear-gradient(180deg, var(--surface-0), rgba(5,150,105,0.05))' }}>
                <div className="flex items-end gap-3 rounded-2xl p-3" style={{ background: 'var(--surface-1)', border: '1px solid rgba(5,150,105,0.28)', boxShadow: '0 16px 36px rgba(5,150,105,0.1)' }}>
                  <textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder={
                      canManage
                        ? session?.status === 'CONNECTED'
                          ? 'Escribe un mensaje'
                          : 'Conecta o reanuda la sesion para enviar'
                        : 'Tu rol no permite enviar mensajes'
                    }
                    rows={2}
                    className="ctrl-input min-h-[72px] resize-none !border-transparent !bg-transparent !shadow-none"
                    disabled={!canManage || session?.status !== 'CONNECTED' || sendMutation.isPending}
                  />
                  <button onClick={handleSendMessage} disabled={!canManage || session?.status !== 'CONNECTED' || sendMutation.isPending || !messageText.trim()} className="btn-primary !h-12 !px-4">
                    {sendMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                    Enviar
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center px-8 text-center">
              <div>
                <MessageSquareText size={34} className="mx-auto mb-4" style={{ color: 'var(--ink-muted)' }} />
                <p className="text-base font-semibold" style={{ color: 'var(--ink-primary)' }}>Selecciona un chat</p>
                <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ink-tertiary)' }}>
                  Elige una conversacion nueva del inbox para ver contexto y responder desde el CRM.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
