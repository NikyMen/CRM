import type { Prisma } from '@prisma/client'
import type { WorkspaceContext } from '../../types'

export function isPortfolioManager(ctx: Pick<WorkspaceContext, 'role'>) {
  return ctx.role === 'owner' || ctx.role === 'admin'
}

type OwnerVisibilityWhere = {
  ownerId?: string | null
  OR?: Array<{ ownerId: string | null }>
}

type PortfolioActor = Pick<WorkspaceContext, 'userId' | 'role'>

export function contactAssignmentVisibilityWhere(ctx: PortfolioActor): Prisma.ContactWhereInput {
  if (isPortfolioManager(ctx)) return {}
  const assignedClient = {
    company: {
      is: { assignments: { some: { userId: ctx.userId } } },
    },
  }
  if (ctx.role === 'member') {
    return { OR: [{ ownerId: ctx.userId }, { ownerId: null }, assignedClient] }
  }
  return { OR: [{ ownerId: ctx.userId }, assignedClient] }
}

export function contactWriteVisibilityWhere(ctx: PortfolioActor): Prisma.ContactWhereInput {
  if (isPortfolioManager(ctx)) return {}
  const assignedClient = {
    company: {
      is: { assignments: { some: { userId: ctx.userId } } },
    },
  }
  if (ctx.role === 'member') return { OR: [{ ownerId: ctx.userId }, assignedClient] }
  return { AND: [{ ownerId: ctx.userId }, { ownerId: null }] }
}

export function contactFilterVisibilityWhere(ctx: PortfolioActor): Prisma.ContactWhereInput {
  const visibility = contactAssignmentVisibilityWhere(ctx)
  return Object.keys(visibility).length ? { AND: [visibility] } : {}
}

export function dealAssignmentVisibilityWhere(ctx: PortfolioActor): Prisma.DealWhereInput {
  if (isPortfolioManager(ctx)) return {}
  const assignedClient = {
    company: {
      is: { assignments: { some: { userId: ctx.userId } } },
    },
  }
  if (ctx.role === 'member') {
    return { OR: [{ ownerId: ctx.userId }, { ownerId: null }, assignedClient] }
  }
  return { OR: [{ ownerId: ctx.userId }, assignedClient] }
}

export function dealWriteVisibilityWhere(ctx: PortfolioActor): Prisma.DealWhereInput {
  if (isPortfolioManager(ctx)) return {}
  const assignedClient = {
    company: {
      is: { assignments: { some: { userId: ctx.userId } } },
    },
  }
  if (ctx.role === 'member') return { OR: [{ ownerId: ctx.userId }, assignedClient] }
  return { AND: [{ ownerId: ctx.userId }, { ownerId: null }] }
}

export function ownerVisibilityWhere(ctx: WorkspaceContext): OwnerVisibilityWhere {
  if (isPortfolioManager(ctx)) return {}
  if (ctx.role === 'member') {
    return { OR: [{ ownerId: ctx.userId }, { ownerId: null }] }
  }
  return { ownerId: ctx.userId }
}

export function contactPortfolioWhere(ctx: WorkspaceContext): Prisma.ContactWhereInput {
  return {
    workspaceId: ctx.workspaceId,
    ...contactAssignmentVisibilityWhere(ctx),
  }
}

export function dealPortfolioWhere(ctx: WorkspaceContext): Prisma.DealWhereInput {
  return {
    workspaceId: ctx.workspaceId,
    ...dealAssignmentVisibilityWhere(ctx),
  }
}

function linkedPortfolioWhere(ctx: WorkspaceContext) {
  const contactWhere: Prisma.ContactWhereInput = contactPortfolioWhere(ctx)
  const dealWhere: Prisma.DealWhereInput = dealPortfolioWhere(ctx)
  const linkedRecordsMustBeVisible = [
    {
      OR: [
        { contactId: null },
        { contact: { is: contactWhere } },
      ],
    },
    {
      OR: [
        { dealId: null },
        { deal: { is: dealWhere } },
      ],
    },
  ]

  if (!isPortfolioManager(ctx)) {
    linkedRecordsMustBeVisible.push({
      OR: [
        { contactId: { not: null } },
        { dealId: { not: null } },
        { userId: ctx.userId },
      ],
    } as typeof linkedRecordsMustBeVisible[number])
  }

  return { AND: linkedRecordsMustBeVisible }
}

export function activityPortfolioWhere(ctx: WorkspaceContext): Prisma.ActivityWhereInput {
  return linkedPortfolioWhere(ctx) as Prisma.ActivityWhereInput
}

export function notePortfolioWhere(ctx: WorkspaceContext): Prisma.NoteWhereInput {
  return linkedPortfolioWhere(ctx) as Prisma.NoteWhereInput
}

export function activityDeleteWhere(
  ctx: WorkspaceContext,
  id: string
): Prisma.ActivityWhereInput {
  return {
    id,
    workspaceId: ctx.workspaceId,
    ...activityPortfolioWhere(ctx),
    ...(!isPortfolioManager(ctx) ? { userId: ctx.userId } : {}),
  }
}

export function noteDeleteWhere(ctx: WorkspaceContext, id: string): Prisma.NoteWhereInput {
  return {
    id,
    workspaceId: ctx.workspaceId,
    ...notePortfolioWhere(ctx),
    ...(!isPortfolioManager(ctx) ? { userId: ctx.userId } : {}),
  }
}
