'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  MessageCircle,
  PlugZap,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  Wifi,
} from 'lucide-react'
import { BASE_URL, metaApi } from '@/lib/api'
import { auth } from '@/lib/auth'
import { canDo, type InboxConnection, type MetaApiEndpoint, type Role } from '@/types'

type MetaChannel = 'whatsapp' | 'instagram' | 'messenger'

const ALLOWED_ROLES: Role[] = ['owner', 'admin']
const CHANNELS: Array<{ value: MetaChannel; label: string; helper: string }> = [
  { value: 'whatsapp', label: 'WhatsApp', helper: 'Phone Number ID' },
  { value: 'messenger', label: 'Messenger', helper: 'Page ID' },
  { value: 'instagram', label: 'Instagram', helper: 'Instagram Business Account ID' },
]

function toErrorMessage(error: any) {
  return error?.response?.data?.message ?? error?.response?.data?.error ?? error?.message ?? 'Error inesperado'
}

function apiOrigin() {
  return BASE_URL.replace(/\/api\/v1\/?$/, '')
}

function absoluteApiUrl(path: string) {
  return `${apiOrigin()}${path}`
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.14em]',
        ok
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200'
          : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200'
      )}
    >
      {ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
      {label}
    </span>
  )
}

function MethodBadge({ method }: { method: string }) {
  const color =
    method === 'GET'
      ? 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200'
      : method === 'POST'
        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200'
        : method === 'DELETE'
          ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200'
          : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200'

  return <span className={clsx('rounded-full px-2 py-1 text-[10px] font-black', color)}>{method}</span>
}

function ConnectionCard({
  connection,
  onTest,
  onDelete,
  onRegister,
  busy,
}: {
  connection: InboxConnection
  onTest: (id: string) => void
  onDelete: (id: string) => void
  onRegister: (id: string, pin: string) => void
  busy: boolean
}) {
  const [pin, setPin] = useState('')
  const isWhatsApp = connection.channel === 'whatsapp'

  return (
    <article className="rounded-2xl border border-[var(--panel-border)] bg-[var(--surface-1)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#0c1015] px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-[#c5ed1b] dark:bg-[#c5ed1b] dark:text-[#0c1015]">
              {connection.channel}
            </span>
            <StatusPill ok={connection.status === 'connected'} label={connection.status} />
            {connection.hasCredentials ? <StatusPill ok label="Token guardado" /> : <StatusPill ok={false} label="Sin token" />}
          </div>
          <h3 className="mt-3 truncate text-base font-black text-slate-900 dark:text-slate-50">{connection.name}</h3>
          <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
            {connection.externalAccountLabel || connection.externalAccountId}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onDelete(connection.id)}
          disabled={busy}
          className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-rose-700 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-400/30 dark:bg-rose-500/15 dark:text-rose-200"
          aria-label="Eliminar conexion"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => onTest(connection.id)} disabled={busy} className="btn-secondary h-9 px-3 text-xs">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
          Probar
        </button>
        {isWhatsApp ? (
          <div className="flex min-w-[240px] flex-1 gap-2">
            <input
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
              className="ctrl-input h-9"
              placeholder="PIN 6 digitos"
              inputMode="numeric"
            />
            <button
              type="button"
              onClick={() => onRegister(connection.id, pin)}
              disabled={busy || pin.length !== 6}
              className="btn-primary h-9 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              Registrar
            </button>
          </div>
        ) : null}
      </div>
    </article>
  )
}

function EndpointRow({ endpoint }: { endpoint: MetaApiEndpoint }) {
  return (
    <div className="grid gap-3 border-b border-[var(--panel-border)] px-4 py-3 last:border-b-0 lg:grid-cols-[84px_minmax(0,1fr)_180px] lg:items-center">
      <MethodBadge method={endpoint.method} />
      <div className="min-w-0">
        <code className="block truncate rounded-lg bg-[var(--surface-1)] px-2 py-1 text-xs font-bold text-slate-800 dark:text-slate-100">
          {endpoint.path}
        </code>
        <p className="mt-1 text-xs font-medium leading-5 text-slate-600 dark:text-slate-300">{endpoint.description}</p>
      </div>
      <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{endpoint.auth}</p>
    </div>
  )
}

