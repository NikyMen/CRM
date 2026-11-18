'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { AlertCircle, Building2, CalendarDays, CheckCircle2, CircleDashed, ClipboardList, Flag, History, Pencil, Plus, Search, Timer, Trash2, UserRound } from 'lucide-react'
import { auth } from '@/lib/auth'
import { teamApi } from '@/lib/api'
import { fullName, getErrorMessage } from '@/lib/format'
import { formatDay, isOverdue, PRIORITY_LABEL, STATUS_LABEL, tasksApi, todayInParaguay, toInput, type Task, type TaskFilters, type TaskInput, type TaskStatus } from '@/lib/tasks'
import { ErrorState, LoadingState, PageFrame } from '@/components/romez/OperationalUI'
import { useConfirmDelete } from '@/components/romez/ConfirmDelete'
import { EMPTY_TASK, TaskForm, type Member } from '@/components/romez/tasks/TaskForm'
import { TaskHistory } from '@/components/romez/tasks/TaskHistory'

const STATUS_FILTERS: { key: NonNullable<TaskFilters['status']> | 'all'; label: string }[] = [
  { key: 'open', label: 'Abiertas' },
  { key: 'PENDING', label: 'Pendientes' },
  { key: 'IN_PROGRESS', label: 'En curso' },
  { key: 'DONE', label: 'Hechas' },
  { key: 'CANCELLED', label: 'Canceladas' },
  { key: 'all', label: 'Todas' },
]

const STATUS_TONE: Record<TaskStatus, string> = {
  PENDING: 'bg-[var(--paper-inset)] text-[var(--ink-secondary)]',
  IN_PROGRESS: 'bg-[var(--ast-accent-soft)] text-[var(--ast-accent)]',
  DONE: 'bg-[var(--success-paper)] text-[var(--success)]',
  CANCELLED: 'bg-[var(--danger-paper)] text-[var(--danger)]',
}

const PRIORITY_TONE = { LOW: 'text-[var(--ink-tertiary)]', MEDIUM: 'text-[var(--warning)]', HIGH: 'text-[var(--danger)]' } as const

