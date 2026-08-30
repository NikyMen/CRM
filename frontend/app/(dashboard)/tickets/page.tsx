'use client'

import { useDeferredValue, useEffect, useState } from 'react'
import Link from 'next/link'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCheck, CircleUserRound, Clock3, Download, Headphones, Loader2, MessageCircle, MessageSquareText, Paperclip, Search, Send, UserCheck, UsersRound } from 'lucide-react'
import clsx from 'clsx'
import { teamApi, ticketsApi, whatsappApi } from '@/lib/api'
import { auth } from '@/lib/auth'
import type { PaginatedResult, Role, Ticket, TicketMessage, TicketPriority, TicketStatus } from '@/types'
import { formatDateTime, fullName, getErrorMessage } from '@/lib/format'
import { EmptyState, ErrorState, LoadingState, PageFrame, PageHeader, StatusPill } from '@/components/romez/OperationalUI'

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
  const [reply, setReply] = useState('')
  const [internalNote, setInternalNote] = useState('')
  const [detailTab, setDetailTab] = useState<'conversation' | 'notes'>('conversation')

  useEffect(() => {
    const ticketId = new URLSearchParams(window.location.search).get('ticket')
    if (ticketId) setSelectedId(ticketId)
  }, [])

  const ticketsQuery = useInfiniteQuery({
    queryKey: ['tickets', { inbox, search: deferredSearch, status }],
    queryFn: ({ pageParam }) => ticketsApi.list({ inbox, search: deferredSearch || undefined, status, page: pageParam, limit: 25 }).then((response) => response.data),
    initialPageParam: 0,
    getNextPageParam: (lastPage: PaginatedResult<Ticket>) => lastPage.page + 1 < lastPage.totalPages ? lastPage.page + 1 : undefined,
    refetchInterval: 12_000,
  })
  const detailQuery = useQuery<Ticket>({ queryKey: ['ticket', selectedId], queryFn: () => ticketsApi.get(selectedId!).then((response) => response.data), enabled: Boolean(selectedId), refetchInterval: selectedId ? 10_000 : false })
  const teamQuery = useQuery<Member[]>({ queryKey: ['team'], queryFn: () => teamApi.list().then((response) => response.data), enabled: canManage })

  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['tickets'] }); queryClient.invalidateQueries({ queryKey: ['ticket', selectedId] }); queryClient.invalidateQueries({ queryKey: ['customer-service-summary'] }) }
  const assignTicket = useMutation({ mutationFn: (assignedToUserId: string | null) => ticketsApi.assign(selectedId!, assignedToUserId), onSuccess: refresh })
  const updateStatus = useMutation({ mutationFn: (nextStatus: TicketStatus) => ticketsApi.updateStatus(selectedId!, nextStatus), onSuccess: refresh })
  const updateTicket = useMutation({ mutationFn: (data: Partial<Pick<Ticket, 'priority' | 'category' | 'dueAt'>>) => ticketsApi.update(selectedId!, data), onSuccess: refresh })
  const sendReply = useMutation({ mutationFn: () => ticketsApi.reply(selectedId!, reply.trim()), onSuccess: () => { setReply(''); refresh() } })
  const addNote = useMutation({ mutationFn: () => ticketsApi.addComment(selectedId!, internalNote.trim()), onSuccess: () => { setInternalNote(''); refresh() } })

  const ticket = detailQuery.data
  const tickets = ticketsQuery.data?.pages.flatMap((page) => page.items) ?? []
  const ticketTotal = ticketsQuery.data?.pages[0]?.total ?? 0
  const canOperate = Boolean(ticket && role !== 'viewer' && (canManage || ticket.assignedToUserId === currentUser?.userId))
  const inboxOptions: Array<{ id: Inbox; label: string }> = canManage ? [{ id: 'free', label: 'Libres' }, { id: 'mine', label: 'Míos' }, { id: 'all', label: 'Todos' }] : role === 'viewer' ? [{ id: 'mine', label: 'Míos' }] : [{ id: 'free', label: 'Libres' }, { id: 'mine', label: 'Míos' }]

  return (
    <PageFrame className="max-w-none md:h-full md:min-h-[760px] md:overflow-hidden">
      <PageHeader eyebrow="Bandeja de atención" title="Tickets" description="Cada conversación nueva de WhatsApp entra libre o llega directamente a su responsable." />
      <div className="grid min-h-[650px] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--paper)] md:h-[calc(100vh-180px)] md:min-h-0 md:grid-cols-[minmax(320px,390px)_1fr]">
        <section className={clsx('min-h-0 border-r border-[var(--line)]', selectedId && 'hidden md:flex', 'flex-col')}>
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
              <TicketHeader ticket={ticket} back={() => setSelectedId(null)} canManage={canManage} canOperate={canOperate} canTake={role !== 'viewer'} members={teamQuery.data ?? []} currentUserId={currentUser?.userId} assign={(userId) => assignTicket.mutate(userId)} assigning={assignTicket.isPending} updateStatus={(nextStatus) => updateStatus.mutate(nextStatus)} updatePriority={(priority) => updateTicket.mutate({ priority })} updateCategory={(category) => updateTicket.mutate({ category })} updateDueAt={(dueAt) => updateTicket.mutate({ dueAt })} updating={updateStatus.isPending || updateTicket.isPending} />
              {assignTicket.isError ? <p className="border-b border-[var(--danger-line)] bg-[var(--danger-paper)] px-4 py-3 text-xs font-semibold text-[var(--danger)]">{getErrorMessage(assignTicket.error, 'Otro integrante tomó este ticket primero. Actualizá la bandeja.')}</p> : null}
              <div className="flex border-b border-[var(--line-soft)] px-4"><button type="button" onClick={() => setDetailTab('conversation')} className={clsx('border-b-2 px-3 py-3 text-xs font-bold', detailTab === 'conversation' ? 'border-[var(--brand-blue)] text-[var(--brand-navy)] dark:text-[var(--brand-blue)]' : 'border-transparent text-[var(--ink-tertiary)]')}>Conversación</button><button type="button" onClick={() => setDetailTab('notes')} className={clsx('border-b-2 px-3 py-3 text-xs font-bold', detailTab === 'notes' ? 'border-[var(--brand-blue)] text-[var(--brand-navy)] dark:text-[var(--brand-blue)]' : 'border-transparent text-[var(--ink-tertiary)]')}>Notas internas ({ticket._count?.comments ?? ticket.comments?.length ?? 0})</button></div>
              {detailTab === 'conversation' ? <Conversation ticket={ticket} canOperate={canOperate} reply={reply} setReply={setReply} send={() => sendReply.mutate()} sending={sendReply.isPending} error={sendReply.error} /> : <InternalNotes ticket={ticket} canOperate={canOperate} note={internalNote} setNote={setInternalNote} add={() => addNote.mutate()} adding={addNote.isPending} error={addNote.error} />}
            </>
          )}
        </section>
      </div>
    </PageFrame>
  )
}

