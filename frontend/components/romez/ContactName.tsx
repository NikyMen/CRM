'use client'

import { useState } from 'react'
import { Check, Loader2, Pencil, X } from 'lucide-react'
import clsx from 'clsx'
import { getErrorMessage } from '@/lib/format'

/** Nombre del contacto con lápiz: el cambio se guarda en el backend y lo ven todos. */
export function ContactName({ name, canEdit, save, className }: { name: string; canEdit: boolean; save: (name: string) => Promise<unknown>; className: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cancel = () => { setDraft(null); setError(null) }
  const submit = async () => {
    const value = (draft ?? '').replace(/\s+/g, ' ').trim()
    if (!value) { setError('Escribí un nombre.'); return }
    if (value === name) { cancel(); return }
    setSaving(true)
    setError(null)
    try { await save(value); setDraft(null) } catch (err) { setError(getErrorMessage(err, 'No se pudo guardar el nombre.')) } finally { setSaving(false) }
  }
  if (draft !== null) return <form onSubmit={(event) => { event.preventDefault(); void submit() }} className="flex flex-wrap items-center gap-1.5"><input autoFocus value={draft} maxLength={120} disabled={saving} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); cancel() } }} className="ctrl-input h-8 w-56 py-1 text-sm" aria-label="Nombre del contacto" placeholder="Nombre del contacto" /><button type="submit" disabled={saving} className="rounded-md p-1.5 text-[var(--success)] hover:bg-[var(--paper-soft)]" aria-label="Guardar nombre" title="Guardar">{saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}</button><button type="button" disabled={saving} onClick={cancel} className="rounded-md p-1.5 text-[var(--ink-tertiary)] hover:bg-[var(--paper-soft)]" aria-label="Cancelar edición" title="Cancelar"><X size={15} /></button>{error ? <span role="alert" className="text-xs font-semibold text-[var(--danger)]">{error}</span> : null}</form>
  return <span className="inline-flex min-w-0 items-center gap-1"><span className={clsx('truncate', className)}>{name || 'Contacto sin identificar'}</span>{canEdit ? <button type="button" onClick={() => setDraft(name)} className="rounded-md p-1 text-[var(--ink-tertiary)] hover:bg-[var(--paper-soft)] hover:text-[var(--brand-blue)]" aria-label="Editar nombre del contacto" title="Editar nombre"><Pencil size={14} /></button> : null}</span>
}
