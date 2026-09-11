'use client'

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { ArrowLeft, Hash, Loader2, LockKeyhole, MessageCircleMore, Search, Send, UserRoundPlus, UsersRound, X } from 'lucide-react'
import { UserAvatar } from '@/components/UserAvatar'
import { EmptyState, ErrorState, LoadingState, PageFrame, PageHeader } from '@/components/romez/OperationalUI'
import { auth } from '@/lib/auth'
import { BASE_URL, internalChatApi } from '@/lib/api'
import { formatDate, formatDateTime, fullName, getErrorMessage } from '@/lib/format'
import type { InternalChatConversation, InternalChatMember, InternalChatMessage, InternalChatMessagesPage } from '@/types'

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Miembro',
  viewer: 'Consulta',
}

export default function InternalChatPage() {
  const currentUser = auth.get()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [draft, setDraft] = useState('')
  const [showMobileMembers, setShowMobileMembers] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const didAutoSelectRef = useRef(false)

  const conversationsQuery = useQuery({
    queryKey: ['internal-chat-conversations'],
    queryFn: () => internalChatApi.listConversations().then((response) => response.data),
    refetchInterval: 20_000,
  })
  const membersQuery = useQuery({
    queryKey: ['internal-chat-members'],
    queryFn: () => internalChatApi.listMembers().then((response) => response.data),
  })
  const messagesQuery = useInfiniteQuery({
    queryKey: ['internal-chat-messages', selectedId],
    queryFn: ({ pageParam }) => internalChatApi.listMessages(selectedId!, {
      limit: 60,
      cursor: pageParam,
    }).then((response) => response.data),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: InternalChatMessagesPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(selectedId),
  })

  useInternalChatLiveSync(queryClient)

  const conversations = useMemo(() => conversationsQuery.data ?? [], [conversationsQuery.data])
  const selectedConversation = conversations.find((conversation) => conversation.id === selectedId) ?? null
  const messages = useMemo(
    () => (messagesQuery.data?.pages.slice().reverse().flatMap((page) => page.items) ?? []),
    [messagesQuery.data],
  )
  const latestMessageId = messages.at(-1)?.id
  const filteredMembers = useMemo(() => {
    const term = deferredSearch.trim().toLocaleLowerCase('es')
    return (membersQuery.data ?? []).filter((member) => {
      if (member.id === currentUser?.userId) return false
      if (!term) return true
      return `${member.firstName} ${member.lastName ?? ''} ${member.email}`.toLocaleLowerCase('es').includes(term)
    })
  }, [currentUser?.userId, deferredSearch, membersQuery.data])

  useEffect(() => {
    if (!didAutoSelectRef.current && !selectedId && conversations.length) {
      didAutoSelectRef.current = true
      setSelectedId(conversations.find((conversation) => conversation.type === 'GENERAL')?.id ?? conversations[0].id)
    }
  }, [conversations, selectedId])

  useEffect(() => {
    if (!selectedId || !messagesQuery.dataUpdatedAt) return
    internalChatApi.markRead(selectedId, latestMessageId).then(() => {
      queryClient.invalidateQueries({ queryKey: ['internal-chat-conversations'] })
    }).catch(() => undefined)
  }, [latestMessageId, messagesQuery.dataUpdatedAt, queryClient, selectedId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [latestMessageId, selectedId])

  const createDirect = useMutation({
    mutationFn: (userId: string) => internalChatApi.createDirect(userId).then((response) => response.data),
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: ['internal-chat-conversations'] })
      setSelectedId(id)
      setShowMobileMembers(false)
    },
  })
  const sendMessage = useMutation({
    mutationFn: () => internalChatApi.sendMessage(selectedId!, draft.trim()),
    onSuccess: async () => {
      setDraft('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['internal-chat-conversations'] }),
        queryClient.invalidateQueries({ queryKey: ['internal-chat-messages', selectedId] }),
      ])
    },
  })

  const selectConversation = (id: string) => {
    setSelectedId(id)
    setShowMobileMembers(false)
  }
  const submit = () => {
    if (draft.trim() && selectedId && !sendMessage.isPending) sendMessage.mutate()
  }

  return (
    <PageFrame className="max-w-none lg:h-full lg:min-h-[760px] lg:overflow-hidden">
      <PageHeader
        eyebrow="Coordinación del equipo"
        title="Chat interno"
        description="Conversaciones privadas y un espacio común para todos los miembros de Gestión ROMEZ."
        action={<button type="button" className="btn-secondary lg:hidden" onClick={() => setShowMobileMembers(true)}><UserRoundPlus size={16} /> Nuevo privado</button>}
      />

      <div className="grid min-h-[650px] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--paper)] lg:h-[calc(100vh-180px)] lg:min-h-0 lg:grid-cols-[minmax(270px,320px)_minmax(390px,1fr)_minmax(240px,280px)]">
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          loading={conversationsQuery.isLoading}
          error={conversationsQuery.error}
          hidden={Boolean(selectedId) || showMobileMembers}
          onSelect={selectConversation}
          retry={() => conversationsQuery.refetch()}
        />

        <section className={clsx('min-h-0 flex-col', showMobileMembers ? 'hidden lg:flex' : selectedId ? 'flex' : 'hidden lg:flex')}>
          {!selectedConversation ? (
            <EmptyState icon={MessageCircleMore} title="Elegí una conversación" description="Usá el grupo Equipo ROMEZ o iniciá un mensaje privado con otro miembro." />
          ) : (
            <>
              <ConversationHeader
                conversation={selectedConversation}
                onBack={() => setSelectedId(null)}
                onOpenMembers={() => setShowMobileMembers(true)}
              />
              <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--chat-surface)] px-3 py-4 sm:px-5">
                {messagesQuery.hasNextPage ? (
                  <div className="mb-4 text-center"><button type="button" className="btn-secondary" disabled={messagesQuery.isFetchingNextPage} onClick={() => messagesQuery.fetchNextPage()}>{messagesQuery.isFetchingNextPage ? <Loader2 size={14} className="animate-spin" /> : null} Cargar mensajes anteriores</button></div>
                ) : null}
                {messagesQuery.isLoading ? <LoadingState label="Cargando mensajes…" /> : messagesQuery.isError ? <ErrorState message={getErrorMessage(messagesQuery.error)} retry={() => messagesQuery.refetch()} /> : messages.length ? (
                  <MessageTimeline messages={messages} currentUserId={currentUser?.userId} />
                ) : (
                  <EmptyState icon={selectedConversation.type === 'GENERAL' ? UsersRound : LockKeyhole} title="Todavía no hay mensajes" description={selectedConversation.type === 'GENERAL' ? 'Abrí la conversación del equipo con el primer mensaje.' : 'Este canal es privado entre ustedes dos.'} />
                )}
                <div ref={messagesEndRef} />
              </div>
              <div className="border-t border-[var(--line)] bg-[var(--paper)] p-3 sm:p-4">
                <div className="flex items-end gap-2">
                  <textarea
                    value={draft}
                    maxLength={4000}
                    rows={1}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        submit()
                      }
                    }}
                    className="ctrl-input min-h-11 flex-1 resize-none py-3"
                    placeholder={selectedConversation.type === 'GENERAL' ? 'Escribí al equipo…' : `Mensaje privado a ${conversationName(selectedConversation)}…`}
                  />
                  <button type="button" className="btn-primary h-11 w-11 px-0" disabled={!draft.trim() || sendMessage.isPending} onClick={submit} aria-label="Enviar mensaje">
                    {sendMessage.isPending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
                  </button>
                </div>
                {sendMessage.isError ? <p className="mt-2 text-xs font-semibold text-[var(--danger)]">{getErrorMessage(sendMessage.error, 'No se pudo enviar el mensaje.')}</p> : <p className="mt-2 flex justify-between text-[10px] text-[var(--ink-muted)]"><span>Enter para enviar · Shift + Enter para nueva línea</span><span>{draft.length}/4000</span></p>}
              </div>
            </>
          )}
        </section>

        <MemberDirectory
          members={filteredMembers}
          totalMembers={membersQuery.data?.length ?? 0}
          search={search}
          setSearch={setSearch}
          loading={membersQuery.isLoading}
          error={membersQuery.error}
          creatingUserId={createDirect.isPending ? createDirect.variables : undefined}
          visibleOnMobile={showMobileMembers}
          close={() => setShowMobileMembers(false)}
          startDirect={(userId) => createDirect.mutate(userId)}
          retry={() => membersQuery.refetch()}
        />
      </div>
    </PageFrame>
  )
}

