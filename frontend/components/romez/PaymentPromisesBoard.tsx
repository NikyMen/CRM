'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CalendarClock, CalendarDays, CheckCircle2, ChevronDown, Plus, RotateCcw, XCircle } from 'lucide-react'
import clsx from 'clsx'
import { collectionsApi } from '@/lib/api'
import { auth } from '@/lib/auth'
import type { PaymentPromise, PaymentPromiseBoard as Board, PaymentPromiseStatus } from '@/types'
import { formatMoney, fullName, getErrorMessage, isPositiveDecimal, subtractDecimal } from '@/lib/format'
import { formatPromiseDate, invalidatePromises, paraguayToday, PROMISE_STATUS_LABELS, relativePromiseDay } from '@/lib/payment-promises'
import { DateField } from '@/components/romez/DateField'
import { EmptyState, ErrorState, LoadingState, SectionPanel, StatusPill } from '@/components/romez/OperationalUI'
import { WhatsAppLogo } from '@/components/WhatsAppLogo'

type Scope = 'mine' | 'all'

const SECTIONS = [
  { key: 'overdue', title: 'Vencidas', description: 'Pasó el día y sigue pendiente: volvé a escribirle o marcá qué pasó.', tone: 'danger' },
  { key: 'today', title: 'Para hoy', description: 'Dijeron que pagan hoy.', tone: 'brand' },
  { key: 'upcoming', title: 'Próximas', description: 'Lo que viene en los próximos días.', tone: 'neutral' },
] as const

/**
 * Bandeja de promesas de pago. Sin `companyId` es la vista de Cobranzas (mías / todas);
 * con `companyId` muestra las de un cliente.
 */
