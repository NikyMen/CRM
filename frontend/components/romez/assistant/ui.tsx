'use client'

import type { ReactNode } from 'react'
import clsx from 'clsx'
import { SectionPanel } from '@/components/romez/OperationalUI'

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'border-[var(--success)] bg-[var(--success)]' : 'border-[var(--line-strong)] bg-[var(--paper-inset)]',
      )}
    >
      <span className={clsx('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-6' : 'translate-x-1')} />
    </button>
  )
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx('block space-y-1.5', className)}>
      <span className="block text-xs font-extrabold uppercase tracking-wide text-[var(--ink-secondary)]">{label}</span>
      {children}
      {hint ? <span className="block text-xs font-medium text-[var(--ink-tertiary)]">{hint}</span> : null}
    </label>
  )
}

export function SwitchRow({ title, description, checked, onChange, disabled }: { title: string; description?: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-[var(--line-soft)] bg-[var(--paper-soft)] px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-bold text-[var(--ink-primary)]">{title}</p>
        {description ? <p className="mt-0.5 text-xs font-medium text-[var(--ink-tertiary)]">{description}</p> : null}
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} disabled={disabled} />
    </div>
  )
}

export function Kpi({ label, value, hint, tone = 'neutral' }: { label: string; value: string; hint?: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const color = { neutral: 'text-[var(--ink-primary)]', good: 'text-[var(--success)]', warn: 'text-[var(--warning)]', bad: 'text-[var(--danger)]' }[tone]
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4">
      <p className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--ink-tertiary)]">{label}</p>
      <p className={clsx('font-display mt-1.5 text-2xl font-extrabold tabular-nums', color)}>{value}</p>
      {hint ? <p className="mt-1 text-xs font-medium text-[var(--ink-tertiary)]">{hint}</p> : null}
    </div>
  )
}

/** Burbuja estilo WhatsApp: muestra el texto exacto que recibiría el cliente. */
export function Bubble({ text, muted }: { text: string; muted?: boolean }) {
  return (
    <div className="rounded-xl bg-[#e7f3ec] p-3 shadow-sm ring-1 ring-black/5">
      <p className={clsx('whitespace-pre-wrap break-words text-[13px] leading-relaxed', muted ? 'italic text-[var(--ink-tertiary)]' : 'text-[#1b2b22]')}>{text}</p>
    </div>
  )
}

export function Bar({ value, max, tone = 'brand' }: { value: number; max: number; tone?: 'brand' | 'warn' | 'good' }) {
  const color = { brand: 'bg-[var(--brand-navy)]', warn: 'bg-[#c2571a]', good: 'bg-[var(--success)]' }[tone]
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--paper-inset)]">
      <div className={clsx('h-full rounded-full transition-[width] duration-500', color)} style={{ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%` }} />
    </div>
  )
}

/** SectionPanel con relleno interno en el contenido. */
export function Panel({ title, description, action, children, className }: { title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <SectionPanel title={title} description={description} action={action} className={className}>
      <div className="p-4 sm:p-5">{children}</div>
    </SectionPanel>
  )
}
