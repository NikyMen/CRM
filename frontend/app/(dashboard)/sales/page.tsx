'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArchiveRestore, Ban, CheckCircle2, ChevronLeft, ChevronRight, Download, History, Plus, Search, Trash2, X } from 'lucide-react'
import clsx from 'clsx'
import { auth } from '@/lib/auth'
import { salesApi, type SalePayload } from '@/lib/api'
import type { PaginatedResult, Sale, SaleHistoryEntry, SaleStatus, SaleSummary } from '@/types'
import { formatDate, formatMoney, getErrorMessage } from '@/lib/format'
import { EmptyState, ErrorState, LoadingState, PageFrame, PageHeader, SectionPanel, StatusPill } from '@/components/romez/OperationalUI'
import { ClientPicker } from '@/components/romez/ClientPicker'
import { DateField } from '@/components/romez/DateField'
import { ReceiptScanner } from '@/components/romez/ReceiptScanner'

const PAGE_SIZE = 25

const STATUS_LABEL: Record<SaleStatus, string> = {
  DRAFT: 'Borrador',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Anulada',
}

const STATUS_TONE: Record<SaleStatus, 'warning' | 'success' | 'danger'> = {
  DRAFT: 'warning',
  CONFIRMED: 'success',
  CANCELLED: 'danger',
}

type DraftItem = { description: string; quantity: string; unitPrice: string }

function paraguayBusinessDate() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Asuncion', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

const BUSINESS_DATE = paraguayBusinessDate()
const EMPTY_ITEM: DraftItem = { description: '', quantity: '1', unitPrice: '' }
const EMPTY_FORM = {
  companyId: '',
  soldAt: BUSINESS_DATE,
  currency: 'PYG',
  discount: '',
  taxAmount: '',
  reference: '',
  notes: '',
}

/** Subtotal en vivo del formulario; el backend vuelve a calcular al guardar. */
function draftSubtotal(items: DraftItem[]) {
  return items.reduce((total, item) => {
    const quantity = Number(item.quantity.replace(',', '.'))
    const unitPrice = Number(item.unitPrice.replace(',', '.'))
    if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return total
    return total + quantity * unitPrice
  }, 0)
}

