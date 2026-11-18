'use client'

import type { ReactNode } from 'react'
import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'

// Piezas visuales del módulo /asistente. Los colores salen de los tokens de globals.css (.assistant-ui), que ya
// contemplan el modo oscuro.

export type Tone = 'neutral' | 'good' | 'warn' | 'bad'

const TONE_CHIP: Record<Tone, string> = {
  neutral: 'bg-[var(--ast-accent-soft)] text-[var(--ast-accent)]',
  good: 'bg-[var(--success-paper)] text-[var(--success)]',
  warn: 'bg-[var(--warning-paper)] text-[var(--warning)]',
  bad: 'bg-[var(--danger-paper)] text-[var(--danger)]',
}

/** Cuadradito redondeado con un ícono, del color del tono. */
export function IconChip({ icon: Icon, tone = 'neutral', size = 'md' }: { icon: LucideIcon; tone?: Tone; size?: 'sm' | 'md' | 'lg' }) {
  const box = { sm: 'h-8 w-8 rounded-2xl', md: 'h-10 w-10 rounded-2xl', lg: 'h-12 w-12 rounded-2xl' }[size]
  return (
    <span className={clsx('grid shrink-0 place-items-center', box, TONE_CHIP[tone])} aria-hidden>
      <Icon size={size === 'sm' ? 15 : size === 'lg' ? 22 : 18} strokeWidth={2.1} />
    </span>
  )
}

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
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 outline-none focus-visible:ring-4 focus-visible:ring-[var(--ast-accent-soft)] disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-[var(--success)]' : 'bg-[var(--line-strong)]',
      )}
    >
      <span className={clsx('inline-block h-5 w-5 rounded-full bg-[#ffffff] shadow-[0_2px_6px_rgba(0,0,0,.22)] transition-transform duration-200 ease-out', checked ? 'translate-x-6' : 'translate-x-1')} />
    </button>
  )
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx('block space-y-2', className)}>
      <span className="block text-[13px] font-semibold text-[var(--ink-primary)]">{label}</span>
      {children}
      {hint ? <span className="block text-xs leading-relaxed text-[var(--ink-tertiary)]">{hint}</span> : null}
    </label>
  )
}

export function SwitchRow({ title, description, checked, onChange, disabled, icon }: { title: string; description?: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; icon?: LucideIcon }) {
  return (
    <div className={clsx('flex items-center justify-between gap-4 rounded-2xl border px-4 py-4 transition-colors sm:px-5', checked ? 'border-[var(--success-line)] bg-[var(--success-paper)]' : 'border-[var(--line-soft)] bg-[var(--paper-soft)]')}>
      <div className="flex min-w-0 items-center gap-3.5">
        {icon ? <IconChip icon={icon} tone={checked ? 'good' : 'neutral'} size="sm" /> : null}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--ink-primary)]">{title}</p>
          {description ? <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-tertiary)]">{description}</p> : null}
        </div>
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} disabled={disabled} />
    </div>
  )
}

/** Aviso suave (advertencia o éxito) con ícono. */
export function Notice({ icon: Icon, tone = 'warn', children }: { icon: LucideIcon; tone?: 'warn' | 'good'; children: ReactNode }) {
  return (
    <div className={clsx('flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-sm leading-relaxed', tone === 'warn' ? 'border-[var(--warning-line)] bg-[var(--warning-paper)] text-[var(--warning)]' : 'border-[var(--success-line)] bg-[var(--success-paper)] text-[var(--success)]')}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  )
}

/** Estado encendido/apagado con punto (late cuando está encendido). */
export function LiveBadge({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold', on ? 'bg-[var(--success-paper)] text-[var(--success)]' : 'bg-[var(--paper-inset)] text-[var(--ink-tertiary)]')}>
      <span className={clsx('h-2 w-2 rounded-full', on ? 'ast-pulse bg-[var(--success)]' : 'bg-[var(--ink-muted)]')} />
      {children}
    </span>
  )
}

const KPI_VALUE: Record<Tone, string> = {
  neutral: 'text-[var(--ink-primary)]',
  good: 'text-[var(--success)]',
  warn: 'text-[var(--warning)]',
  bad: 'text-[var(--danger)]',
}

export function Kpi({ label, value, hint, tone = 'neutral', icon }: { label: string; value: string; hint?: string; tone?: Tone; icon?: LucideIcon }) {
  return (
    <div className="ast-card flex flex-col gap-4 p-4 last:odd:col-span-2 sm:p-5 xl:last:odd:col-span-1">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium leading-snug text-[var(--ink-secondary)]">{label}</p>
        {icon ? <IconChip icon={icon} tone={tone} size="sm" /> : null}
      </div>
      <div>
        <p className={clsx('font-display text-[1.875rem] font-bold leading-none tracking-[-0.02em] tabular-nums', KPI_VALUE[tone])}>{value}</p>
        {hint ? <p className="mt-2 text-xs leading-relaxed text-[var(--ink-tertiary)]">{hint}</p> : null}
      </div>
    </div>
  )
}

/** Burbuja estilo WhatsApp: muestra el texto exacto que recibiría el cliente. */
export function Bubble({ text, muted }: { text: string; muted?: boolean }) {
  return (
    <div className="rounded-2xl rounded-tl-lg bg-[#e7f3ec] px-3.5 py-3 shadow-sm ring-1 ring-black/5">
      <p className={clsx('whitespace-pre-wrap break-words text-[13px] leading-relaxed', muted ? 'italic text-[#5d6b63]' : 'text-[#1b2b22]')}>{text}</p>
    </div>
  )
}

export function Bar({ value, max, tone = 'brand' }: { value: number; max: number; tone?: 'brand' | 'warn' | 'good' }) {
  const color = { brand: 'bg-[var(--ast-accent-2)]', warn: 'bg-[var(--ast-offhours)]', good: 'bg-[var(--success)]' }[tone]
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--ast-track)]">
      <div className={clsx('h-full rounded-full transition-[width] duration-700 ease-out', color)} style={{ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%` }} />
    </div>
  )
}

/** Tarjeta de sección: título con ícono opcional, sin línea divisoria y con aire. */
export function Panel({ title, description, action, children, className, icon }: { title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string; icon?: LucideIcon }) {
  return (
    <section className={clsx('ast-card', className)}>
      <header className="flex flex-col gap-3 px-5 pt-5 sm:flex-row sm:items-start sm:justify-between sm:px-7 sm:pt-6">
        <div className="flex min-w-0 items-start gap-3.5">
          {icon ? <IconChip icon={icon} /> : null}
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold tracking-[-0.01em] text-[var(--ink-primary)]">{title}</h2>
            {description ? <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[var(--ink-tertiary)]">{description}</p> : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className="px-5 pb-5 pt-5 sm:px-7 sm:pb-7">{children}</div>
    </section>
  )
}
