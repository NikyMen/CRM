'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronRight, Download, Minus, Search, X } from 'lucide-react'
import clsx from 'clsx'
import type { CollectionAgingClient, CollectionInsights } from '@/types'
import { formatMoney } from '@/lib/format'
import { buildXlsx } from '@/lib/xlsx'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const monthLabel = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1] ?? key
const money = (value: number, currency: string) => formatMoney(Math.round(value), currency)
const compact = (value: number) => new Intl.NumberFormat('es-PY', { notation: 'compact', maximumFractionDigits: 1 }).format(value)

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Se pone en true un frame después de montar, para que las transiciones CSS arranquen desde cero. */
function useMounted() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  return mounted
}

function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (prefersReducedMotion()) { setValue(target); return }
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      setValue(target * (1 - Math.pow(1 - progress, 3)))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, duration])
  return value
}

/** Escala "linda" para el eje: 0 y tres divisiones redondeadas. */
function niceMax(value: number) {
  if (value <= 0) return 1
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)))
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate * 4 >= value) ?? 10 * magnitude
  return step * 4
}

export function CollectionsDashboard({ data }: { data: CollectionInsights }) {
  const { currency } = data
  const change = data.collectedLastMonth > 0 ? ((data.collectedThisMonth - data.collectedLastMonth) / data.collectedLastMonth) * 100 : null

  return <div className="viz space-y-4">
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile label="Cobrado este mes" value={data.collectedThisMonth} currency={currency}>
        {change === null ? <span className="text-[var(--ink-tertiary)]">Sin cobros el mes anterior</span> : <span className={clsx('inline-flex items-center gap-1 font-bold', change > 0 ? 'text-[var(--success)]' : change < 0 ? 'text-[var(--danger)]' : 'text-[var(--ink-tertiary)]')}>{change > 0 ? <ArrowUpRight size={14} /> : change < 0 ? <ArrowDownRight size={14} /> : <Minus size={14} />}{Math.abs(change).toFixed(0)}% <span className="font-medium text-[var(--ink-tertiary)]">vs. mes anterior</span></span>}
      </StatTile>
      <RateTile rate={data.collectionRate} applied={data.applied} billed={data.billed} currency={currency} />
      <StatTile label="Saldo vencido" value={data.overdueOutstanding} currency={currency} danger={data.overdueOutstanding > 0}>
        <span className="text-[var(--ink-tertiary)]"><strong className="font-bold text-[var(--ink-secondary)]">{money(data.outstanding, currency)}</strong> pendiente anual</span>
      </StatTile>
      <StatTile label="Clientes con deuda" value={data.clientsWithDebt} plain>
        <span className="text-[var(--ink-tertiary)]">Saldo a favor de clientes: <strong className="font-bold text-[var(--ink-secondary)]">{money(data.creditBalance, currency)}</strong></span>
      </StatTile>
    </section>

    <MoreStats>
      <section className="grid gap-4 lg:grid-cols-5">
        <TrendChart data={data} className="lg:col-span-3" />
        <AgingChart data={data} className="lg:col-span-2" />
      </section>
      <TopDebtors data={data} />
    </MoreStats>
  </div>
}

/**
 * Los gráficos quedan plegados detrás de "Ver más" y se despliegan deslizando.
 * Se montan recién al abrir, así sus animaciones de entrada se ven.
 */
