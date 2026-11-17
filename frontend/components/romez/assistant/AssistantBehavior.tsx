'use client'

import { useState } from 'react'
import { BellRing, LifeBuoy, Plus, Sparkles, UserRoundCheck, X } from 'lucide-react'
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
      <Panel icon={UserRoundCheck} title="Temas que se derivan a una persona" description="El asistente no cotiza ni opina sobre estos temas: avisa al equipo y se calla en ese chat.">
        <div className="flex flex-wrap gap-2">
          {draft.handoffTopics.map((item) => (
            <span key={item} className="group inline-flex items-center gap-1.5 rounded-full bg-[var(--ast-accent-soft)] py-1.5 pl-3.5 pr-1.5 text-sm font-medium text-[var(--ast-accent)]">
              {item}
              <button type="button" aria-label={`Quitar ${item}`} className="grid h-6 w-6 place-items-center rounded-full text-[var(--ast-accent)] opacity-70 hover:bg-[var(--danger-paper)] hover:text-[var(--danger)] hover:opacity-100" onClick={() => onChange({ handoffTopics: draft.handoffTopics.filter((current) => current !== item) })}>
                <X size={13} />
              </button>
            </span>
          ))}
          {!draft.handoffTopics.length ? <p className="rounded-2xl border border-dashed border-[var(--line)] px-4 py-3 text-sm text-[var(--ink-tertiary)]">No hay temas cargados.</p> : null}
        </div>
        <div className="mt-5 flex max-w-xl gap-2 rounded-full border border-[var(--line)] bg-[var(--paper-inset)] p-1.5 pl-2 focus-within:border-[var(--brand-blue)] focus-within:shadow-[0_0_0_3px_rgba(54,92,171,.16)]">
          <input className="min-w-0 flex-1 bg-transparent px-3 text-sm font-medium text-[var(--ink-primary)] outline-none placeholder:text-[var(--ink-muted)]" aria-label="Nuevo tema" value={topic} maxLength={200} placeholder="Por ejemplo: Clientes con facturas atrasadas" onChange={(event) => setTopic(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTopic() } }} />
          <button type="button" className="btn-primary !min-h-9 shrink-0 !rounded-full !px-4" onClick={addTopic} disabled={!topic.trim()}><Plus size={15} /> Agregar</button>
        </div>
      </Panel>

      <Panel icon={Sparkles} title="Instrucciones adicionales" description="Reglas propias que se suman a las del asistente. Escribilas como se las explicarías a una persona nueva.">
        <Field label="Instrucciones" hint="Ejemplos: «No ofrezcas reuniones los viernes», «Si preguntan por una marca, derivá a la abogada». Ojo: los precios no se escriben acá, van en Servicios y precios.">
          <textarea className="ctrl-input !min-h-[180px] resize-y !px-4 !py-3 leading-relaxed" maxLength={4000} value={draft.extraInstructions} onChange={(event) => onChange({ extraInstructions: event.target.value })} />
        </Field>
        <div className="mt-2 flex justify-end">
          <span className="rounded-full bg-[var(--paper-soft)] px-2.5 py-1 text-xs font-medium tabular-nums text-[var(--ink-tertiary)]">{draft.extraInstructions.length} / 4000</span>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel icon={LifeBuoy} title="Si la IA falla" description="Mensaje que recibe el cliente cuando el asistente no puede responder; después se avisa al equipo.">
          <Field label="Mensaje">
            <textarea className="ctrl-input !min-h-[120px] resize-y !px-4 !py-3 leading-relaxed" maxLength={1000} value={draft.fallbackMessage} onChange={(event) => onChange({ fallbackMessage: event.target.value })} />
          </Field>
        </Panel>
        <Panel icon={BellRing} title="Mensaje de seguimiento" description="Un solo recordatorio a quien recibió los costos y no volvió a escribir.">
          <Field label="Mensaje" hint="{{nombre}} se reemplaza por el primer nombre; si no se conoce, se omite.">
            <textarea className="ctrl-input !min-h-[120px] resize-y !px-4 !py-3 leading-relaxed" maxLength={1000} value={draft.followUpMessage} onChange={(event) => onChange({ followUpMessage: event.target.value })} />
          </Field>
        </Panel>
      </div>
    </div>
  )
}