export default function MetaApiPage() {
  const queryClient = useQueryClient()
  const [userReady, setUserReady] = useState(false)
  const [canAccess, setCanAccess] = useState(false)
  const [channel, setChannel] = useState<MetaChannel>('whatsapp')
  const [name, setName] = useState('')
  const [externalAccountId, setExternalAccountId] = useState('')
  const [externalAccountLabel, setExternalAccountLabel] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [settingsRaw, setSettingsRaw] = useState('{\n  "apiVersion": "v23.0"\n}')
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const user = auth.get()
    setCanAccess(canDo(user?.role, ALLOWED_ROLES))
    setUserReady(true)
  }, [])

  const statusQuery = useQuery({
    queryKey: ['meta-api-status'],
    queryFn: () => metaApi.status().then((response) => response.data),
    enabled: userReady && canAccess,
    retry: false,
  })

  const connectionsQuery = useQuery({
    queryKey: ['meta-api-connections'],
    queryFn: () => metaApi.listConnections().then((response) => response.data),
    enabled: userReady && canAccess,
  })

  const status = statusQuery.data
  const connections = connectionsQuery.data ?? []
  const selectedChannel = CHANNELS.find((item) => item.value === channel)!
  const webhookUrl = status ? absoluteApiUrl(status.webhook.path) : absoluteApiUrl('/api/v1/meta-api/webhook')

  const createMutation = useMutation({
    mutationFn: () => {
      let settings: Record<string, unknown> | undefined
      try {
        settings = settingsRaw.trim() ? JSON.parse(settingsRaw) : undefined
      } catch {
        throw new Error('El JSON de settings no es valido')
      }

      return metaApi.createConnection({
        channel,
        name: name.trim(),
        externalAccountId: externalAccountId.trim(),
        externalAccountLabel: externalAccountLabel.trim() || undefined,
        credentials: accessToken.trim() ? { accessToken: accessToken.trim() } : undefined,
        settings,
      })
    },
    onSuccess: async () => {
      setName('')
      setExternalAccountId('')
      setExternalAccountLabel('')
      setAccessToken('')
      setNotice('Conexion Meta creada.')
      await connectionsQuery.refetch()
    },
    onError: (error) => setNotice(toErrorMessage(error)),
  })

  const testMutation = useMutation({
    mutationFn: (id: string) => metaApi.testConnection(id),
    onSuccess: async () => {
      setNotice('Conexion validada contra Meta.')
      await connectionsQuery.refetch()
    },
    onError: (error) => setNotice(toErrorMessage(error)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => metaApi.deleteConnection(id),
    onSuccess: async () => {
      setNotice('Conexion eliminada.')
      await connectionsQuery.refetch()
    },
    onError: (error) => setNotice(toErrorMessage(error)),
  })

  const registerMutation = useMutation({
    mutationFn: ({ id, pin }: { id: string; pin: string }) => metaApi.registerWhatsAppPhone(id, pin),
    onSuccess: async () => {
      setNotice('Numero de WhatsApp registrado en Cloud API.')
      await connectionsQuery.refetch()
    },
    onError: (error) => setNotice(toErrorMessage(error)),
  })

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['meta-api-status'] }),
      queryClient.invalidateQueries({ queryKey: ['meta-api-connections'] }),
    ])
  }

  const copyWebhook = async () => {
    await navigator.clipboard.writeText(webhookUrl)
    setNotice('Webhook copiado.')
  }

  const connectionBusy = createMutation.isPending || testMutation.isPending || deleteMutation.isPending || registerMutation.isPending

  const groupedEndpoints = useMemo(() => {
    const endpoints = status?.endpoints ?? []
    return {
      private: endpoints.filter((endpoint) => endpoint.auth.startsWith('JWT')),
      public: endpoints.filter((endpoint) => !endpoint.auth.startsWith('JWT')),
    }
  }, [status?.endpoints])

  if (!userReady || statusQuery.isLoading) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <Loader2 className="animate-spin text-primary-600" size={30} />
      </div>
    )
  }

  if (!canAccess) {
    return (
      <div className="mx-auto flex min-h-full max-w-4xl items-center justify-center p-6">
        <section className="interactive-card w-full border-l-4 border-l-amber-500 p-8">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-amber-100 p-3 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-50">Acceso restringido</h1>
              <p className="mt-2 max-w-xl text-sm font-medium text-slate-600 dark:text-slate-300">
                API Meta queda habilitado solo para owner y admin.
              </p>
            </div>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col gap-5 p-6">
      <section className="interactive-card static-card overflow-hidden">
        <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--panel-border)] bg-[var(--surface-1)] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-slate-700 dark:text-slate-200">
              <ShieldCheck size={14} />
              Oficial Graph API
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50">API Meta</h1>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-600 dark:text-slate-300">
              Conecta cuentas oficiales de Meta por workspace y usa webhooks, conversaciones y envio normalizado sin mostrar secretos en el frontend.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[520px]">
            <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--surface-1)] p-4">
              <p className="section-label">Graph API</p>
              <p className="mt-2 text-xl font-black text-slate-900 dark:text-slate-50">{status?.graphApiVersion ?? 'v23.0'}</p>
            </div>
            <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--surface-1)] p-4">
              <p className="section-label">Conexiones</p>
              <p className="mt-2 text-xl font-black text-slate-900 dark:text-slate-50">{connections.length}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--panel-border)] px-5 py-4">
          <StatusPill ok={Boolean(status?.configured.webhookVerifyTokenConfigured)} label="Webhook verify token" />
          <StatusPill ok={Boolean(status?.configured.appConfigured)} label="Meta app" />
          <StatusPill ok={Boolean(status?.configured.embeddedSignupConfigured)} label="Embedded Signup" />
          <StatusPill ok={Boolean(status?.configured.codeExchangeReady)} label="Code exchange" />
          <button type="button" onClick={refreshAll} className="btn-secondary ml-auto h-9 px-3 text-xs">
            <RefreshCcw size={14} />
            Actualizar
          </button>
        </div>
      </section>

      {notice ? (
        <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--surface-0)] px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="interactive-card static-card overflow-hidden">
          <div className="border-b border-[var(--panel-border)] p-5">
            <div className="flex items-center gap-2">
              <PlugZap size={18} className="text-primary-600" />
              <h2 className="text-lg font-black text-slate-900 dark:text-slate-50">Nueva conexion</h2>
            </div>
          </div>

          <form
            className="space-y-4 p-5"
            onSubmit={(event) => {
              event.preventDefault()
              createMutation.mutate()
            }}
          >
            <div>
              <label className="section-label">Canal</label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {CHANNELS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setChannel(item.value)}
                    className={clsx(
                      'rounded-xl border px-3 py-2 text-xs font-black transition',
                      channel === item.value
                        ? 'border-[#c5ed1b] bg-[#c5ed1b] text-[#0c1015]'
                        : 'border-[var(--panel-border)] bg-[var(--surface-1)] text-slate-600 dark:text-slate-300'
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="section-label">Nombre interno</label>
              <input value={name} onChange={(event) => setName(event.target.value)} className="ctrl-input mt-2 h-10" placeholder="Meta Cliente Norte" required />
            </div>

            <div>
              <label className="section-label">{selectedChannel.helper}</label>
              <input value={externalAccountId} onChange={(event) => setExternalAccountId(event.target.value)} className="ctrl-input mt-2 h-10" placeholder="ID de cuenta externa" required />
            </div>

            <div>
              <label className="section-label">Etiqueta visible</label>
              <input value={externalAccountLabel} onChange={(event) => setExternalAccountLabel(event.target.value)} className="ctrl-input mt-2 h-10" placeholder="Nombre de pagina o numero" />
            </div>

            <div>
              <label className="section-label">Access token</label>
              <div className="mt-2 flex items-center gap-2">
                <KeyRound size={16} className="text-slate-400" />
                <input value={accessToken} onChange={(event) => setAccessToken(event.target.value)} className="ctrl-input h-10" placeholder="Se guarda solo en backend" type="password" />
              </div>
            </div>

            <div>
              <label className="section-label">Settings JSON</label>
              <textarea value={settingsRaw} onChange={(event) => setSettingsRaw(event.target.value)} className="ctrl-input mt-2 min-h-[112px] resize-y font-mono text-xs" spellCheck={false} />
            </div>

            <button type="submit" disabled={createMutation.isPending} className="btn-primary h-11 w-full disabled:cursor-not-allowed disabled:opacity-60">
              {createMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <PlugZap size={16} />}
              Crear conexion Meta
            </button>
          </form>
        </section>

        <section className="interactive-card static-card overflow-hidden">
          <div className="grid gap-4 border-b border-[var(--panel-border)] p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <div className="flex items-center gap-2">
                <Wifi size={18} className="text-primary-600" />
                <h2 className="text-lg font-black text-slate-900 dark:text-slate-50">Webhook oficial</h2>
              </div>
              <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                Usar esta URL en Meta Developers para WhatsApp, Messenger e Instagram.
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={copyWebhook} className="btn-secondary h-10 px-3 text-xs">
                <Copy size={14} />
                Copiar
              </button>
              <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer" className="btn-secondary h-10 px-3 text-xs">
                <ExternalLink size={14} />
                Meta
              </a>
            </div>
          </div>

          <div className="p-5">
            <code className="block overflow-x-auto rounded-xl border border-[var(--panel-border)] bg-[var(--surface-1)] p-3 text-xs font-bold text-slate-800 dark:text-slate-100">
              {webhookUrl}
            </code>
            {status?.missing.length ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-200">
                Faltan variables: {status.missing.join(', ')}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <section className="interactive-card static-card overflow-hidden">
        <div className="border-b border-[var(--panel-border)] p-5">
          <div className="flex items-center gap-2">
            <MessageCircle size={18} className="text-primary-600" />
            <h2 className="text-lg font-black text-slate-900 dark:text-slate-50">Conexiones Meta</h2>
          </div>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-2">
          {connectionsQuery.isLoading ? (
            <div className="col-span-full flex min-h-32 items-center justify-center">
              <Loader2 className="animate-spin text-primary-600" size={26} />
            </div>
          ) : connections.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-[var(--panel-border)] p-8 text-center">
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Todavia no hay conexiones Meta en este workspace.</p>
            </div>
          ) : (
            connections.map((connection) => (
              <ConnectionCard
                key={connection.id}
                connection={connection}
                busy={connectionBusy}
                onTest={(id) => testMutation.mutate(id)}
                onDelete={(id) => deleteMutation.mutate(id)}
                onRegister={(id, pin) => registerMutation.mutate({ id, pin })}
              />
            ))
          )}
        </div>
      </section>

      <section className="interactive-card static-card overflow-hidden">
        <div className="border-b border-[var(--panel-border)] p-5">
          <h2 className="text-lg font-black text-slate-900 dark:text-slate-50">Endpoints disponibles</h2>
        </div>
        <div>
          {groupedEndpoints.private.map((endpoint) => <EndpointRow key={`${endpoint.method}-${endpoint.path}`} endpoint={endpoint} />)}
          {groupedEndpoints.public.map((endpoint) => <EndpointRow key={`${endpoint.method}-${endpoint.path}`} endpoint={endpoint} />)}
        </div>
      </section>
    </div>
  )
}
