'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck, FileDown, Plus, RotateCcw, Save, Send, Trash2, UsersRound } from 'lucide-react'
import clsx from 'clsx'
import { auth } from '@/lib/auth'
import { dailyReportsApi, type DailyReportPayload } from '@/lib/api'
import type { DailyReport, MyDailyReportResponse, Role, TeamDailyReportResponse, TeamDailyReportRow } from '@/types'
import { formatDate, fullName, getErrorMessage } from '@/lib/format'
import { EmptyState, ErrorState, LoadingState, PageFrame, PageHeader, SectionPanel, StatusPill } from '@/components/romez/OperationalUI'
import { ClientPicker } from '@/components/romez/ClientPicker'
import { DateField } from '@/components/romez/DateField'

type DraftTask = {
  key: string
  description: string
  companyId: string
  company: { id: string; name: string; ruc?: string | null } | null
  minutes: string
  isDone: boolean
}

let taskSeq = 0
const newTask = (): DraftTask => ({ key: `task-${++taskSeq}`, description: '', companyId: '', company: null, minutes: '', isDone: true })

const STATE_LABEL = { SUBMITTED: 'Enviada', DRAFT: 'Borrador', MISSING: 'Sin cargar' } as const
const STATE_TONE = { SUBMITTED: 'success', DRAFT: 'warning', MISSING: 'danger' } as const

function paraguayBusinessDate() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Asuncion', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** Suma días a una fecha `yyyy-mm-dd` sin pasar por la zona horaria del navegador. */
function shiftDate(iso: string, days: number) {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days, 12))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function longDate(iso: string) {
  const text = new Intl.DateTimeFormat('es-PY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function formatMinutes(total: number) {
  if (!total) return '—'
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (!hours) return `${minutes} min`
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`
}

const submittedTime = (value?: string | null) => formatDate(value, { hour: '2-digit', minute: '2-digit', timeZone: 'America/Asuncion' })

/** "Planilla Diaria - Jueves 24-09-2026.pdf": el nombre del servidor y, si el navegador no lo expone, el mismo armado acá. */
function planillaFileName(disposition: string | undefined, iso: string) {
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (encoded) {
    try { return decodeURIComponent(encoded) } catch { /* se arma localmente */ }
  }
  const [year, month, day] = iso.split('-')
  const weekday = new Intl.DateTimeFormat('es-PY', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`))
  return `Planilla Diaria - ${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${day}-${month}-${year}.pdf`
}

const isCount = (value: string) => value === '' || /^\d{1,6}$/.test(value.trim())
const toCount = (value: string) => value.trim() === '' ? null : Number(value.trim())

