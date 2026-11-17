'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Bot, LayoutDashboard, Lock, MessagesSquare, PlugZap, Save, ShieldCheck, SlidersHorizontal, Tags, type LucideIcon } from 'lucide-react'
import { auth } from '@/lib/auth'
import { assistantApi, toSettingsInput, type AssistantSettings, type AssistantSettingsInput } from '@/lib/assistant'
import { getErrorMessage } from '@/lib/format'
import { ErrorState, LoadingState, PageFrame } from '@/components/romez/OperationalUI'
import { AssistantBehavior } from '@/components/romez/assistant/AssistantBehavior'
import { AssistantConnection } from '@/components/romez/assistant/AssistantConnection'
import { AssistantOverview } from '@/components/romez/assistant/AssistantOverview'
import { AssistantServices } from '@/components/romez/assistant/AssistantServices'
import { AssistantSettingsPanel } from '@/components/romez/assistant/AssistantSettingsPanel'

type Tab = 'overview' | 'services' | 'behavior' | 'settings' | 'connection'

const TABS: { key: Tab; label: string; icon: LucideIcon; editsSettings?: boolean }[] = [
  { key: 'overview', label: 'Resumen', icon: LayoutDashboard },
  { key: 'services', label: 'Servicios y precios', icon: Tags },
  { key: 'behavior', label: 'Comportamiento', icon: MessagesSquare, editsSettings: true },
  { key: 'settings', label: 'Configuración', icon: SlidersHorizontal, editsSettings: true },
  { key: 'connection', label: 'Conexión', icon: PlugZap },
]

