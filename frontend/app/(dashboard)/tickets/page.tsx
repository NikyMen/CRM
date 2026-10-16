'use client'

import { useDeferredValue, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ArrowLeft, BarChart3, CheckCheck, CheckCircle2, CircleCheckBig, CircleUserRound, Clock3, Headphones, Loader2, MessageCircle, MessageSquareText, Radio, Search, Settings, UserCheck, UserRoundCheck, UsersRound, Wifi, X } from 'lucide-react'
import clsx from 'clsx'
import { customerServiceApi, teamApi, ticketsApi, whatsappApi } from '@/lib/api'
import { auth } from '@/lib/auth'
import type { AssigneeSummary, CustomerServiceSummary, PaginatedResult, Role, Ticket, TicketMessage, TicketPriority, TicketStatus } from '@/types'
import { formatDateTime, fullName, getErrorMessage } from '@/lib/format'
import { EmptyState, ErrorState, LoadingState, PageFrame, StatusPill } from '@/components/romez/OperationalUI'
import { TopbarContent } from '@/components/romez/Topbar'
import { TicketComposer, type ComposerPayload } from '@/components/romez/TicketComposer'
import { WhatsAppLinkDialog } from '@/components/romez/WhatsAppLinkDialog'
import { ChatMedia, isMediaType, MessageReactions, myReaction, ReactionButton, visibleMessageText } from '@/components/romez/ChatMessageParts'

type Inbox = 'free' | 'mine' | 'all'
type Member = { id: string; role: Role; user: { id: string; firstName: string; lastName?: string | null; email: string } }

const STATUS_LABELS: Record<TicketStatus, string> = { NEW: 'Nuevo', OPEN: 'Abierto', WAITING_CUSTOMER: 'Esperando cliente', RESOLVED: 'Resuelto', CLOSED: 'Cerrado' }
const PRIORITY_LABELS: Record<TicketPriority, string> = { LOW: 'Baja', NORMAL: 'Normal', HIGH: 'Alta', URGENT: 'Urgente' }

