import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'

export type WhatsAppRealtimeEvent = {
  id: string
  type: 'session.updated' | 'chat.updated' | 'message.updated' | 'assignment.updated' | 'kanban.updated'
  at: string
  jid?: string
}

class WhatsAppRealtimeHub {
  private readonly emitter = new EventEmitter()

  constructor() {
    this.emitter.setMaxListeners(500)
  }

  publish(workspaceId: string, event: Omit<WhatsAppRealtimeEvent, 'id' | 'at'>) {
    this.emitter.emit(workspaceId, {
      ...event,
      id: randomUUID(),
      at: new Date().toISOString(),
    } satisfies WhatsAppRealtimeEvent)
  }

  subscribe(workspaceId: string, listener: (event: WhatsAppRealtimeEvent) => void) {
    this.emitter.on(workspaceId, listener)
    return () => this.emitter.off(workspaceId, listener)
  }
}

export const whatsAppRealtime = new WhatsAppRealtimeHub()
