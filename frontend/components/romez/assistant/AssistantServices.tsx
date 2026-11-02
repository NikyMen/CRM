'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { ArrowDown, ArrowUp, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { assistantApi, PRICE_TOKEN, renderPreview, type AssistantService, type AssistantServiceInput } from '@/lib/assistant'
import { getErrorMessage } from '@/lib/format'
import { useConfirmDelete } from '@/components/romez/ConfirmDelete'
import { MoneyInput } from '@/components/romez/MoneyInput'
import { ErrorState, LoadingState, StatusPill } from '@/components/romez/OperationalUI'
import { Bubble, Field, Panel, Toggle } from './ui'

const SERVICES_KEY = ['assistant', 'services']

type Draft = AssistantServiceInput

function toDraft(service: AssistantService): Draft {
  return { title: service.title, description: service.description, body: service.body, amount: service.amount, active: service.active }
}

/** Problema que impide guardar, o null. */
function validate(draft: Draft) {
  if (!draft.title.trim()) return 'Poné un título.'
  if (!draft.body.trim()) return 'El texto no puede estar vacío.'
  if (draft.body.includes(PRICE_TOKEN) && !draft.amount) return `El texto usa ${PRICE_TOKEN}: cargá el precio o sacá ese marcador.`
  return null
}

function DraftFields({ draft, onChange }: { draft: Draft; onChange: (patch: Partial<Draft>) => void }) {
  const preview = renderPreview(draft.body, draft.amount)
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_190px]">
          <Field label="Título">
            <input className="ctrl-input" value={draft.title} maxLength={120} onChange={(event) => onChange({ title: event.target.value })} />
          </Field>
          <Field label="Precio (Gs.)" hint={`Entra en el texto donde pongas ${PRICE_TOKEN}`}>
            <MoneyInput value={draft.amount ?? ''} onChange={(value) => onChange({ amount: value || null })} placeholder="Sin precio" />
          </Field>
        </div>
        <Field label="Cuándo usarlo" hint="Es lo único que ve la IA para decidir si lo manda. No pongas montos acá.">
          <input className="ctrl-input" value={draft.description} maxLength={300} onChange={(event) => onChange({ description: event.target.value })} />
        </Field>
        <Field label="Texto que recibe el cliente" hint={`Se envía tal cual. Usá ${PRICE_TOKEN} para insertar el precio.`}>
          <textarea className="ctrl-input min-h-[220px] resize-y font-mono !text-[13px] leading-relaxed" value={draft.body} maxLength={3500} onChange={(event) => onChange({ body: event.target.value })} />
        </Field>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--ink-secondary)]">Vista previa en WhatsApp</p>
        {preview !== null ? <Bubble text={preview} /> : <Bubble muted text={`Falta cargar el precio para armar el mensaje (el texto usa ${PRICE_TOKEN}).`} />}
        <p className="text-xs font-medium text-[var(--ink-tertiary)]">{preview?.length ?? 0} caracteres. WhatsApp admite hasta 4.096 por mensaje.</p>
      </div>
    </div>
  )
}