export default function TicketsPage() {
  const queryClient = useQueryClient()
  const currentUser = auth.get()
  const role = (currentUser?.role ?? 'viewer') as Role
  const canManage = role === 'owner' || role === 'admin'
  const [inbox, setInbox] = useState<Inbox>(role === 'viewer' ? 'mine' : 'free')
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [status, setStatus] = useState<TicketStatus | ''>('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [internalNote, setInternalNote] = useState('')
  const [metricsOpen, setMetricsOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [detailTab, setDetailTab] = useState<'conversation' | 'notes'>('conversation')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ticketId = params.get('ticket')
    if (ticketId) setSelectedId(ticketId)
    const requestedInbox = params.get('inbox')
    // "Todos" es sólo para owner/admin: el resto nunca ve tickets de otros responsables.
    if (requestedInbox === 'free' && role !== 'viewer') setInbox('free')
    if (requestedInbox === 'mine') setInbox('mine')
    if (requestedInbox === 'all' && canManage) setInbox('all')
  }, [role, canManage])

  const ticketsQuery = useInfiniteQuery({
    queryKey: ['tickets', { inbox, search: deferredSearch, status }],
    queryFn: ({ pageParam }) => ticketsApi.list({ inbox, search: deferredSearch || undefined, status, page: pageParam, limit: 25 }).then((response) => response.data),
    initialPageParam: 0,
    getNextPageParam: (lastPage: PaginatedResult<Ticket>) => lastPage.page + 1 < lastPage.totalPages ? lastPage.page + 1 : undefined,
    refetchInterval: 12_000,
  })
  const detailQuery = useQuery<Ticket>({ queryKey: ['ticket', selectedId], queryFn: () => ticketsApi.get(selectedId!).then((response) => response.data), enabled: Boolean(selectedId), refetchInterval: selectedId ? 10_000 : false })
  const teamQuery = useQuery<Member[]>({ queryKey: ['team'], queryFn: () => teamApi.list().then((response) => response.data), enabled: canManage })
  const summaryQuery = useQuery<CustomerServiceSummary>({ queryKey: ['customer-service-summary'], queryFn: () => customerServiceApi.summary().then((response) => response.data), refetchInterval: 15_000 })

  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['tickets'] }); queryClient.invalidateQueries({ queryKey: ['ticket', selectedId] }); queryClient.invalidateQueries({ queryKey: ['customer-service-summary'] }) }
  const assignTicket = useMutation({ mutationFn: (assignedToUserId: string | null) => ticketsApi.assign(selectedId!, assignedToUserId), onSuccess: refresh })
  const updateStatus = useMutation({ mutationFn: (nextStatus: TicketStatus) => ticketsApi.updateStatus(selectedId!, nextStatus), onSuccess: refresh })
  const updateTicket = useMutation({ mutationFn: (data: Partial<Pick<Ticket, 'priority' | 'category' | 'dueAt'>>) => ticketsApi.update(selectedId!, data), onSuccess: refresh })
  const sendReply = useMutation({ mutationFn: (payload: ComposerPayload) => ticketsApi.reply(selectedId!, payload), onSuccess: refresh })
  const addNote = useMutation({ mutationFn: () => ticketsApi.addComment(selectedId!, internalNote.trim()), onSuccess: () => { setInternalNote(''); refresh() } })

  const ticket = detailQuery.data
  const tickets = ticketsQuery.data?.pages.flatMap((page) => page.items) ?? []
  const ticketTotal = ticketsQuery.data?.pages[0]?.total ?? 0
  const canOperate = Boolean(ticket && role !== 'viewer' && (canManage || ticket.assignedToUserId === currentUser?.userId))
  // "Todos" (los tickets de cualquier responsable) existe sólo para owner/admin; el backend aplica la misma regla.
  const inboxOptions: Array<{ id: Inbox; label: string }> = canManage ? [{ id: 'free', label: 'Libres' }, { id: 'mine', label: 'Míos' }, { id: 'all', label: 'Todos' }] : role === 'viewer' ? [{ id: 'mine', label: 'Míos' }] : [{ id: 'free', label: 'Libres' }, { id: 'mine', label: 'Míos' }]
  const summary = summaryQuery.data
  const whatsappConnected = summary?.whatsapp?.status === 'CONNECTED'

  return (
    <PageFrame className="max-w-none md:h-full md:overflow-hidden">
      <TopbarContent>
        <div className="min-w-0 flex-1" title="Cada conversación nueva de WhatsApp entra libre o llega directamente a su responsable.">
          <p className="hidden text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ink-tertiary)] sm:block">Bandeja de atención</p>
          <h1 className="truncate font-display text-base font-extrabold leading-tight text-[var(--ink-primary)]">Tickets</h1>
        </div>
        <button type="button" className="btn-secondary hidden h-9 sm:inline-flex" onClick={() => setMetricsOpen(true)} title={whatsappConnected ? `WhatsApp conectado · última conexión ${formatDateTime(summary?.whatsapp?.lastConnectedAt)}` : 'WhatsApp sin conexión'}>
          <span className={clsx('relative flex h-2.5 w-2.5 rounded-full', whatsappConnected ? 'bg-[var(--success)]' : 'bg-[var(--danger)]')}>{whatsappConnected ? <span className="absolute inset-0 animate-ping rounded-full bg-[var(--success)] opacity-60" /> : null}</span>
          <span className="max-w-36 truncate">{summary?.whatsapp?.pushName || 'WhatsApp'}</span>
        </button>
        <button type="button" className="btn-secondary h-9" onClick={() => setMetricsOpen(true)} aria-label="Métricas de atención"><BarChart3 size={15} /><span className="hidden lg:inline">Métricas</span>{summary?.unassigned ? <span className="rounded-full bg-[var(--warning)] px-1.5 text-[10px] font-extrabold text-white">{summary.unassigned}</span> : null}</button>
        {canManage ? <button type="button" className="btn-secondary h-9" onClick={() => setLinkOpen(true)} aria-label="Configurar WhatsApp de Tickets" title="Vincular el WhatsApp de Tickets (QR)"><Settings size={15} /></button> : null}
      </TopbarContent>
      <div className="grid min-h-[650px] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--paper)] md:h-[calc(100dvh-64px-56px)] md:min-h-[520px] md:grid-cols-[minmax(320px,390px)_1fr]">
        <section className={clsx('min-h-0 flex-col border-r border-[var(--line)]', selectedId ? 'hidden md:flex' : 'flex')}>
          <div className="border-b border-[var(--line-soft)] p-3">
            <div className="mb-3 flex gap-1">{inboxOptions.map((option) => <button type="button" key={option.id} onClick={() => { setInbox(option.id); setSelectedId(null) }} className={clsx('flex-1 rounded-md border px-2 py-2 text-xs font-bold', inbox === option.id ? 'border-[var(--brand-navy)] bg-[var(--brand-navy)] text-white' : 'border-[var(--line)] text-[var(--ink-secondary)] hover:bg-[var(--paper-soft)]')}>{option.label}</button>)}</div>
            <label className="relative block"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="ctrl-input pl-9" placeholder="Nombre, teléfono o mensaje…" /></label>
            <select value={status} onChange={(event) => setStatus(event.target.value as TicketStatus | '')} className="ctrl-input mt-2" aria-label="Filtrar estado"><option value="">Todos los estados</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {ticketsQuery.isLoading ? <LoadingState label="Cargando tickets…" /> : ticketsQuery.isError ? <ErrorState message={getErrorMessage(ticketsQuery.error)} retry={() => ticketsQuery.refetch()} /> : tickets.length ? <>{tickets.map((item) => <TicketListItem key={item.id} ticket={item} selected={selectedId === item.id} onSelect={() => setSelectedId(item.id)} />)}<div className="p-3 text-center"><p className="mb-2 text-[10px] font-semibold text-[var(--ink-muted)]">{tickets.length} de {ticketTotal} tickets</p>{ticketsQuery.hasNextPage ? <button type="button" className="btn-secondary w-full" disabled={ticketsQuery.isFetchingNextPage} onClick={() => ticketsQuery.fetchNextPage()}>{ticketsQuery.isFetchingNextPage ? <><Loader2 size={14} className="animate-spin" /> Cargando…</> : 'Cargar más tickets'}</button> : null}</div></> : <EmptyState icon={MessageSquareText} title="Bandeja vacía" description={inbox === 'free' ? 'No hay conversaciones sin responsable.' : 'No hay tickets que coincidan con estos filtros.'} />}
          </div>
        </section>

        <section className={clsx('min-h-0 flex-col', selectedId ? 'flex' : 'hidden md:flex')}>
          {!selectedId ? <EmptyState icon={Headphones} title="Seleccioná un ticket" description="Abrí una conversación para responder, asignar responsable o dejar una nota interna." /> : detailQuery.isLoading ? <LoadingState label="Abriendo conversación…" /> : detailQuery.isError || !ticket ? <ErrorState message={getErrorMessage(detailQuery.error)} retry={() => detailQuery.refetch()} /> : (
            <>
              <TicketHeader ticket={ticket} back={() => setSelectedId(null)} canManage={canManage} canOperate={canOperate} canTake={role !== 'viewer'} members={teamQuery.data ?? []} currentUserId={currentUser?.userId} assign={(userId) => assignTicket.mutate(userId)} assigning={assignTicket.isPending} updateStatus={(nextStatus) => updateStatus.mutate(nextStatus)} updatePriority={(priority) => updateTicket.mutate({ priority })} updateCategory={(category) => updateTicket.mutate({ category })} updating={updateStatus.isPending || updateTicket.isPending} closing={updateStatus.isPending} />
              {assignTicket.isError ? <p className="border-b border-[var(--danger-line)] bg-[var(--danger-paper)] px-4 py-3 text-xs font-semibold text-[var(--danger)]">{getErrorMessage(assignTicket.error, 'Otro integrante tomó este ticket primero. Actualizá la bandeja.')}</p> : null}
              {updateStatus.isError ? <p className="border-b border-[var(--danger-line)] bg-[var(--danger-paper)] px-4 py-3 text-xs font-semibold text-[var(--danger)]">{getErrorMessage(updateStatus.error, 'No se pudo cambiar el estado del ticket.')}</p> : null}
              <div className="flex border-b border-[var(--line-soft)] px-4"><button type="button" onClick={() => setDetailTab('conversation')} className={clsx('border-b-2 px-3 py-3 text-xs font-bold', detailTab === 'conversation' ? 'border-[var(--brand-blue)] text-[var(--brand-navy)] dark:text-[var(--brand-blue)]' : 'border-transparent text-[var(--ink-tertiary)]')}>Conversación</button><button type="button" onClick={() => setDetailTab('notes')} className={clsx('border-b-2 px-3 py-3 text-xs font-bold', detailTab === 'notes' ? 'border-[var(--brand-blue)] text-[var(--brand-navy)] dark:text-[var(--brand-blue)]' : 'border-transparent text-[var(--ink-tertiary)]')}>Notas internas ({ticket._count?.comments ?? ticket.comments?.length ?? 0})</button></div>
              {detailTab === 'conversation' ? <Conversation key={ticket.id} ticket={ticket} canOperate={canOperate} canManage={canManage} currentUserId={currentUser?.userId} send={(payload) => sendReply.mutateAsync(payload)} /> : <InternalNotes ticket={ticket} canOperate={canOperate} note={internalNote} setNote={setInternalNote} add={() => addNote.mutate()} adding={addNote.isPending} error={addNote.error} />}
            </>
          )}
        </section>
      </div>
      {metricsOpen ? <ServiceMetricsModal summary={summary} loading={summaryQuery.isLoading} error={summaryQuery.error} retry={() => summaryQuery.refetch()} onClose={() => setMetricsOpen(false)} /> : null}
      {linkOpen ? <WhatsAppLinkDialog title="WhatsApp de Tickets" description="El número compartido que alimenta la bandeja de tickets de todo el estudio." queryKey="whatsapp-session" getSession={() => whatsappApi.getSession().then((response) => response.data)} connect={() => whatsappApi.connect()} disconnect={async () => { await whatsappApi.disconnect(); queryClient.invalidateQueries({ queryKey: ['customer-service-summary'] }) }} disconnectConfirm="¿Desconectar el WhatsApp compartido de ROMEZ?" canManage={canManage} onClose={() => setLinkOpen(false)} /> : null}
    </PageFrame>
  )
}

