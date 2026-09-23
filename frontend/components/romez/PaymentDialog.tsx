'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { HandCoins, Paperclip, Upload, X } from 'lucide-react'
import clsx from 'clsx'
import { clientsApi, collectionsApi } from '@/lib/api'
import type { Client, ClientBalances, Receivable } from '@/types'
import { formatMoney, getErrorMessage } from '@/lib/format'
import { ClientPicker } from '@/components/romez/ClientPicker'
import { DateField } from '@/components/romez/DateField'
import { MoneyInput } from '@/components/romez/MoneyInput'

/** Qué se va a cobrar: un cliente (desde Saldos), un cargo puntual o nada (cobro libre). */
export type PaymentTarget = {
  client?: Pick<Client, 'id' | 'name' | 'ruc'> | null
  currency?: string
  receivable?: Receivable | null
}

function paraguayBusinessDate() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Asuncion', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** Todo lo que muestra saldos o movimientos de cobranzas se refresca después de un cambio. */
export function invalidateCollections(queryClient: QueryClient) {
  for (const key of ['balances', 'collections-summary', 'collections-insights', 'collections-trash', 'receivables', 'payments', 'recurring-charges', 'client-summary', 'client-documents']) {
    queryClient.invalidateQueries({ queryKey: [key] })
  }
}

export function PaymentDialog({ target, onClose }: { target: PaymentTarget | null; onClose: () => void }) {
  if (!target) return null
  return <PaymentDialogContent target={target} onClose={onClose} />
}