/** Sección Tareas: owner/admin crean y asignan; cada integrante ve las suyas y les cambia el estado. */
export default function TasksPage() {
  const queryClient = useQueryClient()
  const confirmDelete = useConfirmDelete()
  const [viewer, setViewer] = useState<{ userId: string; role: string } | null | undefined>(undefined)
  const [status, setStatus] = useState<NonNullable<TaskFilters['status']> | 'all'>('open')
  const [assignee, setAssignee] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Task | 'new' | null>(null)
  const [history, setHistory] = useState<{ taskId?: string; title?: string } | null>(null)

  useEffect(() => {
    const stored = auth.get()
    setViewer(stored ? { userId: stored.userId, role: stored.role } : null)
  }, [])
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const isManager = viewer?.role === 'owner' || viewer?.role === 'admin'
  const filters: TaskFilters = { status: status === 'all' ? undefined : status, assignedToUserId: assignee || undefined, search: search || undefined }

  const tasks = useQuery({ queryKey: ['tasks', 'list', filters], queryFn: () => tasksApi.list(filters).then((response) => response.data), enabled: viewer !== undefined })
  // Contadores: mismas personas y búsqueda, pero de todos los estados (no cambian al tocar el filtro de estado).
  const countFilters: TaskFilters = { ...filters, status: undefined }
  const allTasks = useQuery({ queryKey: ['tasks', 'list', countFilters], queryFn: () => tasksApi.list(countFilters).then((response) => response.data), enabled: viewer !== undefined })
  const team = useQuery<Member[]>({ queryKey: ['team'], queryFn: () => teamApi.list().then((response) => response.data), enabled: isManager })
  const members = team.data ?? []

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['tasks'] })
  const save = useMutation({
    mutationFn: ({ id, input }: { id?: string; input: TaskInput }) => (id ? tasksApi.update(id, input) : tasksApi.create(input)).then((response) => response.data),
    onSuccess: () => { setEditing(null); refresh() },
  })
  const changeStatus = useMutation({
    mutationFn: ({ id, next }: { id: string; next: TaskStatus }) => tasksApi.setStatus(id, next),
    onSuccess: refresh,
  })
  const remove = useMutation({ mutationFn: (id: string) => tasksApi.remove(id), onSuccess: refresh })

  if (viewer === undefined) return <LoadingState />

  const list = tasks.data ?? []
  const today = todayInParaguay()
  const everything = allTasks.data ?? []
  const counts = {
    pending: everything.filter((task) => task.status === 'PENDING').length,
    progress: everything.filter((task) => task.status === 'IN_PROGRESS').length,
    overdue: everything.filter((task) => isOverdue(task, today)).length,
    done: everything.filter((task) => task.status === 'DONE').length,
  }
  const canChange = (task: Task) => viewer !== null && viewer.role !== 'viewer' && (isManager || task.assignedToUserId === viewer.userId)

  return (
    <PageFrame className="assistant-ui !space-y-7">
      <header className="ast-rise relative overflow-hidden rounded-[2rem] border border-[var(--line-soft)] px-6 py-7 shadow-[var(--ast-card-shadow)] sm:px-9 sm:py-8" style={{ background: 'var(--ast-hero)' }}>
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full border border-[var(--line-soft)]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-1 text-xs font-semibold text-[var(--ast-accent)] shadow-sm"><ClipboardList size={13} /> Equipo del estudio</p>
            <h1 className="font-display mt-4 text-[clamp(1.75rem,3.4vw,2.5rem)] font-bold leading-[1.08] tracking-[-0.03em] text-[var(--ink-primary)]">Tareas</h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[var(--ink-secondary)]">
              {isManager ? 'Creá tareas, asignalas a alguien del equipo y seguí cómo avanzan. Todo cambio queda en el historial.' : 'Las tareas que te asignaron. Cambiá el estado a medida que avanzás.'}
            </p>
          </div>
          {isManager ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary !rounded-full" onClick={() => setHistory({})}><History size={15} /> Historial</button>
              <button type="button" className="btn-primary !rounded-full" onClick={() => { save.reset(); setEditing('new') }}><Plus size={15} /> Nueva tarea</button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat icon={CircleDashed} label="Pendientes" value={counts.pending} />
        <Stat icon={Timer} label="En curso" value={counts.progress} tone="accent" />
        <Stat icon={AlertCircle} label="Vencidas" value={counts.overdue} tone={counts.overdue ? 'bad' : undefined} />
        <Stat icon={CheckCircle2} label="Hechas" value={counts.done} tone="good" />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          <div className="inline-flex gap-1 rounded-full border border-[var(--line-soft)] bg-[var(--paper)] p-1 shadow-[var(--ast-card-shadow)]" role="group" aria-label="Estado">
            {STATUS_FILTERS.map((entry) => (
              <button key={entry.key} type="button" aria-pressed={status === entry.key} onClick={() => setStatus(entry.key)} className={clsx('min-h-8 whitespace-nowrap rounded-full px-3.5 text-xs font-semibold transition-colors', status === entry.key ? 'bg-[var(--ast-accent)] text-[var(--ast-on-accent)]' : 'text-[var(--ink-secondary)] hover:bg-[var(--paper-soft)]')}>{entry.label}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {isManager ? (
            <select className="ctrl-input !rounded-full sm:w-52" value={assignee} onChange={(event) => setAssignee(event.target.value)} aria-label="Responsable">
              <option value="">Todo el equipo</option>
              <option value="none">Sin asignar</option>
              {members.map((member) => <option key={member.user.id} value={member.user.id}>{fullName(member.user)}</option>)}
            </select>
          ) : null}
          <label className="relative block sm:w-64">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" />
            <input className="ctrl-input !rounded-full !pl-10" placeholder="Buscar tarea o cliente…" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} aria-label="Buscar" />
          </label>
        </div>
      </div>

      {tasks.isLoading ? <LoadingState label="Cargando tareas…" /> : null}
      {tasks.isError ? <ErrorState message={getErrorMessage(tasks.error)} retry={() => tasks.refetch()} /> : null}
      {changeStatus.isError ? <p className="rounded-2xl border border-[var(--danger-line)] bg-[var(--danger-paper)] px-4 py-3 text-sm font-semibold text-[var(--danger)]">{getErrorMessage(changeStatus.error, 'No pudimos cambiar el estado.')}</p> : null}
      {remove.isError ? <p className="rounded-2xl border border-[var(--danger-line)] bg-[var(--danger-paper)] px-4 py-3 text-sm font-semibold text-[var(--danger)]">{getErrorMessage(remove.error, 'No pudimos eliminar la tarea.')}</p> : null}

      {tasks.data && !list.length ? (
        <div className="ast-card flex flex-col items-center gap-3 px-6 py-14 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-3xl bg-[var(--ast-accent-soft)] text-[var(--ast-accent)]"><ClipboardList size={24} /></span>
          <p className="font-display text-base font-semibold text-[var(--ink-primary)]">No hay tareas para mostrar</p>
          <p className="max-w-sm text-sm text-[var(--ink-tertiary)]">{isManager ? 'Creá la primera con «Nueva tarea» o cambiá los filtros.' : 'No tenés tareas con este filtro. Cuando te asignen una, aparece acá.'}</p>
        </div>
      ) : null}

      {list.length ? (
        <ul className="space-y-3">
          {list.map((task) => {
            const overdue = isOverdue(task, today)
            return (
              <li key={task.id} className={clsx('ast-card flex flex-col gap-4 p-4 transition-shadow sm:flex-row sm:items-center sm:p-5', overdue && 'border-[var(--danger-line)]')}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={clsx('inline-flex items-center gap-1 text-xs font-semibold', PRIORITY_TONE[task.priority])}><Flag size={12} /> {PRIORITY_LABEL[task.priority]}</span>
                    {overdue ? <span className="rounded-full bg-[var(--danger-paper)] px-2 py-0.5 text-[11px] font-semibold text-[var(--danger)]">Vencida</span> : null}
                  </div>
                  <p className={clsx('mt-1 text-[15px] font-semibold text-[var(--ink-primary)]', (task.status === 'DONE' || task.status === 'CANCELLED') && 'text-[var(--ink-tertiary)] line-through decoration-[var(--line-strong)]')}>{task.title}</p>
                  {task.description ? <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--ink-tertiary)]">{task.description}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-[var(--ink-secondary)]">
                    <Chip icon={UserRound}>{task.assignedTo ? fullName(task.assignedTo) : 'Sin asignar'}</Chip>
                    {task.company ? <Chip icon={Building2}>{task.company.name}</Chip> : null}
                    {task.dueDate ? <Chip icon={CalendarDays} danger={overdue}>Vence {formatDay(task.dueDate)}</Chip> : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {canChange(task) ? (
                    <select
                      className={clsx('min-h-9 cursor-pointer rounded-full border-0 px-3.5 text-xs font-semibold outline-none focus-visible:ring-4 focus-visible:ring-[var(--ast-accent-soft)]', STATUS_TONE[task.status])}
                      value={task.status}
                      disabled={changeStatus.isPending}
                      onChange={(event) => changeStatus.mutate({ id: task.id, next: event.target.value as TaskStatus })}
                      aria-label={`Estado de ${task.title}`}
                    >
                      {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((key) => <option key={key} value={key}>{STATUS_LABEL[key]}</option>)}
                    </select>
                  ) : <span className={clsx('rounded-full px-3.5 py-2 text-xs font-semibold', STATUS_TONE[task.status])}>{STATUS_LABEL[task.status]}</span>}
                  <IconButton label={`Historial de ${task.title}`} onClick={() => setHistory({ taskId: task.id, title: task.title })}><History size={15} /></IconButton>
                  {isManager ? (
                    <>
                      <IconButton label={`Editar ${task.title}`} onClick={() => { save.reset(); setEditing(task) }}><Pencil size={15} /></IconButton>
                      <IconButton label={`Eliminar ${task.title}`} danger onClick={async () => {
                        if (await confirmDelete({ title: '¿Eliminar esta tarea?', message: `«${task.title}» deja de aparecer en la lista. Su historial se conserva.`, confirmLabel: 'Sí, eliminar' })) remove.mutate(task.id)
                      }}><Trash2 size={15} /></IconButton>
                    </>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}

      {editing ? (
        <TaskForm
          initial={editing === 'new' ? EMPTY_TASK : { ...toInput(editing), id: editing.id }}
          initialClientName={editing === 'new' ? null : editing.company?.name}
          members={members}
          saving={save.isPending}
          error={save.error}
          onCancel={() => setEditing(null)}
          onSave={(input) => save.mutate({ id: editing === 'new' ? undefined : editing.id, input })}
        />
      ) : null}
      {history ? <TaskHistory taskId={history.taskId} taskTitle={history.title} onClose={() => setHistory(null)} /> : null}
    </PageFrame>
  )
}

function Stat({ icon: Icon, label, value, tone }: { icon: typeof Plus; label: string; value: number; tone?: 'accent' | 'good' | 'bad' }) {
  const chip = tone === 'good' ? 'bg-[var(--success-paper)] text-[var(--success)]' : tone === 'bad' ? 'bg-[var(--danger-paper)] text-[var(--danger)]' : 'bg-[var(--ast-accent-soft)] text-[var(--ast-accent)]'
  return (
    <div className="ast-card flex items-center gap-3.5 p-4 sm:p-5">
      <span className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-2xl', chip)}><Icon size={18} /></span>
      <div className="min-w-0">
        <p className="font-display text-2xl font-bold leading-none tabular-nums text-[var(--ink-primary)]">{value}</p>
        <p className="mt-1 truncate text-xs text-[var(--ink-tertiary)]">{label}</p>
      </div>
    </div>
  )
}

function Chip({ icon: Icon, children, danger }: { icon: typeof Plus; children: React.ReactNode; danger?: boolean }) {
  return <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1', danger ? 'bg-[var(--danger-paper)] text-[var(--danger)]' : 'bg-[var(--paper-soft)]')}><Icon size={12} />{children}</span>
}

function IconButton({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={clsx('grid h-9 w-9 place-items-center rounded-full border border-[var(--line-soft)] text-[var(--ink-tertiary)] transition-colors', danger ? 'hover:border-[var(--danger-line)] hover:bg-[var(--danger-paper)] hover:text-[var(--danger)]' : 'hover:bg-[var(--paper-soft)] hover:text-[var(--ink-primary)]')}>
      {children}
    </button>
  )
}
