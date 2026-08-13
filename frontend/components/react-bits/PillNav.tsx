'use client'

import clsx from 'clsx'

export function PillNav<T extends string>({ items, active, onChange }: { items: { id: T; label: string; icon?: React.ElementType }[]; active: T; onChange: (id: T) => void }) {
  return <div className="rb-pill-nav">{items.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => onChange(item.id)} className={clsx('rb-pill', active === item.id && 'is-active')}>{Icon && <Icon size={15} />}{item.label}</button> })}</div>
}
