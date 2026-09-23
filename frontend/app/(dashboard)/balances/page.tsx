'use client'

import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, HandCoins, Plus, Search, Trash2 } from 'lucide-react'
import { auth } from '@/lib/auth'
import { collectionsApi } from '@/lib/api'
import type { ClientBalance, ClientBalances, PaginatedResult, Receivable } from '@/types'
import { formatDate, formatMoney, getErrorMessage } from '@/lib/format'
import { RECEIVABLE_LABELS } from '@/lib/collection-labels'
import { EmptyState, ErrorState, LoadingState, PageFrame, PageHeader, SectionPanel, StatusPill } from '@/components/romez/OperationalUI'
import { ClientPicker } from '@/components/romez/ClientPicker'
import { DateField } from '@/components/romez/DateField'
import { MoneyInput } from '@/components/romez/MoneyInput'
import { useConfirmDelete } from '@/components/romez/ConfirmDelete'
import { PaymentDialog, invalidateCollections, type PaymentTarget } from '@/components/romez/PaymentDialog'

const NUMERIC_DATE: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }

function paraguayBusinessDate() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Asuncion', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

const BALANCE_FORM = { companyId: '', description: 'Saldo anterior', amount: '', currency: 'PYG', dueDate: paraguayBusinessDate(), reference: '' }
const rowKey = (item: Pick<ClientBalance, 'companyId' | 'currency'>) => `${item.companyId}:${item.currency}`