function PaymentDialogContent({ target, onClose }: { target: PaymentTarget; onClose: () => void }) {
  const queryClient = useQueryClient()
  const receivable = target.receivable ?? null
  const initialClient = target.client ?? receivable?.company ?? null
  const initialCurrency = receivable?.currency ?? target.currency ?? 'PYG'
  const [form, setForm] = useState({
    companyId: initialClient?.id ?? '',
    currency: initialCurrency,
    amount: receivable ? (initialCurrency === 'PYG' ? receivable.outstanding.split('.')[0] : receivable.outstanding) : '',
    paidAt: paraguayBusinessDate(),
    method: 'TRANSFERENCIA',
    reference: '',
  })
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [noReceipt, setNoReceipt] = useState(false)
  // Evita subir dos veces el mismo comprobante si el pago falla y se reintenta.
  const uploadedReceipt = useRef<{ file: File; id: string } | null>(null)

  const balancesQuery = useQuery<ClientBalances>({ queryKey: ['balances'], queryFn: () => collectionsApi.balances().then((response) => response.data) })
  const selectedBalance = balancesQuery.data?.items.find((item) => item.companyId === form.companyId && item.currency === form.currency)
  const appliesToTarget = Boolean(receivable && receivable.companyId === form.companyId && receivable.currency === form.currency)

  const save = useMutation({
    mutationFn: async () => {
      let documentId: string | undefined
      if (receiptFile) {
        const cached = uploadedReceipt.current
        documentId = cached?.file === receiptFile ? cached.id : (await clientsApi.uploadDocument(form.companyId, receiptFile, 'Comprobante de pago')).data.id
        uploadedReceipt.current = { file: receiptFile, id: documentId }
      }
      const allocations = receivable && appliesToTarget
        ? [{ receivableId: receivable.id, amount: Number(form.amount) <= Number(receivable.outstanding) ? form.amount : receivable.outstanding }]
        : undefined
      return collectionsApi.createPayment({ ...form, allocations, documentId, documentWaived: !receiptFile && noReceipt })
    },
    onSuccess: () => { invalidateCollections(queryClient); onClose() },
  })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !save.isPending) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, save.isPending])

  const missingReceipt = !receiptFile && !noReceipt
  const disabled = !form.companyId || !form.amount || Number(form.amount) <= 0 || !form.paidAt || missingReceipt || save.isPending

  return <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/45 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !save.isPending) onClose() }}>
    <section role="dialog" aria-modal="true" aria-labelledby="payment-dialog-title" className="my-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--paper)] shadow-2xl animate-slide-up">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--brand-blue)]/10 text-[var(--brand-blue)]"><HandCoins size={18} /></span>
          <div className="min-w-0">
            <h2 id="payment-dialog-title" className="font-display text-lg font-extrabold text-[var(--ink-primary)]">Cobrar</h2>
            {receivable ? <p className="truncate text-xs text-[var(--ink-tertiary)]">{receivable.description}</p> : null}
          </div>
        </div>
        <button type="button" className="rounded-lg p-2 text-[var(--ink-tertiary)] hover:bg-[var(--paper-soft)]" aria-label="Cerrar" disabled={save.isPending} onClick={onClose}><X size={18} /></button>
      </header>

      <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <span className="mb-1.5 block text-[11px] font-bold text-[var(--ink-secondary)]">Cliente</span>
          <ClientPicker initialClient={initialClient} value={form.companyId} invalidHint="Elegí un cliente de la lista para poder guardar el cobro." onChange={(companyId) => setForm((current) => ({ ...current, companyId }))} />
          {appliesToTarget && receivable ? <p className="mt-1.5 text-[11px] font-semibold text-[var(--ink-secondary)]">Se aplica a «{receivable.description}», saldo <span className="font-mono">{formatMoney(receivable.outstanding, receivable.currency)}</span>. Lo que exceda queda como saldo a favor.</p>
            : form.companyId && balancesQuery.data ? <p className="mt-1.5 text-[11px] font-semibold text-[var(--ink-secondary)]">{selectedBalance ? <>Saldo pendiente: <span className="font-mono">{formatMoney(selectedBalance.outstanding, selectedBalance.currency)}</span> en {selectedBalance.openCount} {selectedBalance.openCount === 1 ? 'deuda' : 'deudas'}. El cobro cancela primero la más antigua.</> : `Sin saldo pendiente en ${form.currency}; el cobro quedará como saldo a favor.`}</p> : null}
        </div>
        <Field label="Importe"><MoneyInput autoFocus={Boolean(initialClient)} value={form.amount} decimals={form.currency !== 'PYG'} onChange={(amount) => setForm((current) => ({ ...current, amount }))} /></Field>
        <Field label="Moneda"><select className="ctrl-input" value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value, amount: event.target.value === 'PYG' ? current.amount.split('.')[0] : current.amount }))}><option value="PYG">Guaraníes (PYG)</option><option value="USD">Dólares (USD)</option></select></Field>
        <Field label="Fecha (día / mes / año)"><DateField value={form.paidAt} onChange={(paidAt) => setForm((current) => ({ ...current, paidAt }))} /></Field>
        <Field label="Medio"><select className="ctrl-input" value={form.method} onChange={(event) => setForm((current) => ({ ...current, method: event.target.value }))}><option value="TRANSFERENCIA">Transferencia</option><option value="EFECTIVO">Efectivo</option><option value="CHEQUE">Cheque</option><option value="OTRO">Otro</option></select></Field>
        <div className="sm:col-span-2"><Field label="Referencia (opcional)"><input className="ctrl-input" maxLength={180} value={form.reference} onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))} /></Field></div>

        <div className="sm:col-span-2">
          <span className="mb-1.5 block text-[11px] font-bold text-[var(--ink-secondary)]">Comprobante del cobro</span>
          <div className={clsx('flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between', missingReceipt ? 'border-[var(--warning-line)]' : 'border-[var(--line)]')}>
            {receiptFile ? <div className="flex min-w-0 items-center gap-2"><Paperclip size={15} className="shrink-0 text-[var(--brand-blue)]" /><span className="truncate text-sm font-semibold text-[var(--ink-primary)]">{receiptFile.name}</span><button type="button" className="btn-secondary !min-h-7 !px-2 text-xs" onClick={() => setReceiptFile(null)}>Quitar</button></div>
              : <label className={clsx('btn-secondary w-fit', noReceipt ? 'pointer-events-none opacity-50' : 'cursor-pointer')}><Upload size={14} /> Subir comprobante<input type="file" className="sr-only" disabled={noReceipt} accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv" onChange={(event) => { const selected = event.target.files?.[0]; if (selected) { setReceiptFile(selected); setNoReceipt(false) } event.target.value = '' }} /></label>}
            <label className="flex items-center gap-2 text-sm text-[var(--ink-secondary)]"><input type="checkbox" checked={noReceipt} onChange={(event) => { setNoReceipt(event.target.checked); if (event.target.checked) setReceiptFile(null) }} /> No subo comprobante</label>
          </div>
          <p className={clsx('mt-1.5 text-[11px]', missingReceipt ? 'font-semibold text-[var(--warning)]' : 'text-[var(--ink-tertiary)]')}>{missingReceipt ? 'Para guardar, subí el comprobante o marcá que no lo subís.' : receiptFile ? 'Se guarda también en los documentos del legajo del cliente.' : 'Quedará registrado que el cobro se cargó sin comprobante.'}</p>
        </div>
      </div>

      <footer className="flex flex-col gap-3 border-t border-[var(--line)] bg-[var(--paper-soft)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        {save.error ? <p role="alert" className="text-xs font-semibold text-[var(--danger)]">{getErrorMessage(save.error, 'No pudimos guardar el cobro.')}</p> : <span />}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" disabled={save.isPending} onClick={onClose}>Cancelar</button>
          <button type="button" className="btn-primary" disabled={disabled} onClick={() => save.mutate()}><HandCoins size={15} />{save.isPending ? 'Guardando…' : 'Registrar cobro'}</button>
        </div>
      </footer>
    </section>
  </div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[11px] font-bold text-[var(--ink-secondary)]">{label}</span>{children}</label>
}
