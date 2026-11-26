'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { calendarApi, type CalendarAppointment } from '@/lib/api'
import { auth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/format'
import { TopbarContent } from '@/components/romez/Topbar'
import { LineWhatsAppPanel } from '@/components/romez/LineWhatsAppPanel'
import { MemberAvatar, memberName, useTeamMembers } from '@/components/social/AssigneeControl'
import { SocialChatPanel } from '@/components/social/SocialChat'
import { NETWORKS, NetworkLogo } from '@/components/social/networks'
import { MESSAGES_WHATSAPP } from '@/components/social/whatsapp-line'
import { toDateInput } from '@/components/calendar/ScheduleControl'

const DAYS = 30
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const startOfDay = (date: Date) => { const d = new Date(date); d.setHours(0, 0, 0, 0); return d }
const addDays = (date: Date, days: number) => { const d = new Date(date); d.setDate(d.getDate() + days); return d }
const time = (value: string) => new Date(value).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })

/** Calendario: por defecto los próximos 30 días, con las fechas agendadas desde chats y leads. */
export default function CalendarPage() {
  const queryClient = useQueryClient()
  const user = auth.get()
  const team = useTeamMembers()
  const [start, setStart] = useState(() => startOfDay(new Date()))
  const [assignee, setAssignee] = useState<string | 'all'>('all')
  const [open, setOpen] = useState<CalendarAppointment | null>(null)
  const end = addDays(start, DAYS)
  const query = useQuery({ queryKey: ['calendar', start.toISOString()], queryFn: () => calendarApi.list(start, end).then((response) => response.data.appointments), refetchInterval: 30_000 })
  const appointments = useMemo(() => (query.data ?? []).filter((item) => assignee === 'all' || (assignee === 'free' ? !item.assignedToUserId : item.assignedToUserId === assignee)), [query.data, assignee])
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarAppointment[]>()
    for (const item of appointments) { const key = toDateInput(new Date(item.startsAt)); map.set(key, [...(map.get(key) ?? []), item]) }
    return map
  }, [appointments])
  const today = toDateInput(new Date())
  // Celdas vacías al principio para que cada día caiga en su columna (lunes primero).
  const lead = (start.getDay() + 6) % 7
  const days = Array.from({ length: DAYS }, (_, index) => addDays(start, index))
  const rangeLabel = `${start.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} – ${addDays(end, -1).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}`.replace(/\./g, '')
  const close = () => { setOpen(null); queryClient.invalidateQueries({ queryKey: ['calendar'] }) }

  return (
    <div className="flex h-full flex-col">
      <TopbarContent>
        <div className="min-w-0 flex-1">
          <p className="hidden truncate text-xs font-medium text-[var(--ink-tertiary)] sm:block">Próximos {DAYS} días · {rangeLabel}</p>
          <h1 className="truncate font-display text-base font-bold leading-tight text-[var(--ink-primary)]">Calendario</h1>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" className="grid h-9 w-9 place-items-center rounded-full text-[var(--ink-secondary)] hover:bg-[var(--paper-soft)]" onClick={() => setStart(addDays(start, -DAYS))} aria-label="30 días antes"><ChevronLeft size={18} /></button>
          <button type="button" className="btn-secondary h-9 !min-h-9 !px-3" onClick={() => setStart(startOfDay(new Date()))}>Hoy</button>
          <button type="button" className="grid h-9 w-9 place-items-center rounded-full text-[var(--ink-secondary)] hover:bg-[var(--paper-soft)]" onClick={() => setStart(addDays(start, DAYS))} aria-label="30 días después"><ChevronRight size={18} /></button>
        </div>
      </TopbarContent>

      <div className="shrink-0 px-4 pt-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por responsable">
          {[{ id: 'all', label: 'Todos' }, ...(team.data ?? []).map((member) => ({ id: member.id, label: member.id === user?.userId ? 'Míos' : member.firstName, member })), { id: 'free', label: 'Sin responsable' }].map((item) => (
            <button key={item.id} type="button" onClick={() => setAssignee(item.id)} aria-pressed={assignee === item.id} className={clsx('inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ring-1 transition-colors', 'member' in item ? 'pl-1' : '', assignee === item.id ? 'bg-[var(--brand-navy)] text-white ring-transparent' : 'bg-[var(--paper)] text-[var(--ink-secondary)] ring-[var(--line)] hover:text-[var(--ink-primary)]')}>
              {'member' in item && item.member ? <MemberAvatar member={item.member} className="h-6 w-6 text-[9px]" /> : null}{item.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-[var(--ink-muted)]">{query.isFetching ? 'Actualizando…' : `${appointments.length} fecha${appointments.length === 1 ? '' : 's'} agendada${appointments.length === 1 ? '' : 's'}`}</span>
        </div>
      </div>

      {query.isLoading ? <div className="grid flex-1 place-items-center"><Loader2 className="animate-spin text-[var(--ink-muted)]" size={28} /></div>
        : query.isError ? <p className="p-6 text-sm font-semibold text-[var(--danger)]">{getErrorMessage(query.error)}</p> : (
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-[var(--line-soft)] bg-[var(--line-soft)] shadow-[var(--ast-card-shadow)]">
              {WEEKDAYS.map((day) => <div key={day} className="bg-[var(--paper-soft)] px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-[var(--ink-tertiary)]">{day}</div>)}
              {Array.from({ length: lead }, (_, index) => <div key={`pad-${index}`} className="min-h-28 bg-[var(--paper-soft)]/60" />)}
              {days.map((day) => {
                const key = toDateInput(day)
                const items = byDay.get(key) ?? []
                const isToday = key === today
                const weekend = day.getDay() === 0 || day.getDay() === 6
                return (
                  <div key={key} className={clsx('min-h-28 p-1.5', weekend ? 'bg-[var(--paper-soft)]' : 'bg-[var(--paper)]')}>
                    <p className={clsx('mb-1 flex items-center gap-1 px-1 text-xs font-semibold', isToday ? 'text-[var(--brand-blue)]' : 'text-[var(--ink-secondary)]')}>
                      <span className={clsx('grid h-6 min-w-6 place-items-center rounded-full', isToday && 'bg-[var(--brand-navy)] text-white')}>{day.getDate()}</span>
                      {day.getDate() === 1 || key === toDateInput(start) ? <span className="text-[10px] uppercase text-[var(--ink-muted)]">{day.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '')}</span> : null}
                    </p>
                    <div className="space-y-1">
                      {items.map((item) => {
                        const color = item.network ? NETWORKS[item.network].color : 'var(--brand-blue)'
                        return (
                          <button key={item.id} type="button" onClick={() => setOpen(item)} title={`${time(item.startsAt)} · ${item.deal.title}${item.note ? ` · ${item.note}` : ''}${item.assignedTo ? ` · ${memberName(item.assignedTo)}` : ''}`}
                            className="flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left text-[11px] leading-tight hover:brightness-95" style={{ background: `color-mix(in srgb, ${color} 12%, var(--paper))`, color }}>
                            {item.network ? <NetworkLogo network={item.network} size={11} /> : null}
                            <b className="shrink-0">{time(item.startsAt)}</b>
                            <span className="min-w-0 truncate text-[var(--ink-primary)]">{item.deal.title.split(' · ')[0]}</span>
                            {item.assignedTo ? <MemberAvatar member={item.assignedTo} className="ml-auto h-4 w-4 shrink-0 text-[7px]" /> : null}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="mt-3 text-xs text-[var(--ink-muted)]">Las fechas se eligen desde cada chat o lead con el botón «Agendar». Tocá una para abrir su conversación.</p>
          </div>
        )}

      {open?.chatId && (open.network === 'instagram' || open.network === 'facebook') ? <SocialChatPanel conversationId={open.chatId} onClose={close} /> : null}
      {open?.chatId && open.network === 'whatsapp' ? <LineWhatsAppPanel line={MESSAGES_WHATSAPP} initialChatId={open.chatId} canWrite={user?.role !== 'viewer'} canManage={user?.role === 'owner' || user?.role === 'admin'} currentUserId={user?.userId} onClose={close} /> : null}
    </div>
  )
}