function TicketListItem({ ticket, selected, onSelect }: { ticket: Ticket; selected: boolean; onSelect: () => void }) {
  const company = ticket.company ?? ticket.client
  const preview = ticket.whatsappChat?.lastMessagePreview ?? ticket.lastMessagePreview ?? 'Sin vista previa'
  const assignee = ticket.assignedTo ?? ticket.assignee
  return <button type="button" onClick={onSelect} className={clsx('block w-full border-b border-[var(--line-soft)] px-4 py-4 text-left', selected ? 'bg-[var(--brand-paper)]' : 'hover:bg-[var(--paper-soft)]')}><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--brand-navy)] text-xs font-extrabold text-white">{(company?.name || ticket.contact?.firstName || 'WA').slice(0, 2).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-[var(--ink-primary)]">{company?.name || [ticket.contact?.firstName, ticket.contact?.lastName].filter(Boolean).join(' ') || ticket.whatsappChat?.displayName || 'Contacto sin identificar'}</p><p className="mt-1 truncate text-xs text-[var(--ink-tertiary)]">{preview}</p><div className="mt-2 flex items-center gap-2"><StatusPill tone={ticket.assignedToUserId ? 'brand' : 'warning'}>{assignee ? fullName(assignee) : 'Libre'}</StatusPill>{ticket.priority === 'URGENT' || ticket.priority === 'HIGH' ? <StatusPill tone="danger">{PRIORITY_LABELS[ticket.priority]}</StatusPill> : null}<span className="ml-auto text-[10px] font-bold text-[var(--ink-muted)]">#{ticket.number || ticket.id.slice(-6)}</span></div></div></div></button>
}