function MoreStats({ children }: { children: React.ReactNode }) {
  const [rendered, setRendered] = useState(false)
  const [open, setOpen] = useState(false)
  const toggle = () => {
    if (open) { setOpen(false); return }
    setRendered(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)))
  }
  return <div>
    <div className="flex justify-center">
      <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--paper)] px-4 py-2 text-xs font-bold text-[var(--brand-blue)] shadow-sm transition-colors hover:border-[var(--brand-blue)]" aria-expanded={open} onClick={toggle}>
        {open ? 'Ver menos' : 'Ver más estadísticas'}
        <ChevronDown size={14} className={clsx('transition-transform duration-300 motion-reduce:transition-none', open && 'rotate-180')} />
      </button>
    </div>
    <div className={clsx('grid transition-[grid-template-rows,opacity] duration-500 ease-out motion-reduce:transition-none', open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')} onTransitionEnd={(event) => { if (event.target === event.currentTarget && !open) setRendered(false) }}>
      <div className="min-h-0 overflow-hidden">
        {rendered ? <div className="space-y-4 pt-4">{children}</div> : null}
      </div>
    </div>
  </div>
}

function Card({ title, subtitle, children, className }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return <div className={clsx('paper-panel p-5', className)}><h3 className="font-display text-sm font-extrabold text-[var(--ink-primary)]">{title}</h3>{subtitle ? <p className="mt-1 text-xs text-[var(--ink-tertiary)]">{subtitle}</p> : null}<div className="mt-4">{children}</div></div>
}

function StatTile({ label, value, currency = 'PYG', plain, danger, children }: { label: string; value: number; currency?: string; plain?: boolean; danger?: boolean; children?: React.ReactNode }) {
  const animated = useCountUp(value)
  return <div className="paper-panel p-5"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--ink-muted)]">{label}</p><p className={clsx('mt-2 font-mono text-2xl font-bold tabular-nums', danger ? 'text-[var(--danger)]' : 'text-[var(--ink-primary)]')}>{plain ? Math.round(animated) : money(animated, currency)}</p><p className="mt-2 text-xs">{children}</p></div>
}

function RateTile({ rate, applied, billed, currency }: { rate: number; applied: number; billed: number; currency: string }) {
  const mounted = useMounted()
  const animated = useCountUp(rate)
  const radius = 26
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - (mounted ? Math.min(rate, 100) : 0) / 100)
  return <div className="paper-panel flex items-center gap-4 p-5">
    <svg width="68" height="68" viewBox="0 0 68 68" role="img" aria-label={`Tasa de cobro ${rate}%`} className="shrink-0 -rotate-90">
      <circle cx="34" cy="34" r={radius} fill="none" stroke="var(--viz-track)" strokeWidth="8" />
      <circle cx="34" cy="34" r={radius} fill="none" stroke="var(--viz-collected)" strokeWidth="8" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} className="transition-[stroke-dashoffset] duration-1000 ease-out motion-reduce:transition-none" />
    </svg>
    <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--ink-muted)]">Tasa de cobro</p><p className="mt-1 font-mono text-2xl font-bold tabular-nums text-[var(--ink-primary)]">{animated.toFixed(1).replace('.', ',')}%</p><p className="mt-1 truncate text-xs text-[var(--ink-tertiary)]">{money(applied, currency)} de {money(billed, currency)}</p></div>
  </div>
}

