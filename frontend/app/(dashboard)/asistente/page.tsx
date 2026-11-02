'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Bot, Lock, Save } from 'lucide-react'
import { auth } from '@/lib/auth'
import { assistantApi, toSettingsInput, type AssistantSettings, type AssistantSettingsInput } from '@/lib/assistant'
import { getErrorMessage } from '@/lib/format'
import { ErrorState, LoadingState, PageFrame, PageHeader } from '@/components/romez/OperationalUI'
import { AssistantBehavior } from '@/components/romez/assistant/AssistantBehavior'
import { AssistantConnection } from '@/components/romez/assistant/AssistantConnection'
import { AssistantOverview } from '@/components/romez/assistant/AssistantOverview'
import { AssistantServices } from '@/components/romez/assistant/AssistantServices'
import { AssistantSettingsPanel } from '@/components/romez/assistant/AssistantSettingsPanel'

type Tab = 'overview' | 'services' | 'behavior' | 'settings' | 'connection'

const TABS: { key: Tab; label: string; editsSettings?: boolean }[] = [
  { key: 'overview', label: 'Resumen' },
  { key: 'services', label: 'Servicios y precios' },
  { key: 'behavior', label: 'Comportamiento', editsSettings: true },
  { key: 'settings', label: 'Configuración', editsSettings: true },
  { key: 'connection', label: 'Conexión' },
]

/**
 * Panel del asistente comercial de WhatsApp. Módulo oculto: no figura en el menú ni en
 * Configuración → Módulos; se entra por /asistente y sólo owner y admin.
 */
export default function AssistantPage() {
  const queryClient = useQueryClient()
  const [role, setRole] = useState<string | null | undefined>(undefined)
  const [tab, setTab] = useState<Tab>('overview')
  const [draft, setDraft] = useState<AssistantSettingsInput | null>(null)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => setRole(auth.get()?.role ?? null), [])
  const allowed = role === 'owner' || role === 'admin'

  const settings = useQuery({ queryKey: ['assistant', 'settings'], queryFn: () => assistantApi.settings().then((response) => response.data), enabled: allowed })
  useEffect(() => { if (settings.data) setDraft(toSettingsInput(settings.data)) }, [settings.data])

  const dirty = useMemo(() => Boolean(settings.data && draft) && JSON.stringify(draft) !== JSON.stringify(toSettingsInput(settings.data as AssistantSettings)), [settings.data, draft])

  const save = useMutation({
    mutationFn: (input: AssistantSettingsInput) => assistantApi.saveSettings(input).then((response) => response.data),
    onSuccess: (data) => {
      setSaveError(null)
      setSaved(true)
      queryClient.setQueryData(['assistant', 'settings'], data)
      queryClient.invalidateQueries({ queryKey: ['assistant', 'flow-config'] })
      queryClient.invalidateQueries({ queryKey: ['assistant', 'insights'] })
      setTimeout(() => setSaved(false), 2500)
    },
    onError: (error) => setSaveError(getErrorMessage(error, 'No pudimos guardar la configuración.')),
  })

  if (role === undefined) return <LoadingState />
  if (!allowed) {
    return (
      <div className="grid min-h-[70vh] place-items-center px-6">
        <div className="max-w-md text-center">
          <Lock className="mx-auto mb-4 text-[var(--ink-tertiary)]" size={28} />
          <p className="text-lg font-extrabold text-[var(--ink-primary)]">No tenés acceso a esta sección</p>
          <p className="mt-2 text-sm text-[var(--ink-tertiary)]">Pedile a un administrador del estudio que te habilite.</p>
        </div>
      </div>
    )
  }

  const current = TABS.find((entry) => entry.key === tab)

  return (
    <PageFrame>
      <PageHeader
        eyebrow="Gestión comercial"
        title="Asistente de WhatsApp"
        description="Configurá qué responde el asistente, cuánto cuesta cada servicio y cuándo deriva a una persona. Todo lo que cambies acá lo lee el flujo de n8n."
        action={<span className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--paper)] px-3 py-1.5 text-xs font-bold text-[var(--ink-secondary)]"><Bot size={14} /> Sólo administradores</span>}
      />

      <div className="-mx-1 overflow-x-auto px-1">
        <div className="inline-flex min-w-full gap-1 border-b border-[var(--line)]" role="tablist" aria-label="Secciones del asistente">
          {TABS.map((entry) => (
            <button key={entry.key} type="button" role="tab" aria-selected={tab === entry.key} onClick={() => setTab(entry.key)} className={clsx('-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-bold', tab === entry.key ? 'border-[var(--brand-navy)] text-[var(--brand-navy)]' : 'border-transparent text-[var(--ink-tertiary)] hover:text-[var(--ink-primary)]')}>
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {settings.isLoading ? <LoadingState label="Cargando configuración…" /> : null}
      {settings.isError ? <ErrorState message={getErrorMessage(settings.error)} retry={() => settings.refetch()} /> : null}

      {settings.data && draft ? (
        <div className={clsx(current?.editsSettings && 'pb-24')}>
          {tab === 'overview' ? <AssistantOverview settings={settings.data} saving={save.isPending} onToggle={(enabled) => save.mutate({ ...toSettingsInput(settings.data as AssistantSettings), enabled })} /> : null}
          {tab === 'services' ? <AssistantServices /> : null}
          {tab === 'behavior' ? <AssistantBehavior draft={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} /> : null}
          {tab === 'settings' ? <AssistantSettingsPanel draft={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} /> : null}
          {tab === 'connection' ? <AssistantConnection /> : null}
        </div>
      ) : null}

      {saveError && tab === 'overview' ? <p className="text-sm font-semibold text-[var(--danger)]">{saveError}</p> : null}

      {current?.editsSettings && (dirty || saved || saveError) ? (
        <div className="sticky bottom-4 z-20 mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line-strong)] bg-[var(--paper)] px-4 py-3 shadow-lg">
          <p className={clsx('text-sm font-bold', saveError ? 'text-[var(--danger)]' : saved && !dirty ? 'text-[var(--success)]' : 'text-[var(--ink-secondary)]')} role="status">
            {saveError ?? (saved && !dirty ? 'Cambios guardados' : 'Hay cambios sin guardar')}
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" disabled={!dirty || save.isPending} onClick={() => { setDraft(toSettingsInput(settings.data as AssistantSettings)); setSaveError(null) }}>Descartar</button>
            <button type="button" className="btn-primary" disabled={!dirty || save.isPending || !draft} onClick={() => draft && save.mutate(draft)}><Save size={15} /> {save.isPending ? 'Guardando…' : 'Guardar cambios'}</button>
          </div>
        </div>
      ) : null}
    </PageFrame>
  )
}
