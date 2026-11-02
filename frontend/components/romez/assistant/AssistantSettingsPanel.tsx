'use client'

import clsx from 'clsx'
import { AlertTriangle } from 'lucide-react'
import { WEEKDAY_LABELS, type AssistantSettingsInput } from '@/lib/assistant'
import { Field, Panel, SwitchRow } from './ui'

type Props = { draft: AssistantSettingsInput; onChange: (patch: Partial<AssistantSettingsInput>) => void }

function NumberField({ label, hint, value, min, max, suffix, onChange }: { label: string; hint?: string; value: number; min: number; max: number; suffix?: string; onChange: (value: number) => void }) {
  return (
    <Field label={label} hint={hint ?? `Entre ${min} y ${max}${suffix ? ` ${suffix}` : ''}`}>
      <input type="number" className="ctrl-input" min={min} max={max} value={Number.isFinite(value) ? value : ''} onChange={(event) => onChange(event.target.value === '' ? NaN : Number(event.target.value))} />
    </Field>
  )
}

const lines = (value: string) => value.split('\n')

export function AssistantSettingsPanel({ draft, onChange }: Props) {
  const toggleDay = (day: number) => onChange({ officeDays: draft.officeDays.includes(day) ? draft.officeDays.filter((current) => current !== day) : [...draft.officeDays, day].sort((a, b) => a - b) })

  return (
    <div className="space-y-6">
      <Panel title="Modo prueba y números" description="Controlan a quién le contesta el asistente. Los teléfonos van con código de país, un número por línea.">
        <div className="space-y-4">
          <SwitchRow title="Responder automáticamente" description="Interruptor general del asistente." checked={draft.enabled} onChange={(enabled) => onChange({ enabled })} />
          {draft.enabled && !draft.testOnlyPhones.some((phone) => phone.trim()) ? (
            <div className="flex items-start gap-3 rounded-lg border border-[var(--warning-line)] bg-[var(--warning-paper)] px-4 py-3 text-sm text-[var(--warning)]">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <p>Sin teléfonos de prueba, el asistente le contesta a <b>todos</b> los que escriban a la línea.</p>
            </div>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Modo prueba: sólo responder a" hint="Si cargás alguno, el asistente ignora al resto. Ejemplo: 595981123456">
              <textarea className="ctrl-input min-h-[110px] resize-y font-mono !text-[13px]" value={draft.testOnlyPhones.join('\n')} onChange={(event) => onChange({ testOnlyPhones: lines(event.target.value) })} />
            </Field>
            <Field label="Nunca responder a" hint="Clientes actuales, familia, equipo, proveedores.">
              <textarea className="ctrl-input min-h-[110px] resize-y font-mono !text-[13px]" value={draft.excludedPhones.join('\n')} onChange={(event) => onChange({ excludedPhones: lines(event.target.value) })} />
            </Field>
          </div>
          <Field label="Avisar a este WhatsApp cuando hay que derivar" hint="Recibe el resumen del lead (nombre, interés, último mensaje). El asistente nunca atiende este número.">
            <input className="ctrl-input max-w-sm font-mono" inputMode="tel" placeholder="595981123456" value={draft.notifyTo ?? ''} onChange={(event) => onChange({ notifyTo: event.target.value || null })} />
          </Field>
        </div>
      </Panel>

      <Panel title="Horario de atención del equipo" description="No apaga al asistente: le avisa si el equipo humano está o no disponible (por ejemplo «le escribe mañana a primera hora») y mide los leads fuera de horario.">
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-[var(--ink-secondary)]">Días</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Días de atención">
              {WEEKDAY_LABELS.map((label, index) => {
                const day = index + 1
                const active = draft.officeDays.includes(day)
                return (
                  <button key={label} type="button" aria-pressed={active} onClick={() => toggleDay(day)} className={clsx('min-h-9 min-w-12 rounded-lg border px-3 text-sm font-bold', active ? 'border-[var(--brand-navy)] bg-[var(--brand-navy)] text-white' : 'border-[var(--line)] bg-[var(--paper)] text-[var(--ink-secondary)] hover:bg-[var(--paper-soft)]')}>
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Desde"><input type="time" className="ctrl-input" value={draft.officeFrom} onChange={(event) => onChange({ officeFrom: event.target.value })} /></Field>
            <Field label="Hasta"><input type="time" className="ctrl-input" value={draft.officeTo} onChange={(event) => onChange({ officeTo: event.target.value })} /></Field>
            <Field label="Zona horaria"><input className="ctrl-input" value={draft.timezone} onChange={(event) => onChange({ timezone: event.target.value })} /></Field>
          </div>
        </div>
      </Panel>

      <Panel title="Ritmo y límites" description="Pausas y topes que protegen la conversación y el costo.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <NumberField label="Pausa tras intervención humana" suffix="horas" min={1} max={168} value={draft.pauseHours} onChange={(pauseHours) => onChange({ pauseHours })} hint="Si una persona escribe en el chat, el asistente se calla estas horas." />
          <NumberField label="Espera de ráfaga" suffix="segundos" min={2} max={60} value={draft.waitSeconds} onChange={(waitSeconds) => onChange({ waitSeconds })} hint="Junta los mensajes seguidos y responde una sola vez." />
          <NumberField label="Audio más largo que se transcribe" suffix="segundos" min={10} max={600} value={draft.maxAudioSeconds} onChange={(maxAudioSeconds) => onChange({ maxAudioSeconds })} hint="Si dura más, se le pide un resumen escrito." />
          <NumberField label="Máximo de respuestas por hora" min={1} max={100} value={draft.maxRepliesPerHour} onChange={(maxRepliesPerHour) => onChange({ maxRepliesPerHour })} hint="Por chat. Corta cualquier bucle." />
        </div>
      </Panel>

      <Panel title="Seguimiento" description="Un único recordatorio a quien recibió los costos y no contestó. El texto se edita en Comportamiento.">
        <div className="space-y-4">
          <SwitchRow title="Enviar seguimiento" description="Apagado por defecto. Sólo se envía en horario hábil y una vez por lead." checked={draft.followUpEnabled} onChange={(followUpEnabled) => onChange({ followUpEnabled })} />
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberField label="Esperar" suffix="horas" min={1} max={72} value={draft.followUpHours} onChange={(followUpHours) => onChange({ followUpHours })} hint="Desde el último mensaje del asistente." />
            <Field label="Enviar desde"><input type="time" className="ctrl-input" value={draft.followUpFrom} onChange={(event) => onChange({ followUpFrom: event.target.value })} /></Field>
            <Field label="Enviar hasta"><input type="time" className="ctrl-input" value={draft.followUpTo} onChange={(event) => onChange({ followUpTo: event.target.value })} /></Field>
          </div>
        </div>
      </Panel>

      <Panel title="CRM" description="Qué hace el asistente con los datos que recoge.">
        <SwitchRow title="Cargar los leads en el CRM" description="Crea o actualiza el contacto (con su rubro y etapa) cuando conocemos el nombre. Probalo primero contra un entorno de prueba." checked={draft.crmSyncEnabled} onChange={(crmSyncEnabled) => onChange({ crmSyncEnabled })} />
      </Panel>
    </div>
  )
}