function TicketHeader({ ticket, back, canManage, canOperate, canTake, members, currentUserId, assign, assigning, updateStatus, updatePriority, updateCategory, updating, closing }: { ticket: Ticket; back: () => void; canManage: boolean; canOperate: boolean; canTake: boolean; members: Member[]; currentUserId?: string; assign: (value: string | null) => void; assigning: boolean; updateStatus: (value: TicketStatus) => void; updatePriority: (value: TicketPriority) => void; updateCategory: (value: string | null) => void; updating: boolean; closing: boolean }) {
  const company = ticket.company ?? ticket.client
  const assignedTo = ticket.assignedTo ?? ticket.assignee
  return <header className="border-b border-[var(--line-soft)] p-4"><div className="flex items-start gap-3"><button type="button" onClick={back} className="rounded-lg border border-[var(--line)] p-2 text-[var(--ink-secondary)] md:hidden" aria-label="Volver a tickets"><ArrowLeft size={16} /></button><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-base font-extrabold text-[var(--ink-primary)]">{company?.name || [ticket.contact?.firstName, ticket.contact?.lastName].filter(Boolean).join(' ') || ticket.whatsappChat?.displayName || 'Contacto sin identificar'}</h2><StatusPill tone={ticket.status === 'RESOLVED' || ticket.status === 'CLOSED' ? 'success' : 'brand'}>{STATUS_LABELS[ticket.status]}</StatusPill></div><p className="mt-1 text-xs text-[var(--ink-tertiary)]">{company?.ruc ? `RUC ${company.ruc}${company.dv ? `-${company.dv}` : ''} · ` : ''}{ticket.contact?.phone || ticket.whatsappChat?.phoneNumber || 'Sin teléfono'} · Ticket #{ticket.number || ticket.id.slice(-6)}</p></div>{company ? <Link href={`/clients/${company.id}`} className="btn-secondary hidden sm:inline-flex">Ver legajo</Link> : null}</div><div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-[180px_130px_150px_150px_minmax(180px,1fr)]"><select disabled={!canOperate || updating} value={ticket.status} onChange={(event) => updateStatus(event.target.value as TicketStatus)} className="ctrl-input" aria-label="Estado del ticket">{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select disabled={!canOperate || updating} value={ticket.priority} onChange={(event) => updatePriority(event.target.value as TicketPriority)} className="ctrl-input" aria-label="Prioridad">{Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select disabled={!canOperate || updating} value={ticket.category ?? ''} onChange={(event) => updateCategory(event.target.value || null)} className="ctrl-input" aria-label="Categoría"><option value="">Sin categoría</option><option value="CONTABILIDAD">Contabilidad</option><option value="IMPUESTOS">Impuestos</option><option value="DOCUMENTOS">Documentos</option><option value="COBRANZAS">Cobranzas</option><option value="LABORAL">Laboral</option><option value="OTRO">Otro</option></select><button type="button" disabled={!canOperate || updating || ticket.status === 'CLOSED'} onClick={() => updateStatus('CLOSED')} className="btn-secondary"><CircleCheckBig size={15} />{ticket.status === 'CLOSED' ? 'Ticket cerrado' : closing ? 'Cerrando…' : 'Cerrar ticket'}</button>{canManage ? <select disabled={assigning} value={ticket.assignedToUserId ?? ''} onChange={(event) => assign(event.target.value || null)} className="ctrl-input" aria-label="Responsable"><option value="">Sin responsable</option>{members.map((member) => <option key={member.user.id} value={member.user.id}>{fullName(member.user)}</option>)}</select> : canTake && ticket.assignedToUserId === currentUserId ? <button type="button" disabled={assigning} onClick={() => assign(null)} className="btn-secondary"><UsersRound size={15} /> Liberar ticket</button> : canTake && !ticket.assignedToUserId ? <button type="button" disabled={assigning || !currentUserId} onClick={() => assign(currentUserId ?? null)} className="btn-primary"><UserCheck size={15} /> Tomar ticket</button> : <div className="flex items-center gap-2 rounded-lg border border-[var(--line)] px-3 text-xs font-bold text-[var(--ink-secondary)]"><CircleUserRound size={15} />{assignedTo ? fullName(assignedTo) : 'Sin responsable'}</div>}</div></header>
}

function Conversation({ ticket, canOperate, canManage, currentUserId, send }: { ticket: Ticket; canOperate: boolean; canManage: boolean; currentUserId?: string; send: (payload: ComposerPayload) => Promise<unknown> }) {
  const messages = ticket.messages ?? []
  const closedEvents = (ticket.events ?? []).filter((event) => event.type === 'STATUS_CHANGED' && event.toValue === 'CLOSED')
  const timeline = [
    ...messages.map((message) => ({ kind: 'message' as const, at: message.sentAt, message })),
    ...closedEvents.map((event) => ({ kind: 'closed' as const, at: event.createdAt, event })),
  ].sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime())
  const canReply = canOperate && ticket.status !== 'CLOSED'
  const queryClient = useQueryClient()
  const react = async (messageId: string, emoji: string) => {
    await ticketsApi.react(ticket.id, messageId, emoji)
    await queryClient.invalidateQueries({ queryKey: ['ticket', ticket.id] })
  }

  return <><div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[var(--chat-surface)] p-4 sm:p-6">{timeline.length ? timeline.map((item) => item.kind === 'message' ? <MessageBubble key={`message-${item.message.id}`} ticketId={ticket.id} message={item.message} onReact={canOperate ? (emoji) => react(item.message.id, emoji) : undefined} /> : <TicketClosedNote key={`event-${item.event.id}`} actor={item.event.actor} />) : <EmptyState icon={MessageCircle} title="Sin mensajes disponibles" description="El historial aparecerá cuando se sincronice la conversación de WhatsApp." />}</div><TicketComposer canReply={canReply} canManage={canManage} currentUserId={currentUserId} send={send} placeholder={canReply ? 'Responder por WhatsApp…' : ticket.status === 'CLOSED' ? 'El ticket está cerrado; se reabrirá si el cliente vuelve a escribir' : 'Tomá el ticket para poder responder'} hint={canOperate ? 'Enter para enviar · Shift + Enter para nueva línea · 📎 adjuntar · ⚡ respuestas rápidas · 😊 reaccionar' : 'Solo el responsable asignado puede responder o reaccionar.'} /></>
}

function TicketClosedNote({ actor }: { actor?: AssigneeSummary | null }) {
  return <div className="flex justify-center"><div className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--paper-soft)] px-3 py-1.5 text-[10px] font-bold text-[var(--ink-tertiary)]"><CircleCheckBig size={13} />Ticket cerrado por {actor ? fullName(actor) : 'el sistema'}</div></div>
}

