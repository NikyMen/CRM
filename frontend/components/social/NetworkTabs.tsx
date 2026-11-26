'use client'

import type { ReactNode } from 'react'
import clsx from 'clsx'
import { TopbarContent } from '@/components/romez/Topbar'
import { NETWORKS, NetworkLogo, type NetworkKey } from './networks'

export type NetworkTab<T extends string> = { key: T; label: string; badge?: number }

/** Encabezado de la sección de una red (en la barra superior) con sus pestañas. */
export function NetworkHeader<T extends string>({ network, subtitle, tabs, active, onChange, action }: { network: NetworkKey; subtitle: string; tabs?: NetworkTab<T>[]; active?: T; onChange?: (tab: T) => void; action?: ReactNode }) {
  const info = NETWORKS[network]
  return (
    <TopbarContent>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: info.soft, color: info.color }}><NetworkLogo network={network} size={18} /></span>
      <div className="min-w-0 flex-1">
        <p className="hidden truncate text-xs font-medium text-[var(--ink-tertiary)] sm:block">{subtitle}</p>
        <h1 className="truncate font-display text-base font-bold leading-tight text-[var(--ink-primary)]">{info.label}</h1>
      </div>
      {tabs?.length ? (
        <div className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--paper-inset)] p-1" role="tablist" aria-label={`Secciones de ${info.label}`}>
          {tabs.map((tab) => (
            <button key={tab.key} type="button" role="tab" aria-selected={active === tab.key} onClick={() => onChange?.(tab.key)} className={clsx('inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors sm:px-4', active === tab.key ? 'bg-[var(--paper)] text-[var(--ink-primary)] shadow-sm' : 'text-[var(--ink-tertiary)] hover:text-[var(--ink-primary)]')}>
              {tab.label}
              {tab.badge ? <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold text-white" style={{ background: info.color }}>{tab.badge}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      {action}
    </TopbarContent>
  )
}
