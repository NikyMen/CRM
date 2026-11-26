'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Archive, ImagePlus, Loader2, MapPin, X } from 'lucide-react'
import { propertiesApi, type Property, type PropertyInput, type PropertyOperation, type PropertyStatus, type PropertyType } from '@/lib/api'
import { auth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/format'
import { useConfirmDelete } from '@/components/romez/ConfirmDelete'
import { AssigneeControl, memberName, useTeamMembers } from '@/components/social/AssigneeControl'
import { PropertyImage } from './PropertyImage'
import { OPERATION_LABEL, STATUS_META, TYPE_LABEL } from './property-meta'

const LeafletMap = dynamic(() => import('./LeafletMap'), { ssr: false, loading: () => <div className="grid h-full place-items-center bg-[var(--paper-inset)]"><Loader2 className="animate-spin text-[var(--ink-muted)]" size={20} /></div> })

/** Achica la foto a 1600 px y la pasa a JPG antes de subirla. */
async function toJpeg(file: File) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('El navegador no pudo procesar la foto.')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const dataUrl = canvas.toDataURL('image/jpeg', 0.86)
  return { previewUrl: dataUrl, payload: { fileName: file.name.replace(/\.[^.]+$/, '') + '.jpg', mimeType: 'image/jpeg', dataBase64: dataUrl.slice(dataUrl.indexOf(',') + 1) } }
}

const num = (value: string) => (value.trim() === '' ? null : Number(value))
const text = (value: number | null | undefined) => (value === null || value === undefined ? '' : String(value))