function ConversationList({ conversations, selectedId, loading, error, hidden, onSelect, retry }: { conversations: InternalChatConversation[]; selectedId: string | null; loading: boolean; error: unknown; hidden: boolean; onSelect: (id: string) => void; retry: () => void }) {
  return (
    <section className={clsx('min-h-0 flex-col border-r border-[var(--line)]', hidden ? 'hidden lg:flex' : 'flex')}>
      <div className="border-b border-[var(--line-soft)] px-4 py-4">
        <p className="section-label">Conversaciones</p>
        <p className="mt-1 text-xs text-[var(--ink-tertiary)]">Grupo general y mensajes privados</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? <LoadingState label="Cargando conversaciones…" /> : error ? <ErrorState message={getErrorMessage(error)} retry={retry} /> : conversations.length ? conversations.map((conversation) => (
          <button type="button" key={conversation.id} onClick={() => onSelect(conversation.id)} className={clsx('block w-full border-b border-[var(--line-soft)] px-4 py-3.5 text-left', selectedId === conversation.id ? 'bg-[var(--brand-paper)]' : 'hover:bg-[var(--paper-soft)]')}>
            <div className="flex items-start gap-3">
              {conversation.type === 'GENERAL' ? <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--brand-navy)] text-white"><Hash size={17} /></span> : <UserAvatar avatar={conversation.otherParticipant?.avatar} firstName={conversation.otherParticipant?.firstName} lastName={conversation.otherParticipant?.lastName} email={conversation.otherParticipant?.email} size="sm" className="h-10 w-10" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><p className="truncate text-sm font-extrabold text-[var(--ink-primary)]">{conversationName(conversation)}</p>{conversation.unreadCount ? <span className="ml-auto min-w-5 rounded-full bg-[var(--brand-navy)] px-1.5 py-0.5 text-center text-[10px] font-extrabold text-white">{conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}</span> : null}</div>
                <p className="mt-1 truncate text-xs text-[var(--ink-tertiary)]">{conversation.lastMessage ? `${conversation.lastMessage.sender.firstName}: ${conversation.lastMessage.body}` : conversation.type === 'GENERAL' ? `${conversation.participantCount} miembros` : 'Conversación privada'}</p>
                {conversation.lastMessageAt ? <p className="mt-1.5 text-[10px] font-semibold text-[var(--ink-muted)]">{formatDateTime(conversation.lastMessageAt)}</p> : null}
              </div>
            </div>
          </button>
        )) : <EmptyState icon={MessageCircleMore} title="Sin conversaciones" description="El grupo general aparecerá automáticamente." />}
      </div>
    </section>
  )
}