export default function SalesPage() {
  const queryClient = useQueryClient()
  const role = auth.get()?.role
  const canManage = role === 'owner' || role === 'admin'
  const canWrite = Boolean(role && role !== 'viewer')

  const [status, setStatus] = useState('')
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [showTrash, setShowTrash] = useState(false)
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [items, setItems] = useState<DraftItem[]>([{ ...EMPTY_ITEM }])

  const summaryQuery = useQuery<SaleSummary>({
    queryKey: ['sales-summary'],
    queryFn: () => salesApi.summary().then((response) => response.data),
  })

  const salesQuery = useQuery<PaginatedResult<Sale>>({
    queryKey: ['sales', { status, page, showTrash }],
    queryFn: () => salesApi.list({ status: (status || undefined) as SaleStatus | undefined, page, limit: PAGE_SIZE, includeDeleted: showTrash }).then((response) => response.data),
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['sales'] })
    queryClient.invalidateQueries({ queryKey: ['sales-summary'] })
  }

  const closeForm = () => { setFormOpen(false); setForm(EMPTY_FORM); setItems([{ ...EMPTY_ITEM }]) }

  const createSale = useMutation({
    mutationFn: () => {
      const payload: SalePayload = {
        companyId: form.companyId,
        soldAt: form.soldAt,
        currency: form.currency,
        discount: form.discount || undefined,
        taxAmount: form.taxAmount || undefined,
        reference: form.reference || null,
        notes: form.notes || null,
        items: items.map((item) => ({ description: item.description.trim(), quantity: item.quantity, unitPrice: item.unitPrice })),
      }
      return salesApi.create(payload)
    },
    onSuccess: () => { refresh(); closeForm() },
  })

  const confirmSale = useMutation({ mutationFn: (id: string) => salesApi.confirm(id), onSuccess: refresh })
  const cancelSale = useMutation({ mutationFn: (id: string) => salesApi.cancel(id), onSuccess: refresh })
  const removeSale = useMutation({ mutationFn: (id: string) => salesApi.remove(id), onSuccess: refresh })
  const restoreSale = useMutation({ mutationFn: (id: string) => salesApi.restore(id), onSuccess: refresh })

  const exportSales = useMutation({
    mutationFn: () => salesApi.export({ status: (status || undefined) as SaleStatus | undefined }),
    onSuccess: (response) => {
      const url = URL.createObjectURL(response.data as Blob)
      const anchor = window.document.createElement('a')
      anchor.href = url
      anchor.download = `ventas-romez-${BUSINESS_DATE}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
    },
  })

  const selectedSale = salesQuery.data?.items.find((sale) => sale.id === selectedSaleId)
  const visibleSales = useMemo(() => {
    const term = search.trim().toLowerCase()
    const all = salesQuery.data?.items ?? []
    if (!term) return all
    return all.filter((sale) => [sale.company?.name, sale.company?.ruc, sale.reference, String(sale.number)]
      .some((value) => value?.toLowerCase().includes(term)))
  }, [salesQuery.data?.items, search])

  const subtotal = draftSubtotal(items)
  const total = subtotal - Number(form.discount || 0) + Number(form.taxAmount || 0)
  const formReady = Boolean(form.companyId) && items.every((item) => item.description.trim() && item.quantity && item.unitPrice) && total > 0

  return (
    <PageFrame className="max-w-[1800px]">
      <PageHeader
        eyebrow="Facturación"
        title="Ventas"
        action={(
          <div className="flex flex-wrap gap-2">
            <button type="button" className={clsx('btn-secondary', showTrash && 'border-[var(--brand-blue)] text-[var(--brand-blue)]')} onClick={() => { setShowTrash((current) => !current); setPage(0); setSelectedSaleId(null) }}>
              {showTrash ? <ArchiveRestore size={15} /> : <Trash2 size={15} />} {showTrash ? 'Volver a ventas' : 'Papelera'}
            </button>
            <button type="button" className="btn-secondary" disabled={exportSales.isPending || showTrash} onClick={() => exportSales.mutate()}>
              <Download size={15} /> {exportSales.isPending ? 'Exportando…' : 'Exportar CSV'}
            </button>
            {canWrite ? (
              <button type="button" className="btn-primary" onClick={() => setFormOpen(true)}>
                <Plus size={15} /> Nueva venta
              </button>
            ) : null}
          </div>
        )}
      />

      {summaryQuery.isError ? (
        <ErrorState message={getErrorMessage(summaryQuery.error)} retry={() => summaryQuery.refetch()} />
      ) : (
        <section className="grid overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-4">
          {(summaryQuery.data?.currencies ?? []).map((row) => (
            <SaleMetric key={row.currency} label={`Facturado ${row.currency}`} value={formatMoney(row.confirmedTotal, row.currency)} />
          ))}
          <SaleMetric label="Ventas confirmadas" value={String((summaryQuery.data?.currencies ?? []).reduce((count, row) => count + row.confirmedCount, 0))} />
          <SaleMetric label="Borradores" value={String(summaryQuery.data?.draftCount ?? 0)} tone={(summaryQuery.data?.draftCount ?? 0) > 0 ? 'warning' : undefined} />
        </section>
      )}

      {formOpen ? (
        <SectionPanel
          title="Nueva venta"
          action={<button type="button" className="btn-secondary" onClick={closeForm}><X size={14} /> Cerrar</button>}
        >
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2">
              <span className="mb-1.5 block text-[11px] font-bold text-[var(--ink-secondary)]">Cliente</span>
              <ClientPicker value={form.companyId} onChange={(clientId) => setForm((current) => ({ ...current, companyId: clientId }))} />
            </div>
            <Field label="Fecha (día / mes / año)">
              <DateField value={form.soldAt} onChange={(iso) => setForm((current) => ({ ...current, soldAt: iso }))} />
            </Field>
            <Field label="Moneda">
              <select className="ctrl-input" value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value }))}>
                <option value="PYG">PYG</option>
                <option value="USD">USD</option>
              </select>
            </Field>
            <Field label="Descuento">
              <input type="number" min="0" className="ctrl-input" value={form.discount} onChange={(event) => setForm((current) => ({ ...current, discount: event.target.value }))} />
            </Field>
            <Field label="Impuesto (IVA)">
              <input type="number" min="0" className="ctrl-input" value={form.taxAmount} onChange={(event) => setForm((current) => ({ ...current, taxAmount: event.target.value }))} />
            </Field>
            <div>
              <span className="mb-1.5 block text-[11px] font-bold text-[var(--ink-secondary)]">Referencia / comprobante</span>
              <input className="ctrl-input font-mono tabular-nums" value={form.reference} onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))} placeholder="001-001-0000123" />
              <div className="mt-2">
                <ReceiptScanner onDetected={(value) => setForm((current) => ({ ...current, reference: value }))} />
              </div>
            </div>
            <Field label="Notas">
              <input className="ctrl-input" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
            </Field>
          </div>

          <div className="border-t border-[var(--line-soft)] p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-bold text-[var(--ink-secondary)]">Ítems de la venta</p>
              <button type="button" className="btn-secondary" onClick={() => setItems((current) => [...current, { ...EMPTY_ITEM }])}>
                <Plus size={14} /> Agregar ítem
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[1fr_110px_150px_40px]">
                  <input className="ctrl-input" placeholder="Descripción" value={item.description} onChange={(event) => setItems((current) => current.map((row, position) => position === index ? { ...row, description: event.target.value } : row))} />
                  <input className="ctrl-input" type="number" min="0" step="0.001" placeholder="Cant." value={item.quantity} onChange={(event) => setItems((current) => current.map((row, position) => position === index ? { ...row, quantity: event.target.value } : row))} />
                  <input className="ctrl-input" type="number" min="0" placeholder="Precio unitario" value={item.unitPrice} onChange={(event) => setItems((current) => current.map((row, position) => position === index ? { ...row, unitPrice: event.target.value } : row))} />
                  <button type="button" className="btn-secondary justify-center" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((_, position) => position !== index))} aria-label={`Quitar ítem ${index + 1}`}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <dl className="mt-4 flex flex-wrap gap-6 text-sm">
              <Total label="Subtotal" value={formatMoney(subtotal, form.currency)} />
              <Total label="Descuento" value={formatMoney(Number(form.discount || 0), form.currency)} />
              <Total label="Impuesto" value={formatMoney(Number(form.taxAmount || 0), form.currency)} />
              <Total label="Total" value={formatMoney(total, form.currency)} strong />
            </dl>
          </div>

          <div className="flex flex-col gap-3 border-t border-[var(--line-soft)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            {createSale.error ? <p className="text-xs font-semibold text-[var(--danger)]">{getErrorMessage(createSale.error, 'No pudimos guardar la venta.')}</p> : <span />}
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" onClick={closeForm}>Cancelar</button>
              <button type="button" className="btn-primary" disabled={!formReady || createSale.isPending} onClick={() => createSale.mutate()}>
                {createSale.isPending ? 'Guardando…' : 'Guardar borrador'}
              </button>
            </div>
          </div>
        </SectionPanel>
      ) : null}

      <SectionPanel title={showTrash ? 'Papelera' : 'Ventas'}>
        <div className="grid gap-3 border-b border-[var(--line-soft)] p-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
          <label className="relative block w-full min-w-0">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" />
            <input className="ctrl-input !min-h-11 w-full pl-10 text-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar en esta página por cliente, RUC, comprobante o número de venta…" />
          </label>
          <select className="ctrl-input !min-h-11 w-full" value={status} onChange={(event) => { setStatus(event.target.value); setPage(0) }}>
            <option value="">Todos los estados</option>
            <option value="DRAFT">Borradores</option>
            <option value="CONFIRMED">Confirmadas</option>
            <option value="CANCELLED">Anuladas</option>
          </select>
        </div>

        {salesQuery.isLoading ? <LoadingState /> : null}
        {salesQuery.isError ? <ErrorState message={getErrorMessage(salesQuery.error)} retry={() => salesQuery.refetch()} /> : null}

        {!salesQuery.isLoading && !salesQuery.isError ? (
          visibleSales.length ? (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>Estado</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSales.map((sale) => (
                    <tr key={sale.id} onClick={(event) => { if ((event.target as HTMLElement).closest('a, button')) return; setSelectedSaleId(sale.id) }} className="cursor-pointer hover:bg-[var(--paper-soft)]">
                      <td className="font-mono text-xs font-bold tabular-nums">{String(sale.number).padStart(5, '0')}</td>
                      <td className="font-mono text-xs tabular-nums">{formatDate(sale.soldAt, { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                      <td>
                        {sale.company ? (
                          <Link className="font-bold text-[var(--ink-primary)] hover:text-[var(--brand-blue)]" href={`/clients/${sale.company.id}`}>{sale.company.name}</Link>
                        ) : '—'}
                        <p className="mt-0.5 text-[11px] text-[var(--ink-tertiary)]">{sale.reference || `${sale.items.length} ítem${sale.items.length === 1 ? '' : 's'}`}</p>
                      </td>
                      <td><StatusPill tone={STATUS_TONE[sale.status]}>{STATUS_LABEL[sale.status]}</StatusPill></td>
                      <td className="text-right font-mono font-bold tabular-nums text-[var(--ink-primary)]">{formatMoney(sale.total, sale.currency)}</td>
                      <td>
                        <div className="flex justify-end gap-1">
                          {canWrite && sale.status === 'DRAFT' ? (
                            <button type="button" className="btn-secondary" disabled={confirmSale.isPending} onClick={() => confirmSale.mutate(sale.id)}>
                              <CheckCircle2 size={14} /> Confirmar
                            </button>
                          ) : null}
                          {canManage && sale.status === 'CONFIRMED' ? (
                            <button type="button" className="btn-secondary" disabled={cancelSale.isPending} onClick={() => cancelSale.mutate(sale.id)}>
                              <Ban size={14} /> Anular
                            </button>
                          ) : null}
                          {canManage && showTrash ? (
                            <button type="button" className="btn-secondary" disabled={restoreSale.isPending} onClick={() => restoreSale.mutate(sale.id)}>
                              <ArchiveRestore size={14} /> Restaurar
                            </button>
                          ) : null}
                          {canManage && !showTrash ? (
                            <button type="button" className="btn-secondary" disabled={removeSale.isPending} onClick={() => removeSale.mutate(sale.id)} aria-label={`Eliminar venta ${sale.number}`}>
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Sin ventas registradas" description="Cargá la primera venta para empezar a ver el facturado del estudio." />
          )
        ) : null}

        {cancelSale.error || removeSale.error || restoreSale.error || confirmSale.error ? (
          <p className="border-t border-[var(--line-soft)] px-5 py-3 text-xs font-semibold text-[var(--danger)]">
            {getErrorMessage(cancelSale.error ?? removeSale.error ?? restoreSale.error ?? confirmSale.error, 'No pudimos actualizar la venta.')}
          </p>
        ) : null}

        <Pager data={salesQuery.data} page={page} setPage={setPage} />
      </SectionPanel>

      {selectedSale ? <SaleDetail sale={selectedSale} onClose={() => setSelectedSaleId(null)} /> : null}
    </PageFrame>
  )
}

function SaleDetail({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const items = [...sale.items].sort((a, b) => a.position - b.position)
  const historyQuery = useQuery<SaleHistoryEntry[]>({ queryKey: ['sale-history', sale.id], queryFn: () => salesApi.history(sale.id).then((response) => response.data) })
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={`Venta ${sale.number}`} onClick={onClose}>
      <div className="paper-panel max-h-[90vh] w-full max-w-2xl overflow-y-auto" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-[var(--line-soft)] px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--ink-muted)]">Venta N° {String(sale.number).padStart(5, '0')}</p>
            <h2 className="mt-1 font-display text-base font-extrabold text-[var(--ink-primary)]">{sale.company?.name ?? 'Sin cliente'}</h2>
            <p className="mt-1 text-xs text-[var(--ink-tertiary)]">{formatDate(sale.soldAt, { day: '2-digit', month: '2-digit', year: 'numeric' })}{sale.company?.ruc ? ` · RUC ${sale.company.ruc}` : ''}{sale.reference ? ` · ${sale.reference}` : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill tone={STATUS_TONE[sale.status]}>{STATUS_LABEL[sale.status]}</StatusPill>
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

function SaleMetric({ label, value, tone }: { label: string; value: string; tone?: 'warning' }) {
  return (
    <div className="bg-[var(--paper)] p-5">
      <p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--ink-muted)]">{label}</p>
      <p className={clsx('mt-2 font-mono text-xl font-bold tabular-nums text-[var(--ink-primary)]', tone === 'warning' && 'text-[var(--warning)]')}>{value}</p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[11px] font-bold text-[var(--ink-secondary)]">{label}</span>{children}</label>
}

function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">{label}</dt>
      <dd className={clsx('mt-1 font-mono tabular-nums', strong ? 'text-lg font-bold text-[var(--ink-primary)]' : 'text-[var(--ink-secondary)]')}>{value}</dd>
    </div>
  )
}

function Pager({ data, page, setPage }: { data?: PaginatedResult<Sale>; page: number; setPage: React.Dispatch<React.SetStateAction<number>> }) {
  if (!data || data.totalPages <= 1) return null
  return (
    <div className="flex flex-col gap-3 border-t border-[var(--line-soft)] px-4 py-3 text-xs text-[var(--ink-tertiary)] sm:flex-row sm:items-center sm:justify-between">
      <p><strong className="text-[var(--ink-primary)]">{data.total}</strong> ventas · página {data.page + 1} de {data.totalPages}</p>
      <div className="flex gap-2">
        <button type="button" className="btn-secondary" disabled={page <= 0} onClick={() => setPage((current) => Math.max(0, current - 1))}><ChevronLeft size={14} /> Anterior</button>
        <button type="button" className="btn-secondary" disabled={page + 1 >= data.totalPages} onClick={() => setPage((current) => current + 1)}>Siguiente <ChevronRight size={14} /></button>
      </div>
    </div>
  )
}
