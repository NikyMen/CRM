'use client'

import { useState } from 'react'
import { NetworkHeader } from '@/components/social/NetworkTabs'
import { SocialInbox } from '@/components/social/SocialChat'
import { SocialConnectionCard, useSocialStatus } from '@/components/social/SocialConnection'

type Tab = 'messages' | 'connection'

export default function FacebookPage() {
  const [tab, setTab] = useState<Tab>('messages')
  const status = useSocialStatus()
  const unread = status.data?.networks.find((item) => item.network === 'facebook')?.unreadConversations
  return (
    <div className="flex h-full flex-col">
      <NetworkHeader network="facebook" subtitle="Mensajes de la página (Messenger)" active={tab} onChange={setTab} tabs={[{ key: 'messages', label: 'Mensajes', badge: unread }, { key: 'connection', label: 'Conexión' }]} />
      {tab === 'messages' ? <div className="min-h-0 flex-1 p-4 sm:p-6"><SocialInbox network="facebook" /></div> : null}
      {tab === 'connection' ? <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"><SocialConnectionCard network="facebook" /></div> : null}
    </div>
  )
}
