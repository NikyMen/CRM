import { COMMERCIAL_WHATSAPP, type WhatsAppLineConfig } from '@/components/romez/LineWhatsAppPanel'

/**
 * El número de WhatsApp de la bandeja de Mensajes. Es la misma línea que la de Gestión
 * comercial (mismos chats y misma API); sólo cambian los textos para una instalación que
 * no tiene ese módulo a la vista.
 */
export const MESSAGES_WHATSAPP: WhatsAppLineConfig = {
  ...COMMERCIAL_WHATSAPP,
  title: 'WhatsApp',
  linkDescription: 'El número de WhatsApp que recibe las consultas. Se vincula escaneando un QR desde el teléfono.',
  emptyDescription: 'Cuando alguien escriba al número de WhatsApp va a aparecer acá.',
  // Sin asistente de IA: cada chat tiene una persona responsable, como los tickets.
  assistant: false,
  assignment: true,
  clients: false,
}