function MessageBubble({ ticketId, message, onReact }: { ticketId: string; message: TicketMessage; onReact?: (emoji: string) => Promise<unknown> }) {
  const fromMe = message.fromMe ?? message.direction === 'OUTBOUND'
  const hasMedia = Boolean(message.mediaMimeType || message.mediaFileName || isMediaType(message.messageType))
  const text = visibleMessageText(message.text, message.messageType, message.mediaFileName)
  const canReact = Boolean(onReact) && Boolean(message.messageId) && !message.messageId?.startsWith('local-')
  return <div className={clsx('group flex items-end gap-1', fromMe ? 'flex-row-reverse' : 'flex-row')}>
    <div className={clsx('flex max-w-[82%] flex-col', fromMe ? 'items-end' : 'items-start')}>
      <div className={clsx('rounded-lg border px-3 py-2.5', fromMe ? 'border-[var(--brand-navy)] bg-[var(--brand-navy)] text-[var(--chat-outgoing-text)]' : 'border-[var(--chat-incoming-border)] bg-[var(--chat-incoming-bg)] text-[var(--ink-primary)]')}>
        <p className={clsx('text-[10px] font-bold', fromMe ? 'text-[var(--chat-outgoing-muted)]' : 'text-[var(--ink-tertiary)]')}>{fromMe ? 'Equipo ROMEZ' : message.pushName || message.senderName || 'Cliente'}</p>
        {hasMedia ? <ChatMedia messageType={message.messageType} mimeType={message.mediaMimeType} fileName={message.mediaFileName} sizeBytes={message.mediaSizeBytes} durationSeconds={message.mediaDurationSeconds} outgoing={fromMe} load={() => ticketsApi.getMessageMedia(ticketId, message.id).then((response) => response.data)} /> : null}
        {text ? <p className="mt-1 whitespace-pre-wrap text-sm leading-5">{text}</p> : !hasMedia ? <p className="mt-1 text-sm">Mensaje multimedia</p> : null}
        <p className={clsx('mt-1.5 flex items-center justify-end gap-1 text-[10px]', fromMe ? 'text-[var(--chat-outgoing-muted)]' : 'text-[var(--ink-muted)]')}>{formatDateTime(message.sentAt)}{fromMe ? <CheckCheck size={11} /> : null}</p>
      </div>
      <MessageReactions reactions={message.reactions} outgoing={fromMe} />
    </div>
    {canReact ? <ReactionButton current={myReaction(message.reactions)} onReact={onReact!} outgoing={fromMe} /> : null}
  </div>
}