function ConversationHeader({ conversation, onBack, onOpenMembers }: { conversation: InternalChatConversation; onBack: () => void; onOpenMembers: () => void }) {
  return (
    <header className="flex items-center gap-3 border-b border-[var(--line-soft)] px-3 py-3 sm:px-4">
      <button type="button" onClick={onBack} className="rounded-lg border border-[var(--line)] p-2 text-[var(--ink-secondary)] lg:hidden" aria-label="Volver a conversaciones"><ArrowLeft size={16} /></button>
      {conversation.type === 'GENERAL' ? <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--brand-navy)] text-white"><UsersRound size={17} /></span> : <UserAvatar avatar={conversation.otherParticipant?.avatar} firstName={conversation.otherParticipant?.firstName} lastName={conversation.otherParticipant?.lastName} email={conversation.otherParticipant?.email} size="sm" className="h-10 w-10" />}
      <div className="min-w-0 flex-1"><h2 className="truncate font-display text-sm font-extrabold text-[var(--ink-primary)]">{conversationName(conversation)}</h2><p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-tertiary)]">{conversation.type === 'GENERAL' ? `${conversation.participantCount} miembros del equipo` : 'Mensaje privado interno'}</p></div>
      <button type="button" className="btn-secondary px-3 lg:hidden" onClick={onOpenMembers}><UserRoundPlus size={15} /><span className="hidden sm:inline">Nuevo privado</span></button>
    </header>
  )
}

