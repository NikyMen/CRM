'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, BadgeDollarSign, BriefcaseBusiness, CalendarCheck2, CheckCircle2, Headphones, Ticket } from 'lucide-react'
import { auth } from '@/lib/auth'
import { checklistsApi, clientsApi, collectionsApi, customerServiceApi, dashboardApi } from '@/lib/api'
import type { ChecklistSummary, Client, CollectionSummary, CustomerServiceSummary, DashboardData, PaginatedResult } from '@/types'
import { formatMoney, getErrorMessage } from '@/lib/format'
import { ClientIdentityStrip, EmptyState, ErrorState, LoadingState, PageFrame, PageHeader, SectionPanel, StatusPill } from '@/components/romez/OperationalUI'

export default function DashboardPage() {
  const user = auth.get()
  const collectionsQuery = useQuery<CollectionSummary>({ queryKey: ['collections-summary'], queryFn: () => collectionsApi.summary().then((response) => response.data) })
  const serviceQuery = useQuery<CustomerServiceSummary>({ queryKey: ['customer-service-summary'], queryFn: () => customerServiceApi.summary().then((response) => response.data), refetchInterval: 15_000 })
  const clientsQuery = useQuery<PaginatedResult<Client>>({ queryKey: ['clients', 'dashboard-attention'], queryFn: () => clientsApi.list({ page: 0, limit: 8 }).then((response) => response.data) })
  const checklistsQuery = useQuery<ChecklistSummary>({ queryKey: ['checklists-summary'], queryFn: () => checklistsApi.summary().then((response) => response.data) })
  const commercialQuery = useQuery<DashboardData>({ queryKey: ['dashboard'], queryFn: () => dashboardApi.get().then((response) => response.data) })

  const hasPrimaryError = collectionsQuery.isError && serviceQuery.isError && clientsQuery.isError
  if (hasPrimaryError) return <PageFrame><ErrorState message={getErrorMessage(collectionsQuery.error || serviceQuery.error || clientsQuery.error)} retry={() => { collectionsQuery.refetch(); serviceQuery.refetch(); clientsQuery.refetch() }} /></PageFrame>

  const collections = collectionsQuery.data
  const service = serviceQuery.data
  const clients = clientsQuery.data?.items ?? []
  const checklistPending = (checklistsQuery.data?.pending ?? 0) + (checklistsQuery.data?.inProgress ?? 0) + (checklistsQuery.data?.overdue ?? 0)
  const primaryCurrency = collections?.currencies.find((item) => item.currency === 'PYG') ?? collections?.currencies[0]

  return (
    <PageFrame>
      <PageHeader eyebrow="Mesa de trabajo" title={`Buen día, ${user?.firstName || 'equipo'}`} description="Lo que requiere atención ahora, ordenado por impacto operativo." />

      {(collectionsQuery.isLoading || serviceQuery.isLoading) && !collections && !service ? <LoadingState label="Preparando prioridades…" /> : (
        <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--paper)]">
          <div className="flex flex-col border-b border-[var(--line-soft)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="section-label">Prioridades de hoy</p><h2 className="mt-1 font-display text-base font-extrabold text-[var(--ink-primary)]">Cola operativa</h2></div><p className="mt-2 text-xs text-[var(--ink-tertiary)] sm:mt-0">Actualización automática de WhatsApp cada 15 segundos</p></div>
          <div className="grid divide-y divide-[var(--line-soft)] md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4">
            <PriorityLink href="/tickets" icon={Ticket} label="Tickets sin responsable" value={service?.unassigned ?? 0} action={(service?.unassigned ?? 0) > 0 ? 'Asignar ahora' : 'Bandeja despejada'} urgent={(service?.unassigned ?? 0) > 0} />
            <PriorityLink href="/collections" icon={BadgeDollarSign} label="Cuentas vencidas" value={collections?.overdueCount ?? 0} action="Revisar cobranzas" urgent={(collections?.overdueCount ?? 0) > 0} />
            <PriorityLink href="/clients" icon={CalendarCheck2} label="Checklist pendientes" value={checklistPending} action="Revisar legajos" urgent={checklistPending > 0} />
            <PriorityLink href="/customer-service" icon={Headphones} label="Esperando cliente" value={service?.waitingCustomer ?? 0} action="Ver seguimiento" />
          </div>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.35fr_.85fr]">
        <SectionPanel title="Legajos que requieren contexto" description="Identidad, responsable, cuenta y pendientes sin entrar a cada ficha." action={<Link href="/clients" className="text-xs font-bold text-[var(--brand-blue)]">Ver cartera</Link>}>
          {clientsQuery.isLoading ? <LoadingState /> : clientsQuery.isError ? <ErrorState message={getErrorMessage(clientsQuery.error)} retry={() => clientsQuery.refetch()} /> : clients.length ? <div className="space-y-2 p-3">{clients.slice(0, 6).map((client) => { const balance = client.balances?.find((item) => item.currency === 'PYG') ?? client.balances?.[0]; return <Link href={`/clients/${client.id}`} key={client.id} className="block"><ClientIdentityStrip client={client} account={balance ? { currency: balance.currency, balance: balance.balance, billed: '0', paid: '0', count: 0 } : undefined} pending={(client.pendingChecklistItems ?? 0) + (client.openTickets ?? 0)} compact /></Link> })}</div> : <EmptyState title="Sin legajos" description="Los clientes creados aparecerán en esta cola." />}
        </SectionPanel>

        <div className="space-y-6">
          <SectionPanel title="Pulso comercial" description="Oportunidades abiertas en el embudo.">
            {commercialQuery.isLoading ? <LoadingState /> : commercialQuery.data ? <div className="p-5"><div className="flex items-end justify-between"><div><p className="font-mono text-2xl font-bold tabular-nums text-[var(--ink-primary)]">{commercialQuery.data.deals.total}</p><p className="mt-1 text-xs text-[var(--ink-tertiary)]">oportunidades activas</p></div><p className="font-mono text-sm font-bold tabular-nums text-[var(--brand-blue)]">{formatMoney(commercialQuery.data.deals.pipelineValue)}</p></div><div className="mt-5 space-y-3">{commercialQuery.data.deals.byStage.slice(0, 5).map((stage) => <div key={stage.stageId} className="flex items-center gap-3"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: stage.color }} /><p className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--ink-secondary)]">{stage.stageName}</p><span className="font-mono text-xs font-bold tabular-nums text-[var(--ink-primary)]">{stage.count}</span></div>)}</div><Link href="/commercial" className="btn-secondary mt-5 w-full"><BriefcaseBusiness size={15} /> Abrir gestión comercial</Link></div> : <EmptyState title="Sin datos comerciales" description="El embudo aparecerá cuando existan oportunidades." />}
          </SectionPanel>

          <SectionPanel title="Estado del día">
            <div className="divide-y divide-[var(--line-soft)]"><HealthRow label="WhatsApp" ok={service?.whatsapp?.status === 'CONNECTED'} detail={service?.whatsapp?.status === 'CONNECTED' ? 'Conectado' : 'Requiere atención'} /><HealthRow label="Tickets propios" ok={(service?.mine ?? 0) === 0} detail={`${service?.mine ?? 0} abiertos`} /><HealthRow label="Cobros registrados" ok={Number(primaryCurrency?.received ?? 0) > 0} detail={formatMoney(primaryCurrency?.received, primaryCurrency?.currency)} /></div>
          </SectionPanel>
        </div>
      </div>
    </PageFrame>
  )
}

function PriorityLink({ href, icon: Icon, label, value, action, urgent }: { href: string; icon: typeof Ticket; label: string; value: string | number; action: string; urgent?: boolean }) { return <Link href={href} className="group p-5 hover:bg-[var(--paper-soft)]"><div className="flex items-center gap-2"><Icon size={16} className={urgent ? 'text-[var(--warning)]' : 'text-[var(--brand-blue)]'} /><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--ink-tertiary)]">{label}</p></div><p className={urgent ? 'mt-3 font-mono text-2xl font-bold tabular-nums text-[var(--warning)]' : 'mt-3 font-mono text-2xl font-bold tabular-nums text-[var(--ink-primary)]'}>{value}</p><p className="mt-3 flex items-center gap-1 text-xs font-bold text-[var(--brand-blue)]">{action} <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" /></p></Link> }
function HealthRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) { return <div className="flex items-center gap-3 px-5 py-3.5">{ok ? <CheckCircle2 size={16} className="text-[var(--success)]" /> : <AlertTriangle size={16} className="text-[var(--warning)]" />}<p className="flex-1 text-xs font-bold text-[var(--ink-primary)]">{label}</p><StatusPill tone={ok ? 'success' : 'warning'}>{detail}</StatusPill></div> }
