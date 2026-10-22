'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, X } from 'lucide-react'
import clsx from 'clsx'
import { collectionsApi, teamApi } from '@/lib/api'
import { auth } from '@/lib/auth'
import type { Client, Role } from '@/types'
import { fullName, getErrorMessage } from '@/lib/format'
import { addDays, formatPromiseDate, invalidatePromises, paraguayToday } from '@/lib/payment-promises'
import { ClientPicker } from '@/components/romez/ClientPicker'
import { DateField } from '@/components/romez/DateField'
import { MoneyInput } from '@/components/romez/MoneyInput'

type Member = { id: string; role: Role; user: { id: string; firstName: string; lastName?: string | null; email: string } }

export type PromiseTarget = {
  client?: Pick<Client, 'id' | 'name' | 'ruc'> | null
  /** Chat del WhatsApp de Cobranzas donde el cliente prometió el pago. */
  chatId?: string | null
}

/** Popup para agendar "el cliente me dijo que paga tal día". */
export function PaymentPromiseDialog({ target, onClose }: { target: PromiseTarget | null; onClose: () => void }) {
  if (!target) return null
  return <PaymentPromiseDialogContent target={target} onClose={onClose} />
}

function PaymentPromiseDialogContent({ target, onClose }: { target: PromiseTarget; onClose: () => void }) {
  const queryClient = useQueryClient()
  const user = auth.get()
  const canAssign = user?.role === 'owner' || user?.role === 'admin'
  const today = paraguayToday()
  const [form, setForm] = useState({ companyId: target.client?.id ?? '', promisedDate: '', amount: '', currency: 'PYG', note: '', assignedUserId: user?.userId ?? '' })
  const teamQuery = useQuery<Member[]>({ queryKey: ['team'], queryFn: () => teamApi.list().then((response) => response.data), enabled: canAssign })
  const assignable = (teamQuery.data ?? []).filter((member) => member.role !== 'viewer')

  const save = useMutation({
    mutationFn: () => collectionsApi.createPromise({
      companyId: form.companyId,
      promisedDate: form.promisedDate,
      amount: form.amount || null,
      currency: form.currency,
      note: form.note.trim() || null,
      chatId: target.chatId ?? null,
      ...(canAssign && form.assignedUserId ? { assignedUserId: form.assignedUserId } : {}),
    }),
    onSuccess: () => { invalidatePromises(queryClient); onClose() },
  })

  const pastDate = Boolean(form.promisedDate) && form.promisedDate < today
  const disabled = !form.companyId || !form.promisedDate || pastDate || save.isPending
  const shortcuts: Array<[string, string]> = [['Hoy', today], ['Mañana', addDays(today, 1)], ['En 3 días', addDays(today, 3)], ['En una semana', addDays(today, 7)]]

  return <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-black/45 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !save.isPending) onClose() }}>
    <section role="dialog" aria-modal="true" aria-labelledby="promise-dialog-title" className="my-auto w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--paper)] shadow-2xl animate-slide-up">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--brand-blue)]/10 text-[var(--brand-blue)]"><CalendarClock size={18} /></span>
          <div className="min-w-0">
            <h2 id="promise-dialog-title" className="font-display text-lg font-extrabold text-[var(--ink-primary)]">Agendar promesa de pago</h2>
            <p className="truncate text-xs text-[var(--ink-tertiary)]">Ese día te aparece en Cobranzas y en la campanita para volver a escribirle.</p>
          </div>
        </div>
        <button type="button" className="rounded-lg p-2 text-[var(--ink-tertiary)] hover:bg-[var(--paper-soft)]" aria-label="Cerrar" disabled={save.isPending} onClick={onClose}><X size={18} /></button>
      </header>

      <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <span className="mb-1.5 block text-[11px] font-bold text-[var(--ink-secondary)]">Cliente</span>
          <ClientPicker initialClient={target.client ?? undefined} value={form.companyId} invalidHint="Elegí un cliente de la lista para poder agendar la promesa." onChange={(companyId) => setForm((current) => ({ ...current, companyId }))} />
        </div>
        <div className="sm:col-span-2">
          <span className="mb-1.5 block text-[11px] font-bold text-[var(--ink-secondary)]">¿Qué día dijo que paga?</span>
          <div className="mb-2 flex flex-wrap gap-2">{shortcuts.map(([label, day]) => <button key={label} type="button" onClick={() => setForm((current) => ({ ...current, promisedDate: day }))} className={clsx('rounded-full border px-3 py-1.5 text-xs font-bold transition-colors', form.promisedDate === day ? 'border-[var(--brand-blue)] bg-[var(--brand-blue)] text-white' : 'border-[var(--line)] bg-[var(--paper-soft)] text-[var(--ink-secondary)] hover:border-[var(--brand-blue)]')}>{label}</button>)}</div>
          <DateField value={form.promisedDate} onChange={(promisedDate) => setForm((current) => ({ ...current, promisedDate }))} />
          {pastDate ? <p className="mt-1.5 text-[11px] font-semibold text-[var(--danger)]">La fecha no puede ser anterior a hoy.</p> : form.promisedDate ? <p className="mt-1.5 text-[11px] font-semibold text-[var(--ink-secondary)]">Recordatorio para el {formatPromiseDate(form.promisedDate, { weekday: 'long', day: 'numeric', month: 'long' })}.</p> : null}
        </div>
        <Field label="Monto prometido (opcional)"><MoneyInput value={form.amount} decimals={form.currency !== 'PYG'} onChange={(amount) => setForm((current) => ({ ...current, amount }))} /></Field>
        <Field label="Moneda"><select className="ctrl-input" value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value, amount: event.target.value === 'PYG' ? current.amount.split('.')[0] : current.amount }))}><option value="PYG">Guaraníes (PYG)</option><option value="USD">Dólares (USD)</option></select></Field>
        <div className="sm:col-span-2"><Field label="Nota (opcional)"><textarea className="ctrl-input min-h-[72px] py-2" maxLength={1000} placeholder="Ej.: paga por transferencia después de cobrar." value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} /></Field></div>
        {canAssign ? <div className="sm:col-span-2"><Field label="Responsable del recordatorio"><select className="ctrl-input" value={form.assignedUserId} onChange={(event) => setForm((current) => ({ ...current, assignedUserId: event.target.value }))}>{assignable.some((member) => member.user.id === user?.userId) ? null : <option value={user?.userId ?? ''}>Yo</option>}{assignable.map((member) => <option key={member.user.id} value={member.user.id}>{member.user.id === user?.userId ? `Yo (${fullName(member.user)})` : fullName(member.user)}</option>)}</select></Field></div> : null}
      </div>

      <footer className="flex flex-col gap-3 border-t border-[var(--line)] bg-[var(--paper-soft)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        {save.error ? <p role="alert" className="text-xs font-semibold text-[var(--danger)]">{getErrorMessage(save.error, 'No pudimos agendar la promesa.')}</p> : <span />}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" disabled={save.isPending} onClick={onClose}>Cancelar</button>
          <button type="button" className="btn-primary" disabled={disabled} onClick={() => save.mutate()}><CalendarClock size={15} />{save.isPending ? 'Guardando…' : 'Agendar'}</button>
        </div>
      </footer>
    </section>
  </div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[11px] font-bold text-[var(--ink-secondary)]">{label}</span>{children}</label>
}
