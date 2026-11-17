'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { AlertTriangle, CalendarDays, CheckCheck, Clock3, FlaskConical, Hourglass, Inbox, MessageSquareReply, MoonStar, PartyPopper, PhoneCall, Power, Repeat2, Timer, UsersRound } from 'lucide-react'
import { assistantApi, formatWaiting, type AssistantSettings } from '@/lib/assistant'
import { getErrorMessage } from '@/lib/format'
import { ErrorState, LoadingState } from '@/components/romez/OperationalUI'
import { Bar, Kpi, LiveBadge, Notice, Panel, SwitchRow } from './ui'

const RANGES = [7, 14, 30, 60]

function percent(part: number, total: number) {
  return total > 0 ? `${Math.round((part / total) * 100)} %` : '—'
}

function initials(name: string | null) {
  if (!name) return '?'
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join('')
}

export function AssistantOverview({ settings, saving, onToggle }: { settings: AssistantSettings; saving: boolean; onToggle: (enabled: boolean) => void }) {
  const [days, setDays] = useState(14)
  const insights = useQuery({ queryKey: ['assistant', 'insights', days], queryFn: () => assistantApi.insights(days).then((response) => response.data) })

  const answersEveryone = settings.enabled && settings.testOnlyPhones.length === 0
  const data = insights.data

  return (
    <div className="space-y-7">
      <Panel
        icon={Power}
        title="Estado del asistente"
        description="Lo que n8n lee en cada mensaje. Apagarlo corta las respuestas automáticas al instante."
        action={<LiveBadge on={settings.enabled}>{settings.enabled ? 'Encendido' : 'Apagado'}</LiveBadge>}
      >
        <div className="space-y-3">
          <SwitchRow
            title="Responder automáticamente"
            description="Interruptor general. Mientras esté apagado, el flujo de n8n no contesta ningún mensaje."
            checked={settings.enabled}
            onChange={onToggle}
            disabled={saving}
          />
          {answersEveryone ? (
            <Notice icon={AlertTriangle}>
              <b>Está encendido y sin teléfonos de prueba</b>: va a contestarle a cualquier persona que escriba al número. Para probar, cargá tu teléfono en Configuración → Modo prueba.
            </Notice>
          ) : null}
          {settings.enabled && settings.testOnlyPhones.length > 0 ? (
            <p className="inline-flex items-center gap-2 rounded-full bg-[var(--ast-accent-soft)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--ast-accent)]">
              <FlaskConical size={14} /> Modo prueba: sólo responde a {settings.testOnlyPhones.length} {settings.testOnlyPhones.length === 1 ? 'teléfono' : 'teléfonos'}.
            </p>
          ) : null}
        </div>
      </Panel>

      <div className="flex flex-wrap items-end justify-between gap-4 pt-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ast-accent-2)]">Línea comercial</p>
          <h2 className="font-display mt-1.5 text-xl font-semibold tracking-[-0.015em] text-[var(--ink-primary)] sm:text-2xl">Qué está pasando con los leads</h2>
        </div>
        <div className="inline-flex rounded-full border border-[var(--line-soft)] bg-[var(--paper)] p-1 shadow-[var(--ast-card-shadow)]" role="group" aria-label="Período">
          {RANGES.map((range) => (
            <button key={range} type="button" onClick={() => setDays(range)} aria-pressed={days === range} className={clsx('min-h-8 rounded-full px-3.5 text-xs font-semibold transition-colors', days === range ? 'bg-[var(--ast-accent)] text-[var(--ast-on-accent)]' : 'text-[var(--ink-secondary)] hover:bg-[var(--paper-soft)]')}>
              {range} días
            </button>
          ))}
        </div>
      </div>

      {insights.isLoading ? <LoadingState label="Calculando métricas de la línea comercial…" /> : null}
      {insights.isError ? <ErrorState message={getErrorMessage(insights.error)} retry={() => insights.refetch()} /> : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
            <Kpi icon={UsersRound} label="Leads nuevos" value={String(data.leads)} hint="Chats que empezó el cliente" />
            <Kpi icon={CheckCheck} label="Respondidos" value={percent(data.answered, data.leads)} hint={`${data.answered} de ${data.leads}`} tone={data.leads && data.answered / data.leads < 0.8 ? 'warn' : 'good'} />
            <Kpi icon={Timer} label="Primera respuesta (mediana)" value={formatWaiting(data.firstResponse.medianMinutes)} hint={data.firstResponse.p90Minutes !== null ? `El 90 % esperó hasta ${formatWaiting(data.firstResponse.p90Minutes)}` : 'Sin respuestas todavía'} tone={data.firstResponse.medianMinutes !== null && data.firstResponse.medianMinutes > 120 ? 'bad' : 'good'} />
            <Kpi icon={MoonStar} label="Fuera de horario" value={percent(data.offHoursLeads, data.leads)} hint={`${settings.officeFrom} a ${settings.officeTo}`} tone={data.leads && data.offHoursLeads / data.leads > 0.3 ? 'warn' : 'neutral'} />
            <Kpi icon={Inbox} label="Sin respuesta" value={String(data.unanswered)} hint="Nadie del equipo les contestó" tone={data.unanswered ? 'bad' : 'good'} />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel icon={Hourglass} title="Tiempo hasta la primera respuesta" description={`${data.firstResponse.samples} conversaciones respondidas`}>
              <div className="space-y-4">
                {data.firstResponse.buckets.map((bucket, index) => (
                  <div key={bucket.key} className="grid grid-cols-[minmax(96px,130px)_1fr_36px] items-center gap-4 text-sm">
                    <span className="font-medium text-[var(--ink-secondary)]">{bucket.label}</span>
                    <Bar value={bucket.count} max={Math.max(1, data.firstResponse.samples)} tone={index <= 1 ? 'good' : index >= 3 ? 'warn' : 'brand'} />
                    <span className="text-right font-semibold tabular-nums text-[var(--ink-primary)]">{bucket.count}</span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel icon={Clock3} title="A qué hora escriben" description="Hora de Paraguay. En naranja, fuera del horario de atención.">
              <HourChart values={data.leadsByHour} officeFrom={settings.officeFrom} officeTo={settings.officeTo} />
            </Panel>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel icon={Repeat2} title="Lo que el asistente puede responder por vos" description="Textos del equipo que se repiten idénticos en los chats">
              <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
                <ShareRing share={data.repeatedReplies.share} />
                <div className="space-y-2.5">
                  <p className="text-sm text-[var(--ink-secondary)]"><b className="font-semibold text-[var(--ink-primary)]">{data.repeatedReplies.repeatedMessages}</b> de {data.repeatedReplies.textMessages} textos enviados</p>
                  <div className="flex flex-wrap gap-2 text-xs font-medium text-[var(--ink-secondary)]">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--paper-soft)] px-3 py-1.5"><PhoneCall size={13} /> {data.messages.outboundFromPhone} desde el teléfono</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--paper-soft)] px-3 py-1.5"><MessageSquareReply size={13} /> {data.messages.outboundFromCrm} desde el CRM</span>
                  </div>
                </div>
              </div>
              {data.repeatedReplies.top.length ? (
                <ul className="mt-5 space-y-2">
                  {data.repeatedReplies.top.map((item) => (
                    <li key={item.preview} className="flex items-start justify-between gap-3 rounded-2xl rounded-tl-md bg-[var(--paper-soft)] px-4 py-3 text-sm">
                      <span className="min-w-0 leading-relaxed text-[var(--ink-secondary)]">{item.preview}</span>
                      <span className="shrink-0 rounded-full bg-[var(--ast-accent-soft)] px-2.5 py-0.5 text-xs font-bold tabular-nums text-[var(--ast-accent)]">×{item.count}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-5 text-sm text-[var(--ink-tertiary)]">Todavía no hay textos repetidos en este período.</p>}
            </Panel>

            <Panel icon={Inbox} title="Esperando respuesta" description="Leads a los que nadie les contestó, del más antiguo al más nuevo">
              {data.pending.length ? (
                <ul className="space-y-2">
                  {data.pending.map((lead) => (
                    <li key={lead.chatId} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--line-soft)] px-3 py-2.5 text-sm transition-colors hover:bg-[var(--paper-soft)]">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--ast-accent-soft)] text-xs font-bold text-[var(--ast-accent)]">{initials(lead.name)}</span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-[var(--ink-primary)]">{lead.name || 'Sin nombre'}</span>
                          {lead.phoneTail ? <span className="block text-xs text-[var(--ink-tertiary)]">…{lead.phoneTail}</span> : null}
                        </span>
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--danger-paper)] px-2.5 py-1 text-xs font-semibold text-[var(--danger)]"><Clock3 size={12} /> {formatWaiting(lead.waitingMinutes)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center gap-3 rounded-2xl bg-[var(--success-paper)] px-4 py-8 text-center text-sm font-medium text-[var(--success)]">
                  <PartyPopper size={22} />
                  No hay leads sin responder en este período.
                </div>
              )}
            </Panel>
          </div>

          <Panel icon={CalendarDays} title="Leads por día">
            <DayChart days={data.leadsByDay} />
          </Panel>
        </>
      ) : null}
    </div>
  )
}

/** Anillo con el porcentaje de textos repetidos. */
function ShareRing({ share }: { share: number }) {
  const value = Math.max(0, Math.min(100, share))
  return (
    <div className="relative grid h-28 w-28 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(var(--ast-accent-2) ${value * 3.6}deg, var(--ast-track) 0deg)` }} role="img" aria-label={`${share} % de textos repetidos`}>
      <div className="grid h-[5.5rem] w-[5.5rem] place-items-center rounded-full bg-[var(--paper)]">
        <span className="font-display text-2xl font-bold tabular-nums text-[var(--ink-primary)]">{share}<span className="text-base text-[var(--ink-tertiary)]"> %</span></span>
      </div>
    </div>
  )
}

function Legend({ color, children }: { color: string; children: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />{children}</span>
}

function HourChart({ values, officeFrom, officeTo }: { values: number[]; officeFrom: string; officeTo: string }) {
  const max = Math.max(1, ...values)
  const from = Number(officeFrom.split(':')[0])
  const to = Number(officeTo.split(':')[0])
  return (
    <div>
      <div className="flex h-40 items-end gap-1 sm:gap-1.5" role="img" aria-label="Cantidad de leads por hora del día">
        {values.map((count, hour) => {
          const off = hour < from || hour >= to
          return (
            <div key={hour} title={`${String(hour).padStart(2, '0')}:00 · ${count} leads`} className="flex h-full flex-1 items-end overflow-hidden rounded-full bg-[var(--ast-track)]">
              <div className="w-full rounded-full transition-[height] duration-700 ease-out" style={{ height: count ? `max(8px, ${(count / max) * 100}%)` : 0, background: off ? 'var(--ast-offhours)' : 'var(--ast-accent-2)' }} />
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex gap-1 text-[10px] font-medium text-[var(--ink-tertiary)] sm:gap-1.5">
        {values.map((_, hour) => <span key={hour} className="flex-1 text-center">{hour % 3 === 0 ? hour : ''}</span>)}
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-xs font-medium text-[var(--ink-secondary)]">
        <Legend color="var(--ast-accent-2)">En horario</Legend>
        <Legend color="var(--ast-offhours)">Fuera de horario</Legend>
      </div>
    </div>
  )
}

function DayChart({ days }: { days: { day: string; count: number }[] }) {
  if (!days.length) return <p className="text-sm text-[var(--ink-tertiary)]">Todavía no hay leads en este período.</p>
  const max = Math.max(1, ...days.map((entry) => entry.count))
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1" role="img" aria-label="Leads por día">
      {days.map((entry) => (
        <div key={entry.day} className="flex min-w-[26px] flex-1 flex-col items-center gap-1.5" title={`${entry.day} · ${entry.count}`}>
          <span className="text-[11px] font-semibold tabular-nums text-[var(--ink-secondary)]">{entry.count}</span>
          <div className="flex h-28 w-full max-w-[18px] items-end overflow-hidden rounded-full bg-[var(--ast-track)]">
            <div className="w-full rounded-full bg-[var(--ast-accent-2)] transition-[height] duration-700 ease-out" style={{ height: entry.count ? `max(8px, ${(entry.count / max) * 100}%)` : 0 }} />
          </div>
          <span className="whitespace-nowrap text-[10px] font-medium text-[var(--ink-tertiary)]">{entry.day.slice(8)}/{entry.day.slice(5, 7)}</span>
        </div>
      ))}
    </div>
  )
}