function ServiceCard({ service, first, last, busy, onMove }: { service: AssistantService; first: boolean; last: boolean; busy: boolean; onMove: (direction: -1 | 1) => void }) {
  const queryClient = useQueryClient()
  const confirmDelete = useConfirmDelete()
  const [draft, setDraft] = useState<Draft>(() => toDraft(service))
  const [error, setError] = useState<string | null>(null)

  // Si el servidor cambia el servicio (guardado, restauración), el borrador lo sigue.
  useEffect(() => setDraft(toDraft(service)), [service])

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(toDraft(service)), [draft, service])
  const problem = validate(draft)

  const save = useMutation({
    mutationFn: () => assistantApi.updateService(service.id, draft).then((response) => response.data),
    onSuccess: () => { setError(null); queryClient.invalidateQueries({ queryKey: SERVICES_KEY }); queryClient.invalidateQueries({ queryKey: ['assistant', 'flow-config'] }) },
    onError: (failure) => setError(getErrorMessage(failure, 'No pudimos guardar el servicio.')),
  })
  const remove = useMutation({
    mutationFn: () => assistantApi.deleteService(service.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: SERVICES_KEY }); queryClient.invalidateQueries({ queryKey: ['assistant', 'flow-config'] }) },
    onError: (failure) => setError(getErrorMessage(failure, 'No pudimos eliminar el servicio.')),
  })

  return (
    <article className={clsx('rounded-xl border bg-[var(--paper)]', draft.active ? 'border-[var(--line)]' : 'border-dashed border-[var(--line)] opacity-80')}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line-soft)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <code className="rounded-md bg-[var(--brand-paper)] px-2 py-1 text-xs font-extrabold text-[var(--brand-navy)]">{service.code}</code>
          <h3 className="truncate font-display text-sm font-extrabold text-[var(--ink-primary)]">{draft.title || 'Sin título'}</h3>
          {dirty ? <StatusPill tone="warning">Sin guardar</StatusPill> : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[var(--ink-tertiary)]">{draft.active ? 'Activo' : 'Apagado'}</span>
          <Toggle checked={draft.active} onChange={(value) => setDraft((current) => ({ ...current, active: value }))} label={`Activar ${service.code}`} />
          <button type="button" className="btn-secondary !min-h-8 !p-1.5" onClick={() => onMove(-1)} disabled={first || busy} aria-label="Subir"><ArrowUp size={15} /></button>
          <button type="button" className="btn-secondary !min-h-8 !p-1.5" onClick={() => onMove(1)} disabled={last || busy} aria-label="Bajar"><ArrowDown size={15} /></button>
        </div>
      </header>
      <div className="space-y-4 p-4">
        <DraftFields draft={draft} onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))} />
        {problem && dirty ? <p className="text-sm font-semibold text-[var(--danger)]">{problem}</p> : null}
        {error ? <p className="text-sm font-semibold text-[var(--danger)]">{error}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            className="btn-danger !min-h-9"
            disabled={remove.isPending}
            onClick={async () => { if (await confirmDelete(`Se eliminará el servicio ${service.code}. Si el flujo de n8n lo menciona, dejará de enviarlo.`)) remove.mutate() }}
          >
            <Trash2 size={15} /> Eliminar
          </button>
          <div className="flex items-center gap-2">
            {dirty ? <button type="button" className="btn-secondary" onClick={() => setDraft(toDraft(service))}>Descartar cambios</button> : null}
            <button type="button" className="btn-primary" disabled={!dirty || Boolean(problem) || save.isPending} onClick={() => save.mutate()}>
              <Save size={15} /> {save.isPending ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

function NewServiceForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [draft, setDraft] = useState<Draft>({ title: '', description: '', body: '', amount: null, active: true })
  const [error, setError] = useState<string | null>(null)
  const problem = validate(draft) ?? (/^[A-Z][A-Z0-9_]{1,39}$/.test(code) ? null : 'El código usa mayúsculas, números y guion bajo (por ejemplo ALTA_RUC).')

  const create = useMutation({
    mutationFn: () => assistantApi.createService({ ...draft, code }).then((response) => response.data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: SERVICES_KEY }); queryClient.invalidateQueries({ queryKey: ['assistant', 'flow-config'] }); onDone() },
    onError: (failure) => setError(getErrorMessage(failure, 'No pudimos crear el servicio.')),
  })

  return (
    <article className="rounded-xl border-2 border-dashed border-[var(--brand-blue)] bg-[var(--brand-paper)]/40 p-4">
      <h3 className="mb-4 font-display text-sm font-extrabold text-[var(--ink-primary)]">Nuevo servicio</h3>
      <div className="mb-4 max-w-sm">
        <Field label="Código" hint="Identificador que usa el flujo de n8n. No se puede cambiar después.">
          <input className="ctrl-input font-mono" value={code} maxLength={40} placeholder="ALTA_RUC" onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))} />
        </Field>
      </div>
      <DraftFields draft={draft} onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))} />
      {error ? <p className="mt-3 text-sm font-semibold text-[var(--danger)]">{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onDone}>Cancelar</button>
        <button type="button" className="btn-primary" disabled={Boolean(problem) || create.isPending} onClick={() => create.mutate()} title={problem ?? undefined}>
          <Plus size={15} /> {create.isPending ? 'Creando…' : 'Crear servicio'}
        </button>
      </div>
    </article>
  )
}

