'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { auth } from '@/lib/auth'
import { BASE_URL } from '@/lib/api'

type RealtimeEvent = {
  type?:
    | 'session.updated'
    | 'chat.updated'
    | 'message.updated'
    | 'assignment.updated'
    | 'kanban.updated'
    | 'ticket.created'
    | 'ticket.updated'
    | 'collection.updated'
    | 'checklist.updated'
  jid?: string
}

export function WhatsAppLiveSync() {
  const queryClient = useQueryClient()

  useEffect(() => {
    let controller: AbortController | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let stopped = false
    let retry = 0

    const refresh = (event?: RealtimeEvent) => {
      const kind = event?.type?.split('.')[0]
      if (!kind || kind === 'session') {
        queryClient.invalidateQueries({ queryKey: ['whatsapp-session'] })
      }
      if (!kind || ['chat', 'message', 'assignment'].includes(kind)) {
        queryClient.invalidateQueries({ queryKey: ['whatsapp-chats'] })
        queryClient.invalidateQueries({ queryKey: ['whatsapp-messages'] })
      }
      if (!kind || ['kanban', 'message', 'assignment'].includes(kind)) {
        queryClient.invalidateQueries({ queryKey: ['kanban'] })
      }
      if (!kind || kind === 'ticket') {
        queryClient.invalidateQueries({ queryKey: ['tickets'] })
        queryClient.invalidateQueries({ queryKey: ['ticket'] })
        queryClient.invalidateQueries({ queryKey: ['customer-service-summary'] })
        queryClient.invalidateQueries({ queryKey: ['clients'] })
        queryClient.invalidateQueries({ queryKey: ['client-summary'] })
      }
      if (!kind || kind === 'collection') {
        queryClient.invalidateQueries({ queryKey: ['collections-summary'] })
        queryClient.invalidateQueries({ queryKey: ['receivables'] })
        queryClient.invalidateQueries({ queryKey: ['payments'] })
        queryClient.invalidateQueries({ queryKey: ['recurring-charges'] })
        queryClient.invalidateQueries({ queryKey: ['clients'] })
        queryClient.invalidateQueries({ queryKey: ['client-summary'] })
      }
      if (!kind || kind === 'checklist') {
        queryClient.invalidateQueries({ queryKey: ['checklists-summary'] })
        queryClient.invalidateQueries({ queryKey: ['clients'] })
        queryClient.invalidateQueries({ queryKey: ['client-summary'] })
      }
    }

    async function connect() {
      const token = auth.getToken()
      if (!token || stopped) return
      controller?.abort()
      const requestController = new AbortController()
      controller = requestController

      try {
        const response = await fetch(`${BASE_URL}/whatsapp/events`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
          signal: requestController.signal,
        })
        if (response.status === 401) {
          auth.clear()
          window.location.replace('/login')
          return
        }
        if (!response.ok || !response.body) throw new Error(`SSE ${response.status}`)
        retry = 0
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (!stopped) {
          const { value, done } = await reader.read()
          if (done) throw new Error('SSE cerrado')
          buffer += decoder.decode(value, { stream: true })
          const frames = buffer.split('\n\n')
          buffer = frames.pop() ?? ''
          for (const frame of frames) {
            const data = frame.split('\n').find((line) => line.startsWith('data:'))?.slice(5).trim()
            if (!data) continue
            try { refresh(JSON.parse(data) as RealtimeEvent) } catch { /* heartbeat o payload parcial */ }
          }
        }
      } catch {
        if (stopped || requestController.signal.aborted) return
        retry += 1
        retryTimer = setTimeout(connect, Math.min(15_000, 800 * 2 ** Math.min(retry, 5)))
      }
    }

    const resync = () => {
      if (document.visibilityState === 'hidden') return
      refresh()
      connect()
    }
    connect()
    window.addEventListener('online', resync)
    window.addEventListener('focus', resync)
    document.addEventListener('visibilitychange', resync)
    return () => {
      stopped = true
      controller?.abort()
      if (retryTimer) clearTimeout(retryTimer)
      window.removeEventListener('online', resync)
      window.removeEventListener('focus', resync)
      document.removeEventListener('visibilitychange', resync)
    }
  }, [queryClient])

  return null
}
