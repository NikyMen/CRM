import Link from 'next/link'
import type { ComponentType, ReactNode } from 'react'
import { AlertCircle, ArrowLeft, FolderOpen, LoaderCircle, RefreshCw } from 'lucide-react'
import clsx from 'clsx'
import type { AccountSummary, Client } from '@/types'
import { formatMoney, fullName } from '@/lib/format'
import { TopbarContent } from '@/components/romez/Topbar'

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  backHref,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
  backHref?: string
}) {
  // El título va en la barra superior (como Tickets) para dejarle todo el alto al contenido; la
  // descripción queda como ayuda al pasar el mouse. En pantallas chicas las acciones no entran en
  // la barra y se muestran arriba del contenido.
  return (
    <>
      <TopbarContent>
        {backHref ? <Link href={backHref} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--ink-secondary)] hover:bg-[var(--paper-soft)] hover:text-[var(--ast-accent)]" aria-label="Volver" title="Volver"><ArrowLeft size={18} /></Link> : null}
        <div className="min-w-0 flex-1" title={description}>
          {eyebrow ? <p className="hidden truncate text-xs font-medium text-[var(--ink-tertiary)] sm:block">{eyebrow}</p> : null}
          <h1 className="truncate font-display text-base font-bold leading-tight text-[var(--ink-primary)]">{title}</h1>
          {description ? <p className="sr-only">{description}</p> : null}
        </div>
        {action ? <div className="hidden shrink-0 items-center gap-2 lg:flex">{action}</div> : null}
      </TopbarContent>
      {action ? <div className="flex flex-wrap gap-2 lg:hidden">{action}</div> : null}
    </>
  )
}

export function PageFrame({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('mx-auto w-full max-w-[1480px] space-y-7 px-4 py-5 sm:px-6 sm:py-7', className)}>{children}</div>
}

export function LoadingState({ label = 'Cargando información…' }: { label?: string }) {
  return (
    <div className="state-panel" role="status">
      <LoaderCircle className="animate-spin text-[var(--brand-blue)]" size={24} />
      <p>{label}</p>
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = FolderOpen,
}: {
  title: string
  description: string
  action?: ReactNode
  icon?: ComponentType<{ size?: number; className?: string }>
}) {
  return (
    <div className="state-panel border-dashed">
      <Icon size={26} className="text-[var(--ink-muted)]" />
      <div>
        <p className="font-bold text-[var(--ink-primary)]">{title}</p>
        <p className="mt-1 max-w-lg text-sm text-[var(--ink-tertiary)]">{description}</p>
      </div>
      {action}
    </div>
  )
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="state-panel border-[var(--danger-line)] bg-[var(--danger-paper)]" role="alert">
      <AlertCircle size={24} className="text-[var(--danger)]" />
      <div>
        <p className="font-bold text-[var(--ink-primary)]">No se pudo completar la consulta</p>
        <p className="mt-1 text-sm text-[var(--ink-secondary)]">{message}</p>
      </div>
      {retry ? <button type="button" onClick={retry} className="btn-secondary"><RefreshCw size={15} /> Reintentar</button> : null}
    </div>
  )
}

export function StatusPill({ tone = 'neutral', children }: { tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger'; children: ReactNode }) {
  return <span className={clsx('status-pill', `status-pill--${tone}`)}>{children}</span>
}

export function ClientIdentityStrip({ client, account, pending, compact = false }: { client: Client; account?: AccountSummary | null; pending?: number; compact?: boolean }) {
  const balance = account?.balance
  return (
    <section className={clsx('client-identity', compact && 'client-identity--compact')} aria-label={`Legajo de ${client.name}`}>
      <div className="client-identity__name">
        <span className="client-identity__mark">{client.name.slice(0, 2).toUpperCase()}</span>
        <div className="min-w-0">
          <p className="truncate font-display text-base font-bold text-[var(--ink-primary)]">{client.name}</p>
          <p className="mt-0.5 text-xs text-[var(--ink-tertiary)]">RUC {client.ruc ? `${client.ruc}${client.dv ? `-${client.dv}` : ''}` : 'sin registrar'}</p>
        </div>
      </div>
      <IdentityDatum label="Responsable" value={fullName(client.owner)} />
      <IdentityDatum label="Saldo" value={balance === undefined ? 'Consultar' : formatMoney(balance, account?.currency)} numeric={balance !== undefined} tone={Number(balance ?? 0) > 0 ? 'warning' : undefined} />
      <IdentityDatum label="Pendientes" value={pending === undefined ? '—' : String(pending)} numeric={pending !== undefined} tone={(pending ?? 0) > 0 ? 'brand' : undefined} />
    </section>
  )
}

function IdentityDatum({ label, value, numeric, tone }: { label: string; value: string; numeric?: boolean; tone?: 'brand' | 'warning' }) {
  return (
    <div className="client-identity__datum">
      <p>{label}</p>
      <strong className={clsx(numeric && 'tabular-nums', tone === 'brand' && 'text-[var(--brand-blue)]', tone === 'warning' && 'text-[var(--warning)]')}>{value}</strong>
    </div>
  )
}

export function SectionPanel({ title, description, action, children, className }: { title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('paper-panel', className)}>
      <div className="flex flex-col gap-3 border-b border-[var(--line-soft)] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div>
          <h2 className="font-display text-base font-semibold tracking-[-0.01em] text-[var(--ink-primary)]">{title}</h2>
          {description ? <p className="mt-1 text-[13px] leading-relaxed text-[var(--ink-tertiary)]">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