function TrendChart({ data, className }: { data: CollectionInsights; className?: string }) {
  const mounted = useMounted()
  const [hover, setHover] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)
  const max = niceMax(Math.max(...data.months.flatMap((item) => [item.billed, item.collected])))
  const ticks = [4, 3, 2, 1, 0].map((step) => (max / 4) * step)
  const hovered = hover === null ? null : data.months[hover]

  return <Card title="Facturado vs. cobrado" subtitle="Últimos 6 meses · facturado según vencimiento, cobrado según fecha de pago" className={className}>
    <div className="mb-3 flex flex-wrap items-center gap-4 text-xs font-semibold text-[var(--ink-secondary)]">
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--viz-billed)]" />Facturado</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--viz-collected)]" />Cobrado</span>
      <button type="button" className="ml-auto text-[11px] font-semibold text-[var(--brand-blue)]" onClick={() => setShowTable((value) => !value)}>{showTable ? 'Ver gráfico' : 'Ver tabla'}</button>
    </div>
    {showTable ? <table className="data-table"><thead><tr><th>Mes</th><th className="text-right">Facturado</th><th className="text-right">Cobrado</th></tr></thead><tbody>{data.months.map((item) => <tr key={item.key}><td className="capitalize">{monthLabel(item.key)} {item.key.slice(0, 4)}</td><td className="text-right font-mono">{money(item.billed, data.currency)}</td><td className="text-right font-mono">{money(item.collected, data.currency)}</td></tr>)}</tbody></table> : <div className="relative pl-12" onMouseLeave={() => setHover(null)}>
      <div className="pointer-events-none absolute bottom-6 left-0 right-0 top-0">
        {ticks.map((tick) => <div key={tick} className="absolute left-0 right-0 flex items-center" style={{ bottom: `${(tick / max) * 100}%` }}><span className="w-10 -translate-y-px pr-2 text-right font-mono text-[10px] text-[var(--ink-muted)]">{compact(tick)}</span><span className={clsx('h-px flex-1', tick === 0 ? 'bg-[var(--line-strong)]' : 'bg-[var(--line-soft)]')} /></div>)}
      </div>
      <div className="relative flex gap-2">
      {data.months.map((item, index) => <div key={item.key} className="relative z-10 flex flex-1 flex-col items-center" onMouseEnter={() => setHover(index)} onFocus={() => setHover(index)} tabIndex={0} aria-label={`${monthLabel(item.key)}: facturado ${money(item.billed, data.currency)}, cobrado ${money(item.collected, data.currency)}`}>
        <div className={clsx('flex h-52 w-full items-end justify-center gap-[2px] rounded-md transition-colors', hover === index && 'bg-[var(--viz-hover)]')}>
          {(['billed', 'collected'] as const).map((field, barIndex) => <div key={field} className="w-[34%] max-w-7 rounded-t-[4px] transition-[height] duration-700 ease-out motion-reduce:transition-none" style={{ height: mounted ? `${Math.max((item[field] / max) * 100, item[field] > 0 ? 1 : 0)}%` : '0%', transitionDelay: `${index * 70 + barIndex * 40}ms`, background: `var(--viz-${field})` }} />)}
        </div>
        <span className={clsx('mt-2 h-4 text-[11px] font-semibold capitalize', hover === index ? 'text-[var(--ink-primary)]' : 'text-[var(--ink-tertiary)]')}>{monthLabel(item.key)}</span>
      </div>)}
      {hovered && hover !== null ? <div className="pointer-events-none absolute top-0 z-20 w-48 rounded-lg border border-[var(--line)] bg-[var(--paper)] p-3 text-xs shadow-lg" style={{ left: `${((hover + 0.5) / data.months.length) * 100}%`, transform: hover >= data.months.length / 2 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)' }}>
        <p className="font-bold capitalize text-[var(--ink-primary)]">{monthLabel(hovered.key)} {hovered.key.slice(0, 4)}</p>
        <p className="mt-2 flex items-center justify-between gap-2 text-[var(--ink-secondary)]"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[var(--viz-billed)]" />Facturado</span><span className="font-mono font-bold text-[var(--ink-primary)]">{money(hovered.billed, data.currency)}</span></p>
        <p className="mt-1 flex items-center justify-between gap-2 text-[var(--ink-secondary)]"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[var(--viz-collected)]" />Cobrado</span><span className="font-mono font-bold text-[var(--ink-primary)]">{money(hovered.collected, data.currency)}</span></p>
      </div> : null}
      </div>
    </div>}
  </Card>
}

function AgingChart({ data, className }: { data: CollectionInsights; className?: string }) {
  const mounted = useMounted()
  const [report, setReport] = useState<string | null>(null)
  const max = Math.max(...data.aging.map((item) => item.amount), 1)
  const total = data.aging.reduce((sum, item) => sum + item.amount, 0)
  return <Card title="Antigüedad de la deuda" subtitle="Saldo pendiente según días de atraso · tocá un tramo para ver cada cliente" className={className}>
    {total <= 0 ? <p className="py-10 text-center text-sm text-[var(--ink-tertiary)]">No hay saldos pendientes. 🎉</p> : <ul className="space-y-1">
      {data.aging.map((item, index) => <li key={item.key}>
        <button type="button" disabled={!item.clients.length} onClick={() => setReport(item.key)} className="group block w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--viz-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-blue)] disabled:cursor-default disabled:hover:bg-transparent" title={`${item.label}: ${money(item.amount, data.currency)} en ${item.count} cargos de ${item.clients.length} clientes`}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs"><span className="inline-flex items-center gap-1 font-semibold text-[var(--ink-secondary)] group-hover:text-[var(--brand-blue)]">{item.label}{item.clients.length ? <span className="font-medium text-[var(--ink-muted)]">· {item.clients.length} {item.clients.length === 1 ? 'cliente' : 'clientes'}</span> : null}</span><span className="inline-flex items-center gap-1 font-mono font-bold tabular-nums text-[var(--ink-primary)]">{money(item.amount, data.currency)} <span className="font-sans font-medium text-[var(--ink-muted)]">· {total ? Math.round((item.amount / total) * 100) : 0}%</span>{item.clients.length ? <ChevronRight size={13} className="text-[var(--ink-muted)] group-hover:text-[var(--brand-blue)]" /> : null}</span></div>
          <div className="h-3 overflow-hidden rounded-[4px] bg-[var(--viz-track)]"><div className="h-full rounded-[4px] transition-[width] duration-700 ease-out group-hover:brightness-110 motion-reduce:transition-none" style={{ width: mounted ? `${(item.amount / max) * 100}%` : '0%', transitionDelay: `${index * 90}ms`, background: `var(--viz-seq-${index + 1})` }} /></div>
        </button>
      </li>)}
    </ul>}
    {report ? <AgingReport data={data} initialKey={report} onClose={() => setReport(null)} /> : null}
  </Card>
}

