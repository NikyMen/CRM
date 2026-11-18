'use client'

import { useEffect } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { ArrowRight, History, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { tasksApi, type TaskEvent } from '@/lib/tasks'
import { fullName, getErrorMessage } from '@/lib/format'

const PAGE = 40

const ACTIONS: Record<string, { verb: string; icon: typeof Plus; tone: string }> = {
  created: { verb: 'creó la tarea', icon: Plus, tone: 'bg-[var(--success-paper)] text-[var(--success)]' },
  updated: { verb: 'editó la tarea', icon: Pencil, tone: 'bg-[var(--ast-accent-soft)] text-[var(--ast-accent)]' },
  status: { verb: 'cambió el estado de la tarea', icon: RefreshCw, tone: 'bg-[var(--warning-paper)] text-[var(--warning)]' },
  deleted: { verb: 'eliminó la tarea', icon: Trash2, tone: 'bg-[var(--danger-paper)] text-[var(--danger)]' },
}

const stamp = new Intl.DateTimeFormat('es-PY', { timeZone: 'America/Asuncion', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
const dayLabel = new Intl.DateTimeFormat('es-PY', { timeZone: 'America/Asuncion', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

/**
 * Panel lateral con el historial: de una tarea (`taskId`) o de todas. Cada cambio muestra quién, cuándo y el valor
 * anterior y el nuevo de cada campo.
 */
export function TaskHistory({ taskId, taskTitle, onClose }: { taskId?: string; taskTitle?: string; onClose: () => void }) {
  const history = useInfiniteQuery({
    queryKey: ['tasks', 'history', taskId ?? 'all'],
    queryFn: ({ pageParam }) => tasksApi.history({ taskId, before: pageParam, limit: PAGE }).then((response) => response.data),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.items[last.items.length - 1]?.createdAt : undefined),
  })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const events = history.data?.pages.flatMap((page) => page.items) ?? []
  const groups: { day: string; items: TaskEvent[] }[] = []
  for (const event of events) {
    const raw = dayLabel.format(new Date(event.createdAt))
    const day = raw.charAt(0).toUpperCase() + raw.slice(1)
    const last = groups[groups.length - 1]
    if (last?.day === day) last.items.push(event)
    else groups.push({ day, items: [event] })
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <aside className="assistant-ui ast-rise flex h-full w-full max-w-xl flex-col bg-[var(--paper-canvas)] shadow-[var(--ast-float-shadow)] sm:m-3 sm:h-[calc(100%-1.5rem)] sm:rounded-[1.75rem] sm:border sm:border-[var(--line-soft)]" role="dialog" aria-modal="true" aria-labelledby="task-history-title">
        <header className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
          <div className="flex min-w-0 items-start gap-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--ast-accent)] text-[var(--ast-on-accent)]"><History size={20} /></span>
            <div className="min-w-0">
              <h2 id="task-history-title" className="font-display text-lg font-semibold text-[var(--ink-primary)]">{taskId ? 'Historial de la tarea' : 'Historial de tareas'}</h2>
              <p className="mt-0.5 truncate text-[13px] text-[var(--ink-tertiary)]">{taskId ? taskTitle : 'Todos los cambios: quién, cuándo, cómo estaba antes y cómo quedó.'}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--ink-tertiary)] hover:bg-[var(--paper)] hover:text-[var(--ink-primary)]" aria-label="Cerrar historial"><X size={18} /></button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-6 sm:px-6">
          {history.isLoading ? <p className="py-10 text-center text-sm text-[var(--ink-tertiary)]">Cargando historial…</p> : null}
          {history.isError ? <p className="rounded-2xl bg-[var(--danger-paper)] px-4 py-3 text-sm text-[var(--danger)]">{getErrorMessage(history.error)}</p> : null}
          {!history.isLoading && !events.length && !history.isError ? <p className="py-10 text-center text-sm text-[var(--ink-tertiary)]">Todavía no hay cambios registrados.</p> : null}

          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.day}>
                <p className="sticky top-0 z-10 -mx-1 mb-3 bg-[var(--paper-canvas)] px-1 py-1 text-xs font-semibold text-[var(--ink-tertiary)]">{group.day}</p>
                <ol className="relative space-y-3 border-l border-[var(--line)] pl-6">
                  {group.items.map((event) => <EventItem key={event.id} event={event} showTitle={!taskId} />)}
                </ol>
              </section>
            ))}
          </div>

          {history.hasNextPage ? (
            <div className="mt-6 flex justify-center">
              <button type="button" className="btn-secondary !rounded-full" disabled={history.isFetchingNextPage} onClick={() => history.fetchNextPage()}>{history.isFetchingNextPage ? 'Cargando…' : 'Ver cambios anteriores'}</button>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  )
}

function EventItem({ event, showTitle }: { event: TaskEvent; showTitle: boolean }) {
  const action = ACTIONS[event.type] ?? ACTIONS.updated
  const Icon = action.icon
  const changes = event.type === 'created' ? event.changes.filter((change) => change.to !== null) : event.changes
  return (
    <li className="relative">
      <span className={clsx('absolute -left-[2.35rem] top-3 grid h-7 w-7 place-items-center rounded-full ring-4 ring-[var(--paper-canvas)]', action.tone)}><Icon size={13} strokeWidth={2.4} /></span>
      <div className="ast-card px-4 py-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-sm text-[var(--ink-secondary)]">
            <b className="font-semibold text-[var(--ink-primary)]">{event.actor ? fullName(event.actor) : 'Alguien que ya no está en el equipo'}</b> {action.verb}
            {showTitle ? <> <span className="font-semibold text-[var(--ink-primary)]">«{event.taskTitle}»</span></> : null}
          </p>
          <time dateTime={event.createdAt} className="shrink-0 text-xs tabular-nums text-[var(--ink-tertiary)]">{stamp.format(new Date(event.createdAt))}</time>
        </div>
        {changes.length ? (
          <dl className="mt-3 space-y-2">
            {changes.map((change) => (
              <div key={change.field} className="rounded-2xl bg-[var(--paper-soft)] px-3 py-2 text-[13px]">
                <dt className="text-xs font-semibold text-[var(--ink-tertiary)]">{change.label}</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  {event.type !== 'created' ? (
                    <>
                      <span className={clsx('whitespace-pre-wrap break-words', change.from ? 'text-[var(--danger)] line-through decoration-[var(--danger)]/50' : 'italic text-[var(--ink-muted)]')}>{change.from ?? 'vacío'}</span>
                      <ArrowRight size={13} className="shrink-0 text-[var(--ink-muted)]" />
                    </>
                  ) : null}
                  <span className={clsx('whitespace-pre-wrap break-words', change.to ? 'font-medium text-[var(--success)]' : 'italic text-[var(--ink-muted)]')}>{change.to ?? 'vacío'}</span>
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </li>
  )
}
