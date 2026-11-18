'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList, Save, X } from 'lucide-react'
import { clientsApi } from '@/lib/api'
import { fullName, getErrorMessage } from '@/lib/format'
import { PRIORITY_LABEL, STATUS_LABEL, type TaskInput, type TaskPriority, type TaskStatus } from '@/lib/tasks'
import { Field } from '@/components/romez/assistant/ui'

export type Member = { id: string; role: string; user: { id: string; firstName: string; lastName?: string | null; email: string } }

export const EMPTY_TASK: TaskInput = { title: '', description: '', priority: 'MEDIUM', status: 'PENDING', assignedToUserId: null, companyId: null, dueDate: null }

/** Alta o edición de una tarea (sólo owner/admin). */
export function TaskForm({ initial, initialClientName, members, saving, error, onCancel, onSave }: {
  initial: TaskInput & { id?: string }
  initialClientName?: string | null
  members: Member[]
  saving: boolean
  error: unknown
  onCancel: () => void
  onSave: (input: TaskInput) => void
}) {
  const [form, setForm] = useState<TaskInput>(initial)
  const [clientSearch, setClientSearch] = useState('')
  const update = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) => setForm((current) => ({ ...current, [key]: value }))

  const clients = useQuery({
    queryKey: ['tasks', 'client-options', clientSearch],
    queryFn: () => clientsApi.list({ search: clientSearch || undefined, limit: 50 }).then((response) => response.data.items),
  })
  const clientOptions = clients.data ?? []
  const selectedMissing = form.companyId && !clientOptions.some((client) => client.id === form.companyId)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, saving])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 backdrop-blur-[2px] sm:items-center sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onCancel() }}>
      <form
        className="assistant-ui ast-card ast-rise my-auto w-full max-w-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-form-title"
        onSubmit={(event) => { event.preventDefault(); if (form.title.trim()) onSave({ ...form, title: form.title.trim(), description: form.description.trim() }) }}
      >
        <header className="flex items-start justify-between gap-4 px-6 pt-6 sm:px-7">
          <div className="flex items-start gap-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--ast-accent-soft)] text-[var(--ast-accent)]"><ClipboardList size={20} /></span>
            <div>
              <h2 id="task-form-title" className="font-display text-lg font-semibold text-[var(--ink-primary)]">{initial.id ? 'Editar tarea' : 'Nueva tarea'}</h2>
              <p className="mt-0.5 text-[13px] text-[var(--ink-tertiary)]">Cada cambio queda en el historial con quién lo hizo y cuándo.</p>
            </div>
          </div>
          <button type="button" onClick={onCancel} disabled={saving} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--ink-tertiary)] hover:bg-[var(--paper-soft)]" aria-label="Cerrar"><X size={18} /></button>
        </header>

        <div className="grid gap-5 px-6 py-6 sm:grid-cols-2 sm:px-7">
          <Field label="Título *" className="sm:col-span-2">
            <input className="ctrl-input" autoFocus maxLength={200} value={form.title} placeholder="Por ejemplo: Liquidar IVA de octubre" onChange={(event) => update('title', event.target.value)} />
          </Field>
          <Field label="Descripción" className="sm:col-span-2">
            <textarea className="ctrl-input !min-h-[110px] resize-y !px-4 !py-3 leading-relaxed" maxLength={5000} value={form.description} placeholder="Qué hay que hacer, documentos, contexto…" onChange={(event) => update('description', event.target.value)} />
          </Field>
          <Field label="Responsable">
            <select className="ctrl-input" value={form.assignedToUserId ?? ''} onChange={(event) => update('assignedToUserId', event.target.value || null)}>
              <option value="">Sin asignar</option>
              {members.map((member) => <option key={member.user.id} value={member.user.id}>{fullName(member.user)}</option>)}
            </select>
          </Field>
          <Field label="Vencimiento">
            <input type="date" className="ctrl-input" value={form.dueDate ?? ''} onChange={(event) => update('dueDate', event.target.value || null)} />
          </Field>
          <Field label="Cliente (opcional)" hint="Escribí para buscar entre los clientes.">
            <span className="block space-y-2">
              <input className="ctrl-input" value={clientSearch} placeholder="Buscar cliente…" onChange={(event) => setClientSearch(event.target.value)} aria-label="Buscar cliente" />
              <select className="ctrl-input" value={form.companyId ?? ''} onChange={(event) => update('companyId', event.target.value || null)} aria-label="Cliente">
                <option value="">Sin cliente</option>
                {selectedMissing ? <option value={form.companyId as string}>{initialClientName ?? 'Cliente actual'}</option> : null}
                {clientOptions.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            </span>
          </Field>
          <div className="grid content-start gap-5">
            <Field label="Prioridad">
              <select className="ctrl-input" value={form.priority} onChange={(event) => update('priority', event.target.value as TaskPriority)}>
                {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((key) => <option key={key} value={key}>{PRIORITY_LABEL[key]}</option>)}
              </select>
            </Field>
            <Field label="Estado">
              <select className="ctrl-input" value={form.status} onChange={(event) => update('status', event.target.value as TaskStatus)}>
                {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((key) => <option key={key} value={key}>{STATUS_LABEL[key]}</option>)}
              </select>
            </Field>
          </div>
        </div>

        <footer className="flex flex-col gap-3 border-t border-[var(--line-soft)] px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          {error ? <p className="text-sm font-semibold text-[var(--danger)]">{getErrorMessage(error, 'No pudimos guardar la tarea.')}</p> : <span />}
          <div className="flex gap-2">
            <button type="button" className="btn-secondary !rounded-full" disabled={saving} onClick={onCancel}>Cancelar</button>
            <button type="submit" className="btn-primary !rounded-full" disabled={!form.title.trim() || saving}><Save size={15} /> {saving ? 'Guardando…' : initial.id ? 'Guardar cambios' : 'Crear tarea'}</button>
          </div>
        </footer>
      </form>
    </div>
  )
}
