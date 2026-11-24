'use client'

import { Fragment, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { ArrowLeft, Hash, Loader2, LockKeyhole, MessageCircleMore, Search, Send, UserRoundPlus, UsersRound, X } from 'lucide-react'
import { UserAvatar } from '@/components/UserAvatar'
import { EmptyState, ErrorState, LoadingState, PageFrame, PageHeader } from '@/components/romez/OperationalUI'
import { chatListTime, dayKey, dayLabel, MessageTicks, messageTime } from '@/components/romez/WaChatBits'
import { auth } from '@/lib/auth'
import { BASE_URL, internalChatApi } from '@/lib/api'
import { fullName, getErrorMessage } from '@/lib/format'
import type { InternalChatConversation, InternalChatMember, InternalChatMessage, InternalChatMessagesPage, InternalChatReader } from '@/types'
import { brand } from '@/lib/brand'

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
  // La primera página es la más reciente y trae hasta cuándo leyó cada destinatario.
  const readers = useMemo(() => messagesQuery.data?.pages[0]?.readers ?? [], [messagesQuery.data])
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
    <PageFrame className="max-w-none !space-y-3 lg:h-full lg:overflow-hidden">
      <PageHeader
        eyebrow="Coordinación del equipo"
        title="Chat interno"
        description={`Conversaciones privadas y un espacio común para todos los miembros de ${brand.name}.`}
        action={<button type="button" className="btn-secondary h-9 lg:hidden" onClick={() => setShowMobileMembers(true)}><UserRoundPlus size={16} /> Nuevo privado</button>}
      />

      <div className="grid min-h-[600px] overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--paper)] lg:h-[calc(100dvh-64px-56px)] lg:min-h-[520px] lg:grid-cols-[minmax(270px,340px)_minmax(390px,1fr)_minmax(230px,270px)]">
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          loading={conversationsQuery.isLoading}
          error={conversationsQuery.error}
          hidden={Boolean(selectedId) || showMobileMembers}
          currentUserId={currentUser?.userId}
          onSelect={selectConversation}
          retry={() => conversationsQuery.refetch()}
        />

        <section className={clsx('min-h-0 flex-col', showMobileMembers ? 'hidden lg:flex' : selectedId ? 'flex' : 'hidden lg:flex')}>
          {!selectedConversation ? (
            <div className="wa-thread flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-3xl bg-[var(--paper)] text-[var(--wa-green)] shadow-[var(--ast-card-shadow)]"><MessageCircleMore size={28} /></span>
              <p className="font-display text-base font-semibold text-[var(--ink-primary)]">Elegí una conversación</p>
              <p className="max-w-sm text-sm text-[var(--ink-tertiary)]">Usá el grupo Equipo {brand.shortName} o iniciá un mensaje privado con otro miembro.</p>
            </div>
          ) : (
            <>
              <ConversationHeader
                conversation={selectedConversation}
                onBack={() => setSelectedId(null)}
                onOpenMembers={() => setShowMobileMembers(true)}
              />
              <div className="wa-thread min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-8">
                {messagesQuery.hasNextPage ? (
                  <div className="mb-2 text-center"><button type="button" className="inline-flex items-center gap-2 rounded-lg bg-[var(--wa-day)] px-3 py-1 text-[11px] font-medium text-[var(--ink-tertiary)] shadow-sm hover:text-[var(--ink-primary)]" disabled={messagesQuery.isFetchingNextPage} onClick={() => messagesQuery.fetchNextPage()}>{messagesQuery.isFetchingNextPage ? <Loader2 size={12} className="animate-spin" /> : null} Cargar mensajes anteriores</button></div>
                ) : null}
                {messagesQuery.isLoading ? <p className="flex items-center justify-center gap-2 py-10 text-xs text-[var(--ink-tertiary)]"><Loader2 size={14} className="animate-spin" /> Cargando mensajes…</p> : messagesQuery.isError ? <ErrorState message={getErrorMessage(messagesQuery.error)} retry={() => messagesQuery.refetch()} /> : messages.length ? (
                  <MessageTimeline messages={messages} readers={readers} group={selectedConversation.type === 'GENERAL'} currentUserId={currentUser?.userId} />
                ) : (
                  <div className="mx-auto mt-10 max-w-sm rounded-2xl bg-[var(--wa-day)] px-5 py-4 text-center shadow-sm">
                    <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-[var(--paper-inset)] text-[var(--ink-tertiary)]">{selectedConversation.type === 'GENERAL' ? <UsersRound size={18} /> : <LockKeyhole size={18} />}</span>
                    <p className="mt-2 text-sm font-semibold text-[var(--ink-primary)]">Todavía no hay mensajes</p>
                    <p className="mt-1 text-xs text-[var(--ink-tertiary)]">{selectedConversation.type === 'GENERAL' ? 'Abrí la conversación del equipo con el primer mensaje.' : 'Este canal es privado entre ustedes dos.'}</p>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              <div className="border-t border-[var(--line-soft)] bg-[var(--paper)] px-2 py-2 sm:px-3">
                <div className="flex items-end gap-1.5">
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
                    className="min-h-10 min-w-0 flex-1 resize-none rounded-3xl border border-[var(--line)] bg-[var(--paper-soft)] px-4 py-2.5 text-sm leading-5 text-[var(--ink-primary)] outline-none placeholder:text-[var(--ink-muted)] focus:border-[var(--wa-green)] focus:bg-[var(--paper)]"
                    placeholder={selectedConversation.type === 'GENERAL' ? 'Escribí al equipo' : `Mensaje privado a ${conversationName(selectedConversation)}`}
                  />
                  <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--wa-green)] text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40" disabled={!draft.trim() || sendMessage.isPending} onClick={submit} aria-label="Enviar mensaje">
                    {sendMessage.isPending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
                  </button>
                </div>
                {sendMessage.isError ? <p className="mt-1.5 px-2 text-xs font-semibold text-[var(--danger)]">{getErrorMessage(sendMessage.error, 'No se pudo enviar el mensaje.')}</p> : <p className="mt-1 flex justify-between px-2 text-[10px] text-[var(--ink-muted)]"><span>Enter envía · Shift + Enter nueva línea</span>{draft.length > 3500 ? <span>{draft.length}/4000</span> : null}</p>}
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

function GroupAvatar({ className = 'h-11 w-11' }: { className?: string }) {
  return <span className={clsx('grid shrink-0 place-items-center rounded-full bg-[var(--brand-navy)] text-white', className)}><Hash size={18} /></span>
}

function ConversationList({ conversations, selectedId, loading, error, hidden, currentUserId, onSelect, retry }: { conversations: InternalChatConversation[]; selectedId: string | null; loading: boolean; error: unknown; hidden: boolean; currentUserId?: string; onSelect: (id: string) => void; retry: () => void }) {
  return (
    <section className={clsx('min-h-0 flex-col border-r border-[var(--line-soft)]', hidden ? 'hidden lg:flex' : 'flex')}>
      <div className="flex items-baseline justify-between border-b border-[var(--line-soft)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--ink-primary)]">Conversaciones</h2>
        <span className="text-xs text-[var(--ink-muted)]">{conversations.length}</span>
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-[var(--line-soft)] overflow-y-auto">
        {loading ? <li><LoadingState label="Cargando conversaciones…" /></li> : error ? <li><ErrorState message={getErrorMessage(error)} retry={retry} /></li> : conversations.length ? conversations.map((conversation) => {
          const unread = conversation.unreadCount
          const last = conversation.lastMessage
          const mine = last?.senderId === currentUserId
          return (
            <li key={conversation.id}>
              <button type="button" onClick={() => onSelect(conversation.id)} className={clsx('flex w-full items-center gap-3 border-l-4 py-3 pl-3 pr-3 text-left transition', selectedId === conversation.id ? 'border-l-[var(--wa-green)] bg-[var(--wa-green-soft)]' : 'border-l-transparent hover:bg-[var(--paper-soft)]')}>
                {conversation.type === 'GENERAL' ? <GroupAvatar /> : <UserAvatar avatar={conversation.otherParticipant?.avatar} firstName={conversation.otherParticipant?.firstName} lastName={conversation.otherParticipant?.lastName} email={conversation.otherParticipant?.email} size="sm" className="h-11 w-11 !rounded-full" />}
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={clsx('truncate text-sm text-[var(--ink-primary)]', unread ? 'font-bold' : 'font-medium')}>{conversationName(conversation)}</span>
                    <span className={clsx('shrink-0 text-[11px]', unread ? 'font-semibold text-[var(--wa-green)]' : 'text-[var(--ink-muted)]')}>{chatListTime(conversation.lastMessageAt)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className={clsx('min-w-0 flex-1 truncate text-xs', unread ? 'text-[var(--ink-secondary)]' : 'text-[var(--ink-tertiary)]')}>
                      {last ? `${mine ? 'Vos' : last.sender.firstName}: ${last.body}` : conversation.type === 'GENERAL' ? `${conversation.participantCount} miembros` : 'Conversación privada'}
                    </span>
                    {unread ? <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[var(--wa-green)] px-1.5 text-[10px] font-bold text-white">{unread > 99 ? '99+' : unread}</span> : null}
                  </span>
                </span>
              </button>
            </li>
          )
        }) : <li><EmptyState icon={MessageCircleMore} title="Sin conversaciones" description="El grupo general aparecerá automáticamente." /></li>}
      </ul>
    </section>
  )
}

function ConversationHeader({ conversation, onBack, onOpenMembers }: { conversation: InternalChatConversation; onBack: () => void; onOpenMembers: () => void }) {
  return (
    <header className="flex items-center gap-3 border-b border-[var(--line-soft)] bg-[var(--paper)] px-3 py-2.5 sm:px-4">
      <button type="button" onClick={onBack} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--ink-secondary)] hover:bg-[var(--paper-soft)] lg:hidden" aria-label="Volver a conversaciones"><ArrowLeft size={18} /></button>
      {conversation.type === 'GENERAL' ? <GroupAvatar className="h-10 w-10" /> : <UserAvatar avatar={conversation.otherParticipant?.avatar} firstName={conversation.otherParticipant?.firstName} lastName={conversation.otherParticipant?.lastName} email={conversation.otherParticipant?.email} size="sm" className="h-10 w-10 !rounded-full" />}
      <div className="min-w-0 flex-1"><h2 className="truncate text-[15px] font-semibold text-[var(--ink-primary)]">{conversationName(conversation)}</h2><p className="truncate text-xs text-[var(--ink-tertiary)]">{conversation.type === 'GENERAL' ? `${conversation.participantCount} miembros del equipo` : 'Mensaje privado interno'}</p></div>
      <button type="button" className="btn-secondary h-9 !px-3 lg:hidden" onClick={onOpenMembers}><UserRoundPlus size={15} /><span className="hidden sm:inline">Nuevo privado</span></button>
    </header>
  )
}

function MemberDirectory({ members, totalMembers, search, setSearch, loading, error, creatingUserId, visibleOnMobile, close, startDirect, retry }: { members: InternalChatMember[]; totalMembers: number; search: string; setSearch: (value: string) => void; loading: boolean; error: unknown; creatingUserId?: string; visibleOnMobile: boolean; close: () => void; startDirect: (userId: string) => void; retry: () => void }) {
  return (
    <aside className={clsx('min-h-0 flex-col border-l border-[var(--line-soft)]', visibleOnMobile ? 'flex' : 'hidden lg:flex')}>
      <div className="space-y-2.5 border-b border-[var(--line-soft)] p-3">
        <div className="flex items-center justify-between px-1"><div><h2 className="text-sm font-semibold text-[var(--ink-primary)]">Equipo</h2><p className="text-xs text-[var(--ink-muted)]">{totalMembers} miembros · tocá uno para un privado</p></div><button type="button" onClick={close} className="grid h-8 w-8 place-items-center rounded-full text-[var(--ink-secondary)] hover:bg-[var(--paper-soft)] lg:hidden" aria-label="Cerrar miembros"><X size={16} /></button></div>
        <label className="relative block"><Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="ctrl-input !rounded-full pl-9" placeholder="Buscar miembro…" /></label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? <LoadingState label="Cargando equipo…" /> : error ? <ErrorState message={getErrorMessage(error)} retry={retry} /> : members.length ? members.map((member) => (
          <button type="button" key={member.id} disabled={Boolean(creatingUserId)} onClick={() => startDirect(member.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-[var(--paper-soft)] disabled:opacity-60">
            <UserAvatar avatar={member.avatar} firstName={member.firstName} lastName={member.lastName} email={member.email} size="sm" className="!rounded-full" />
            <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-[var(--ink-primary)]">{fullName(member)}</span><span className="mt-0.5 block truncate text-[10px] text-[var(--ink-tertiary)]">{ROLE_LABELS[member.role] ?? member.role}</span></span>
            {creatingUserId === member.id ? <Loader2 size={14} className="animate-spin text-[var(--wa-green)]" /> : <LockKeyhole size={13} className="text-[var(--ink-muted)]" />}
          </button>
        )) : <EmptyState icon={UsersRound} title="Sin coincidencias" description="Probá con otro nombre o correo." />}
      </div>
    </aside>
  )
}

/**
 * Visto de un mensaje propio: una tilde si nadie lo leyó, dos grises si lo leyeron algunos del
 * grupo y dos azules cuando lo leyeron todos los destinatarios.
 */
function readState(message: InternalChatMessage, readers: InternalChatReader[], group: boolean) {
  const sentAt = new Date(message.createdAt).getTime()
  const seenBy = readers.filter((reader) => reader.lastReadAt && new Date(reader.lastReadAt).getTime() >= sentAt)
  const status = readers.length && seenBy.length === readers.length ? 'read' : seenBy.length ? 'delivered' : 'sent'
  const label = !seenBy.length
    ? 'Todavía no lo vio nadie'
    : !group
      ? 'Visto'
      : seenBy.length === readers.length
        ? 'Lo vieron todos'
        : `Visto por ${seenBy.map((reader) => reader.firstName).join(', ')} (${seenBy.length} de ${readers.length})`
  return { status, label }
}

function MessageTimeline({ messages, readers, group, currentUserId }: { messages: InternalChatMessage[]; readers: InternalChatReader[]; group: boolean; currentUserId?: string }) {
  return <div>{messages.map((message, index) => {
    const previous = messages[index - 1]
    const newDay = !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt)
    const mine = message.senderId === currentUserId
    const tail = newDay || previous?.senderId !== message.senderId
    const seen = mine ? readState(message, readers, group) : null
    return <Fragment key={message.id}>
      {newDay ? <p className="my-3 text-center"><span className="inline-block rounded-lg bg-[var(--wa-day)] px-3 py-1 text-[11px] font-medium text-[var(--ink-tertiary)] shadow-sm first-letter:uppercase">{dayLabel(message.createdAt)}</span></p> : null}
      <div className={clsx('flex', mine ? 'justify-end' : 'justify-start', tail ? 'mt-2.5' : 'mt-0.5')}>
        <div className={clsx('max-w-[85%] rounded-xl px-2.5 pb-1 pt-1.5 text-sm shadow-[0_1px_0.5px_rgba(11,20,26,.13)] sm:max-w-[70%]', mine ? 'bg-[var(--wa-out)] text-[var(--wa-out-ink)]' : 'bg-[var(--wa-in)] text-[var(--ink-primary)]', tail && (mine ? 'rounded-tr-sm' : 'rounded-tl-sm'))}>
          {tail && !mine && group ? <p className="text-[11px] font-semibold text-[var(--ast-accent)]">{fullName(message.sender)}</p> : null}
          <p className="whitespace-pre-wrap break-words leading-5">{message.body}</p>
          <p className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-[var(--wa-meta)]" title={seen?.label}>{messageTime(message.createdAt)}{seen ? <MessageTicks status={seen.status} /> : null}</p>
        </div>
      </div>
    </Fragment>
  })}</div>
}

function conversationName(conversation: InternalChatConversation) {
  return conversation.type === 'GENERAL' ? `Equipo ${brand.shortName}` : fullName(conversation.otherParticipant)
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
              const event = JSON.parse(data) as { type?: string; conversationId?: string }
              // Un "leído" sólo cambia las tildes: no hace falta recargar la lista de conversaciones.
              if (event.type !== 'internal-chat.read') queryClient.invalidateQueries({ queryKey: ['internal-chat-conversations'] })
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