export default function DailyReportsPage() {
  const [role, setRole] = useState<Role>()
  useEffect(() => { setRole(auth.get()?.role as Role | undefined) }, [])
  const canManage = role === 'owner' || role === 'admin'
  const canWrite = Boolean(role && role !== 'viewer')

  const [today, setToday] = useState('')
  const [date, setDate] = useState('')
  const [view, setView] = useState<'mine' | 'team'>('mine')
  useEffect(() => { const current = paraguayBusinessDate(); setToday(current); setDate(current) }, [])

  // Owner y admin llegan acá sobre todo a revisar: arrancan en el resumen del equipo.
  useEffect(() => { if (canManage) setView('team') }, [canManage])

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date)

  const downloadPdf = useMutation({
    mutationFn: () => dailyReportsApi.teamPdf(date),
    onSuccess: ({ data, headers }) => {
      const url = URL.createObjectURL(data)
      const link = window.document.createElement('a')
      link.href = url
      link.download = planillaFileName(headers['content-disposition'] as string | undefined, date)
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
  })

  return (
    <PageFrame>
      <PageHeader
        eyebrow="Cierre de jornada"
        title="Planilla diaria"
        description="Al terminar el día, cada integrante carga lo que hizo y envía su planilla. Owner y admin ven el resumen de todo el equipo."
        action={canManage ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={!validDate || downloadPdf.isPending} onClick={() => downloadPdf.mutate()}>
              <FileDown size={15} /> {downloadPdf.isPending ? 'Generando…' : 'Descargar planilla PDF'}
            </button>
            <button type="button" className={clsx('btn-secondary', view === 'team' && 'border-[var(--brand-blue)] text-[var(--brand-blue)]')} onClick={() => setView('team')}>
              <UsersRound size={15} /> Resumen del equipo
            </button>
            <button type="button" className={clsx('btn-secondary', view === 'mine' && 'border-[var(--brand-blue)] text-[var(--brand-blue)]')} onClick={() => setView('mine')}>
              <ClipboardCheck size={15} /> Mi planilla
            </button>
          </div>
        ) : null}
      />

      {downloadPdf.error ? <p className="text-xs font-semibold text-[var(--danger)]">{getErrorMessage(downloadPdf.error, 'No pudimos generar el PDF de la planilla.')}</p> : null}

      <DayNavigator date={date} today={today} onChange={setDate} />

      {!role || !validDate ? null : !canWrite ? (
        <EmptyState title="Sin planilla para tu rol" description="El rol viewer consulta información pero no carga planillas diarias." />
      ) : view === 'team' && canManage ? (
        <TeamSummary date={date} />
      ) : (
        <MyReport date={date} />
      )}
    </PageFrame>
  )
}

function DayNavigator({ date, today, onChange }: { date: string; today: string; onChange: (iso: string) => void }) {
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date)
  return (
    <section className="paper-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--ink-muted)]">{date === today ? 'Hoy' : 'Día seleccionado'}</p>
        <p className="mt-1 font-display text-lg font-extrabold text-[var(--ink-primary)]">{valid ? longDate(date) : '—'}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary" disabled={!valid} onClick={() => onChange(shiftDate(date, -1))} aria-label="Día anterior">
          <ChevronLeft size={15} />
        </button>
        <div className="w-40">
          <DateField value={date} onChange={(iso) => { if (iso && iso <= today) onChange(iso) }} />
        </div>
        <button type="button" className="btn-secondary" disabled={!valid || date >= today} onClick={() => onChange(shiftDate(date, 1))} aria-label="Día siguiente">
          <ChevronRight size={15} />
        </button>
        <button type="button" className="btn-secondary" disabled={date === today} onClick={() => onChange(today)}>Hoy</button>
      </div>
    </section>
  )
}

function toDraft(report: DailyReport | null) {
  if (!report?.items.length) return [newTask()]
  return report.items.map((item) => ({
    key: `task-${++taskSeq}`,
    description: item.description,
    companyId: item.companyId ?? '',
    company: item.company ?? null,
    minutes: item.minutes === null || item.minutes === undefined ? '' : String(item.minutes),
    isDone: item.isDone,
  }))
}

