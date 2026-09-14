'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { History, X } from 'lucide-react'
import clsx from 'clsx'
import { salesApi } from '@/lib/api'
import type { Sale, SaleHistoryEntry, SaleStatus } from '@/types'
import { formatDate, formatMoney } from '@/lib/format'
import { StatusPill } from '@/components/romez/OperationalUI'

export const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  DRAFT: 'Borrador',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Anulada',
}

export const SALE_STATUS_TONE: Record<SaleStatus, 'warning' | 'success' | 'danger'> = {
  DRAFT: 'warning',
  CONFIRMED: 'success',
  CANCELLED: 'danger',
}

export function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">{label}</dt>
      <dd className={clsx('mt-1 font-mono tabular-nums', strong ? 'text-lg font-bold text-[var(--ink-primary)]' : 'text-[var(--ink-secondary)]')}>{value}</dd>
    </div>
  )
}

export function SaleDetail({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const items = [...sale.items].sort((a, b) => a.position - b.position)
  const historyQuery = useQuery<SaleHistoryEntry[]>({ queryKey: ['sale-history', sale.id], queryFn: () => salesApi.history(sale.id).then((response) => response.data) })
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={`Factura ${sale.number}`} onClick={onClose}>
      <div className="paper-panel max-h-[90vh] w-full max-w-2xl overflow-y-auto" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-[var(--line-soft)] px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--ink-muted)]">Factura N° {String(sale.number).padStart(5, '0')}</p>
            <h2 className="mt-1 font-display text-base font-extrabold text-[var(--ink-primary)]">{sale.company?.name ?? 'Sin cliente'}</h2>
            <p className="mt-1 text-xs text-[var(--ink-tertiary)]">{formatDate(sale.soldAt, { day: '2-digit', month: '2-digit', year: 'numeric' })}{sale.company?.ruc ? ` · RUC ${sale.company.ruc}` : ''}{sale.reference ? ` · ${sale.reference}` : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill tone={SALE_STATUS_TONE[sale.status]}>{SALE_STATUS_LABEL[sale.status]}</StatusPill>
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-[var(--ink-tertiary)] hover:bg-[var(--paper-soft)]" aria-label="Cerrar"><X size={17} /></button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Descripción</th><th className="text-right">Cant.</th><th className="text-right">Precio</th><th className="text-right">Total</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.description}</td>
                  <td className="text-right font-mono tabular-nums">{Number(item.quantity)}</td>
                  <td className="text-right font-mono tabular-nums">{formatMoney(item.unitPrice, sale.currency)}</td>
                  <td className="text-right font-mono font-bold tabular-nums">{formatMoney(item.total, sale.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="grid grid-cols-2 gap-4 border-t border-[var(--line-soft)] px-5 py-4 sm:grid-cols-4">
          <Total label="Subtotal" value={formatMoney(sale.subtotal, sale.currency)} />
          <Total label="Descuento" value={formatMoney(sale.discount, sale.currency)} />
          <Total label="Impuesto" value={formatMoney(sale.taxAmount, sale.currency)} />
          <Total label="Total" value={formatMoney(sale.total, sale.currency)} strong />
        </dl>
        {sale.notes ? <p className="border-t border-[var(--line-soft)] px-5 py-4 text-sm text-[var(--ink-secondary)] whitespace-pre-wrap">{sale.notes}</p> : null}
        <div className="border-t border-[var(--line-soft)] px-5 py-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold text-[var(--ink-secondary)]"><History size={14} /> Actividad</div>
          {historyQuery.isLoading ? <p className="text-xs text-[var(--ink-muted)]">Cargando actividad…</p> : historyQuery.data?.length ? <div className="space-y-3">{historyQuery.data.map((entry) => <div key={entry.id} className="flex gap-3 text-xs"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--brand-blue)]" /><div><p className="font-semibold text-[var(--ink-primary)]">{entry.summary}</p><p className="mt-0.5 text-[var(--ink-tertiary)]">{formatDate(entry.createdAt, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}{entry.actor ? ` · ${entry.actor.firstName} ${entry.actor.lastName ?? ''}` : ''}</p></div></div>)}</div> : <p className="text-xs text-[var(--ink-muted)]">Sin actividad registrada.</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--line-soft)] px-5 py-4">
          {sale.company ? <Link className="btn-secondary" href={`/clients/${sale.company.id}`}>Ver cliente</Link> : null}
          <button type="button" className="btn-primary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