function InternalNotes({ ticket, canOperate, note, setNote, add, adding, error }: { ticket: Ticket; canOperate: boolean; note: string; setNote: (value: string) => void; add: () => void; adding: boolean; error: unknown }) { return <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"><div className="mx-auto max-w-3xl">{canOperate ? <div className="paper-panel p-4"><label className="block text-xs font-bold text-[var(--ink-secondary)]">Nueva nota interna</label><textarea value={note} onChange={(event) => setNote(event.target.value)} className="ctrl-input mt-2 min-h-24 resize-y" placeholder="Contexto para el equipo; el cliente no verá esta nota." /><div className="mt-3 flex items-center justify-between">{error ? <p className="text-xs text-[var(--danger)]">{getErrorMessage(error)}</p> : <span />}<button type="button" className="btn-primary" disabled={!note.trim() || adding} onClick={add}>{adding ? 'Guardando…' : 'Guardar nota'}</button></div></div> : <p className="rounded-lg border border-[var(--line)] bg-[var(--paper-soft)] p-3 text-xs font-semibold text-[var(--ink-tertiary)]">Solo el responsable asignado puede agregar notas internas.</p>}<div className="mt-5 space-y-3">{ticket.comments?.length ? ticket.comments.map((comment) => <article key={comment.id} className="paper-panel p-4"><p className="whitespace-pre-wrap text-sm leading-6 text-[var(--ink-secondary)]">{comment.body}</p><p className="mt-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]"><Clock3 size={12} />{fullName(comment.author)} · {formatDateTime(comment.createdAt)}</p></article>) : <EmptyState title="Sin notas internas" description="Usá este espacio para dejar contexto que no debe enviarse por WhatsApp." />}</div></div></div> }

