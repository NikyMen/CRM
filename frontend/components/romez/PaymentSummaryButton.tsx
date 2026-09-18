'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { CalendarDays, Download, X } from 'lucide-react'
import clsx from 'clsx'
import { collectionsApi } from '@/lib/api'
import { getErrorMessage } from '@/lib/format'

type QuickPeriod = 'all' | 'month' | 'previous-month' | 'quarter' | 'year'

function paraguayToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date()) }
function formatUtcDate(value: Date) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(value) }
function quickRange(period: QuickPeriod) {
  const today = paraguayToday()
  const [year, month] = today.split('-').map(Number)
  if (period === 'all') return {}
  if (period === 'year') return { from: `${year}-01-01`, to: `${year}-12-31` }
  if (period === 'quarter') return { from: formatUtcDate(new Date(Date.UTC(year, month - 3, 1))), to: today }
  const current = new Date(Date.UTC(year, month - 1, 1))
  if (period === 'previous-month') current.setUTCMonth(current.getUTCMonth() - 1)
  return { from: formatUtcDate(current), to: formatUtcDate(new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0))) }
}

export function PaymentSummaryButton({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false)
  const [period, setPeriod] = useState<QuickPeriod>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const download = useMutation({
    mutationFn: () => collectionsApi.paymentSummaryPdf(clientId, from || to ? { from: from || undefined, to: to || undefined } : quickRange(period)),
    onSuccess: ({ data }) => { const url = URL.createObjectURL(data); const link = document.createElement('a'); link.href = url; link.download = 'resumen-cuenta-romez.pdf'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setOpen(false) },
  })
  const choosePeriod = (next: QuickPeriod) => { setPeriod(next); setFrom(''); setTo('') }
  const hasInvalidRange = Boolean(from && to && from > to)
  return <><button type="button" className="btn-secondary" onClick={() => setOpen(true)}><Download size={16} />Cargar resumen</button>{open ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !download.isPending) setOpen(false) }}><section role="dialog" aria-modal="true" aria-labelledby="summary-title" className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--paper)] shadow-2xl animate-slide-up"><header className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><div className="flex items-center gap-3"><CalendarDays className="text-[var(--brand-blue)]" size={20} /><h2 id="summary-title" className="font-display text-lg font-extrabold text-[var(--ink-primary)]">Cargar resumen</h2></div><button type="button" className="rounded-lg p-2 text-[var(--ink-tertiary)] hover:bg-[var(--paper-soft)]" aria-label="Cerrar" onClick={() => setOpen(false)} disabled={download.isPending}><X size={18} /></button></header><div className="space-y-6 px-5 py-5"><div><p className="text-xs font-extrabold uppercase tracking-wider text-[var(--ink-tertiary)]">Período rápido</p><div className="mt-3 flex flex-wrap gap-2">{([['all', 'Todo'], ['month', 'Este mes'], ['previous-month', 'Mes anterior'], ['quarter', 'Últimos 3 meses'], ['year', 'Este año']] as Array<[QuickPeriod, string]>).map(([value, label]) => <button key={value} type="button" onClick={() => choosePeriod(value)} className={clsx('rounded-full border px-4 py-2 text-xs font-extrabold transition-all duration-200', period === value && !from && !to ? 'border-[var(--brand-blue)] bg-[var(--brand-blue)] text-white shadow-sm' : 'border-[var(--line)] bg-[var(--paper-soft)] text-[var(--ink-secondary)] hover:border-[var(--brand-blue)]')}>{label}</button>)}</div></div><div><p className="text-xs font-extrabold uppercase tracking-wider text-[var(--ink-tertiary)]">O elegí un rango personalizado</p><div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-3"><label className="grid gap-1.5 text-xs font-bold text-[var(--ink-secondary)]">Desde<input type="date" className="ctrl-input" value={from} onChange={(event) => setFrom(event.target.value)} /></label><span className="pb-3 text-[var(--ink-tertiary)]">→</span><label className="grid gap-1.5 text-xs font-bold text-[var(--ink-secondary)]">Hasta<input type="date" className="ctrl-input" value={to} onChange={(event) => setTo(event.target.value)} /></label></div>{hasInvalidRange ? <p role="alert" className="mt-2 text-xs font-semibold text-[var(--danger)]">La fecha desde no puede ser posterior a hasta.</p> : <p className="mt-3 text-center text-xs text-[var(--ink-tertiary)]">El documento incluye movimientos y totales del período elegido.</p>}</div>{download.isError ? <p role="alert" className="text-xs font-semibold text-[var(--danger)]">{getErrorMessage(download.error, 'No se pudo generar el resumen.')}</p> : null}</div><footer className="flex justify-end gap-2 border-t border-[var(--line)] bg-[var(--paper-soft)] px-5 py-4"><button type="button" className="btn-secondary" onClick={() => setOpen(false)} disabled={download.isPending}>Cancelar</button><button type="button" className="btn-primary" onClick={() => download.mutate()} disabled={hasInvalidRange || download.isPending}><Download size={16} />{download.isPending ? 'Generando…' : 'Generar resumen'}</button></footer></section></div> : null}</>
}
