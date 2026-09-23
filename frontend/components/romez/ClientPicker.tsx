'use client'

import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Building2, Check, Search, X } from 'lucide-react'
import clsx from 'clsx'
import { clientsApi } from '@/lib/api'
import type { Client, PaginatedResult } from '@/types'

type ClientPickerProps = {
  /** Id del cliente elegido; cadena vacía cuando todavía no hay selección válida. */
  value: string
  onChange: (clientId: string, client: Client | null) => void
  /** Se muestra cuando hay texto escrito pero ningún cliente seleccionado. */
  invalidHint?: string
  placeholder?: string
  disabled?: boolean
  /** Cliente ya elegido al montar (por ejemplo al llegar desde Saldos). */
  initialClient?: Pick<Client, 'id' | 'name' | 'ruc'> | null
}

/**
 * Buscador y selector de cliente en un solo control: se escribe libremente pero el
 * valor sólo queda cargado cuando se elige una de las tarjetas sugeridas.
 */
export function ClientPicker({
  value,
  onChange,
  invalidHint = 'Elegí un cliente de la lista para poder guardar la venta.',
  placeholder = 'Buscar por nombre, RUC o teléfono…',
  disabled,
  initialClient,
}: ClientPickerProps) {
  const listId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState(initialClient?.name ?? '')
  const [selected, setSelected] = useState<Pick<Client, 'id' | 'name' | 'ruc'> | null>(initialClient ?? null)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const deferredQuery = useDeferredValue(query)

  const clientsQuery = useQuery<PaginatedResult<Client>>({
    queryKey: ['clients', 'picker', { search: deferredQuery }],
    queryFn: () => clientsApi.list({ search: deferredQuery.trim() || undefined, page: 0, limit: 12, status: 'ACTIVE' }).then((response) => response.data),
    enabled: open && !disabled,
  })

  const results = useMemo(() => clientsQuery.data?.items ?? [], [clientsQuery.data?.items])

  /** El padre puede limpiar la selección (por ejemplo al cerrar el formulario). */
  useEffect(() => {
    if (!value && selected) {
      setSelected(null)
      setQuery('')
    }
  }, [value, selected])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.document.addEventListener('mousedown', onPointerDown)
    return () => window.document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  useEffect(() => { setHighlight(0) }, [deferredQuery])

  const select = (client: Client) => {
    setSelected(client)
    setQuery(client.name)
    setOpen(false)
    onChange(client.id, client)
  }

  const clear = () => {
    setSelected(null)
    setQuery('')
    setOpen(false)
    onChange('', null)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { setOpen(false); return }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) { setOpen(true); return }
      if (!results.length) return
      setHighlight((current) => {
        const next = event.key === 'ArrowDown' ? current + 1 : current - 1
        return (next + results.length) % results.length
      })
      return
    }
    if (event.key === 'Enter') {
      if (!open) return
      event.preventDefault()
      const candidate = results[highlight]
      if (candidate) select(candidate)
    }
  }

  const showInvalid = Boolean(query.trim()) && !selected

  return (
    <div ref={containerRef} className="relative">
      <span className="relative block">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" />
        <input
          className={clsx('ctrl-input pl-9', selected ? 'pr-24' : 'pr-3', showInvalid && 'border-[var(--warning-line)]')}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          value={query}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
            if (selected) { setSelected(null); onChange('', null) }
          }}
        />
        {selected ? (
          <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
            <Check size={14} className="text-[var(--success)]" />
            <button type="button" className="btn-secondary !min-h-7 !px-2" onClick={clear} aria-label="Quitar cliente">
              <X size={13} />
            </button>
          </span>
        ) : null}
      </span>

      {selected ? (
        <p className="mt-1.5 text-[11px] font-semibold text-[var(--ink-tertiary)]">
          Cliente cargado: {selected.name}{selected.ruc ? ` · RUC ${selected.ruc}` : ''}
        </p>
      ) : showInvalid ? (
        <p className="mt-1.5 text-[11px] font-semibold text-[var(--warning)]">{invalidHint}</p>
      ) : null}

      {open && !disabled ? (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--paper)] p-1.5 shadow-[0_18px_40px_-22px_rgba(15,23,42,.45)]"
        >
          {clientsQuery.isLoading ? (
            <p className="px-3 py-4 text-xs font-semibold text-[var(--ink-tertiary)]">Buscando clientes…</p>
          ) : results.length ? (
            <div className="grid gap-1.5">
              {results.map((client, index) => (
                <button
                  key={client.id}
                  type="button"
                  role="option"
                  aria-selected={client.id === value}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => select(client)}
                  className={clsx(
                    'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left',
                    index === highlight
                      ? 'border-[var(--brand-blue)] bg-[var(--brand-paper)]'
                      : 'border-[var(--line-soft)] bg-[var(--paper-soft)] hover:border-[var(--line-strong)]',
                  )}
                >
                  <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-[var(--brand-navy)] text-[10px] font-extrabold text-white">
                    {initials(client.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-[var(--ink-primary)]">{client.name}</span>
                    <span className="block truncate text-[11px] text-[var(--ink-tertiary)]">
                      {[client.ruc ? `RUC ${client.ruc}` : null, client.phone, client.city].filter(Boolean).join(' · ') || 'Sin datos fiscales'}
                    </span>
                  </span>
                  <Building2 size={14} className="flex-none text-[var(--ink-muted)]" />
                </button>
              ))}
            </div>
          ) : (
            <p className="px-3 py-4 text-xs font-semibold text-[var(--ink-tertiary)]">
              {query.trim() ? 'Ningún cliente coincide con la búsqueda.' : 'Escribí para buscar un cliente.'}
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '—'
}
