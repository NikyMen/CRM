'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, CircleAlert, Loader2, PlugZap, Unplug } from 'lucide-react'
import { socialApi, type SocialNetwork, type SocialStatus } from '@/lib/api'
import { auth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/format'
import { NETWORKS, NetworkLogo } from './networks'

export function useSocialStatus() {
  return useQuery<SocialStatus>({ queryKey: ['social-status'], queryFn: () => socialApi.status().then((response) => response.data), refetchInterval: 30_000 })
}

const HELP: Record<SocialNetwork, { idLabel: string; idHint: string; tokenHint: string }> = {
  instagram: {
    idLabel: 'ID de la cuenta de Instagram',
    idHint: 'El número de la cuenta profesional (Instagram Business Account ID), no el @usuario.',
    tokenHint: 'Token de la página de Facebook vinculada, con permisos instagram_manage_messages e instagram_content_publish.',
  },
  facebook: {
    idLabel: 'ID de la página de Facebook',
    idHint: 'El número de la página (Page ID).',
    tokenHint: 'Token de acceso de la página, con permiso pages_messaging.',
  },
}

/** Estado de la cuenta de una red y formulario para vincularla con las credenciales de Meta. */
export function SocialConnectionCard({ network }: { network: SocialNetwork }) {
  const queryClient = useQueryClient()
  const status = useSocialStatus()
  const canManage = ['owner', 'admin'].includes(auth.get()?.role ?? '')
  const [accountId, setAccountId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const info = NETWORKS[network]
  const help = HELP[network]
  const entry = status.data?.networks.find((item) => item.network === network)
  const connection = entry?.connection ?? null
  const connected = connection?.status === 'connected'
  const update = (data: SocialStatus) => { queryClient.setQueryData(['social-status'], data); setAccountId(''); setAccessToken('') }
  const connect = useMutation({ mutationFn: () => socialApi.connect({ network, accountId: accountId.trim(), accessToken: accessToken.trim() }).then((response) => response.data), onSuccess: update })
  const disconnect = useMutation({ mutationFn: () => socialApi.disconnect(network).then((response) => response.data), onSuccess: update })

  if (status.isLoading) return <div className="grid place-items-center p-10"><Loader2 className="animate-spin text-[var(--ink-muted)]" size={24} /></div>
  if (status.isError) return <p className="p-6 text-sm font-semibold text-[var(--danger)]">{getErrorMessage(status.error)}</p>

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <section className="rounded-2xl border border-[var(--line-soft)] bg-[var(--paper)] p-5 shadow-[var(--ast-card-shadow)]">
        <div className="flex items-center gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl" style={{ background: info.soft, color: info.color }}><NetworkLogo network={network} size={24} /></span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-semibold text-[var(--ink-primary)]">{connection?.externalAccountLabel ?? `Cuenta de ${info.label}`}</p>
            <p className={`mt-0.5 flex items-center gap-1.5 text-sm font-medium ${connected ? 'text-[var(--success)]' : 'text-[var(--ink-tertiary)]'}`}>
              {connected ? <><CheckCircle2 size={15} /> Conectada</> : connection?.status === 'error' ? <><CircleAlert size={15} className="text-[var(--danger)]" /> Meta rechazó la última comprobación</> : <><Unplug size={15} /> Sin conectar</>}
            </p>
          </div>
          {connected && canManage ? <button type="button" className="btn-secondary" disabled={disconnect.isPending} onClick={() => { if (window.confirm(`¿Desconectar la cuenta de ${info.label}? Las conversaciones se conservan, pero no vas a poder responder hasta volver a conectarla.`)) disconnect.mutate() }}>{disconnect.isPending ? <Loader2 size={15} className="animate-spin" /> : <Unplug size={15} />} Desconectar</button> : null}
        </div>
        {disconnect.isError ? <p role="alert" className="mt-3 text-xs font-semibold text-[var(--danger)]">{getErrorMessage(disconnect.error)}</p> : null}
      </section>

      {status.data && (!status.data.webhookEnabled || !status.data.publicApiReady) ? (
        <section className="flex items-start gap-3 rounded-2xl border border-[var(--warning-line,var(--line))] bg-[var(--warning-paper)] p-4 text-sm text-[var(--warning)]">
          <CircleAlert size={18} className="mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold">Esta instalación todavía no puede recibir mensajes de Meta</p>
            {!status.data.publicApiReady ? <p>Meta necesita llegar al CRM por una dirección pública con https. En una instalación local se puede probar la pantalla, pero no entran mensajes reales ni se puede publicar.</p> : null}
            {!status.data.webhookEnabled ? <p>Falta activar el webhook de Meta en el servidor (ENABLE_LEGACY_CHANNELS=true).</p> : null}
          </div>
        </section>
      ) : null}

      {!connected ? (
        <section className="rounded-2xl border border-[var(--line-soft)] bg-[var(--paper)] p-5 shadow-[var(--ast-card-shadow)]">
          <p className="font-display text-[15px] font-semibold text-[var(--ink-primary)]">Vincular la cuenta</p>
          <p className="mt-1 text-sm text-[var(--ink-tertiary)]">Los datos salen de la app de Meta del negocio. Al guardar, el CRM consulta la cuenta en Meta: si algo está mal no queda vinculada.</p>
          {canManage ? (
            <form className="mt-4 space-y-4" onSubmit={(event) => { event.preventDefault(); connect.mutate() }}>
              <label className="block">
                <span className="text-xs font-semibold text-[var(--ink-secondary)]">{help.idLabel}</span>
                <input value={accountId} onChange={(event) => setAccountId(event.target.value)} inputMode="numeric" autoComplete="off" required className="ctrl-input mt-1" placeholder="17841400000000000" />
                <span className="mt-1 block text-xs text-[var(--ink-muted)]">{help.idHint}</span>
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-[var(--ink-secondary)]">Token de acceso</span>
                <input value={accessToken} onChange={(event) => setAccessToken(event.target.value)} type="password" autoComplete="off" required className="ctrl-input mt-1" placeholder="EAAG…" />
                <span className="mt-1 block text-xs text-[var(--ink-muted)]">{help.tokenHint}</span>
              </label>
              {connect.isError ? <p role="alert" className="text-sm font-semibold text-[var(--danger)]">{getErrorMessage(connect.error, 'No se pudo vincular la cuenta.')}</p> : null}
              <button type="submit" className="btn-primary" disabled={connect.isPending || !accountId.trim() || !accessToken.trim()}>{connect.isPending ? <Loader2 size={15} className="animate-spin" /> : <PlugZap size={15} />} Vincular {info.label}</button>
            </form>
          ) : <p className="mt-4 rounded-xl bg-[var(--paper-inset)] px-3 py-2.5 text-sm text-[var(--ink-secondary)]">Sólo el dueño o un administrador puede vincular la cuenta.</p>}
        </section>
      ) : null}
    </div>
  )
}