function MemberDirectory({ members, totalMembers, search, setSearch, loading, error, creatingUserId, visibleOnMobile, close, startDirect, retry }: { members: InternalChatMember[]; totalMembers: number; search: string; setSearch: (value: string) => void; loading: boolean; error: unknown; creatingUserId?: string; visibleOnMobile: boolean; close: () => void; startDirect: (userId: string) => void; retry: () => void }) {
  return (
    <aside className={clsx('min-h-0 flex-col border-l border-[var(--line)]', visibleOnMobile ? 'flex' : 'hidden lg:flex')}>
      <div className="border-b border-[var(--line-soft)] p-4">
        <div className="flex items-center justify-between"><div><p className="section-label">Equipo</p><p className="mt-1 text-xs text-[var(--ink-tertiary)]">{totalMembers} miembros</p></div><button type="button" onClick={close} className="rounded-lg border border-[var(--line)] p-2 text-[var(--ink-secondary)] lg:hidden" aria-label="Cerrar miembros"><X size={16} /></button></div>
        <label className="relative mt-3 block"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="ctrl-input pl-9" placeholder="Buscar miembro…" /></label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? <LoadingState label="Cargando equipo…" /> : error ? <ErrorState message={getErrorMessage(error)} retry={retry} /> : members.length ? members.map((member) => (
          <button type="button" key={member.id} disabled={Boolean(creatingUserId)} onClick={() => startDirect(member.id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-[var(--paper-soft)] disabled:opacity-60">
            <UserAvatar avatar={member.avatar} firstName={member.firstName} lastName={member.lastName} email={member.email} size="sm" />
            <span className="min-w-0 flex-1"><span className="block truncate text-xs font-extrabold text-[var(--ink-primary)]">{fullName(member)}</span><span className="mt-0.5 block truncate text-[10px] text-[var(--ink-tertiary)]">{ROLE_LABELS[member.role] ?? member.role}</span></span>
            {creatingUserId === member.id ? <Loader2 size={14} className="animate-spin text-[var(--brand-blue)]" /> : <LockKeyhole size={13} className="text-[var(--ink-muted)]" />}
          </button>
        )) : <EmptyState icon={UsersRound} title="Sin coincidencias" description="Probá con otro nombre o correo." />}
      </div>
    </aside>
  )
}

function MessageTimeline({ messages, currentUserId }: { messages: InternalChatMessage[]; currentUserId?: string }) {
  return <div className="space-y-3">{messages.map((message, index) => {
    const date = formatDate(message.createdAt, { weekday: 'short', day: '2-digit', month: 'short' })
    const previousDate = index > 0 ? formatDate(messages[index - 1].createdAt, { weekday: 'short', day: '2-digit', month: 'short' }) : ''
    const showDate = date !== previousDate
    const mine = message.senderId === currentUserId
    return <div key={message.id}>{showDate ? <div className="mb-3 flex justify-center"><span className="rounded-full border border-[var(--line)] bg-[var(--paper-soft)] px-3 py-1 text-[10px] font-bold capitalize text-[var(--ink-tertiary)]">{date}</span></div> : null}<div className={clsx('flex gap-2', mine ? 'justify-end' : 'justify-start')}><div className={clsx('max-w-[86%] rounded-lg border px-3 py-2.5 sm:max-w-[72%]', mine ? 'border-[var(--brand-navy)] bg-[var(--brand-navy)] text-[var(--chat-outgoing-text)]' : 'border-[var(--chat-incoming-border)] bg-[var(--chat-incoming-bg)] text-[var(--ink-primary)]')}><div className={clsx('flex items-center justify-between gap-4 text-[10px] font-bold', mine ? 'text-[var(--chat-outgoing-muted)]' : 'text-[var(--ink-tertiary)]')}><span>{mine ? 'Vos' : fullName(message.sender)}</span><time>{new Intl.DateTimeFormat('es-PY', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.createdAt))}</time></div><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5">{message.body}</p></div></div></div>
  })}</div>
}

function conversationName(conversation: InternalChatConversation) {
  return conversation.type === 'GENERAL' ? 'Equipo ROMEZ' : fullName(conversation.otherParticipant)
}

function useInternalChatLiveSync(queryClient: QueryClient) {
  useEffect(() => {
    let controller: AbortController | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let stopped = false
    let retry = 0

    async function connect() {
      const token = auth.getToken()
      if (!token || stopped) return
      controller?.abort()
      const requestController = new AbortController()
      controller = requestController
      try {
        const response = await fetch(`${BASE_URL}/internal-chat/events`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
          signal: requestController.signal,
        })
        if (!response.ok || !response.body) throw new Error(`SSE ${response.status}`)
        retry = 0
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (!stopped) {
          const { value, done } = await reader.read()
          if (done) throw new Error('SSE cerrado')
          buffer += decoder.decode(value, { stream: true })
          const frames = buffer.split('\n\n')
          buffer = frames.pop() ?? ''
          for (const frame of frames) {
            const data = frame.split('\n').find((line) => line.startsWith('data:'))?.slice(5).trim()
            if (!data) continue
            try {
              const event = JSON.parse(data) as { conversationId?: string }
              queryClient.invalidateQueries({ queryKey: ['internal-chat-conversations'] })
              if (event.conversationId) queryClient.invalidateQueries({ queryKey: ['internal-chat-messages', event.conversationId] })
            } catch { /* heartbeat o payload incompleto */ }
          }
        }
      } catch {
        if (stopped || requestController.signal.aborted) return
        retry += 1
        retryTimer = setTimeout(connect, Math.min(15_000, 800 * 2 ** Math.min(retry, 5)))
      }
    }

    connect()
    return () => {
      stopped = true
      controller?.abort()
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [queryClient])
}