export function AssistantServices() {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const services = useQuery({ queryKey: SERVICES_KEY, queryFn: () => assistantApi.services().then((response) => response.data) })

  const reorder = useMutation({
    mutationFn: (ids: string[]) => assistantApi.reorderServices(ids).then((response) => response.data),
    onSuccess: (data) => { queryClient.setQueryData(SERVICES_KEY, data); queryClient.invalidateQueries({ queryKey: ['assistant', 'flow-config'] }) },
  })
  const restore = useMutation({
    mutationFn: () => assistantApi.restoreDefaults().then((response) => response.data),
    onSuccess: (data) => {
      queryClient.setQueryData(SERVICES_KEY, data.services)
      queryClient.invalidateQueries({ queryKey: ['assistant', 'flow-config'] })
      setNotice(data.restored.length ? `Se restauraron: ${data.restored.join(', ')}.` : 'No faltaba ningún servicio inicial.')
    },
  })

  const list = services.data ?? []
  const move = (index: number, direction: -1 | 1) => {
    const ids = list.map((service) => service.id)
    const target = index + direction
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    reorder.mutate(ids)
  }

  return (
    <div className="space-y-5">
      <Panel
        title="Servicios y precios"
        description="Son los mensajes exactos que el asistente envía. La IA sólo elige cuál mandar: nunca escribe un precio por su cuenta."
        action={
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => restore.mutate()} disabled={restore.isPending}><RotateCcw size={15} /> Restaurar iniciales</button>
            <button type="button" className="btn-primary" onClick={() => setAdding(true)} disabled={adding}><Plus size={15} /> Agregar servicio</button>
          </div>
        }
      >
        <ul className="list-disc space-y-1 pl-5 text-sm font-medium text-[var(--ink-secondary)]">
          <li>Cambiá el <b>precio</b> en un solo campo: se actualiza en todos los lugares del texto que tengan <code>{PRICE_TOKEN}</code>.</li>
          <li>Los cambios llegan a n8n en el mensaje siguiente, sin tocar el flujo (cuando la lectura desde el CRM está activada en Conexión).</li>
          <li>Los precios iniciales salen de lo que el equipo ya manda por WhatsApp: <b>confirmalos antes de usar el asistente con clientes</b>.</li>
        </ul>
        {notice ? <p className="mt-3 text-sm font-semibold text-[var(--success)]">{notice}</p> : null}
      </Panel>

      {adding ? <NewServiceForm onDone={() => setAdding(false)} /> : null}
      {services.isLoading ? <LoadingState label="Cargando servicios…" /> : null}
      {services.isError ? <ErrorState message={getErrorMessage(services.error)} retry={() => services.refetch()} /> : null}
      {!services.isLoading && !services.isError && !list.length ? (
        <p className="rounded-xl border border-dashed border-[var(--line)] p-6 text-center text-sm font-medium text-[var(--ink-tertiary)]">No hay servicios cargados. Usá «Restaurar iniciales» o «Agregar servicio».</p>
      ) : null}
      <div className="space-y-4">
        {list.map((service, index) => (
          <ServiceCard key={service.id} service={service} first={index === 0} last={index === list.length - 1} busy={reorder.isPending} onMove={(direction) => move(index, direction)} />
        ))}
      </div>
    </div>
  )
}
