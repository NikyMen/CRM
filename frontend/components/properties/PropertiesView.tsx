'use client'

import { useDeferredValue, useMemo, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { Bath, BedDouble, LayoutGrid, Loader2, Map as MapIcon, MapPin, Plus, Ruler, Search } from 'lucide-react'
import { propertiesApi, type Property, type PropertyOperation } from '@/lib/api'
import { auth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/format'
import { TopbarContent } from '@/components/romez/Topbar'
import { MemberAvatar, memberName } from '@/components/social/AssigneeControl'
import { PropertyForm } from './PropertyForm'
import { PropertyImage } from './PropertyImage'
import { formatPrice, OPERATION_LABEL, propertyPlace, shortPrice, STATUS_META, TYPE_LABEL } from './property-meta'

const LeafletMap = dynamic(() => import('./LeafletMap'), { ssr: false, loading: () => <div className="grid h-full place-items-center bg-[var(--paper-inset)]"><Loader2 className="animate-spin text-[var(--ink-muted)]" size={24} /></div> })

type View = 'catalog' | 'map'
const OPERATION_FILTERS: { key: PropertyOperation | 'all'; label: string }[] = [{ key: 'all', label: 'Todas' }, { key: 'sale', label: 'Venta' }, { key: 'rent', label: 'Alquiler' }]

function Specs({ property }: { property: Property }) {
  const items = [
    property.bedrooms != null ? <span key="b" className="inline-flex items-center gap-1"><BedDouble size={13} /> {property.bedrooms}</span> : null,
    property.bathrooms != null ? <span key="ba" className="inline-flex items-center gap-1"><Bath size={13} /> {property.bathrooms}</span> : null,
    property.areaM2 != null ? <span key="m" className="inline-flex items-center gap-1"><Ruler size={13} /> {property.areaM2} m²</span> : null,
  ].filter(Boolean)
  return items.length ? <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--ink-secondary)]">{items}</div> : null
}

function PropertyCard({ property, onOpen }: { property: Property; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--line-soft)] bg-[var(--paper)] text-left shadow-[var(--ast-card-shadow)] transition hover:-translate-y-0.5 hover:shadow-[var(--ast-float-shadow)]">
      <div className="relative aspect-[4/3] overflow-hidden">
        <PropertyImage id={property.id} version={property.imageVersion} hasImage={property.hasImage} alt={property.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
        <span className="absolute left-3 top-3 rounded-full bg-[var(--brand-navy)] px-2.5 py-1 text-[11px] font-bold text-white shadow">{OPERATION_LABEL[property.operation]}</span>
        <span className={clsx('absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold shadow', STATUS_META[property.status].className)}>{STATUS_META[property.status].label}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="font-display text-lg font-bold leading-tight text-[var(--ink-primary)]">{formatPrice(property)}</p>
          <span className="shrink-0 rounded-full bg-[var(--paper-inset)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ink-tertiary)]">{property.code}</span>
        </div>
        <p className="line-clamp-2 text-sm font-semibold text-[var(--ink-primary)]">{property.title}</p>
        <p className="flex items-start gap-1 text-xs text-[var(--ink-tertiary)]"><MapPin size={13} className="mt-px shrink-0" /> <span className="line-clamp-1">{propertyPlace(property) || 'Sin dirección'}</span></p>
        <Specs property={property} />
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--line-soft)] pt-3 text-xs">
          <span className="text-[var(--ink-tertiary)]">{TYPE_LABEL[property.propertyType]}</span>
          {property.assignedTo
            ? <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-[var(--ink-secondary)]" title="Responsable"><MemberAvatar member={property.assignedTo} className="h-6 w-6 text-[10px]" /> <span className="truncate">{memberName(property.assignedTo)}</span></span>
            : <span className="rounded-full border border-dashed border-[var(--line)] px-2 py-0.5 font-semibold text-[var(--ink-muted)]">Sin responsable</span>}
        </div>
      </div>
    </button>
  )
}