const lateText = (days: number) => days <= 0 ? 'Por vencer' : `${days} ${days === 1 ? 'día' : 'días'}`

/** Informe de antigüedad: clientes y saldo dentro de los tramos elegidos, con descarga en Excel. */
function AgingReport({ data, initialKey, onClose }: { data: CollectionInsights; initialKey: string; onClose: () => void }) {
  const [selected, setSelected] = useState<string[]>([initialKey])
  const [search, setSearch] = useState('')
  const toggle = (key: string) => setSelected((current) => current.includes(key) ? (current.length > 1 ? current.filter((item) => item !== key) : current) : [...current, key])
  const rows = useMemo(() => {
    const merged = new Map<string, CollectionAgingClient & { ranges: string[] }>()
    for (const bucket of data.aging) {
      if (!selected.includes(bucket.key)) continue
      for (const client of bucket.clients) {
        const row = merged.get(client.id)
        merged.set(client.id, row ? { ...row, amount: row.amount + client.amount, count: row.count + client.count, maxDaysLate: Math.max(row.maxDaysLate, client.maxDaysLate), ranges: [...row.ranges, bucket.label] } : { ...client, ranges: [bucket.label] })
      }
    }
    return [...merged.values()].sort((left, right) => right.amount - left.amount)
  }, [data.aging, selected])
  const needle = search.trim().toLowerCase()
  const visible = needle ? rows.filter((row) => row.name.toLowerCase().includes(needle) || (row.ruc ?? '').includes(needle)) : rows
  const total = visible.reduce((sum, row) => sum + row.amount, 0)
  const charges = visible.reduce((sum, row) => sum + row.count, 0)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const download = () => {
    const pyg = data.currency === 'PYG'
    const blob = buildXlsx('Antigüedad de la deuda', [
      { header: 'Cliente' }, { header: 'RUC' }, { header: 'DV' }, { header: 'Tramos' }, { header: 'Cargos', format: 'integer' },
      { header: 'Atraso máximo (días)', format: 'integer' }, { header: 'Saldo', format: pyg ? 'integer' : 'decimal' }, { header: 'Moneda' },
    ], visible.map((row) => [row.name, row.ruc, row.dv, row.ranges.join(' + '), row.count, Math.max(row.maxDaysLate, 0), pyg ? Math.round(row.amount) : Number(row.amount.toFixed(2)), data.currency]))
    const url = URL.createObjectURL(blob)
    const anchor = window.document.createElement('a')
    anchor.href = url
    anchor.download = `antiguedad-deuda-${data.aging.filter((bucket) => selected.includes(bucket.key)).map((bucket) => bucket.key.replace('+', '-mas')).join('_')}.xlsx`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-black/45 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section role="dialog" aria-modal="true" aria-labelledby="aging-report-title" className="my-auto flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--paper)] shadow-2xl animate-slide-up">
      <header className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
        <div className="min-w-0">
          <h2 id="aging-report-title" className="font-display text-lg font-extrabold text-[var(--ink-primary)]">Informe de antigüedad de la deuda</h2>
          <p className="text-xs text-[var(--ink-tertiary)]">Saldo pendiente de cada cliente en los tramos elegidos · {data.currency}</p>
        </div>
        <button type="button" className="rounded-lg p-2 text-[var(--ink-tertiary)] hover:bg-[var(--paper-soft)]" aria-label="Cerrar" onClick={onClose}><X size={18} /></button>
      </header>

      <div className="space-y-3 border-b border-[var(--line)] px-5 py-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Tramos incluidos">
          {data.aging.map((bucket, index) => {
            const active = selected.includes(bucket.key)
            return <button key={bucket.key} type="button" aria-pressed={active} disabled={!bucket.clients.length && !active} onClick={() => toggle(bucket.key)} className={clsx('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-40', active ? 'border-[var(--brand-blue)] bg-[var(--brand-blue)] text-white' : 'border-[var(--line)] bg-[var(--paper-soft)] text-[var(--ink-secondary)] hover:border-[var(--brand-blue)]')}>
              <span className="h-2 w-2 rounded-full" style={{ background: `var(--viz-seq-${index + 1})` }} />{bucket.label}
            </button>
          })}
        </div>
        <label className="relative block"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" /><input className="ctrl-input pl-8" placeholder="Buscar cliente o RUC" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {visible.length ? <table className="data-table">
          <thead><tr><th>Cliente / RUC</th><th className="text-right">Cargos</th><th className="text-right">Atraso máx.</th><th className="text-right">Saldo</th></tr></thead>
          <tbody>{visible.map((row) => <tr key={row.id}>
            <td><Link href={`/clients/${row.id}`} className="font-bold text-[var(--ink-primary)] hover:text-[var(--brand-blue)]">{row.name}</Link><p className="mt-0.5 text-[11px] text-[var(--ink-tertiary)]">RUC {row.ruc ? `${row.ruc}${row.dv ? `-${row.dv}` : ''}` : 'sin registrar'}</p></td>
            <td className="text-right tabular-nums">{row.count}</td>
            <td className={clsx('text-right tabular-nums', row.maxDaysLate > 60 && 'font-bold text-[var(--danger)]')}>{lateText(row.maxDaysLate)}</td>
            <td className="text-right font-mono font-bold tabular-nums">{money(row.amount, data.currency)}</td>
          </tr>)}</tbody>
        </table> : <p className="py-10 text-center text-sm text-[var(--ink-tertiary)]">{needle ? 'Ningún cliente coincide con la búsqueda.' : 'No hay clientes con deuda en estos tramos.'}</p>}
      </div>

      <footer className="flex flex-col gap-3 border-t border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-[var(--ink-tertiary)]"><strong className="text-[var(--ink-primary)]">{visible.length}</strong> {visible.length === 1 ? 'cliente' : 'clientes'} · {charges} cargos · total <strong className="font-mono text-[var(--ink-primary)]">{money(total, data.currency)}</strong></p>
        <div className="flex gap-2"><button type="button" className="btn-secondary" onClick={onClose}>Cerrar</button><button type="button" className="btn-primary" disabled={!visible.length} onClick={download}><Download size={15} /> Descargar Excel</button></div>
      </footer>
    </section>
  </div>
}