export default function BalancesPage() {
  const queryClient = useQueryClient()
  const role = auth.get()?.role
  const canWrite = Boolean(role && role !== 'viewer')
  const canManage = role === 'owner' || role === 'admin'
  const confirmDelete = useConfirmDelete()
  const [paymentTarget, setPaymentTarget] = useState<PaymentTarget | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(BALANCE_FORM)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const balancesQuery = useQuery<ClientBalances>({ queryKey: ['balances'], queryFn: () => collectionsApi.balances().then((response) => response.data) })

  const createBalance = useMutation({
    mutationFn: () => collectionsApi.createReceivable({ ...form, reference: form.reference || undefined }),
    onSuccess: () => {
      invalidateCollections(queryClient)
      setForm(BALANCE_FORM)
      setShowForm(false)
    },
  })

  // Eliminar un concepto lo manda a la papelera de Cobranzas (se puede restaurar).
  const removeReceivable = useMutation({ mutationFn: (id: string) => collectionsApi.removeReceivable(id), onSuccess: () => invalidateCollections(queryClient) })
  const askRemove = async (item: Receivable) => {
    const paid = Number(item.paidAmount) > 0
    const message = `Se enviará a la papelera "${item.description}"${item.company ? ` de ${item.company.name}` : ''} por ${formatMoney(item.amount, item.currency)}.${paid ? ` Lo ya cobrado (${formatMoney(item.paidAmount, item.currency)}) queda como saldo a favor del cliente.` : ''}`
    if (await confirmDelete(message)) removeReceivable.mutate(item.id)
  }

  const items = useMemo(() => {
    const term = search.trim().toLowerCase()
    const all = balancesQuery.data?.items ?? []
    if (!term) return all
    return all.filter((item) => [item.company?.name, item.company?.ruc].some((value) => value?.toLowerCase().includes(term)))
  }, [balancesQuery.data?.items, search])

  return <PageFrame>
    <PageHeader eyebrow="Cuenta corriente" title="Saldos" description="Deudas pendientes de cada cliente. Al cobrar se cancelan automáticamente, empezando por la más antigua de la misma moneda; desde el detalle podés cobrar o eliminar cada concepto." action={canWrite ? <button type="button" className="btn-primary" onClick={() => setShowForm(true)}><Plus size={15} /> Cargar saldo</button> : undefined} />

    {showForm ? <SectionPanel title="Cargar saldo" description="Registra una deuda del cliente. Queda pendiente hasta que se cobre desde Cobranzas.">
      <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2"><span className="mb-1.5 block text-[11px] font-bold text-[var(--ink-secondary)]">Cliente</span><ClientPicker value={form.companyId} invalidHint="Elegí un cliente de la lista para poder guardar el saldo." onChange={(companyId) => setForm((current) => ({ ...current, companyId }))} /></div>
        <Field label="Concepto"><input className="ctrl-input" maxLength={250} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></Field>
        <Field label="Importe"><MoneyInput value={form.amount} decimals={form.currency !== 'PYG'} onChange={(amount) => setForm((current) => ({ ...current, amount }))} /></Field>
        <Field label="Moneda"><select className="ctrl-input" value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value, amount: event.target.value === 'PYG' ? current.amount.split('.')[0] : current.amount }))}><option value="PYG">Guaraníes (PYG)</option><option value="USD">Dólares (USD)</option></select></Field>
        <Field label="Vencimiento (día / mes / año)"><DateField value={form.dueDate} onChange={(dueDate) => setForm((current) => ({ ...current, dueDate }))} /></Field>
        <Field label="Referencia (opcional)"><input className="ctrl-input" maxLength={180} value={form.reference} onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))} /></Field>
      </div>
      <div className="flex flex-col gap-3 border-t border-[var(--line-soft)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        {createBalance.error ? <p role="alert" className="text-xs font-semibold text-[var(--danger)]">{getErrorMessage(createBalance.error, 'No pudimos guardar el saldo.')}</p> : <span />}
        <div className="flex gap-2"><button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setForm(BALANCE_FORM) }}>Cancelar</button><button type="button" className="btn-primary" disabled={!form.companyId || !form.description.trim() || !form.amount || Number(form.amount) <= 0 || !form.dueDate || createBalance.isPending} onClick={() => createBalance.mutate()}>{createBalance.isPending ? 'Guardando…' : 'Guardar saldo'}</button></div>
      </div>
    </SectionPanel> : null}

    {balancesQuery.data?.totals.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{balancesQuery.data.totals.map((total) => <div key={total.currency} className="rounded-lg border border-[var(--line)] bg-[var(--paper)] p-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Saldo pendiente · {total.currency}</p>
      <p className="mt-1 font-mono text-xl font-bold tabular-nums text-[var(--ink-primary)]">{formatMoney(total.outstanding, total.currency)}</p>
      <p className="mt-1 text-xs text-[var(--ink-tertiary)]">{total.clients} {total.clients === 1 ? 'cliente' : 'clientes'} · vencido <span className="font-semibold text-[var(--danger)]">{formatMoney(total.overdue, total.currency)}</span></p>
    </div>)}</div> : null}

    <SectionPanel title="Deudas por cliente">
      <div className="border-b border-[var(--line-soft)] p-3"><label className="relative block w-full min-w-0"><Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" /><input className="ctrl-input !min-h-11 w-full pl-10 text-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por cliente o RUC…" /></label></div>
      {balancesQuery.isLoading ? <LoadingState label="Calculando saldos…" /> : balancesQuery.isError ? <ErrorState message={getErrorMessage(balancesQuery.error, 'No pudimos cargar los saldos.')} retry={() => balancesQuery.refetch()} /> : items.length ? <div className="overflow-x-auto"><table className="data-table">
        <thead><tr><th /><th>Cliente</th><th className="text-right">Deudas</th><th>Más antigua</th><th className="text-right">Importe</th><th className="text-right">Cobrado</th><th className="text-right">Vencido</th><th className="text-right">Saldo</th>{canWrite ? <th /> : null}</tr></thead>
        <tbody>{items.map((item) => {
          const key = rowKey(item)
          const open = expanded === key
          return <Fragment key={key}>
            <tr className="cursor-pointer hover:bg-[var(--paper-soft)]" onClick={(event) => { if (!(event.target as HTMLElement).closest('a, button')) setExpanded(open ? null : key) }}>
              <td className="w-8 text-[var(--ink-tertiary)]">{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
              <td>{item.company && !item.company.isArchived ? <Link className="font-bold text-[var(--ink-primary)] hover:text-[var(--brand-blue)]" href={`/clients/${item.company.id}`}>{item.company.name}</Link> : <p className="font-bold text-[var(--ink-primary)]">{item.company?.name ?? '—'}</p>}{item.company?.isArchived ? <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--danger)]">Cliente eliminado</p> : item.company?.ruc ? <p className="mt-0.5 text-[11px] text-[var(--ink-tertiary)]">RUC {item.company.ruc}{item.company.dv ? `-${item.company.dv}` : ''}</p> : null}</td>
              <td className="text-right tabular-nums">{item.openCount}</td>
              <td>{item.oldestDueDate ? formatDate(item.oldestDueDate, NUMERIC_DATE) : '—'}</td>
              <td className="text-right font-mono tabular-nums">{formatMoney(item.amount, item.currency)}</td>
              <td className="text-right font-mono tabular-nums">{formatMoney(item.paidAmount, item.currency)}</td>
              <td className={Number(item.overdue) > 0 ? 'text-right font-mono font-bold tabular-nums text-[var(--danger)]' : 'text-right font-mono tabular-nums'}>{formatMoney(item.overdue, item.currency)}</td>
              <td className="text-right font-mono font-bold tabular-nums text-[var(--ink-primary)]">{formatMoney(item.outstanding, item.currency)}</td>
              {canWrite ? <td className="text-right">{item.company && !item.company.isArchived ? <button type="button" className="btn-primary whitespace-nowrap" onClick={() => setPaymentTarget({ client: item.company, currency: item.currency })}><HandCoins size={14} /> Cobrar</button> : null}</td> : null}
            </tr>
            {open ? <tr><td colSpan={canWrite ? 9 : 8} className="bg-[var(--paper-soft)] !p-0"><BalanceDetail balance={item} canWrite={canWrite} canManage={canManage} onPay={(receivable) => setPaymentTarget({ receivable, client: receivable.company, currency: receivable.currency })} onRemove={askRemove} removing={removeReceivable.isPending} /></td></tr> : null}
          </Fragment>
        })}</tbody>
      </table></div> : <EmptyState title={search.trim() ? 'Sin coincidencias' : 'Sin saldos pendientes'} description={search.trim() ? 'Ningún cliente con deuda coincide con la búsqueda.' : 'Cuando cargues un saldo, la deuda del cliente aparecerá acá hasta que se cobre.'} />}
    </SectionPanel>
    {removeReceivable.error ? <p role="alert" className="text-xs font-semibold text-[var(--danger)]">{getErrorMessage(removeReceivable.error, 'No pudimos eliminar el concepto.')}</p> : null}
    <PaymentDialog target={paymentTarget} onClose={() => setPaymentTarget(null)} />
  </PageFrame>
}