function TicketListItem({ ticket, selected, onSelect }: { ticket: Ticket; selected: boolean; onSelect: () => void }) {
  const company = ticket.company ?? ticket.client
  const preview = ticket.whatsappChat?.lastMessagePreview ?? ticket.lastMessagePreview ?? 'Sin vista previa'
  const assignee = ticket.assignedTo ?? ticket.assignee
  return <button type="button" onClick={onSelect} className={clsx('block w-full border-b border-[var(--line-soft)] px-4 py-4 text-left', selected ? 'bg-[var(--brand-paper)]' : 'hover:bg-[var(--paper-soft)]')}><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--brand-navy)] text-xs font-extrabold text-white">{(company?.name || ticket.contact?.firstName || 'WA').slice(0, 2).toUpperCase()}</span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--ink-primary)]">{company?.name || [ticket.contact?.firstName, ticket.contact?.lastName].filter(Boolean).join(' ') || ticket.whatsappChat?.displayName || 'Contacto sin identificar'}</p><span className="text-[10px] font-semibold text-[var(--ink-muted)]">{formatDateTime(ticket.lastMessageAt || ticket.updatedAt)}</span></div><p className="mt-1 truncate text-xs text-[var(--ink-tertiary)]">{preview}</p><div className="mt-2 flex items-center gap-2"><StatusPill tone={ticket.assignedToUserId ? 'brand' : 'warning'}>{assignee ? fullName(assignee) : 'Libre'}</StatusPill>{ticket.priority === 'URGENT' || ticket.priority === 'HIGH' ? <StatusPill tone="danger">{PRIORITY_LABELS[ticket.priority]}</StatusPill> : null}<span className="ml-auto text-[10px] font-bold text-[var(--ink-muted)]">#{ticket.number || ticket.id.slice(-6)}</span></div></div></div></button>
}

