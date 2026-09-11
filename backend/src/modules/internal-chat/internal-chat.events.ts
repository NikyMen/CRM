import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'

export type InternalChatRealtimeEvent = {
  id: string
  type: 'internal-chat.updated'
  at: string
  conversationId: string
  senderId?: string
  audienceUserIds?: string[]
}

class InternalChatRealtimeHub {
  private readonly emitter = new EventEmitter()

  constructor() {
    this.emitter.setMaxListeners(500)
  }

  publish(workspaceId: string, event: Omit<InternalChatRealtimeEvent, 'id' | 'at'>) {
    this.emitter.emit(workspaceId, {
      ...event,
      id: randomUUID(),
      at: new Date().toISOString(),
    } satisfies InternalChatRealtimeEvent)
  }

  subscribe(workspaceId: string, listener: (event: InternalChatRealtimeEvent) => void) {
    this.emitter.on(workspaceId, listener)
    return () => this.emitter.off(workspaceId, listener)
  }
}

export const internalChatRealtime = new InternalChatRealtimeHub()
