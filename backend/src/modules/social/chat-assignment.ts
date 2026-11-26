import { db } from '../../core/database'
import { getModuleState } from '../../core/modules/require-module'
import { AppError, ForbiddenError, type WorkspaceContext } from '../../types'

/**
 * Responsable de las conversaciones de la bandeja de Mensajes (WhatsApp, Instagram y
 * Facebook), con las mismas reglas que Tickets: owner y admin ven todo y asignan a
 * cualquiera; member ve lo propio y lo libre, toma un chat libre o libera el suyo;
 * viewer sólo consulta lo propio.
 */

export function isAssignmentManager(ctx: WorkspaceContext) {
  return ctx.role === 'owner' || ctx.role === 'admin'
}

/** Filtro de visibilidad por responsable para `assignedToUserId`. */
export function assignmentVisibility(ctx: WorkspaceContext): { OR?: { assignedToUserId: string | null }[]; assignedToUserId?: string } {
  if (isAssignmentManager(ctx)) return {}
  if (ctx.role === 'member') return { OR: [{ assignedToUserId: null }, { assignedToUserId: ctx.userId }] }
  return { assignedToUserId: ctx.userId }
}

export function canSeeAssignee(ctx: WorkspaceContext, assignedToUserId: string | null) {
  if (isAssignmentManager(ctx)) return true
  if (ctx.role === 'member') return assignedToUserId === null || assignedToUserId === ctx.userId
  return assignedToUserId === ctx.userId
}

/**
 * Los chats de WhatsApp tienen responsable sólo donde está prendida la bandeja de
 * Mensajes: en las instalaciones que usan la línea comercial con el asistente
 * (Gestión comercial) siguen siendo compartidos como hasta ahora.
 */
export async function lineAssignmentEnabled(ctx: WorkspaceContext) {
  const state = await getModuleState(ctx.workspaceId, ctx.userId, ctx.role)
  return state.messages || state.whatsapp
}

export function assertAssignAllowed(ctx: WorkspaceContext, current: string | null, requested: string | null) {
  if (isAssignmentManager(ctx)) return
  if (ctx.role !== 'member') throw new ForbiddenError('Tu rol no puede cambiar el responsable')
  if (current === null && requested === ctx.userId) return
  if (current === ctx.userId && requested === null) return
  if (current === null) throw new ForbiddenError('Sólo podés tomar el chat para vos')
  throw new ForbiddenError(current === ctx.userId ? 'Sólo podés liberar tu chat: para pasárselo a otra persona pedíselo a un administrador' : 'El chat ya tiene responsable')
}

/** El responsable tiene que ser alguien del equipo que pueda atender (no viewer). */
export async function assertAssignableMember(workspaceId: string, userId: string | null) {
  if (!userId) return
  const member = await db.workspaceUser.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } })
  if (!member || member.role === 'viewer') throw new AppError(422, 'Esa persona no puede ser responsable de un chat.', 'INVALID_ASSIGNEE')
}

/** El lead del tablero sigue al responsable de su conversación. */
export async function syncLeadOwner(workspaceId: string, link: 'commercialChatId' | 'socialConversationId', id: string, userId: string | null) {
  await db.deal.updateMany({ where: { workspaceId, isArchived: false, customData: { path: [link], equals: id } }, data: { ownerId: userId } })
}

/** Personas del equipo que pueden ser responsables, para el selector y los filtros. */
export async function listAssignableMembers(workspaceId: string) {
  const members = await db.workspaceUser.findMany({
    where: { workspaceId, role: { not: 'viewer' } },
    select: { role: true, user: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
    orderBy: { user: { firstName: 'asc' } },
  })
  return members.map((member) => ({ ...member.user, role: member.role }))
}