function TopDebtors({ data }: { data: CollectionInsights }) {
  const mounted = useMounted()
  const max = Math.max(...data.topDebtors.map((item) => item.outstanding), 1)
  return <Card title="Clientes con mayor deuda" subtitle="Los 5 saldos pendientes más altos · la parte más oscura ya está vencida">
    {!data.topDebtors.length ? <p className="py-6 text-center text-sm text-[var(--ink-tertiary)]">Ningún cliente tiene deuda pendiente.</p> : <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
      {data.topDebtors.map((debtor, index) => <li key={debtor.id}>
        <Link href={`/clients/${debtor.id}`} className="group block rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-blue)]">
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs"><span className="truncate font-bold text-[var(--ink-primary)] group-hover:text-[var(--brand-blue)]">{debtor.name}</span><span className="shrink-0 font-mono font-bold tabular-nums text-[var(--ink-primary)]">{money(debtor.outstanding, data.currency)}</span></div>
          <div className="flex h-3 overflow-hidden rounded-[4px] bg-[var(--viz-track)]" title={`Vencido ${money(debtor.overdue, data.currency)} · por vencer ${money(debtor.outstanding - debtor.overdue, data.currency)}`}>
            <div className="flex h-full gap-[2px] transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: mounted ? `${(debtor.outstanding / max) * 100}%` : '0%', transitionDelay: `${index * 90}ms` }}>
              {debtor.overdue > 0 ? <div className="h-full rounded-[4px] bg-[var(--viz-seq-5)]" style={{ width: `${(debtor.overdue / debtor.outstanding) * 100}%` }} /> : null}
              {debtor.outstanding - debtor.overdue > 0 ? <div className="h-full flex-1 rounded-[4px] bg-[var(--viz-seq-2)]" /> : null}
            </div>
          </div>
          {debtor.overdue > 0 ? <p className="mt-1 text-[11px] text-[var(--ink-tertiary)]">{money(debtor.overdue, data.currency)} vencido</p> : null}
        </Link>
      </li>)}
    </ul>}
  </Card>
}