/** Sección Propiedades: catálogo (1, 2 o 3 por fila) y mapa, con el mismo buscador y filtros. */
export function PropertiesView({ view }: { view: View }) {
  const [search, setSearch] = useState('')
  const [operation, setOperation] = useState<PropertyOperation | 'all'>('all')
  const [editing, setEditing] = useState<Property | 'new' | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const term = useDeferredValue(search.trim())
  const canCreate = auth.get()?.role !== 'viewer'
  const query = useQuery<Property[]>({
    queryKey: ['properties', term, operation],
    queryFn: () => propertiesApi.list({ search: term || undefined, operation: operation === 'all' ? undefined : operation }).then((response) => response.data.properties),
    placeholderData: (previous) => previous,
  })
  const properties = useMemo(() => query.data ?? [], [query.data])
  const located = useMemo(() => properties.filter((item) => item.latitude != null && item.longitude != null), [properties])
  const pins = useMemo(() => located.map((item) => ({
    id: item.id, lat: item.latitude!, lng: item.longitude!, label: shortPrice(item),
    color: item.status === 'available' ? (item.operation === 'rent' ? '#1d4f9e' : '#021c48') : item.status === 'reserved' ? '#b7791f' : '#6b7280',
  })), [located])
  const selectedProperty = properties.find((item) => item.id === selected) ?? null

  return (
    <div className="flex h-full flex-col">
      <TopbarContent>
        <div className="min-w-0 flex-1">
          <p className="hidden truncate text-xs font-medium text-[var(--ink-tertiary)] sm:block">Catálogo de la inmobiliaria</p>
          <h1 className="truncate font-display text-base font-bold leading-tight text-[var(--ink-primary)]">{view === 'map' ? 'Mapa de propiedades' : 'Propiedades'}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--paper-inset)] p-1" role="tablist" aria-label="Vista">
          <Link href="/propiedades" role="tab" aria-selected={view === 'catalog'} className={clsx('inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold', view === 'catalog' ? 'bg-[var(--paper)] text-[var(--ink-primary)] shadow-sm' : 'text-[var(--ink-tertiary)] hover:text-[var(--ink-primary)]')}><LayoutGrid size={14} /> <span className="hidden sm:inline">Catálogo</span></Link>
          <Link href="/propiedades/mapa" role="tab" aria-selected={view === 'map'} className={clsx('inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold', view === 'map' ? 'bg-[var(--paper)] text-[var(--ink-primary)] shadow-sm' : 'text-[var(--ink-tertiary)] hover:text-[var(--ink-primary)]')}><MapIcon size={14} /> <span className="hidden sm:inline">Mapa</span></Link>
        </div>
        {canCreate ? <button type="button" className="btn-primary h-9 !min-h-9" onClick={() => setEditing('new')}><Plus size={15} /> <span className="hidden sm:inline">Nueva propiedad</span></button> : null}
      </TopbarContent>

      <div className="shrink-0 px-4 pt-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative w-full sm:w-80">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="ctrl-input !rounded-full pl-9" placeholder="Buscar por título, código, barrio o dirección" aria-label="Buscar propiedades" />
          </label>
          <div className="flex gap-1.5" role="group" aria-label="Operación">
            {OPERATION_FILTERS.map((item) => <button key={item.key} type="button" onClick={() => setOperation(item.key)} aria-pressed={operation === item.key} className={clsx('h-9 rounded-full px-3.5 text-[13px] font-semibold transition-colors', operation === item.key ? 'bg-[var(--brand-navy)] text-white' : 'bg-[var(--paper)] text-[var(--ink-secondary)] ring-1 ring-[var(--line)] hover:text-[var(--ink-primary)]')}>{item.label}</button>)}
          </div>
          <span className="ml-auto text-xs text-[var(--ink-muted)]">{query.isFetching ? 'Buscando…' : view === 'map' ? `${located.length} en el mapa${properties.length > located.length ? ` · ${properties.length - located.length} sin ubicación` : ''}` : `${properties.length} propiedad${properties.length === 1 ? '' : 'es'}`}</span>
        </div>
      </div>

      {query.isLoading ? <div className="grid flex-1 place-items-center"><Loader2 className="animate-spin text-[var(--ink-muted)]" size={28} /></div>
        : query.isError ? <p className="p-6 text-sm font-semibold text-[var(--danger)]">{getErrorMessage(query.error)}</p>
        : view === 'catalog' ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            {properties.length ? (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {properties.map((property) => <PropertyCard key={property.id} property={property} onOpen={() => setEditing(property)} />)}
              </div>
            ) : <div className="rounded-2xl border border-dashed border-[var(--line)] p-12 text-center text-sm text-[var(--ink-tertiary)]">{term || operation !== 'all' ? 'Ninguna propiedad coincide con la búsqueda.' : 'Todavía no hay propiedades. Creá la primera con «Nueva propiedad».'}</div>}
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-4 p-4 sm:p-6 lg:grid-cols-[1fr_340px]">
            <div className="relative z-0 min-h-[420px] overflow-hidden rounded-2xl border border-[var(--line-soft)] shadow-[var(--ast-card-shadow)]">
              <LeafletMap pins={pins} selectedId={selected} onSelect={setSelected} />
            </div>
            <aside className="min-h-0 overflow-y-auto rounded-2xl border border-[var(--line-soft)] bg-[var(--paper)] shadow-[var(--ast-card-shadow)]">
              {selectedProperty ? (
                <div>
                  <div className="aspect-[4/3]"><PropertyImage id={selectedProperty.id} version={selectedProperty.imageVersion} hasImage={selectedProperty.hasImage} alt={selectedProperty.title} /></div>
                  <div className="space-y-2 p-4">
                    <p className="font-display text-lg font-bold text-[var(--ink-primary)]">{formatPrice(selectedProperty)}</p>
                    <p className="text-sm font-semibold text-[var(--ink-primary)]">{selectedProperty.title}</p>
                    <p className="text-xs text-[var(--ink-tertiary)]">{propertyPlace(selectedProperty)}</p>
                    <Specs property={selectedProperty} />
                    <div className="flex gap-2 pt-2"><button type="button" className="btn-primary !min-h-9" onClick={() => setEditing(selectedProperty)}>Ver ficha</button><button type="button" className="btn-secondary !min-h-9" onClick={() => setSelected(null)}>Ver lista</button></div>
                  </div>
                </div>
              ) : (
                <ul className="divide-y divide-[var(--line-soft)]">
                  {located.map((property) => (
                    <li key={property.id}><button type="button" onClick={() => setSelected(property.id)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-[var(--paper-soft)]">
                      <span className="h-14 w-16 shrink-0 overflow-hidden rounded-lg"><PropertyImage id={property.id} version={property.imageVersion} hasImage={property.hasImage} alt={property.title} /></span>
                      <span className="min-w-0"><span className="block truncate text-sm font-semibold text-[var(--ink-primary)]">{property.title}</span><span className="block text-xs font-bold text-[var(--brand-blue)]">{formatPrice(property)}</span><span className="block truncate text-[11px] text-[var(--ink-tertiary)]">{propertyPlace(property)}</span></span>
                    </button></li>
                  ))}
                  {!located.length ? <li className="p-8 text-center text-sm text-[var(--ink-tertiary)]">Ninguna propiedad tiene ubicación cargada.</li> : null}
                </ul>
              )}
            </aside>
          </div>
        )}

      {editing ? <PropertyForm property={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  )
}