function MyReport({ date }: { date: string }) {
  const queryClient = useQueryClient()
  const [tasks, setTasks] = useState<DraftTask[]>(() => [newTask()])
  const [notes, setNotes] = useState('')
  const [physical, setPhysical] = useState('')
  const [migrated, setMigrated] = useState('')
  const [dirty, setDirty] = useState(false)

  const reportQuery = useQuery<MyDailyReportResponse>({
    queryKey: ['daily-report', 'mine', date],
    queryFn: () => dailyReportsApi.mine(date).then((response) => response.data),
  })
  const report = reportQuery.data?.report ?? null

  // Al cambiar de día o después de guardar, el formulario vuelve a reflejar lo del servidor.
  const serverVersion = `${date}:${report?.id ?? 'new'}:${report?.updatedAt ?? ''}`
  useEffect(() => {
    if (!reportQuery.data) return
    setTasks(toDraft(reportQuery.data.report))
    setNotes(reportQuery.data.report?.notes ?? '')
    setPhysical(reportQuery.data.report?.physicalCount?.toString() ?? '')
    setMigrated(reportQuery.data.report?.migratedCount?.toString() ?? '')
    setDirty(false)
  }, [serverVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  const update = (key: string, patch: Partial<DraftTask>) => {
    setTasks((current) => current.map((task) => task.key === key ? { ...task, ...patch } : task))
    setDirty(true)
  }

  const payload = (): DailyReportPayload => ({
    date,
    notes: notes.trim() || null,
    physicalCount: toCount(physical),
    migratedCount: toCount(migrated),
    items: tasks
      .filter((task) => task.description.trim())
      .map((task) => ({
        description: task.description.trim(),
        companyId: task.companyId || null,
        minutes: task.minutes === '' ? null : Math.max(0, Math.round(Number(task.minutes))),
        isDone: task.isDone,
      })),
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['daily-report'] })
  }

  const save = useMutation({ mutationFn: () => dailyReportsApi.save(payload()), onSuccess: refresh })
  const submit = useMutation({
    mutationFn: async () => {
      if (dirty || !report) await dailyReportsApi.save(payload())
      return dailyReportsApi.submit(date)
    },
    onSuccess: refresh,
  })

  if (reportQuery.isLoading) return <LoadingState />
  if (reportQuery.isError) return <ErrorState message={getErrorMessage(reportQuery.error)} retry={() => reportQuery.refetch()} />

  const submitted = report?.status === 'SUBMITTED'
  const filled = tasks.filter((task) => task.description.trim())
  const invalidMinutes = tasks.some((task) => task.minutes !== '' && (!Number.isFinite(Number(task.minutes)) || Number(task.minutes) < 0 || Number(task.minutes) > 1440))
  const invalidCounts = !isCount(physical) || !isCount(migrated)
  const totalMinutes = filled.reduce((sum, task) => sum + (Number(task.minutes) || 0), 0)
  const pending = filled.filter((task) => !task.isDone).length
  const busy = save.isPending || submit.isPending
  const state = report?.status ?? 'MISSING'

  if (submitted && report) {
    return (
      <SectionPanel
        title="Mi planilla"
        description={`Enviada a las ${submittedTime(report.submittedAt)} h. Si necesitás corregirla, pedile a un administrador que la reabra.`}
        action={<StatusPill tone="success">Enviada</StatusPill>}
      >
        <ReportDetail report={report} />
      </SectionPanel>
    )
  }

  return (
    <SectionPanel
      title="Mi planilla"
      description={report?.reopenedAt
        ? `Reabierta por ${fullName(report.reopenedBy)} para corregir. Guardá los cambios y volvé a enviarla.`
        : 'Cargá una línea por tarea. Marcá como pendiente lo que quedó para otro día.'}
      action={<StatusPill tone={STATE_TONE[state]}>{STATE_LABEL[state]}</StatusPill>}
    >
      <div className="space-y-3 p-4 sm:p-5">
        <div className="hidden grid-cols-[92px_minmax(0,1.4fr)_minmax(0,1fr)_96px_40px] gap-2 px-1 text-[10px] font-bold uppercase tracking-[.08em] text-[var(--ink-muted)] lg:grid">
          <span>Estado</span><span>Tarea</span><span>Cliente (opcional)</span><span>Minutos</span><span />
        </div>
        {tasks.map((task, index) => (
          <div key={task.key} className="grid gap-2 rounded-lg border border-[var(--line-soft)] p-2 lg:grid-cols-[92px_minmax(0,1.4fr)_minmax(0,1fr)_96px_40px] lg:border-0 lg:p-0">
            <button
              type="button"
              className={clsx('btn-secondary justify-center', task.isDone ? 'text-[var(--success)]' : 'text-[var(--warning)]')}
              onClick={() => update(task.key, { isDone: !task.isDone })}
              aria-label={`Tarea ${index + 1}: ${task.isDone ? 'hecha' : 'pendiente'}`}
            >
              {task.isDone ? <><CheckCircle2 size={14} /> Hecha</> : 'Pendiente'}
            </button>
            <input
              className="ctrl-input"
              placeholder="¿Qué hiciste? Ej.: liquidación de IVA, carga de facturas…"
              value={task.description}
              maxLength={500}
              onChange={(event) => update(task.key, { description: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && index === tasks.length - 1 && task.description.trim()) {
                  event.preventDefault()
                  setTasks((current) => [...current, newTask()])
                }
              }}
            />
            <ClientPicker
              value={task.companyId}
              initialClient={task.company}
              placeholder="Sin cliente"
              invalidHint="Elegí un cliente de la lista o dejalo vacío."
              onChange={(companyId, client) => update(task.key, { companyId, company: client ? { id: client.id, name: client.name, ruc: client.ruc } : null })}
            />
            <input
              className="ctrl-input font-mono tabular-nums"
              type="number"
              min="0"
              max="1440"
              step="5"
              placeholder="min"
              value={task.minutes}
              onChange={(event) => update(task.key, { minutes: event.target.value })}
              aria-label={`Minutos de la tarea ${index + 1}`}
            />
            <button
              type="button"
              className="btn-secondary justify-center"
              disabled={tasks.length === 1}
              onClick={() => { setTasks((current) => current.filter((row) => row.key !== task.key)); setDirty(true) }}
              aria-label={`Quitar tarea ${index + 1}`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button type="button" className="btn-secondary" onClick={() => setTasks((current) => [...current, newTask()])}>
          <Plus size={14} /> Agregar tarea
        </button>
      </div>

      <div className="border-t border-[var(--line-soft)] p-4 sm:p-5">
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:max-w-md">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold text-[var(--ink-secondary)]">Carga físico</span>
            <input className="ctrl-input font-mono tabular-nums" inputMode="numeric" placeholder="Cantidad" value={physical} onChange={(event) => { setPhysical(event.target.value); setDirty(true) }} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold text-[var(--ink-secondary)]">Imputado / migrado</span>
            <input className="ctrl-input font-mono tabular-nums" inputMode="numeric" placeholder="Cantidad" value={migrated} onChange={(event) => { setMigrated(event.target.value); setDirty(true) }} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold text-[var(--ink-secondary)]">Observaciones del día (opcional)</span>
          <textarea
            className="ctrl-input min-h-20"
            maxLength={2000}
            value={notes}
            placeholder="Algo que el equipo o la administración tenga que saber…"
            onChange={(event) => { setNotes(event.target.value); setDirty(true) }}
          />
        </label>
        <dl className="mt-4 flex flex-wrap gap-6 text-sm">
          <Datum label="Tareas" value={String(filled.length)} />
          <Datum label="Pendientes" value={String(pending)} tone={pending ? 'warning' : undefined} />
          <Datum label="Tiempo cargado" value={formatMinutes(totalMinutes)} />
        </dl>
      </div>

      <div className="flex flex-col gap-3 border-t border-[var(--line-soft)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        {save.error || submit.error ? (
          <p className="text-xs font-semibold text-[var(--danger)]">{getErrorMessage(save.error ?? submit.error, 'No pudimos guardar la planilla.')}</p>
        ) : invalidMinutes ? (
          <p className="text-xs font-semibold text-[var(--danger)]">Los minutos tienen que estar entre 0 y 1440.</p>
        ) : invalidCounts ? (
          <p className="text-xs font-semibold text-[var(--danger)]">Carga físico e Imputado / migrado van como números enteros, sin puntos.</p>
        ) : (
          <p className="text-xs text-[var(--ink-tertiary)]">{dirty ? 'Tenés cambios sin guardar.' : report ? `Borrador guardado a las ${submittedTime(report.updatedAt)} h.` : 'Todavía no guardaste nada para este día.'}</p>
        )}
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" disabled={busy || invalidMinutes || invalidCounts || !dirty} onClick={() => save.mutate()}>
            <Save size={14} /> {save.isPending ? 'Guardando…' : 'Guardar borrador'}
          </button>
          <button type="button" className="btn-primary" disabled={busy || invalidMinutes || invalidCounts || !filled.length} onClick={() => submit.mutate()}>
            <Send size={14} /> {submit.isPending ? 'Enviando…' : 'Enviar planilla'}
          </button>
        </div>
      </div>
    </SectionPanel>
  )
}

function TeamSummary({ date }: { date: string }) {
  const queryClient = useQueryClient()
  const [openUserId, setOpenUserId] = useState<string | null>(null)

  const teamQuery = useQuery<TeamDailyReportResponse>({
    queryKey: ['daily-report', 'team', date],
    queryFn: () => dailyReportsApi.team(date).then((response) => response.data),
    refetchInterval: 60_000,
  })

  const reopen = useMutation({
    mutationFn: (id: string) => dailyReportsApi.reopen(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['daily-report'] }),
  })

  if (teamQuery.isLoading) return <LoadingState />
  if (teamQuery.isError) return <ErrorState message={getErrorMessage(teamQuery.error)} retry={() => teamQuery.refetch()} />
  const data = teamQuery.data
  if (!data) return null
  const { totals } = data

  return (
    <>
      <section className="grid overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--line)] sm:grid-cols-3 xl:grid-cols-6">
        <Metric label="Enviaron" value={`${totals.submitted} de ${totals.members}`} tone={totals.submitted === totals.members && totals.members > 0 ? 'success' : undefined} />
        <Metric label="En borrador" value={String(totals.draft)} tone={totals.draft ? 'warning' : undefined} />
        <Metric label="Sin cargar" value={String(totals.missing)} tone={totals.missing ? 'danger' : undefined} />
        <Metric label="Tareas" value={String(totals.tasks)} />
        <Metric label="Pendientes" value={String(totals.pending)} tone={totals.pending ? 'warning' : undefined} />
        <Metric label="Tiempo total" value={formatMinutes(totals.minutes)} />
      </section>

      <SectionPanel title="Equipo" description="Se actualiza solo cada minuto. Tocá una persona para ver el detalle de su día.">
        {data.members.length ? (
          <ul className="divide-y divide-[var(--line-soft)]">
            {data.members.map((row) => (
              <TeamRow
                key={row.user.id}
                row={row}
                open={openUserId === row.user.id}
                onToggle={() => setOpenUserId((current) => current === row.user.id ? null : row.user.id)}
                onReopen={(id) => reopen.mutate(id)}
                reopening={reopen.isPending}
              />
            ))}
          </ul>
        ) : (
          <EmptyState title="Sin integrantes" description="Todavía no hay personas del equipo con la planilla diaria habilitada." />
        )}
        {reopen.error ? <p className="border-t border-[var(--line-soft)] px-5 py-3 text-xs font-semibold text-[var(--danger)]">{getErrorMessage(reopen.error, 'No pudimos reabrir la planilla.')}</p> : null}
      </SectionPanel>
    </>
  )
}

function TeamRow({ row, open, onToggle, onReopen, reopening }: { row: TeamDailyReportRow; open: boolean; onToggle: () => void; onReopen: (id: string) => void; reopening: boolean }) {
  const report = row.report
  const summary = report?.summary
  return (
    <li>
      <button type="button" className="flex w-full flex-col gap-2 px-4 py-3 text-left hover:bg-[var(--paper-soft)] sm:flex-row sm:items-center sm:justify-between sm:px-5" onClick={onToggle} aria-expanded={open} disabled={!report}>
        <span className="flex min-w-0 items-center gap-3">
          <ChevronDown size={15} className={clsx('flex-none text-[var(--ink-muted)] transition-transform', open && 'rotate-180', !report && 'invisible')} />
          <span className="min-w-0">
            <span className="block truncate font-bold text-[var(--ink-primary)]">{fullName(row.user)}</span>
            <span className="block text-[11px] text-[var(--ink-tertiary)]">
              {row.state === 'SUBMITTED' ? `Enviada a las ${submittedTime(report?.submittedAt)} h` : row.state === 'DRAFT' ? 'Guardó un borrador pero no la envió' : 'No cargó nada para este día'}
            </span>
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-3 pl-7 text-xs text-[var(--ink-secondary)] sm:pl-0">
          {summary ? (
            <>
              <span><strong className="tabular-nums text-[var(--ink-primary)]">{summary.tasks}</strong> tareas</span>
              {summary.pending ? <span className="font-semibold text-[var(--warning)]">{summary.pending} pendientes</span> : null}
              <span className="font-mono tabular-nums">{formatMinutes(summary.minutes)}</span>
            </>
          ) : null}
          <StatusPill tone={STATE_TONE[row.state]}>{STATE_LABEL[row.state]}</StatusPill>
        </span>
      </button>
      {open && report ? (
        <div className="border-t border-[var(--line-soft)] bg-[var(--paper-soft)]">
          <ReportDetail report={report} />
          {report.status === 'SUBMITTED' ? (
            <div className="flex justify-end border-t border-[var(--line-soft)] px-5 py-3">
              <button type="button" className="btn-secondary" disabled={reopening} onClick={() => onReopen(report.id)}>
                <RotateCcw size={14} /> Reabrir para corregir
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

function ReportDetail({ report }: { report: DailyReport }) {
  return (
    <div>
      {report.items.length ? (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Estado</th>
                <th>Tarea</th>
                <th>Cliente</th>
                <th className="text-right">Tiempo</th>
              </tr>
            </thead>
            <tbody>
              {report.items.map((item) => (
                <tr key={item.id}>
                  <td><StatusPill tone={item.isDone ? 'success' : 'warning'}>{item.isDone ? 'Hecha' : 'Pendiente'}</StatusPill></td>
                  <td className="whitespace-pre-wrap text-[var(--ink-primary)]">{item.description}</td>
                  <td>{item.company ? <Link className="font-semibold hover:text-[var(--brand-blue)]" href={`/clients/${item.company.id}`}>{item.company.name}</Link> : <span className="text-[var(--ink-muted)]">—</span>}</td>
                  <td className="text-right font-mono tabular-nums">{formatMinutes(item.minutes ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-4 text-sm text-[var(--ink-tertiary)]">El borrador todavía no tiene tareas.</p>
      )}
      {report.physicalCount !== null && report.physicalCount !== undefined || report.migratedCount !== null && report.migratedCount !== undefined ? (
        <dl className="flex flex-wrap gap-6 border-t border-[var(--line-soft)] px-5 py-4 text-sm">
          <Datum label="Carga físico" value={report.physicalCount?.toString() ?? '—'} />
          <Datum label="Imputado / migrado" value={report.migratedCount?.toString() ?? '—'} />
        </dl>
      ) : null}
      {report.notes ? (
        <div className="border-t border-[var(--line-soft)] px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--ink-muted)]">Observaciones</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--ink-primary)]">{report.notes}</p>
        </div>
      ) : null}
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'warning' | 'danger' }) {
  return (
    <div className="bg-[var(--paper)] p-5">
      <p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--ink-muted)]">{label}</p>
      <p className={clsx('mt-2 font-mono text-xl font-bold tabular-nums text-[var(--ink-primary)]', tone === 'success' && 'text-[var(--success)]', tone === 'warning' && 'text-[var(--warning)]', tone === 'danger' && 'text-[var(--danger)]')}>{value}</p>
    </div>
  )
}

function Datum({ label, value, tone }: { label: string; value: string; tone?: 'warning' }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--ink-muted)]">{label}</dt>
      <dd className={clsx('mt-1 font-mono font-bold tabular-nums text-[var(--ink-primary)]', tone === 'warning' && 'text-[var(--warning)]')}>{value}</dd>
    </div>
  )
}
