'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { AlertTriangle, Clock3, Copy, Inbox, MessageSquareReply, PhoneCall } from 'lucide-react'
import { assistantApi, formatWaiting, type AssistantSettings } from '@/lib/assistant'
import { getErrorMessage } from '@/lib/format'
import { ErrorState, LoadingState, StatusPill } from '@/components/romez/OperationalUI'
import { Bar, Kpi, Panel, SwitchRow } from './ui'

const RANGES = [7, 14, 30, 60]

function percent(part: number, total: number) {
  return total > 0 ? `${Math.round((part / total) * 100)} %` : '—'
}

export function AssistantOverview({ settings, saving, onToggle }: { settings: AssistantSettings; saving: boolean; onToggle: (enabled: boolean) => void }) {
  const [days, setDays] = useState(14)
  const insights = useQuery({ queryKey: ['assistant', 'insights', days], queryFn: () => assistantApi.insights(days).then((response) => response.data) })

  const answersEveryone = settings.enabled && settings.testOnlyPhones.length === 0
  const data = insights.data

  return (
    <div className="space-y-6">
      <Panel
        title="Estado del asistente"
        description="Lo que n8n lee en cada mensaje. Apagarlo corta las respuestas automáticas al instante."
        action={<StatusPill tone={settings.enabled ? 'success' : 'neutral'}>{settings.enabled ? 'Encendido' : 'Apagado'}</StatusPill>}
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
            <div className="flex items-start gap-3 rounded-lg border border-[var(--warning-line)] bg-[var(--warning-paper)] px-4 py-3 text-sm text-[var(--warning)]">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <p><b>Está encendido y sin teléfonos de prueba</b>: va a contestarle a cualquier persona que escriba al número. Para probar, cargá tu teléfono en Configuración → Modo prueba.</p>
            </div>
          ) : null}
          {settings.enabled && settings.testOnlyPhones.length > 0 ? (
            <p className="text-sm font-medium text-[var(--ink-secondary)]">Modo prueba: sólo responde a {settings.testOnlyPhones.length} {settings.testOnlyPhones.length === 1 ? 'teléfono' : 'teléfonos'}.</p>
          ) : null}
        </div>
      </Panel>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="section-label">Línea comercial</p>
          <h2 className="font-display text-lg font-extrabold text-[var(--ink-primary)]">Qué está pasando con los leads</h2>
        </div>
        <div className="inline-flex rounded-lg border border-[var(--line)] bg-[var(--paper)] p-1" role="group" aria-label="Período">
          {RANGES.map((range) => (
            <button key={range} type="button" onClick={() => setDays(range)} aria-pressed={days === range} className={clsx('min-h-8 rounded-md px-3 text-xs font-bold', days === range ? 'bg-[var(--brand-navy)] text-white' : 'text-[var(--ink-secondary)] hover:bg-[var(--paper-soft)]')}>
              {range} días
            </button>
          ))}
        </div>
      </div>

      {insights.isLoading ? <LoadingState label="Calculando métricas de la línea comercial…" /> : null}
      {insights.isError ? <ErrorState message={getErrorMessage(insights.error)} retry={() => insights.refetch()} /> : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Kpi label="Leads nuevos" value={String(data.leads)} hint="Chats que empezó el cliente" />
            <Kpi label="Respondidos" value={percent(data.answered, data.leads)} hint={`${data.answered} de ${data.leads}`} tone={data.leads && data.answered / data.leads < 0.8 ? 'warn' : 'good'} />
            <Kpi label="Primera respuesta (mediana)" value={formatWaiting(data.firstResponse.medianMinutes)} hint={data.firstResponse.p90Minutes !== null ? `El 90 % esperó hasta ${formatWaiting(data.firstResponse.p90Minutes)}` : 'Sin respuestas todavía'} tone={data.firstResponse.medianMinutes !== null && data.firstResponse.medianMinutes > 120 ? 'bad' : 'good'} />
            <Kpi label="Fuera de horario" value={percent(data.offHoursLeads, data.leads)} hint={`${settings.officeFrom} a ${settings.officeTo}`} tone={data.leads && data.offHoursLeads / data.leads > 0.3 ? 'warn' : 'neutral'} />
            <Kpi label="Sin respuesta" value={String(data.unanswered)} hint="Nadie del equipo les contestó" tone={data.unanswered ? 'bad' : 'good'} />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="Tiempo hasta la primera respuesta" description={`${data.firstResponse.samples} conversaciones respondidas`}>
              <div className="space-y-3">
                {data.firstResponse.buckets.map((bucket, index) => (
                  <div key={bucket.key} className="grid grid-cols-[130px_1fr_32px] items-center gap-3 text-sm">
                    <span className="font-semibold text-[var(--ink-secondary)]">{bucket.label}</span>
                    <Bar value={bucket.count} max={Math.max(1, data.firstResponse.samples)} tone={index <= 1 ? 'good' : index >= 3 ? 'warn' : 'brand'} />
                    <span className="text-right font-bold tabular-nums text-[var(--ink-primary)]">{bucket.count}</span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="A qué hora escriben" description="Hora de Paraguay. En naranja, fuera del horario de atención.">
              <HourChart values={data.leadsByHour} officeFrom={settings.officeFrom} officeTo={settings.officeTo} />
            </Panel>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="Lo que el asistente puede responder por vos" description="Textos del equipo que se repiten idénticos en los chats">
              <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
                <div>
                  <p className="font-display text-3xl font-extrabold tabular-nums text-[var(--brand-navy)]">{data.repeatedReplies.share} %</p>
                  <p className="text-xs font-medium text-[var(--ink-tertiary)]">{data.repeatedReplies.repeatedMessages} de {data.repeatedReplies.textMessages} textos enviados</p>
                </div>
                <div className="flex gap-6 text-xs font-semibold text-[var(--ink-secondary)]">
                  <span className="inline-flex items-center gap-1.5"><PhoneCall size={14} /> {data.messages.outboundFromPhone} desde el teléfono</span>
                  <span className="inline-flex items-center gap-1.5"><MessageSquareReply size={14} /> {data.messages.outboundFromCrm} desde el CRM</span>
                </div>
              </div>
              {data.repeatedReplies.top.length ? (
                <ul className="mt-4 divide-y divide-[var(--line-soft)]">
                  {data.repeatedReplies.top.map((item) => (
                    <li key={item.preview} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                      <span className="min-w-0 text-[var(--ink-secondary)]"><Copy size={13} className="mr-1.5 inline text-[var(--ink-muted)]" />{item.preview}</span>
                      <span className="shrink-0 rounded-full bg-[var(--brand-paper)] px-2 py-0.5 text-xs font-extrabold text-[var(--brand-navy)]">×{item.count}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-4 text-sm text-[var(--ink-tertiary)]">Todavía no hay textos repetidos en este período.</p>}
            </Panel>

            <Panel title="Esperando respuesta" description="Leads a los que nadie les contestó, del más antiguo al más nuevo">
              {data.pending.length ? (
                <ul className="divide-y divide-[var(--line-soft)]">
                  {data.pending.map((lead) => (
                    <li key={lead.chatId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="inline-flex min-w-0 items-center gap-2 font-semibold text-[var(--ink-primary)]"><Inbox size={14} className="shrink-0 text-[var(--ink-muted)]" /><span className="truncate">{lead.name || 'Sin nombre'}{lead.phoneTail ? ` · …${lead.phoneTail}` : ''}</span></span>
                      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-bold text-[var(--danger)]"><Clock3 size={13} /> {formatWaiting(lead.waitingMinutes)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm font-medium text-[var(--success)]">No hay leads sin responder en este período.</p>}
            </Panel>
          </div>

          <Panel title="Leads por día">
            <DayChart days={data.leadsByDay} />
          </Panel>
        </>
      ) : null}
    </div>
  )
}

function HourChart({ values, officeFrom, officeTo }: { values: number[]; officeFrom: string; officeTo: string }) {
  const max = Math.max(1, ...values)
  const from = Number(officeFrom.split(':')[0])
  const to = Number(officeTo.split(':')[0])
  return (
    <div>
      <div className="flex h-36 items-end gap-1" role="img" aria-label="Cantidad de leads por hora del día">
        {values.map((count, hour) => (
          <div key={hour} title={`${String(hour).padStart(2, '0')}:00 · ${count} leads`} className={clsx('min-h-[2px] flex-1 rounded-t', hour < from || hour >= to ? 'bg-[#c2571a]' : 'bg-[var(--brand-navy)]')} style={{ height: `${(count / max) * 100}%` }} />
        ))}
      </div>
      <div className="mt-1.5 flex gap-1 text-[10px] font-semibold text-[var(--ink-tertiary)]">
        {values.map((_, hour) => <span key={hour} className="flex-1 text-center">{hour % 3 === 0 ? hour : ''}</span>)}
      </div>
    </div>
  )
}

function DayChart({ days }: { days: { day: string; count: number }[] }) {
  if (!days.length) return <p className="text-sm text-[var(--ink-tertiary)]">Todavía no hay leads en este período.</p>
  const max = Math.max(1, ...days.map((entry) => entry.count))
  return (
    <div className="flex h-28 items-end gap-1.5 overflow-x-auto" role="img" aria-label="Leads por día">
      {days.map((entry) => (
        <div key={entry.day} className="flex min-w-[22px] flex-1 flex-col items-center justify-end gap-1" title={`${entry.day} · ${entry.count}`}>
          <span className="text-[10px] font-bold tabular-nums text-[var(--ink-secondary)]">{entry.count}</span>
          <div className="w-full min-h-[2px] rounded-t bg-[var(--brand-blue)]" style={{ height: `${(entry.count / max) * 70}%` }} />
          <span className="text-[9px] font-semibold text-[var(--ink-tertiary)]">{entry.day.slice(8)}/{entry.day.slice(5, 7)}</span>
        </div>
      ))}
    </div>
  )
}