/** Alta y edición de una propiedad. Con `property` edita; sin él, crea. */
export function PropertyForm({ property, onClose }: { property?: Property | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const confirmDelete = useConfirmDelete()
  const user = auth.get()
  const manager = user?.role === 'owner' || user?.role === 'admin'
  const team = useTeamMembers()
  const fileInput = useRef<HTMLInputElement>(null)
  const editing = Boolean(property)
  const canEdit = user?.role !== 'viewer' && (!property || manager || !property.assignedToUserId || property.assignedToUserId === user?.userId)

  const [form, setForm] = useState(() => ({
    title: property?.title ?? '',
    operation: (property?.operation ?? 'sale') as PropertyOperation,
    propertyType: (property?.propertyType ?? 'house') as PropertyType,
    status: (property?.status ?? 'available') as PropertyStatus,
    price: property?.price ? String(Number(property.price)) : '',
    currency: property?.currency ?? 'USD',
    address: property?.address ?? '',
    neighborhood: property?.neighborhood ?? '',
    city: property?.city ?? 'Corrientes',
    bedrooms: text(property?.bedrooms),
    bathrooms: text(property?.bathrooms),
    areaM2: text(property?.areaM2),
    description: property?.description ?? '',
    assignedToUserId: property ? property.assignedToUserId : (manager ? null : user?.userId ?? null),
  }))
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(property?.latitude != null && property.longitude != null ? { lat: property.latitude, lng: property.longitude } : null)
  const [image, setImage] = useState<Awaited<ReturnType<typeof toJpeg>> | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }))

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['properties'] })
  const save = useMutation({
    mutationFn: () => {
      const data: PropertyInput = {
        title: form.title.trim(), operation: form.operation, propertyType: form.propertyType, status: form.status,
        price: num(form.price), currency: form.currency, address: form.address.trim() || null, neighborhood: form.neighborhood.trim() || null,
        city: form.city.trim() || null, bedrooms: num(form.bedrooms), bathrooms: num(form.bathrooms), areaM2: num(form.areaM2),
        description: form.description.trim(), latitude: location?.lat ?? null, longitude: location?.lng ?? null,
        ...(editing ? {} : { assignedToUserId: form.assignedToUserId }),
        ...(image ? { image: image.payload } : {}),
      }
      return property ? propertiesApi.update(property.id, data) : propertiesApi.create(data)
    },
    onSuccess: () => { refresh(); onClose() },
  })
  const archive = useMutation({ mutationFn: () => propertiesApi.archive(property!.id), onSuccess: () => { refresh(); onClose() } })

  const pick = async (file?: File) => {
    setImageError(null)
    if (!file) return
    if (!file.type.startsWith('image/')) { setImageError('Elegí una foto (JPG, PNG o WebP).'); return }
    try { setImage(await toJpeg(file)) } catch (error) { setImageError(getErrorMessage(error, 'No pudimos leer esa foto.')) }
  }

  const field = 'ctrl-input mt-1'
  const label = 'block text-xs font-semibold text-[var(--ink-secondary)]'

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={editing ? 'Editar propiedad' : 'Nueva propiedad'} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="ast-rise flex max-h-full w-full max-w-4xl flex-col overflow-hidden bg-[var(--paper)] shadow-[var(--ast-float-shadow)] sm:max-h-[92vh] sm:rounded-[1.5rem] sm:border sm:border-[var(--line-soft)]" onSubmit={(event) => { event.preventDefault(); if (canEdit) save.mutate() }}>
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--line-soft)] px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base font-semibold text-[var(--ink-primary)]">{editing ? property!.title : 'Nueva propiedad'}</p>
            {editing ? <p className="text-xs text-[var(--ink-tertiary)]">{property!.code}</p> : null}
          </div>
          {editing ? <AssigneeControl assignedToUserId={property!.assignedToUserId} onAssign={async (userId) => { await propertiesApi.assign(property!.id, userId); refresh(); onClose() }} /> : null}
          <button type="button" onClick={onClose} aria-label="Cerrar" className="grid h-9 w-9 place-items-center rounded-full text-[var(--ink-tertiary)] hover:bg-[var(--paper-soft)]"><X size={18} /></button>
        </header>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <label className={label}>Título
              <input className={field} value={form.title} onChange={(event) => set('title', event.target.value)} required maxLength={120} disabled={!canEdit} placeholder="Casa 3 dormitorios con patio" />
            </label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label className={label}>Operación
                <select className={field} value={form.operation} onChange={(event) => set('operation', event.target.value as PropertyOperation)} disabled={!canEdit}>
                  {Object.entries(OPERATION_LABEL).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
                </select>
              </label>
              <label className={label}>Tipo
                <select className={field} value={form.propertyType} onChange={(event) => set('propertyType', event.target.value as PropertyType)} disabled={!canEdit}>
                  {Object.entries(TYPE_LABEL).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
                </select>
              </label>
              <label className={label}>Estado
                <select className={field} value={form.status} onChange={(event) => set('status', event.target.value as PropertyStatus)} disabled={!canEdit}>
                  {Object.entries(STATUS_META).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-[1fr_110px] gap-3">
              <label className={label}>Precio{form.operation === 'rent' ? ' por mes' : ''}
                <input className={field} value={form.price} onChange={(event) => set('price', event.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" disabled={!canEdit} placeholder="Vacío = a consultar" />
              </label>
              <label className={label}>Moneda
                <select className={field} value={form.currency} onChange={(event) => set('currency', event.target.value as 'USD' | 'ARS')} disabled={!canEdit}><option value="USD">USD</option><option value="ARS">$ (ARS)</option></select>
              </label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className={label}>Dormitorios<input className={field} value={form.bedrooms} onChange={(event) => set('bedrooms', event.target.value.replace(/\D/g, ''))} inputMode="numeric" disabled={!canEdit} /></label>
              <label className={label}>Baños<input className={field} value={form.bathrooms} onChange={(event) => set('bathrooms', event.target.value.replace(/\D/g, ''))} inputMode="numeric" disabled={!canEdit} /></label>
              <label className={label}>m²<input className={field} value={form.areaM2} onChange={(event) => set('areaM2', event.target.value.replace(/\D/g, ''))} inputMode="numeric" disabled={!canEdit} /></label>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className={`${label} sm:col-span-3`}>Dirección<input className={field} value={form.address} onChange={(event) => set('address', event.target.value)} maxLength={160} disabled={!canEdit} placeholder="Av. 3 de Abril 1250" /></label>
              <label className={`${label} sm:col-span-2`}>Barrio<input className={field} value={form.neighborhood} onChange={(event) => set('neighborhood', event.target.value)} maxLength={80} disabled={!canEdit} /></label>
              <label className={label}>Ciudad<input className={field} value={form.city} onChange={(event) => set('city', event.target.value)} maxLength={80} disabled={!canEdit} /></label>
            </div>
            <label className={label}>Descripción
              <textarea className={`${field} min-h-24 resize-y !rounded-xl py-2.5 leading-5`} value={form.description} onChange={(event) => set('description', event.target.value)} maxLength={4000} rows={4} disabled={!canEdit} />
            </label>
            {!editing ? (
              <label className={label}>Responsable
                <select className={field} value={form.assignedToUserId ?? ''} onChange={(event) => set('assignedToUserId', event.target.value || null)}>
                  <option value="">Sin responsable</option>
                  {(manager ? team.data ?? [] : team.data?.filter((member) => member.id === user?.userId) ?? []).map((member) => <option key={member.id} value={member.id}>{memberName(member)}{member.id === user?.userId ? ' (vos)' : ''}</option>)}
                </select>
              </label>
            ) : null}
          </div>

          <div className="space-y-4">
            <div>
              <p className={label}>Foto de portada</p>
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id="property-image" onChange={(event) => pick(event.target.files?.[0])} disabled={!canEdit} />
              <label htmlFor="property-image" className="mt-1 block aspect-[4/3] cursor-pointer overflow-hidden rounded-xl border border-dashed border-[var(--line)] bg-[var(--paper-soft)] hover:border-[var(--brand-blue)]">
                {image
                  // eslint-disable-next-line @next/next/no-img-element -- vista previa local de la foto elegida.
                  ? <img src={image.previewUrl} alt="Vista previa" className="h-full w-full object-cover" />
                  : property?.hasImage ? <PropertyImage id={property.id} version={property.imageVersion} hasImage alt={property.title} />
                  : <span className="flex h-full flex-col items-center justify-center gap-1.5 text-center text-[var(--ink-tertiary)]"><ImagePlus size={24} /><span className="text-xs font-semibold">Elegí una foto</span></span>}
              </label>
              {imageError ? <p role="alert" className="mt-1 text-xs font-semibold text-[var(--danger)]">{imageError}</p> : null}
            </div>
            <div>
              <p className={`${label} flex items-center justify-between`}><span className="inline-flex items-center gap-1"><MapPin size={13} /> Ubicación</span>{location ? <button type="button" className="text-[11px] font-semibold text-[var(--ink-tertiary)] hover:text-[var(--danger)]" onClick={() => setLocation(null)} disabled={!canEdit}>Quitar</button> : null}</p>
              <div className="mt-1 h-56 overflow-hidden rounded-xl border border-[var(--line-soft)]">
                <LeafletMap picked={location} onPick={canEdit ? (lat, lng) => setLocation({ lat, lng }) : () => {}} fitToPins={false} />
              </div>
              <p className="mt-1 text-[11px] text-[var(--ink-muted)]">{location ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}` : 'Tocá el mapa donde está la propiedad.'}</p>
            </div>
          </div>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--line-soft)] px-5 py-3">
          {save.isError ? <p role="alert" className="w-full text-sm font-semibold text-[var(--danger)]">{getErrorMessage(save.error, 'No se pudo guardar la propiedad.')}</p> : null}
          {!canEdit ? <p className="flex-1 text-xs text-[var(--ink-tertiary)]">Sólo el responsable o un administrador puede editarla.</p> : null}
          {editing && manager ? <button type="button" className="btn-secondary !text-[var(--danger)]" disabled={archive.isPending} onClick={async () => { if (await confirmDelete({ title: 'Archivar propiedad', message: 'Deja de verse en el catálogo y en el mapa.', confirmLabel: 'Archivar' })) archive.mutate() }}><Archive size={15} /> Archivar</button> : null}
          <span className="flex-1" />
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          {canEdit ? <button type="submit" className="btn-primary" disabled={save.isPending || !form.title.trim()}>{save.isPending ? <Loader2 size={15} className="animate-spin" /> : null} {editing ? 'Guardar cambios' : 'Crear propiedad'}</button> : null}
        </footer>
      </form>
    </div>
  )
}