/**
 * Panel del asistente comercial de WhatsApp. Figura en el menú como «Asistente IA» sólo para owner y admin, no en
 * Configuración → Módulos; se entra por /asistente.
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
      <div className="assistant-ui grid min-h-[70vh] place-items-center px-6">
        <div className="ast-card ast-rise max-w-md px-8 py-10 text-center">
          <span className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-3xl bg-[var(--ast-accent-soft)] text-[var(--ast-accent)]"><Lock size={24} /></span>
          <p className="font-display text-lg font-semibold text-[var(--ink-primary)]">No tenés acceso a esta sección</p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--ink-tertiary)]">Pedile a un administrador del estudio que te habilite.</p>
        </div>
      </div>
    )
  }

  const current = TABS.find((entry) => entry.key === tab)
  // Estado guardado (no el borrador) para la tarjeta de la cabecera.
  const phones = settings.data?.testOnlyPhones.length ?? 0
  const status = settings.data
    ? !settings.data.enabled
      ? { on: false, title: 'Apagado', detail: 'No responde mensajes automáticamente' }
      : phones
        ? { on: true, title: 'Encendido · modo prueba', detail: `Sólo responde a ${phones} ${phones === 1 ? 'teléfono' : 'teléfonos'}` }
        : { on: true, title: 'Encendido', detail: 'Responde a todos los que escriben' }
    : null

  return (
    <PageFrame className="assistant-ui !space-y-7">
      <header className="ast-rise relative overflow-hidden rounded-[2rem] border border-[var(--line-soft)] px-6 py-7 shadow-[var(--ast-card-shadow)] sm:px-9 sm:py-9" style={{ background: 'var(--ast-hero)' }}>
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full border border-[var(--line-soft)]" />
        <div aria-hidden className="pointer-events-none absolute -right-6 -top-10 h-44 w-44 rounded-full border border-[var(--line-soft)]" />
        <div className="relative flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-[var(--line-soft)] bg-[var(--paper)] px-3 py-1 text-xs font-semibold text-[var(--ast-accent)] shadow-sm">
              <ShieldCheck size={13} /> Gestión comercial · sólo administradores
            </p>
            <h1 className="font-display mt-4 text-[clamp(1.75rem,3.4vw,2.5rem)] font-bold leading-[1.08] tracking-[-0.03em] text-[var(--ink-primary)]">Asistente de WhatsApp</h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[var(--ink-secondary)]">Configurá qué responde el asistente, cuánto cuesta cada servicio y cuándo deriva a una persona. Todo lo que cambies acá lo lee el flujo de n8n.</p>
          </div>
          {status ? (
            <div className="flex items-center gap-4 self-start rounded-3xl border border-[var(--line-soft)] bg-[var(--paper)] py-3.5 pl-3.5 pr-6 shadow-[var(--ast-card-shadow)] lg:self-auto">
              <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--ast-accent)] text-[var(--ast-on-accent)]">
                <Bot size={22} />
                <span className={clsx('absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-[var(--paper)]', status.on ? 'ast-pulse bg-[var(--success)]' : 'bg-[var(--ink-muted)]')} />
              </span>
              <div>
                <p className="text-sm font-semibold text-[var(--ink-primary)]">{status.title}</p>
                <p className="mt-0.5 text-xs text-[var(--ink-tertiary)]">{status.detail}</p>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <div className="inline-flex gap-1 rounded-full border border-[var(--line-soft)] bg-[var(--paper)] p-1.5 shadow-[var(--ast-card-shadow)]" role="tablist" aria-label="Secciones del asistente">
          {TABS.map((entry) => {
            const Icon = entry.icon
            const active = tab === entry.key
            return (
              <button key={entry.key} type="button" role="tab" aria-selected={active} onClick={() => setTab(entry.key)} className={clsx('inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2.5 text-[13px] font-semibold outline-none transition-all duration-200 focus-visible:ring-4 focus-visible:ring-[var(--ast-accent-soft)]', active ? 'bg-[var(--ast-accent)] text-[var(--ast-on-accent)] shadow-[0_6px_16px_-8px_rgba(8,35,78,.6)]' : 'text-[var(--ink-tertiary)] hover:bg-[var(--paper-soft)] hover:text-[var(--ink-primary)]')}>
                <Icon size={15} strokeWidth={2.2} /> {entry.label}
              </button>
            )
          })}
        </div>
      </div>

      {settings.isLoading ? <LoadingState label="Cargando configuración…" /> : null}
      {settings.isError ? <ErrorState message={getErrorMessage(settings.error)} retry={() => settings.refetch()} /> : null}

      {settings.data && draft ? (
        <div key={tab} className={clsx('ast-rise', current?.editsSettings && 'pb-28')}>
          {tab === 'overview' ? <AssistantOverview settings={settings.data} saving={save.isPending} onToggle={(enabled) => save.mutate({ ...toSettingsInput(settings.data as AssistantSettings), enabled })} /> : null}
          {tab === 'services' ? <AssistantServices /> : null}
          {tab === 'behavior' ? <AssistantBehavior draft={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} /> : null}
          {tab === 'settings' ? <AssistantSettingsPanel draft={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} /> : null}
          {tab === 'connection' ? <AssistantConnection /> : null}
        </div>
      ) : null}

      {saveError && tab === 'overview' ? <p className="rounded-2xl border border-[var(--danger-line)] bg-[var(--danger-paper)] px-4 py-3 text-sm font-semibold text-[var(--danger)]">{saveError}</p> : null}

      {current?.editsSettings && (dirty || saved || saveError) ? (
        <div className="ast-rise sticky bottom-5 z-20 mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-3 rounded-3xl border border-[var(--line)] bg-[var(--paper)] py-2.5 pl-5 pr-2.5 shadow-[var(--ast-float-shadow)] sm:rounded-full">
          <p className={clsx('inline-flex items-center gap-2.5 text-sm font-semibold', saveError ? 'text-[var(--danger)]' : saved && !dirty ? 'text-[var(--success)]' : 'text-[var(--ink-primary)]')} role="status">
            <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', saveError ? 'bg-[var(--danger)]' : saved && !dirty ? 'bg-[var(--success)]' : 'bg-[var(--warning)]')} />
            {saveError ?? (saved && !dirty ? 'Cambios guardados' : 'Hay cambios sin guardar')}
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary !rounded-full" disabled={!dirty || save.isPending} onClick={() => { setDraft(toSettingsInput(settings.data as AssistantSettings)); setSaveError(null) }}>Descartar</button>
            <button type="button" className="btn-primary !rounded-full" disabled={!dirty || save.isPending || !draft} onClick={() => draft && save.mutate(draft)}><Save size={15} /> {save.isPending ? 'Guardando…' : 'Guardar cambios'}</button>
          </div>
        </div>
      ) : null}
    </PageFrame>
  )
}