function TicketHeader({ ticket, back, canManage, canOperate, canTake, members, currentUserId, assign, assigning, updateStatus, updatePriority, updateCategory, updateDueAt, updating }: { ticket: Ticket; back: () => void; canManage: boolean; canOperate: boolean; canTake: boolean; members: Member[]; currentUserId?: string; assign: (value: string | null) => void; assigning: boolean; updateStatus: (value: TicketStatus) => void; updatePriority: (value: TicketPriority) => void; updateCategory: (value: string | null) => void; updateDueAt: (value: string | null) => void; updating: boolean }) {
  const company = ticket.company ?? ticket.client
  const assignedTo = ticket.assignedTo ?? ticket.assignee
  return <header className="border-b border-[var(--line-soft)] p-4"><div className="flex items-start gap-3"><button type="button" onClick={back} className="rounded-lg border border-[var(--line)] p-2 text-[var(--ink-secondary)] md:hidden" aria-label="Volver a tickets"><ArrowLeft size={16} /></button><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-base font-extrabold text-[var(--ink-primary)]">{company?.name || [ticket.contact?.firstName, ticket.contact?.lastName].filter(Boolean).join(' ') || ticket.whatsappChat?.displayName || 'Contacto sin identificar'}</h2><StatusPill tone={ticket.status === 'RESOLVED' || ticket.status === 'CLOSED' ? 'success' : 'brand'}>{STATUS_LABELS[ticket.status]}</StatusPill></div><p className="mt-1 text-xs text-[var(--ink-tertiary)]">{company?.ruc ? `RUC ${company.ruc}${company.dv ? `-${company.dv}` : ''} · ` : ''}{ticket.contact?.phone || ticket.whatsappChat?.phoneNumber || 'Sin teléfono'} · Ticket #{ticket.number || ticket.id.slice(-6)}</p></div>{company ? <Link href={`/clients/${company.id}`} className="btn-secondary hidden sm:inline-flex">Ver legajo</Link> : null}</div><div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-[180px_130px_150px_150px_minmax(180px,1fr)]"><select disabled={!canOperate || updating} value={ticket.status} onChange={(event) => updateStatus(event.target.value as TicketStatus)} className="ctrl-input" aria-label="Estado del ticket">{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select disabled={!canOperate || updating} value={ticket.priority} onChange={(event) => updatePriority(event.target.value as TicketPriority)} className="ctrl-input" aria-label="Prioridad">{Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select disabled={!canOperate || updating} value={ticket.category ?? ''} onChange={(event) => updateCategory(event.target.value || null)} className="ctrl-input" aria-label="Categoría"><option value="">Sin categoría</option><option value="CONTABILIDAD">Contabilidad</option><option value="IMPUESTOS">Impuestos</option><option value="DOCUMENTOS">Documentos</option><option value="COBRANZAS">Cobranzas</option><option value="LABORAL">Laboral</option><option value="OTRO">Otro</option></select><input type="date" disabled={!canOperate || updating} value={ticket.dueAt?.slice(0, 10) ?? ''} onChange={(event) => updateDueAt(event.target.value ? `${event.target.value}T23:59:59-03:00` : null)} className="ctrl-input" aria-label="Fecha límite" />{canManage ? <select disabled={assigning} value={ticket.assignedToUserId ?? ''} onChange={(event) => assign(event.target.value || null)} className="ctrl-input" aria-label="Responsable"><option value="">Sin responsable</option>{members.map((member) => <option key={member.user.id} value={member.user.id}>{fullName(member.user)}</option>)}</select> : canTake && ticket.assignedToUserId === currentUserId ? <button type="button" disabled={assigning} onClick={() => assign(null)} className="btn-secondary"><UsersRound size={15} /> Liberar ticket</button> : canTake && !ticket.assignedToUserId ? <button type="button" disabled={assigning || !currentUserId} onClick={() => assign(currentUserId ?? null)} className="btn-primary"><UserCheck size={15} /> Tomar ticket</button> : <div className="flex items-center gap-2 rounded-lg border border-[var(--line)] px-3 text-xs font-bold text-[var(--ink-secondary)]"><CircleUserRound size={15} />{assignedTo ? fullName(assignedTo) : 'Sin responsable'}</div>}</div></header>
}

function Conversation({ ticket, canOperate, reply, setReply, send, sending, error }: { ticket: Ticket; canOperate: boolean; reply: string; setReply: (value: string) => void; send: () => void; sending: boolean; error: unknown }) { const messages = ticket.messages ?? []; const canReply = canOperate && ticket.status !== 'CLOSED'; return <><div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[var(--chat-surface)] p-4 sm:p-6">{messages.length ? messages.map((message) => <MessageBubble key={message.id} message={message} canAccessMedia={canOperate} />) : <EmptyState icon={MessageCircle} title="Sin mensajes disponibles" description="El historial aparecerá cuando se sincronice la conversación de WhatsApp." />}</div><div className="border-t border-[var(--line)] bg-[var(--paper)] p-3 sm:p-4"><div className="flex items-end gap-2"><textarea disabled={!canReply} value={reply} onChange={(event) => setReply(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (reply.trim() && !sending && canReply) send() } }} className="ctrl-input min-h-11 flex-1 resize-none py-3" rows={1} placeholder={canReply ? 'Responder por WhatsApp…' : ticket.status === 'CLOSED' ? 'El ticket está cerrado' : 'Tomá el ticket para poder responder'} /><button type="button" className="btn-primary h-11 w-11 px-0" disabled={!canReply || !reply.trim() || sending} onClick={send} aria-label="Enviar respuesta"><Send size={17} /></button></div>{error ? <p className="mt-2 text-xs font-semibold text-[var(--danger)]">{getErrorMessage(error, 'No se pudo enviar el mensaje.')}</p> : <p className="mt-2 text-[10px] text-[var(--ink-muted)]">{canOperate ? 'Enter para enviar · Shift + Enter para nueva línea' : 'Solo el responsable asignado puede responder.'}</p>}</div></> }

function MessageBubble({ message, canAccessMedia }: { message: TicketMessage; canAccessMedia: boolean }) { const fromMe = message.fromMe ?? message.direction === 'OUTBOUND'; const hasMedia = Boolean(message.mediaMimeType || message.mediaFileName || ['image', 'audio', 'video', 'document'].includes(message.messageType ?? '')); return <div className={clsx('flex', fromMe ? 'justify-end' : 'justify-start')}><div className={clsx('max-w-[82%] rounded-lg border px-3 py-2.5', fromMe ? 'border-[var(--brand-navy)] bg-[var(--brand-navy)] text-white' : 'border-[var(--chat-incoming-border)] bg-[var(--chat-incoming-bg)] text-[var(--ink-primary)]')}><div className="flex items-center gap-2"><p className={clsx('text-[10px] font-bold', fromMe ? 'text-white/68' : 'text-[var(--ink-tertiary)]')}>{fromMe ? 'Equipo ROMEZ' : message.pushName || message.senderName || 'Cliente'}</p></div>{message.text ? <p className="mt-1 whitespace-pre-wrap text-sm leading-5">{message.text}</p> : null}{hasMedia ? <TicketMediaButton message={message} canAccess={canAccessMedia} outgoing={fromMe} /> : !message.text ? <p className="mt-1 text-sm">Mensaje multimedia</p> : null}<p className={clsx('mt-1.5 flex items-center justify-end gap-1 text-[9px]', fromMe ? 'text-white/58' : 'text-[var(--ink-muted)]')}>{formatDateTime(message.sentAt)}{fromMe ? <CheckCheck size={11} /> : null}</p></div></div> }

function TicketMediaButton({ message, canAccess, outgoing }: { message: TicketMessage; canAccess: boolean; outgoing: boolean }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const label = message.mediaFileName || (message.messageType === 'image' ? 'Imagen' : message.messageType === 'audio' ? 'Audio' : message.messageType === 'video' ? 'Video' : 'Documento')
  async function openMedia() {
    setLoading(true)
    setError('')
    try {
      const response = await whatsappApi.getMessageMedia(message.id)
      const url = URL.createObjectURL(response.data)
      const anchor = window.document.createElement('a')
      anchor.href = url
      anchor.target = '_blank'
      anchor.rel = 'noreferrer'
      if (!message.mediaMimeType?.startsWith('image/') && !message.mediaMimeType?.startsWith('audio/') && !message.mediaMimeType?.startsWith('video/') && message.mediaMimeType !== 'application/pdf') anchor.download = label
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (candidate) {
      setError(getErrorMessage(candidate, 'No se pudo abrir el archivo.'))
    } finally {
      setLoading(false)
    }
  }
  return <div className="mt-2"><button type="button" disabled={!canAccess || loading} onClick={openMedia} className={clsx('inline-flex max-w-full items-center gap-2 rounded-md border px-2.5 py-2 text-xs font-bold', outgoing ? 'border-white/20 bg-white/10 text-white' : 'border-[var(--line)] bg-[var(--paper-soft)] text-[var(--brand-navy)]', !canAccess && 'cursor-not-allowed opacity-55')}>{loading ? <Loader2 size={14} className="shrink-0 animate-spin" /> : message.mediaFileName ? <Download size={14} className="shrink-0" /> : <Paperclip size={14} className="shrink-0" />}<span className="truncate">{canAccess ? label : `${label} · disponible para el responsable`}</span></button>{error ? <p className={clsx('mt-1 text-[10px] font-semibold', outgoing ? 'text-white/75' : 'text-[var(--danger)]')}>{error}</p> : null}</div>
}

function InternalNotes({ ticket, canOperate, note, setNote, add, adding, error }: { ticket: Ticket; canOperate: boolean; note: string; setNote: (value: string) => void; add: () => void; adding: boolean; error: unknown }) { return <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"><div className="mx-auto max-w-3xl">{canOperate ? <div className="paper-panel p-4"><label className="block text-xs font-bold text-[var(--ink-secondary)]">Nueva nota interna</label><textarea value={note} onChange={(event) => setNote(event.target.value)} className="ctrl-input mt-2 min-h-24 resize-y" placeholder="Contexto para el equipo; el cliente no verá esta nota." /><div className="mt-3 flex items-center justify-between">{error ? <p className="text-xs text-[var(--danger)]">{getErrorMessage(error)}</p> : <span />}<button type="button" className="btn-primary" disabled={!note.trim() || adding} onClick={add}>{adding ? 'Guardando…' : 'Guardar nota'}</button></div></div> : <p className="rounded-lg border border-[var(--line)] bg-[var(--paper-soft)] p-3 text-xs font-semibold text-[var(--ink-tertiary)]">Solo el responsable asignado puede agregar notas internas.</p>}<div className="mt-5 space-y-3">{ticket.comments?.length ? ticket.comments.map((comment) => <article key={comment.id} className="paper-panel p-4"><p className="whitespace-pre-wrap text-sm leading-6 text-[var(--ink-secondary)]">{comment.body}</p><p className="mt-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]"><Clock3 size={12} />{fullName(comment.author)} · {formatDateTime(comment.createdAt)}</p></article>) : <EmptyState title="Sin notas internas" description="Usá este espacio para dejar contexto que no debe enviarse por WhatsApp." />}</div></div></div> }
