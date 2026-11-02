'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { AssistantSettingsInput } from '@/lib/assistant'
import { Field, Panel } from './ui'

type Props = { draft: AssistantSettingsInput; onChange: (patch: Partial<AssistantSettingsInput>) => void }

export function AssistantBehavior({ draft, onChange }: Props) {
  const [topic, setTopic] = useState('')
  const addTopic = () => {
    const value = topic.trim()
    if (!value || draft.handoffTopics.includes(value)) return
    onChange({ handoffTopics: [...draft.handoffTopics, value] })
    setTopic('')
  }

  return (
    <div className="space-y-6">
      <Panel title="Temas que se derivan a una persona" description="El asistente no cotiza ni opina sobre estos temas: avisa al equipo y se calla en ese chat.">
        <div className="flex flex-wrap gap-2">
          {draft.handoffTopics.map((item) => (
            <span key={item} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--paper-soft)] py-1 pl-3 pr-1.5 text-sm font-semibold text-[var(--ink-primary)]">
              {item}
              <button type="button" aria-label={`Quitar ${item}`} className="grid h-5 w-5 place-items-center rounded-full text-[var(--ink-tertiary)] hover:bg-[var(--danger-paper)] hover:text-[var(--danger)]" onClick={() => onChange({ handoffTopics: draft.handoffTopics.filter((current) => current !== item) })}>
                <X size={13} />
              </button>
            </span>
          ))}
          {!draft.handoffTopics.length ? <p className="text-sm text-[var(--ink-tertiary)]">No hay temas cargados.</p> : null}
        </div>
        <div className="mt-4 flex max-w-xl gap-2">
          <input className="ctrl-input" value={topic} maxLength={200} placeholder="Por ejemplo: Clientes con facturas atrasadas" onChange={(event) => setTopic(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTopic() } }} />
          <button type="button" className="btn-secondary shrink-0" onClick={addTopic} disabled={!topic.trim()}><Plus size={15} /> Agregar</button>
        </div>
      </Panel>

      <Panel title="Instrucciones adicionales" description="Reglas propias que se suman a las del asistente. Escribilas como se las explicarías a una persona nueva.">
        <Field label="Instrucciones" hint="Ejemplos: «No ofrezcas reuniones los viernes», «Si preguntan por una marca, derivá a la abogada». Ojo: los precios no se escriben acá, van en Servicios y precios.">
          <textarea className="ctrl-input min-h-[160px] resize-y" maxLength={4000} value={draft.extraInstructions} onChange={(event) => onChange({ extraInstructions: event.target.value })} />
        </Field>
        <p className="mt-1.5 text-right text-xs font-medium text-[var(--ink-tertiary)]">{draft.extraInstructions.length} / 4000</p>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Si la IA falla" description="Mensaje que recibe el cliente cuando el asistente no puede responder; después se avisa al equipo.">
          <Field label="Mensaje">
            <textarea className="ctrl-input min-h-[110px] resize-y" maxLength={1000} value={draft.fallbackMessage} onChange={(event) => onChange({ fallbackMessage: event.target.value })} />
          </Field>
        </Panel>
        <Panel title="Mensaje de seguimiento" description="Un solo recordatorio a quien recibió los costos y no volvió a escribir.">
          <Field label="Mensaje" hint="{{nombre}} se reemplaza por el primer nombre; si no se conoce, se omite.">
            <textarea className="ctrl-input min-h-[110px] resize-y" maxLength={1000} value={draft.followUpMessage} onChange={(event) => onChange({ followUpMessage: event.target.value })} />
          </Field>
        </Panel>
      </div>
    </div>
  )
}
