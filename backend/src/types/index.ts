import { z } from 'zod'

// ─── Paginación ──────────────────────────────────────────────────
// Estos tipos los van a usar todos los módulos que devuelvan listas

export interface PaginationQuery {
  page?: number
  limit?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export function paginate<T>(
  items: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResult<T> {
  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
}

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      404,
      id ? `${resource} con id "${id}" no encontrado` : `${resource} no encontrado`,
      'NOT_FOUND'
    )
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'No autorizado') {
    super(401, message, 'UNAUTHORIZED')
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Acceso denegado') {
    super(403, message, 'FORBIDDEN')
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message, 'CONFLICT')
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(422, message, 'VALIDATION_ERROR')
  }
}

export type CRMEvent =
  // Contactos
  | 'contact.created'
  | 'contact.updated'
  | 'contact.deleted'
  | 'contact.merged'
  // Deals
  | 'deal.created'
  | 'deal.updated'
  | 'deal.stage_changed'
  | 'deal.won'
  | 'deal.lost'
  | 'deal.deleted'
  // Tareas
  | 'task.created'
  | 'task.completed'
  | 'task.overdue'
  // Notas
  | 'note.created'
  // Mensajes — (WhatsApp, Facebook, etc.)
  | 'message.received'
  | 'message.sent'
  // Automatización
  | 'automation.triggered'

  export enum ActivityType {
  // Contacto
  CONTACT_CREATED   = 'CONTACT_CREATED',
  CONTACT_UPDATED   = 'CONTACT_UPDATED',
  CONTACT_MERGED    = 'CONTACT_MERGED',
  // Deal
  DEAL_CREATED      = 'DEAL_CREATED',
  DEAL_UPDATED      = 'DEAL_UPDATED',
  DEAL_STAGE_CHANGED = 'DEAL_STAGE_CHANGED',
  DEAL_WON          = 'DEAL_WON',
  DEAL_LOST         = 'DEAL_LOST',
  // Comunicación
  EMAIL_SENT        = 'EMAIL_SENT',
  EMAIL_RECEIVED    = 'EMAIL_RECEIVED',
  WHATSAPP_SENT     = 'WHATSAPP_SENT',
  WHATSAPP_RECEIVED = 'WHATSAPP_RECEIVED',
  CALL_MADE         = 'CALL_MADE',
  MEETING_HELD      = 'MEETING_HELD',
  // Notas
  NOTE_ADDED        = 'NOTE_ADDED',
  // Automatización
  AUTOMATION_TRIGGERED = 'AUTOMATION_TRIGGERED',
}

// ─── Tipos de Entidad ────────────────────────────────────────────
// Para el sistema polimórfico de Activity y Note

export type EntityType = 'contact' | 'deal' | 'company' | 'task'

// ─── Canal de Contacto ───────────────────────────────────────────
// Estructura del JSON que guarda el campo "channels" en Contact

export const customDataSchema = z.record(z.unknown())
export type CustomData = z.infer<typeof customDataSchema>

export const contactChannelSchema = z.object({
  type: z.enum(['whatsapp', 'facebook', 'instagram', 'email', 'telegram', 'phone']),
  identifier: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
})
export const contactChannelsSchema = z.array(contactChannelSchema)
export type ContactChannel = z.infer<typeof contactChannelSchema>

// ─── Conexiones de Canal ─────────────────────────────────────────
// Estructuras de JSON para credenciales y configuración

export const channelCredentialsSchema = z.object({
  accessToken: z.string().optional(),
}).catchall(z.unknown())
export type ChannelCredentials = z.infer<typeof channelCredentialsSchema>

export const channelSettingsSchema = z.object({
  onboardingSource: z.string().optional(),
  metaBusinessId: z.string().optional(),
  metaWabaId: z.string().optional(),
  metaDisplayPhoneNumber: z.string().optional(),
  metaVerifiedName: z.string().optional(),
  metaQualityRating: z.string().optional(),
}).catchall(z.unknown())
export type ChannelSettings = z.infer<typeof channelSettingsSchema>

// ─── Contexto de Workspace ───────────────────────────────────────
// Lo que el middleware de autenticación inyecta en cada request

export interface WorkspaceContext {
  workspaceId: string
  userId: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
}