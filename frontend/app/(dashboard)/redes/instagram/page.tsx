'use client'

import { useState } from 'react'
import { NetworkHeader } from '@/components/social/NetworkTabs'
import { SocialInbox } from '@/components/social/SocialChat'
import { SocialConnectionCard, useSocialStatus } from '@/components/social/SocialConnection'
import { InstagramPublisher } from '@/components/social/InstagramPublisher'

type Tab = 'messages' | 'publish' | 'connection'

export default function InstagramPage() {
  const [tab, setTab] = useState<Tab>('messages')
  const status = useSocialStatus()
  const unread = status.data?.networks.find((item) => item.network === 'instagram')?.unreadConversations
  return (
    <div className="flex h-full flex-col">
      <NetworkHeader network="instagram" subtitle="Mensajes directos y publicaciones" active={tab} onChange={setTab} tabs={[{ key: 'messages', label: 'Mensajes', badge: unread }, { key: 'publish', label: 'Publicar' }, { key: 'connection', label: 'Conexión' }]} />
      {tab === 'messages' ? <div className="min-h-0 flex-1 p-4 sm:p-6"><SocialInbox network="instagram" /></div> : null}
      {tab === 'publish' ? <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"><InstagramPublisher /></div> : null}
      {tab === 'connection' ? <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"><SocialConnectionCard network="instagram" /></div> : null}
    </div>
  )
}
