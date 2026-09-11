import type { Prisma } from '@prisma/client'
import { ForbiddenError, type WorkspaceContext } from '../../types'
import {
  dealAssignmentVisibilityWhere,
  dealWriteVisibilityWhere,
} from '../../core/auth/portfolio-visibility'

export { dealWriteVisibilityWhere }

export function isDealManager(ctx: WorkspaceContext) {
  return ctx.role === 'owner' || ctx.role === 'admin'
}

export function dealVisibilityWhere(ctx: WorkspaceContext): Prisma.DealWhereInput {
  return dealAssignmentVisibilityWhere(ctx)
}

export function assertDealWriteAccess(
  ctx: WorkspaceContext,
  currentOwnerId: string | null,
  requestedOwnerId: string | null | undefined,
  changesOnlyOwner = false,
  hasClientAssignment = false
) {
  if (isDealManager(ctx)) return
  if (ctx.role === 'viewer') {
    throw new ForbiddenError('El rol viewer solo puede consultar oportunidades')
  }

  if (hasClientAssignment) {
    if (requestedOwnerId !== undefined && requestedOwnerId !== currentOwnerId) {
      throw new ForbiddenError('Solo el responsable principal puede reasignar la oportunidad')
    }
    return
  }

  if (currentOwnerId === ctx.userId) {
    if (requestedOwnerId !== undefined && requestedOwnerId !== null && requestedOwnerId !== ctx.userId) {
      throw new ForbiddenError('Solo podés asignarte una oportunidad o liberarla')
    }
    return
  }

  const isAtomicClaim = currentOwnerId === null && requestedOwnerId === ctx.userId && changesOnlyOwner
  if (!isAtomicClaim) {
    throw new ForbiddenError('Primero tenés que tomar la oportunidad libre')
  }
}