function ServiceMetricsModal({ summary, loading, error, retry, onClose }: { summary?: CustomerServiceSummary; loading: boolean; error: unknown; retry: () => void; onClose: () => void }) {
  const whatsappConnected = summary?.whatsapp?.status === 'CONNECTED'
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div role="dialog" aria-modal="true" aria-labelledby="ticket-metrics-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--paper)] p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between"><h2 id="ticket-metrics-title" className="font-display text-lg font-extrabold text-[var(--ink-primary)]">Métricas de atención</h2><button type="button" aria-label="Cerrar" className="rounded-md p-1 text-[var(--ink-tertiary)] hover:bg-[var(--paper-soft)]" onClick={onClose}><X size={18} /></button></div>{loading ? <LoadingState label="Calculando carga de atención…" /> : error || !summary ? <ErrorState message={getErrorMessage(error)} retry={retry} /> : <div className="space-y-5">
    <section className="grid overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--line)] gap-px grid-cols-2 sm:grid-cols-3">
      <Metric icon={Headphones} label="Abiertos" value={summary.openTotal} />
      <Metric icon={UsersRound} label="Sin asignar" value={summary.unassigned} tone={summary.unassigned ? 'warning' : 'success'} />
      <Metric icon={UserRoundCheck} label="Mis tickets" value={summary.mine} />
      <Metric icon={Clock3} label="Esperando cliente" value={summary.waitingCustomer} />
      <Metric icon={CheckCircle2} label="Resueltos hoy" value={summary.resolvedToday} tone="success" />
      <Metric icon={Radio} label="Primera respuesta" value={summary.avgFirstResponseMinutes == null ? '—' : `${Math.round(summary.avgFirstResponseMinutes)} min`} tone={summary.avgFirstResponseMinutes != null && summary.avgFirstResponseMinutes > 30 ? 'warning' : undefined} />
    </section>
    <MetricsBlock title="WhatsApp compartido"><div className="flex items-center gap-3"><Wifi size={18} className={whatsappConnected ? 'text-[var(--success)]' : 'text-[var(--danger)]'} /><div className="min-w-0 flex-1"><p className="truncate font-bold text-[var(--ink-primary)]">{summary.whatsapp?.pushName || 'WhatsApp ROMEZ'}</p><p className="text-xs text-[var(--ink-tertiary)]">{summary.whatsapp?.phoneNumber || 'Número no informado'} · {whatsappConnected ? `Última conexión ${formatDateTime(summary.whatsapp?.lastConnectedAt)}` : summary.whatsapp?.lastError || 'Requiere reconexión desde Configuración.'}</p></div><StatusPill tone={whatsappConnected ? 'success' : 'danger'}>{whatsappConnected ? 'Conectado' : summary.whatsapp?.status || 'Sin conexión'}</StatusPill></div></MetricsBlock>
    <MetricsBlock title="Carga por responsable"><div className="divide-y divide-[var(--line-soft)]">{summary.byAssignee.length ? summary.byAssignee.map((item) => <div key={item.userId || 'unassigned'} className="flex items-center gap-3 py-2.5"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--brand-paper)] text-xs font-extrabold text-[var(--brand-navy)] dark:text-[var(--brand-blue)]">{item.user?.firstName?.slice(0, 1) || '?'}</span><p className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--ink-primary)]">{item.user ? fullName(item.user) : 'Sin responsable'}</p><span className="font-mono text-sm font-bold tabular-nums text-[var(--ink-primary)]">{item.count}</span></div>) : <p className="py-2 text-sm text-[var(--ink-tertiary)]">No hay carga pendiente.</p>}</div></MetricsBlock>
  </div>}</div></div>
}

function MetricsBlock({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-xl border border-[var(--line)] p-4"><p className="mb-3 text-[10px] font-bold uppercase tracking-[.08em] text-[var(--ink-tertiary)]">{title}</p>{children}</section>
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof AlertCircle; label: string; value: number | string; tone?: 'warning' | 'success' }) { return <div className="bg-[var(--paper)] p-4"><div className="flex items-center gap-2 text-[var(--ink-tertiary)]"><Icon size={15} /><p className="text-[9px] font-bold uppercase tracking-[.08em]">{label}</p></div><p className={clsx('mt-3 font-mono text-xl font-bold tabular-nums text-[var(--ink-primary)]', tone === 'warning' && 'text-[var(--warning)]', tone === 'success' && 'text-[var(--success)]')}>{value}</p></div> }
