import { db } from '../../core/database'
import { ForbiddenError, NotFoundError, ValidationError, type WorkspaceContext } from '../../types'
export { clientVisibilityWhere } from './client-visibility'
import { clientVisibilityWhere } from './client-visibility'

export async function ensureWorkspaceUser(workspaceId: string, userId: string) {
  const membership = await db.workspaceUser.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { userId: true, role: true },
  })
  if (!membership) throw new ValidationError('El responsable no pertenece a este espacio de trabajo')
  return membership
}

export async function ensureClientAccess(
  ctx: WorkspaceContext,
  companyId: string,
  mode: 'read' | 'write' = 'read'
) {
  const client = await db.company.findFirst({
    where: {
      id: companyId,
      workspaceId: ctx.workspaceId,
      isArchived: false,
      ...clientVisibilityWhere(ctx),
    },
  })
  if (!client) throw new NotFoundError('Cliente', companyId)
  if (mode === 'write' && ctx.role === 'viewer') {
    throw new ForbiddenError('El rol viewer solo puede consultar clientes')
  }
  if (mode === 'write' && ctx.role === 'member' && client.ownerId !== ctx.userId) {
    const assignment = await db.clientAssignment.findFirst({
      where: { workspaceId: ctx.workspaceId, companyId, userId: ctx.userId },
      select: { id: true },
    })
    if (!assignment) {
      throw new ForbiddenError('Tomá el cliente antes de modificar su legajo')
    }
  }
  return client
}

export function canManageAllClients(ctx: WorkspaceContext) {
  return ctx.role === 'owner' || ctx.role === 'admin'
}
