import type { Prisma } from '@prisma/client'
import type { WorkspaceContext } from '../../types'

export function clientVisibilityWhere(ctx: WorkspaceContext): Prisma.CompanyWhereInput {
  if (ctx.role === 'owner' || ctx.role === 'admin') return {}
  if (ctx.role === 'member') {
    return {
      OR: [
        { ownerId: ctx.userId },
        { ownerId: null },
        { assignments: { some: { userId: ctx.userId } } },
      ],
    }
  }
  return {
    OR: [
      { ownerId: ctx.userId },
      { assignments: { some: { userId: ctx.userId } } },
    ],
  }
}
