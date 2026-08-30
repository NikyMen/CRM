import type { EventBus } from '../../core/event-bus'

let eventBus: EventBus | null = null

export function configureTicketEvents(bus: EventBus) {
  eventBus = bus
}

export async function emitTicketEvent(
  event: 'ticket.created' | 'ticket.updated',
  payload: Record<string, unknown>
) {
  if (!eventBus) return
  await eventBus.emit(event, payload)
}