export function PaymentPromisesBoard({ companyId, onNew, onWhatsApp }: { companyId?: string; onNew?: () => void; onWhatsApp?: (promise: PaymentPromise) => void }) {
  const user = auth.get()
  const canManage = user?.role === 'owner' || user?.role === 'admin'
  const [scope, setScope] = useState<Scope>(companyId ? 'all' : 'mine')
  const [showClosed, setShowClosed] = useState(false)
  const query = useQuery<Board>({
    queryKey: ['payment-promises', { scope, companyId }],
    queryFn: () => collectionsApi.listPromises({ scope, companyId }).then((response) => response.data),
    refetchInterval: 60_000,
  })
  const board = query.data
  const pendingCount = board ? board.overdue.length + board.today.length + board.upcoming.length : 0

  const scopeToggle = companyId ? null : <div className="inline-flex rounded-lg border border-[var(--line)] p-0.5" role="group" aria-label="Qué promesas ver">{([['mine', 'Mías'], ['all', canManage ? 'De todo el equipo' : 'De mi cartera']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setScope(value)} className={clsx('rounded-md px-3 py-1.5 text-xs font-bold', scope === value ? 'bg-[var(--brand-blue)] text-white' : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]')}>{label}</button>)}</div>

  return <SectionPanel title="Promesas de pago" description={companyId ? 'Lo que el cliente dijo que iba a pagar y cuándo.' : 'Cuando un cliente te dice "te pago el 28", agendalo y ese día te aparece acá y en la campanita.'} action={<div className="flex flex-wrap items-center gap-2">{scopeToggle}{onNew ? <button type="button" className="btn-secondary" onClick={onNew}><Plus size={14} /> Agendar promesa</button> : null}</div>}>
    {query.isLoading ? <LoadingState label="Cargando promesas…" /> : query.isError || !board ? <ErrorState message={getErrorMessage(query.error, 'No pudimos cargar las promesas de pago.')} retry={() => query.refetch()} /> : <div className="divide-y divide-[var(--line-soft)]">
      {pendingCount === 0 ? <EmptyState icon={CalendarClock} title="Sin promesas pendientes" description={scope === 'mine' && !companyId ? 'No tenés recordatorios de pago agendados. Agendá uno desde un chat de WhatsApp de Cobranzas o desde el legajo del cliente.' : 'No hay promesas de pago pendientes.'} /> : SECTIONS.map((section) => {
        const items = board[section.key]
        if (!items.length) return null
        return <section key={section.key} aria-labelledby={`promises-${section.key}`}>
          <header className={clsx('flex items-center gap-2 px-4 py-2.5', section.tone === 'danger' ? 'bg-[var(--danger-paper)]' : section.tone === 'brand' ? 'bg-[var(--brand-paper)]' : 'bg-[var(--paper-soft)]')}>
            {section.tone === 'danger' ? <AlertTriangle size={15} className="text-[var(--danger)]" /> : <CalendarDays size={15} className="text-[var(--brand-blue)]" />}
            <h3 id={`promises-${section.key}`} className={clsx('text-xs font-extrabold uppercase tracking-wider', section.tone === 'danger' ? 'text-[var(--danger)]' : 'text-[var(--ink-primary)]')}>{section.title} · {items.length}</h3>
            <p className="hidden truncate text-xs text-[var(--ink-tertiary)] sm:block">{section.description}</p>
          </header>
          <ul className="divide-y divide-[var(--line-soft)]">{items.map((promise) => <PromiseRow key={promise.id} promise={promise} today={board.date} showClient={!companyId} showAssignee={scope === 'all'} onWhatsApp={onWhatsApp} />)}</ul>
        </section>
      })}
      {board.closed.length ? <section>
        <button type="button" className="flex w-full items-center gap-2 px-4 py-3 text-left text-xs font-bold text-[var(--ink-secondary)] hover:bg-[var(--paper-soft)]" aria-expanded={showClosed} onClick={() => setShowClosed((value) => !value)}><ChevronDown size={15} className={clsx('transition-transform', showClosed && 'rotate-180')} /> Cerradas recientemente ({board.closed.length})</button>
        {showClosed ? <ul className="divide-y divide-[var(--line-soft)] border-t border-[var(--line-soft)]">{board.closed.map((promise) => <PromiseRow key={promise.id} promise={promise} today={board.date} showClient={!companyId} showAssignee />)}</ul> : null}
      </section> : null}
    </div>}
  </SectionPanel>
}

function PromiseRow({ promise, today, showClient, showAssignee, onWhatsApp }: { promise: PaymentPromise; today: string; showClient: boolean; showAssignee: boolean; onWhatsApp?: (promise: PaymentPromise) => void }) {
  const queryClient = useQueryClient()
  const user = auth.get()
  const canManage = user?.role === 'owner' || user?.role === 'admin'
  const canEdit = Boolean(user && user.role !== 'viewer' && (canManage || promise.assignedUserId === user.userId || promise.createdBy?.id === user.userId))
  const [rescheduling, setRescheduling] = useState(false)
  const [newDate, setNewDate] = useState('')
  const update = useMutation({
    mutationFn: (data: { status?: PaymentPromiseStatus; promisedDate?: string }) => collectionsApi.updatePromise(promise.id, data),
    onSuccess: () => { invalidatePromises(queryClient); setRescheduling(false); setNewDate('') },
  })
  const pending = promise.status === 'PENDING'
  const overdue = pending && promise.promisedDate < today
  const covered = Boolean(promise.amount && promise.paidSince) && !isPositiveDecimal(subtractDecimal(promise.amount!, promise.paidSince!))
  const clientName = promise.company?.name ?? 'Cliente'
  const action = (status: PaymentPromiseStatus) => update.mutate({ status })

  return <li className="px-4 py-3">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {showClient ? promise.company && !promise.company.isArchived ? <Link href={`/clients/${promise.company.id}`} className="truncate text-sm font-bold text-[var(--ink-primary)] hover:text-[var(--brand-blue)]">{clientName}</Link> : <span className="truncate text-sm font-bold text-[var(--ink-primary)]">{clientName}</span> : null}
          <span className={clsx('inline-flex items-center gap-1 text-xs font-bold', overdue ? 'text-[var(--danger)]' : 'text-[var(--ink-secondary)]')}><CalendarDays size={13} />{formatPromiseDate(promise.promisedDate)}{pending ? ` · ${relativePromiseDay(promise.promisedDate, today)}` : ''}</span>
          {promise.amount ? <span className="font-mono text-xs font-bold text-[var(--ink-primary)]">{formatMoney(promise.amount, promise.currency)}</span> : <span className="text-xs text-[var(--ink-tertiary)]">Sin monto</span>}
          {!pending ? <StatusPill tone={promise.status === 'FULFILLED' ? 'success' : promise.status === 'BROKEN' ? 'danger' : 'neutral'}>{PROMISE_STATUS_LABELS[promise.status]}</StatusPill> : null}
        </div>
        {promise.note ? <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--ink-secondary)]">{promise.note}</p> : null}
        {pending && promise.paidSince ? <p className={clsx('mt-1 text-xs font-semibold', covered || !promise.amount ? 'text-[var(--success)]' : 'text-[var(--ink-secondary)]')}>{promise.amount ? covered ? `Ya pagó ${formatMoney(promise.paidSince, promise.currency)}: cubre lo prometido, marcala cumplida.` : `Pagó ${formatMoney(promise.paidSince, promise.currency)} de ${formatMoney(promise.amount, promise.currency)} desde que lo prometió.` : `Registró un pago de ${formatMoney(promise.paidSince, promise.currency)} desde que lo prometió.`}</p> : null}
        <p className="mt-1 text-[11px] text-[var(--ink-muted)]">{showAssignee ? `Responsable: ${fullName(promise.assignedUser)} · ` : ''}Agendó {fullName(promise.createdBy)}{!pending && promise.closedBy ? ` · Cerró ${fullName(promise.closedBy)}` : ''}</p>
        {update.error ? <p role="alert" className="mt-1 text-xs font-semibold text-[var(--danger)]">{getErrorMessage(update.error, 'No pudimos actualizar la promesa.')}</p> : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {onWhatsApp && promise.company && !promise.company.isArchived ? <button type="button" className="btn-secondary !min-h-8 !px-2.5 text-xs" onClick={() => onWhatsApp(promise)} title="Abrir el chat de WhatsApp de Cobranzas"><WhatsAppLogo size={14} /> Escribirle</button> : null}
        {canEdit && pending ? <>
          <button type="button" className="btn-secondary !min-h-8 !px-2.5 text-xs text-[var(--success)]" disabled={update.isPending} onClick={() => action('FULFILLED')}><CheckCircle2 size={14} /> Pagó</button>
          {overdue ? <button type="button" className="btn-secondary !min-h-8 !px-2.5 text-xs text-[var(--danger)]" disabled={update.isPending} onClick={() => action('BROKEN')}><XCircle size={14} /> No pagó</button> : null}
          <button type="button" className="btn-secondary !min-h-8 !px-2.5 text-xs" disabled={update.isPending} onClick={() => setRescheduling((value) => !value)} aria-expanded={rescheduling}><CalendarClock size={14} /> Reprogramar</button>
          <button type="button" className="!min-h-8 rounded-lg px-2 text-xs font-bold text-[var(--ink-tertiary)] hover:bg-[var(--paper-soft)]" disabled={update.isPending} onClick={() => action('CANCELLED')}>Cancelar</button>
        </> : null}
        {canEdit && !pending ? <button type="button" className="btn-secondary !min-h-8 !px-2.5 text-xs" disabled={update.isPending} onClick={() => action('PENDING')}><RotateCcw size={14} /> Reabrir</button> : null}
      </div>
    </div>
    {rescheduling ? <div className="mt-3 flex flex-col gap-2 rounded-lg border border-[var(--line)] bg-[var(--paper-soft)] p-3 sm:flex-row sm:items-start">
      <div className="sm:w-48"><DateField value={newDate} onChange={setNewDate} /></div>
      <div className="flex gap-2"><button type="button" className="btn-primary !min-h-10" disabled={!newDate || newDate < paraguayToday() || update.isPending} onClick={() => update.mutate({ promisedDate: newDate })}>{update.isPending ? 'Guardando…' : 'Guardar nueva fecha'}</button><button type="button" className="btn-secondary !min-h-10" onClick={() => setRescheduling(false)}>Cerrar</button></div>
      {newDate && newDate < paraguayToday() ? <p className="text-[11px] font-semibold text-[var(--danger)] sm:self-center">La fecha no puede ser anterior a hoy.</p> : null}
    </div> : null}
  </li>
}
