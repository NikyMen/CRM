'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { CalendarClock, CalendarPlus, Loader2, Trash2 } from 'lucide-react'
import { calendarApi } from '@/lib/api'
import { auth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/format'

const pad = (n: number) => String(n).padStart(2, '0')
export const toDateInput = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const toTimeInput = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`

/** La fecha ya pasó (para mostrarla apagada). */
export function isPast(value: string | Date) {
  return new Date(value).getTime() < Date.now()
}

/** "vie 28 nov · 10:00" (con año sólo si no es el actual). */
export function appointmentLabel(value: string | Date) {
  const date = new Date(value)
  const day = date.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) }).replace(/\./g, '')
  return `${day} · ${toTimeInput(date)}`
}

/**
 * Fecha agendada de un lead, en un botón chico: muestra la fecha (o «Agendar») y al tocarlo
 * abre un recuadro con día, hora y una nota corta. Lo que se guarda aparece en el Calendario.
 */
export function ScheduleControl({ dealId, appointmentAt, onChanged, compact = false }: { dealId: string; appointmentAt?: string | null; onChanged?: () => void; compact?: boolean }) {
  const queryClient = useQueryClient()
  const canWrite = auth.get()?.role !== 'viewer'
  const [open, setOpen] = useState(false)
  const current = appointmentAt ? new Date(appointmentAt) : null
  const defaultDate = current ?? (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d })()
  const [date, setDate] = useState(toDateInput(defaultDate))
  const [time, setTime] = useState(toTimeInput(defaultDate))
  const [note, setNote] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setDate(toDateInput(defaultDate))
    setTime(toTimeInput(defaultDate))
    const onClick = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false) } }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se inicializa al abrir.
  }, [open])

  const done = () => {
    setOpen(false)
    queryClient.invalidateQueries({ queryKey: ['calendar'] })
    queryClient.invalidateQueries({ queryKey: ['kanban'] })
    onChanged?.()
  }
  const save = useMutation({ mutationFn: () => calendarApi.schedule(dealId, new Date(`${date}T${time || '10:00'}`), note.trim() || undefined), onSuccess: done })
  const clear = useMutation({ mutationFn: () => calendarApi.clear(dealId), onSuccess: done })
  const past = current ? isPast(current) : false

  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" disabled={!canWrite && !current} onClick={() => setOpen((value) => !value)} aria-haspopup="dialog" aria-expanded={open}
        title={current ? `Agendado: ${appointmentLabel(current)}` : 'Agendar una fecha (visita, llamada…)'}
        className={clsx('inline-flex h-9 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition hover:border-[var(--brand-blue)]', current ? past ? 'border-[var(--line)] bg-[var(--paper-inset)] text-[var(--ink-tertiary)]' : 'border-[var(--brand-blue)]/40 bg-[var(--brand-paper)] text-[var(--brand-blue)]' : 'border-dashed border-[var(--line)] bg-[var(--paper-soft)] text-[var(--ink-tertiary)]')}>
        {current ? <CalendarClock size={14} /> : <CalendarPlus size={14} />}
        <span className={clsx(compact && !current && 'hidden sm:inline')}>{current ? appointmentLabel(current) : 'Agendar'}</span>
      </button>
      {open ? (
        <form role="dialog" aria-label="Agendar fecha" className="absolute right-0 top-full z-40 mt-1.5 w-64 space-y-2.5 rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-3 shadow-lg" onSubmit={(event) => { event.preventDefault(); save.mutate() }}>
          <div className="grid grid-cols-[1fr_88px] gap-2">
            <label className="text-[11px] font-semibold text-[var(--ink-secondary)]">Día<input type="date" required value={date} onChange={(event) => setDate(event.target.value)} className="ctrl-input mt-0.5 !min-h-9 !px-2 text-xs" disabled={!canWrite} /></label>
            <label className="text-[11px] font-semibold text-[var(--ink-secondary)]">Hora<input type="time" required value={time} onChange={(event) => setTime(event.target.value)} className="ctrl-input mt-0.5 !min-h-9 !px-2 text-xs" disabled={!canWrite} /></label>
          </div>
          <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} className="ctrl-input !min-h-9 text-xs" placeholder="Nota (opcional): visita, llamada…" disabled={!canWrite} />
          {save.isError || clear.isError ? <p role="alert" className="text-[11px] font-semibold text-[var(--danger)]">{getErrorMessage(save.error ?? clear.error, 'No se pudo guardar la fecha.')}</p> : null}
          {canWrite ? <div className="flex items-center gap-2">
            {current ? <button type="button" onClick={() => clear.mutate()} disabled={clear.isPending} className="grid h-9 w-9 place-items-center rounded-full text-[var(--danger)] hover:bg-[var(--danger-paper)]" aria-label="Quitar la fecha" title="Quitar la fecha">{clear.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}</button> : null}
            <span className="flex-1" />
            <button type="submit" className="btn-primary !min-h-9 !px-3.5 text-xs" disabled={save.isPending || !date}>{save.isPending ? <Loader2 size={14} className="animate-spin" /> : null} {current ? 'Cambiar' : 'Agendar'}</button>
          </div> : null}
        </form>
      ) : null}
    </div>
  )
}