function BalanceDetail({ balance, canWrite, canManage, onPay, onRemove, removing }: { balance: ClientBalance; canWrite: boolean; canManage: boolean; onPay: (item: Receivable) => void; onRemove: (item: Receivable) => void; removing: boolean }) {
  const query = useQuery<PaginatedResult<Receivable>>({
    queryKey: ['receivables', { companyId: balance.companyId, currency: balance.currency, scope: 'balances' }],
    queryFn: () => collectionsApi.listReceivables({ companyId: balance.companyId, currency: balance.currency, page: 0, limit: 100 }).then((response) => response.data),
  })
  if (query.isLoading) return <LoadingState label="Cargando deudas…" />
  if (query.isError) return <ErrorState message={getErrorMessage(query.error)} retry={() => query.refetch()} />
  const open = (query.data?.items ?? []).filter((item) => item.status === 'PENDING' || item.status === 'PARTIAL' || item.status === 'OVERDUE')
  if (!open.length) return <p className="px-6 py-4 text-xs text-[var(--ink-tertiary)]">No hay deudas abiertas.</p>
  return <div className="px-4 py-3"><table className="data-table"><thead><tr><th>Concepto</th><th>Vencimiento</th><th>Estado</th><th className="text-right">Importe</th><th className="text-right">Cobrado</th><th className="text-right">Saldo</th>{canWrite ? <th /> : null}</tr></thead><tbody>{open.map((item) => <tr key={item.id}>
    <td><p className="font-semibold text-[var(--ink-primary)]">{item.description}</p>{item.reference || item.periodKey ? <p className="mt-0.5 text-[11px] text-[var(--ink-tertiary)]">{item.reference || item.periodKey}</p> : null}</td>
    <td className={item.status === 'OVERDUE' ? 'font-bold text-[var(--danger)]' : ''}>{formatDate(item.dueDate, NUMERIC_DATE)}</td>
    <td><StatusPill tone={item.status === 'OVERDUE' ? 'danger' : 'warning'}>{RECEIVABLE_LABELS[item.status] ?? item.status}</StatusPill></td>
    <td className="text-right font-mono tabular-nums">{formatMoney(item.amount, item.currency)}</td>
    <td className="text-right font-mono tabular-nums">{formatMoney(item.paidAmount, item.currency)}</td>
    <td className="text-right font-mono font-bold tabular-nums">{formatMoney(item.outstanding, item.currency)}</td>
    {canWrite ? <td className="text-right"><div className="flex justify-end gap-2">{item.company && !item.company.isArchived ? <button type="button" className="btn-secondary whitespace-nowrap" onClick={() => onPay(item)}><HandCoins size={14} /> Cobrar</button> : null}{canManage ? <button type="button" className="btn-danger" disabled={removing} aria-label={`Eliminar ${item.description}`} onClick={() => onRemove(item)}><Trash2 size={14} /></button> : null}</div></td> : null}
  </tr>)}</tbody></table></div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-[11px] font-bold text-[var(--ink-secondary)]">{label}</span>{children}</label> }
