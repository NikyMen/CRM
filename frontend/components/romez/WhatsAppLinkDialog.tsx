'use client'

import { useEffect, useState } from 'react'
import NextImage from 'next/image'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2, RefreshCcw, Smartphone, Unplug, Wifi, WifiOff, X } from 'lucide-react'
import QRCode from 'qrcode'
import clsx from 'clsx'
import { getErrorMessage } from '@/lib/format'
import type { WhatsAppLinkSession } from '@/types'

const STATUS_LABELS: Record<string, string> = {
  CONNECTED: 'Conectado',
  CONNECTING: 'Conectando…',
  PAIRING: 'Esperando que escanees el QR',
  DISCONNECTED: 'Sin vincular',
  ERROR: 'Con error',
}

/** Estado, QR y desvinculación de un número de WhatsApp, en un popup reutilizable. */
export function WhatsAppLinkDialog({ title, description, queryKey, getSession, connect, disconnect, disconnectConfirm, canManage, onClose }: {
  title: string
  description: string
  queryKey: string
  getSession: () => Promise<WhatsAppLinkSession>
  connect: () => Promise<unknown>
  disconnect: () => Promise<unknown>
  disconnectConfirm: string
  canManage: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [qrImage, setQrImage] = useState<string | null>(null)
  const sessionQuery = useQuery<WhatsAppLinkSession>({
    queryKey: [queryKey],
    queryFn: getSession,
    refetchInterval: (query) => ['PAIRING', 'CONNECTING'].includes(query.state.data?.status ?? '') ? 3_000 : 15_000,
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: [queryKey] })
  const connectMutation = useMutation({ mutationFn: connect, onSuccess: refresh })
  const disconnectMutation = useMutation({ mutationFn: disconnect, onSuccess: refresh })

  const qrCode = sessionQuery.data?.qrCode
  useEffect(() => {
    let active = true
    if (!qrCode) { setQrImage(null); return () => { active = false } }
    QRCode.toDataURL(qrCode, { width: 360, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#062d65', light: '#ffffff' } })
      .then((url) => { if (active) setQrImage(url) })
      .catch(() => { if (active) setQrImage(null) })
    return () => { active = false }
  }, [qrCode])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const session = sessionQuery.data
  const connected = session?.status === 'CONNECTED'
  const busy = connectMutation.isPending || disconnectMutation.isPending
  const error = sessionQuery.error || connectMutation.error || disconnectMutation.error

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="whatsapp-link-title" className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--paper)] shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-[var(--line-soft)] p-5">
          <div><h2 id="whatsapp-link-title" className="font-display text-lg font-extrabold text-[var(--ink-primary)]">{title}</h2><p className="mt-1 text-xs text-[var(--ink-tertiary)]">{description}</p></div>
          <button type="button" aria-label="Cerrar" className="rounded-md p-1 text-[var(--ink-tertiary)] hover:bg-[var(--paper-soft)]" onClick={onClose}><X size={18} /></button>
        </header>
        {sessionQuery.isLoading ? <div className="flex items-center justify-center gap-2 p-10 text-sm text-[var(--ink-tertiary)]"><Loader2 size={18} className="animate-spin" /> Consultando el número…</div> : (
          <div className="space-y-4 p-5">
            <div className="flex items-center gap-3">
              <span className={clsx('grid h-11 w-11 shrink-0 place-items-center rounded-lg border', connected ? 'border-[var(--success-line)] bg-[var(--success-paper)] text-[var(--success)]' : 'border-[var(--line)] bg-[var(--paper-soft)] text-[var(--ink-tertiary)]')}>{connected ? <Wifi size={20} /> : <WifiOff size={20} />}</span>
              <div className="min-w-0"><p className="text-sm font-extrabold text-[var(--ink-primary)]">{STATUS_LABELS[session?.status ?? 'DISCONNECTED'] ?? session?.status}</p><p className="mt-0.5 truncate text-xs text-[var(--ink-tertiary)]">{[session?.pushName, session?.phoneNumber ? `+${session.phoneNumber}` : null].filter(Boolean).join(' · ') || 'Sin número vinculado'}</p></div>
            </div>
            {error || session?.lastError ? <p className="flex gap-2 rounded-lg border border-[var(--danger-line)] bg-[var(--danger-paper)] p-3 text-xs font-semibold text-[var(--danger)]"><AlertTriangle size={15} className="shrink-0" />{session?.lastError || getErrorMessage(error, 'No pudimos consultar el WhatsApp.')}</p> : null}
            {qrImage ? (
              <div>
                <div className="grid place-items-center rounded-lg border border-[var(--line)] bg-white p-4"><NextImage unoptimized src={qrImage} alt="Código QR para vincular WhatsApp" width={280} height={280} className="h-auto w-full max-w-[260px]" /></div>
                <p className="mt-3 text-xs leading-5 text-[var(--ink-tertiary)]">En el teléfono: WhatsApp → Dispositivos vinculados → Vincular dispositivo y escaneá el código. Se actualiza solo mientras espera.</p>
              </div>
            ) : (
              <div className="grid min-h-40 place-items-center rounded-lg border border-dashed border-[var(--line)] bg-[var(--paper-soft)] p-6 text-center"><div><Smartphone size={28} className="mx-auto text-[var(--brand-blue)]" /><p className="mt-2 text-sm font-bold text-[var(--ink-primary)]">{connected ? 'Número vinculado y funcionando' : 'Todavía no hay un QR activo'}</p><p className="mt-1 text-xs text-[var(--ink-tertiary)]">{connected ? 'Los mensajes nuevos entran solos.' : canManage ? 'Generá un código y escanealo con el teléfono del número.' : 'Pedile a un administrador que vincule el número.'}</p></div></div>
            )}
            {canManage ? (
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className="btn-secondary" disabled={busy || !session || (!session.hasActiveSocket && !session.authAvailable)} onClick={() => { if (window.confirm(disconnectConfirm)) disconnectMutation.mutate() }}>{disconnectMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Unplug size={15} />} Desvincular</button>
                <button type="button" className="btn-primary" disabled={busy || !session?.packageInstalled} onClick={() => connectMutation.mutate()}>{connectMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}{connected ? 'Reconectar' : qrImage ? 'Actualizar QR' : 'Generar QR'}</button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
