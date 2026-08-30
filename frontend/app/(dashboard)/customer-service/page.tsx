'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, ArrowRight, CheckCircle2, Clock3, Headphones, MessageSquareText, Radio, UserRoundCheck, UsersRound } from 'lucide-react'
import clsx from 'clsx'
import { customerServiceApi, ticketsApi } from '@/lib/api'
import { auth } from '@/lib/auth'
import type { CustomerServiceSummary, PaginatedResult, Ticket } from '@/types'
import { formatDateTime, fullName, getErrorMessage } from '@/lib/format'
import { EmptyState, ErrorState, LoadingState, PageFrame, PageHeader, SectionPanel, StatusPill } from '@/components/romez/OperationalUI'

export default function CustomerServicePage() {
  const role = auth.get()?.role
  const manager = role === 'owner' || role === 'admin'
  const summaryQuery = useQuery<CustomerServiceSummary>({ queryKey: ['customer-service-summary'], queryFn: () => customerServiceApi.summary().then((response) => response.data), refetchInterval: 15_000 })
  const ticketsQuery = useQuery<PaginatedResult<Ticket>>({ queryKey: ['tickets', 'customer-service-recent', manager], queryFn: () => ticketsApi.list({ inbox: manager ? 'all' : 'mine', page: 0, limit: 12 }).then((response) => response.data), refetchInterval: 15_000 })

  if (summaryQuery.isLoading) return <PageFrame><LoadingState label="Calculando carga de atención…" /></PageFrame>
  if (summaryQuery.isError || !summaryQuery.data) return <PageFrame><ErrorState message={getErrorMessage(summaryQuery.error)} retry={() => summaryQuery.refetch()} /></PageFrame>

  const summary = summaryQuery.data
  const whatsappConnected = summary.whatsapp?.status === 'CONNECTED'

  return (
    <PageFrame>
      <PageHeader eyebrow="Operación diaria" title="Atención al cliente" description="Carga del equipo, tiempos de respuesta y estado de la bandeja compartida." action={<Link href="/tickets" className="btn-primary">Abrir bandeja <ArrowRight size={15} /></Link>} />

      <section className="grid overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-6">
        <Metric icon={Headphones} label="Abiertos" value={summary.openTotal} />
        <Metric icon={UsersRound} label="Sin asignar" value={summary.unassigned} tone={summary.unassigned ? 'warning' : 'success'} />
        <Metric icon={UserRoundCheck} label="Mis tickets" value={summary.mine} />
        <Metric icon={Clock3} label="Esperando cliente" value={summary.waitingCustomer} />
        <Metric icon={CheckCircle2} label="Resueltos hoy" value={summary.resolvedToday} tone="success" />
        <Metric icon={Radio} label="Primera respuesta" value={summary.avgFirstResponseMinutes == null ? '—' : `${Math.round(summary.avgFirstResponseMinutes)} min`} tone={summary.avgFirstResponseMinutes != null && summary.avgFirstResponseMinutes > 30 ? 'warning' : undefined} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.35fr]">
        <div className="space-y-6">
          <SectionPanel title="WhatsApp compartido" description="Estado del único número operativo del estudio."><div className="p-5"><div className="flex items-start gap-4"><span className={clsx('grid h-10 w-10 place-items-center rounded-lg border', whatsappConnected ? 'border-[var(--success-line)] bg-[var(--success-paper)] text-[var(--success)]' : 'border-[var(--danger-line)] bg-[var(--danger-paper)] text-[var(--danger)]')}><Radio size={19} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-[var(--ink-primary)]">{summary.whatsapp?.pushName || 'WhatsApp ROMEZ'}</p><StatusPill tone={whatsappConnected ? 'success' : 'danger'}>{whatsappConnected ? 'Conectado' : summary.whatsapp?.status || 'Sin conexión'}</StatusPill></div><p className="mt-1 text-xs text-[var(--ink-tertiary)]">{summary.whatsapp?.phoneNumber || 'Número no informado'}</p><p className="mt-3 text-[11px] text-[var(--ink-muted)]">{whatsappConnected ? `Última conexión ${formatDateTime(summary.whatsapp?.lastConnectedAt)}` : summary.whatsapp?.lastError || 'Requiere reconexión desde Configuración.'}</p></div></div></div></SectionPanel>

          <SectionPanel title="Carga por responsable" description="Tickets abiertos actualmente asignados."><div className="divide-y divide-[var(--line-soft)]">{summary.byAssignee.length ? summary.byAssignee.map((item) => <div key={item.userId || 'unassigned'} className="flex items-center gap-3 px-5 py-3.5"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--brand-paper)] text-xs font-extrabold text-[var(--brand-navy)] dark:text-[var(--brand-blue)]">{item.user?.firstName?.slice(0, 1) || '?'}</span><p className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--ink-primary)]">{fullName(item.user)}</p><span className="font-mono text-sm font-bold tabular-nums text-[var(--ink-primary)]">{item.count}</span></div>) : <p className="p-5 text-sm text-[var(--ink-tertiary)]">No hay carga pendiente.</p>}</div></SectionPanel>
        </div>

        <SectionPanel title="Cola reciente" description="Conversaciones que requieren una próxima acción." action={<Link href="/tickets" className="text-xs font-bold text-[var(--brand-blue)]">Ver todos</Link>}>
          {ticketsQuery.isLoading ? <LoadingState /> : ticketsQuery.isError ? <ErrorState message={getErrorMessage(ticketsQuery.error)} retry={() => ticketsQuery.refetch()} /> : ticketsQuery.data?.items.length ? <div className="divide-y divide-[var(--line-soft)]">{ticketsQuery.data.items.map((ticket) => { const company = ticket.company ?? ticket.client; const assigned = ticket.assignedTo ?? ticket.assignee; return <Link href={`/tickets?ticket=${ticket.id}`} key={ticket.id} className="flex items-start gap-3 px-5 py-4 hover:bg-[var(--paper-soft)]"><MessageSquareText size={17} className="mt-0.5 shrink-0 text-[var(--brand-blue)]" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-bold text-[var(--ink-primary)]">{company?.name || ticket.whatsappChat?.displayName || ticket.contact?.firstName || 'Contacto sin identificar'}</p>{!ticket.assignedToUserId ? <StatusPill tone="warning">Libre</StatusPill> : null}</div><p className="mt-1 truncate text-xs text-[var(--ink-tertiary)]">{ticket.whatsappChat?.lastMessagePreview || 'Sin vista previa'}</p><p className="mt-2 text-[10px] font-semibold text-[var(--ink-muted)]">{fullName(assigned)} · {formatDateTime(ticket.lastMessageAt)}</p></div><ArrowRight size={15} className="mt-1 shrink-0 text-[var(--ink-muted)]" /></Link>})}</div> : <EmptyState icon={CheckCircle2} title="Cola despejada" description="No hay tickets pendientes en esta vista." />}
        </SectionPanel>
      </div>
    </PageFrame>
  )
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof AlertCircle; label: string; value: number | string; tone?: 'warning' | 'success' }) { return <div className="bg-[var(--paper)] p-4"><div className="flex items-center gap-2 text-[var(--ink-tertiary)]"><Icon size={15} /><p className="text-[9px] font-bold uppercase tracking-[.08em]">{label}</p></div><p className={clsx('mt-3 font-mono text-xl font-bold tabular-nums text-[var(--ink-primary)]', tone === 'warning' && 'text-[var(--warning)]', tone === 'success' && 'text-[var(--success)]')}>{value}</p></div> }
