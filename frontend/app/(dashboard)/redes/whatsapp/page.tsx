'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2, QrCode, Unplug } from 'lucide-react'
import { auth } from '@/lib/auth'
import { LineWhatsAppLinkDialog, LineWhatsAppPanel, useLineWhatsAppSession } from '@/components/romez/LineWhatsAppPanel'
import { NetworkHeader } from '@/components/social/NetworkTabs'
import { NETWORKS, NetworkLogo } from '@/components/social/networks'
import { MESSAGES_WHATSAPP } from '@/components/social/whatsapp-line'

type Tab = 'chats' | 'connection'

/** Sección WhatsApp: abre directo en los chats; la conexión por QR va en su pestaña. */
export default function WhatsAppNetworkPage() {
  const user = auth.get()
  const canManage = user?.role === 'owner' || user?.role === 'admin'
  const session = useLineWhatsAppSession(MESSAGES_WHATSAPP)
  const [tab, setTab] = useState<Tab>('chats')
  const [linkOpen, setLinkOpen] = useState(false)
  const connected = session.data?.status === 'CONNECTED'
  const info = NETWORKS.whatsapp

  return (
    <div className="flex h-full flex-col">
      <NetworkHeader network="whatsapp" subtitle={connected && session.data?.phoneNumber ? `Número +${session.data.phoneNumber}` : 'Número de WhatsApp de las consultas'} active={tab} onChange={setTab} tabs={[{ key: 'chats', label: 'Chats' }, { key: 'connection', label: 'Conexión' }]} />
      {tab === 'chats' ? (
        <div className="min-h-0 flex-1 p-4 sm:p-6">
          <LineWhatsAppPanel embedded line={MESSAGES_WHATSAPP} canWrite={user?.role !== 'viewer'} canManage={canManage} currentUserId={user?.userId} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <section className="mx-auto w-full max-w-2xl rounded-2xl border border-[var(--line-soft)] bg-[var(--paper)] p-5 shadow-[var(--ast-card-shadow)]">
            <div className="flex items-center gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl" style={{ background: info.soft, color: info.color }}><NetworkLogo network="whatsapp" size={24} /></span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-base font-semibold text-[var(--ink-primary)]">{connected && session.data?.phoneNumber ? `+${session.data.phoneNumber}` : 'Número de WhatsApp'}</p>
                <p className={`mt-0.5 flex items-center gap-1.5 text-sm font-medium ${connected ? 'text-[var(--success)]' : 'text-[var(--ink-tertiary)]'}`}>
                  {session.isLoading ? <><Loader2 size={15} className="animate-spin" /> Consultando…</> : connected ? <><CheckCircle2 size={15} /> Conectado</> : <><Unplug size={15} /> Sin conectar</>}
                </p>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setLinkOpen(true)}><QrCode size={15} /> {connected ? 'Ver la conexión' : canManage ? 'Vincular con QR' : 'Ver el estado'}</button>
            </div>
            {!connected && !session.isLoading ? <p className="mt-4 rounded-xl bg-[var(--paper-inset)] px-3 py-2.5 text-sm text-[var(--ink-secondary)]">Mientras el número no esté vinculado se pueden leer los chats que ya entraron, pero no llegan mensajes nuevos ni se puede responder.</p> : null}
          </section>
        </div>
      )}
      {linkOpen ? <LineWhatsAppLinkDialog line={MESSAGES_WHATSAPP} canManage={canManage} onClose={() => setLinkOpen(false)} /> : null}
    </div>
  )
}
