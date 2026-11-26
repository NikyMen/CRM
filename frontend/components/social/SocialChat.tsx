'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Check, CheckCheck, CircleAlert, Loader2, Search, Send, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import { dealsApi, socialApi, type ChatLead, type SocialConversation, type SocialConversationDetail, type SocialNetwork } from '@/lib/api'
import { auth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/format'
import { chatListTime, dayKey, dayLabel, messageTime, WaAvatar } from '@/components/romez/WaChatBits'
import { NETWORKS, NetworkLogo } from './networks'
import { AssigneeControl, MemberAvatar, memberName, useTeamMembers } from './AssigneeControl'
import { ScheduleControl } from '@/components/calendar/ScheduleControl'

const detailKey = (id: string) => ['social-conversation', id]

/** Etapas del lead de la conversación, cambiables con un clic (igual que en el chat de WhatsApp). */
function StageBar({ lead, conversationId }: { lead: ChatLead; conversationId: string }) {
  const queryClient = useQueryClient()
  const move = useMutation({
    mutationFn: (stageId: string) => dealsApi.move(lead.id, stageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: detailKey(conversationId) })
      queryClient.invalidateQueries({ queryKey: ['kanban'] })
    },
  })
  const stages = [...lead.stages].sort((a, b) => a.position - b.position)
  const open = stages.filter((stage) => !stage.isWon && !stage.isLost)
  const closed = stages.filter((stage) => stage.isWon || stage.isLost)
  const currentIndex = open.findIndex((stage) => stage.id === lead.stageId)
  const disabled = !lead.canMove || move.isPending
  const chip = (stage: (typeof stages)[number], content: React.ReactNode) => {
    const current = stage.id === lead.stageId
    return <button
      key={stage.id}
      type="button"
      onClick={() => { if (!current && !disabled) move.mutate(stage.id) }}
      disabled={disabled && !current}
      aria-pressed={current}
      title={current ? `Etapa actual: ${stage.name.trim()}` : lead.canMove ? `Mover a ${stage.name.trim()}` : 'Tu rol no puede mover este lead'}
      className={clsx('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition disabled:cursor-not-allowed', current ? 'text-[var(--ink-primary)] shadow-sm' : 'bg-[var(--paper)] text-[var(--ink-tertiary)] ring-1 ring-[var(--line-soft)] enabled:hover:text-[var(--ink-primary)]', disabled && !current && 'opacity-60')}
      style={current ? { background: `color-mix(in srgb, ${stage.color} 22%, var(--paper))`, boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${stage.color} 70%, transparent)` } : undefined}
    >
      {move.isPending && move.variables === stage.id ? <Loader2 size={11} className="animate-spin" /> : content}
      {stage.name.trim()}
    </button>
  }
  return <div className="border-b border-[var(--line-soft)] bg-[var(--paper-soft)] px-3 py-2 sm:px-4">
    <div className="flex items-center gap-2">
      <span className="hidden shrink-0 text-[11px] font-medium text-[var(--ink-muted)] lg:inline">Lead #{lead.leadNumber}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-0.5" role="group" aria-label="Cambiar la etapa del lead">
        {open.map((stage, index) => chip(stage, currentIndex >= 0 && index < currentIndex ? <Check size={11} className="text-[var(--success)]" /> : <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: stage.color }} />))}
        {closed.length ? <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-[var(--line)]" /> : null}
        {closed.map((stage) => chip(stage, stage.isWon ? <ThumbsUp size={11} /> : <ThumbsDown size={11} />))}
      </div>
    </div>
    {move.isError ? <p role="alert" className="mt-1 text-xs font-semibold text-[var(--danger)]">{getErrorMessage(move.error, 'No se pudo mover el lead.')}</p> : null}
  </div>
}

/** Conversación de Instagram o Facebook: encabezado, etapa del lead, mensajes y respuesta. */
export function SocialThread({ conversationId, onClose }: { conversationId: string; onClose?: () => void }) {
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const canWrite = auth.get()?.role !== 'viewer'
  const query = useQuery<SocialConversationDetail>({ queryKey: detailKey(conversationId), queryFn: () => socialApi.conversation(conversationId).then((response) => response.data), refetchInterval: 10_000 })
  const detail = query.data
  const unread = detail?.conversation.unreadCount ?? 0

  useEffect(() => { setText('') }, [conversationId])
  useEffect(() => {
    if (!unread) return
    socialApi.markRead(conversationId).then(() => {
      queryClient.invalidateQueries({ queryKey: ['social-conversations'] })
      queryClient.invalidateQueries({ queryKey: ['social-status'] })
    }).catch(() => {})
  }, [conversationId, unread, queryClient])
  const messageCount = detail?.messages.length ?? 0
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [conversationId, messageCount])

  const send = useMutation({
    mutationFn: () => socialApi.send(conversationId, text.trim()).then((response) => response.data),
    onSuccess: (data) => {
      setText('')
      queryClient.setQueryData(detailKey(conversationId), data)
      queryClient.invalidateQueries({ queryKey: ['social-conversations'] })
      queryClient.invalidateQueries({ queryKey: ['kanban'] })
    },
  })

  if (query.isLoading) return <div className="grid h-full place-items-center"><Loader2 className="animate-spin text-[var(--ink-muted)]" size={26} /></div>
  if (query.isError || !detail) return <div className="grid h-full place-items-center p-6 text-center text-sm font-semibold text-[var(--danger)]">{getErrorMessage(query.error, 'No pudimos abrir la conversación.')}</div>

  const { conversation, messages, lead } = detail
  const network = NETWORKS[conversation.network]
  const submit = () => { if (text.trim() && !send.isPending) send.mutate() }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--line-soft)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <WaAvatar id={conversation.id} name={conversation.name} imageUrl={conversation.avatar} className="h-11 w-11 text-sm" />
          <div className="min-w-0">
            <p className="truncate font-display text-[15px] font-semibold text-[var(--ink-primary)]">{conversation.name}</p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs font-medium" style={{ color: network.color }}>
              <NetworkLogo network={conversation.network} size={12} /> {network.label}{conversation.username ? <span className="text-[var(--ink-tertiary)]">· @{conversation.username}</span> : null}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {lead ? <ScheduleControl compact dealId={lead.id} appointmentAt={lead.appointmentAt} onChanged={() => queryClient.invalidateQueries({ queryKey: detailKey(conversationId) })} /> : null}
          <AssigneeControl assignedToUserId={conversation.assignedToUserId} onAssign={async (userId) => {
            const response = await socialApi.assign(conversationId, userId)
            if (response.data) queryClient.setQueryData(detailKey(conversationId), response.data)
            queryClient.invalidateQueries({ queryKey: ['social-conversations'] })
            queryClient.invalidateQueries({ queryKey: ['kanban'] })
          }} />
          {onClose ? <button type="button" onClick={onClose} aria-label="Cerrar" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--ink-tertiary)] hover:bg-[var(--paper-soft)] hover:text-[var(--ink-primary)]"><X size={18} /></button> : null}
        </div>
      </header>
      {lead ? <StageBar lead={lead} conversationId={conversationId} /> : null}

      <div className="wa-thread min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-4">
        {messages.length ? messages.map((message, index) => {
          const mine = message.direction === 'outbound'
          const image = message.attachments.find((attachment) => attachment.type === 'image' && attachment.url)
          const newDay = index === 0 || dayKey(messages[index - 1].sentAt) !== dayKey(message.sentAt)
          return (
            <div key={message.id}>
              {newDay ? <p className="my-2 text-center"><span className="rounded-lg bg-[var(--paper)] px-2.5 py-1 text-[11px] font-medium text-[var(--ink-tertiary)] shadow-sm">{dayLabel(message.sentAt)}</span></p> : null}
              <div className={clsx('flex', mine ? 'justify-end' : 'justify-start')}>
                <div className={clsx('max-w-[78%] rounded-xl px-2.5 pb-1 pt-1.5 text-sm leading-5 shadow-[0_1px_0.5px_rgba(11,20,26,.13)]', mine ? 'rounded-tr-sm bg-[var(--wa-out)] text-[var(--wa-out-ink)]' : 'rounded-tl-sm bg-[var(--wa-in)] text-[var(--ink-primary)]')}>
                  {image
                    // eslint-disable-next-line @next/next/no-img-element -- adjunto servido por la red social, URL externa.
                    ? <img src={image.url!} alt="Imagen del mensaje" className="mb-1 max-h-72 w-full rounded-lg object-cover" referrerPolicy="no-referrer" />
                    : null}
                  {message.text ? <p className="whitespace-pre-wrap break-words">{message.text}</p> : !image ? <p className="italic text-[var(--ink-tertiary)]">[{message.type}]</p> : null}
                  <p className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-[var(--wa-meta)]">
                    {messageTime(message.sentAt)}
                    {mine ? message.status === 'failed' ? <CircleAlert size={12} className="text-[var(--danger)]" aria-label="No se envió" /> : message.status === 'pending' ? <Loader2 size={11} className="animate-spin" aria-label="Enviando" /> : <CheckCheck size={13} aria-label="Enviado" /> : null}
                  </p>
                </div>
              </div>
            </div>
          )
        }) : <p className="grid h-full place-items-center text-sm text-[var(--ink-tertiary)]">Sin mensajes todavía.</p>}
        <div ref={endRef} />
      </div>

      <footer className="shrink-0 border-t border-[var(--line-soft)] bg-[var(--paper)] px-3 py-2.5">
        {!conversation.canReply ? <p className="mb-2 flex items-start gap-2 rounded-xl bg-[var(--warning-paper)] px-3 py-2 text-xs font-medium text-[var(--warning)]"><CircleAlert size={14} className="mt-0.5 shrink-0" /> La cuenta de {network.label} no está conectada: se puede leer, pero todavía no responder desde acá.</p> : null}
        {send.isError ? <p role="alert" className="mb-2 text-xs font-semibold text-[var(--danger)]">{getErrorMessage(send.error, 'No se pudo enviar el mensaje.')}</p> : null}
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit() } }}
            rows={1}
            maxLength={1000}
            disabled={!conversation.canReply || !canWrite || send.isPending}
            placeholder={conversation.canReply ? 'Escribí un mensaje' : 'Conectá la cuenta para responder'}
            aria-label="Mensaje"
            className="min-h-10 flex-1 resize-none rounded-3xl border border-[var(--line-soft)] bg-[var(--paper-inset)] px-4 py-2.5 text-sm text-[var(--ink-primary)] outline-none placeholder:text-[var(--ink-muted)] focus:border-[var(--brand-blue)] disabled:opacity-60"
          />
          <button type="button" onClick={submit} disabled={!conversation.canReply || !canWrite || !text.trim() || send.isPending} aria-label="Enviar" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white shadow-sm hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40" style={{ background: network.color }}>
            {send.isPending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
          </button>
        </div>
      </footer>
    </div>
  )
}

/** La conversación en un popup, para abrirla desde una tarjeta del tablero de Mensajes. */
export function SocialChatPanel({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label="Conversación">
      <section className="ast-rise h-[min(760px,90vh)] w-full max-w-3xl overflow-hidden rounded-[1.5rem] border border-[var(--line-soft)] bg-[var(--paper)] shadow-[var(--ast-float-shadow)]">
        <SocialThread conversationId={conversationId} onClose={onClose} />
      </section>
    </div>
  )
}

/** Bandeja de una red: lista de conversaciones a la izquierda y la conversación abierta a la derecha. */
export function SocialInbox({ network }: { network: SocialNetwork }) {
  const team = useTeamMembers()
  const me = auth.get()?.userId
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const query = useQuery<SocialConversation[]>({ queryKey: ['social-conversations', network], queryFn: () => socialApi.conversations(network).then((response) => response.data.conversations), refetchInterval: 15_000 })
  const conversations = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (query.data ?? []).filter((item) => !term || [item.name, item.username, item.lastMessagePreview].some((value) => value?.toLowerCase().includes(term)))
  }, [query.data, search])
  const info = NETWORKS[network]

  return (
    <div className="grid h-full min-h-0 overflow-hidden rounded-2xl border border-[var(--line-soft)] bg-[var(--paper)] shadow-[var(--ast-card-shadow)] md:grid-cols-[320px_1fr]">
      <aside className={clsx('min-h-0 flex-col border-r border-[var(--line-soft)]', selected ? 'hidden md:flex' : 'flex')}>
        <div className="shrink-0 border-b border-[var(--line-soft)] p-3">
          <label className="relative block">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="ctrl-input !rounded-full pl-9" placeholder="Buscar conversación" aria-label={`Buscar en ${info.label}`} />
          </label>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {query.isLoading ? <li className="flex items-center justify-center gap-2 p-8 text-xs text-[var(--ink-tertiary)]"><Loader2 size={14} className="animate-spin" /> Cargando conversaciones…</li>
            : query.isError ? <li className="p-6 text-center text-xs font-semibold text-[var(--danger)]">{getErrorMessage(query.error)}</li>
            : conversations.length ? conversations.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => setSelected(item.id)} aria-current={selected === item.id} className={clsx('flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--paper-soft)]', selected === item.id && 'bg-[var(--paper-inset)]')}>
                  <WaAvatar id={item.id} name={item.name} imageUrl={item.avatar} className="h-11 w-11 text-sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={clsx('truncate text-sm text-[var(--ink-primary)]', item.unreadCount ? 'font-bold' : 'font-semibold')}>{item.name}</span>
                      <span className="shrink-0 text-[11px] text-[var(--ink-muted)]">{chatListTime(item.lastMessageAt)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-[var(--ink-secondary)]">{item.lastMessageFromMe ? 'Vos: ' : ''}{item.lastMessagePreview ?? 'Sin mensajes'}</span>
                      {item.unreadCount ? <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[10px] font-bold text-white" style={{ background: info.color }}>{item.unreadCount}</span> : null}
                    </span>
                    {(() => {
                      const owner = team.data?.find((member) => member.id === item.assignedToUserId)
                      return <span className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-[var(--paper-inset)] py-0.5 pl-0.5 pr-2 text-[10px] font-semibold text-[var(--ink-secondary)]">
                        {owner ? <><MemberAvatar member={owner} className="h-4 w-4 text-[8px]" /> <span className="truncate">{owner.id === me ? 'Vos' : memberName(owner)}</span></> : <span className="pl-1.5 text-[var(--ink-muted)]">Libre</span>}
                      </span>
                    })()}
                  </span>
                </button>
              </li>
            )) : <li className="p-8 text-center text-sm text-[var(--ink-tertiary)]">{search ? 'Ninguna conversación coincide.' : `Todavía no hay conversaciones de ${info.label}.`}</li>}
        </ul>
      </aside>
      <section className={clsx('min-h-0', selected ? 'block' : 'hidden md:block')}>
        {selected
          ? <SocialThread key={selected} conversationId={selected} onClose={() => setSelected(null)} />
          : <div className="grid h-full place-items-center p-8 text-center"><div><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl" style={{ background: info.soft, color: info.color }}><NetworkLogo network={network} size={26} /></span><p className="mt-4 font-display text-base font-semibold text-[var(--ink-primary)]">Mensajes de {info.label}</p><p className="mt-1 max-w-xs text-sm text-[var(--ink-tertiary)]">Elegí una conversación para leerla y responder.</p></div></div>}
      </section>
    </div>
  )
}
