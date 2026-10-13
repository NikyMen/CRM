import { Prisma } from '@prisma/client'
import { db } from '../../core/database'
import { ConflictError, ForbiddenError, NotFoundError, type WorkspaceContext } from '../../types'
import { normalizeShortcut } from './quick-reply.shortcut'

export type QuickReplyInput = {
  shortcut: string
  title: string
  body: string
}

const quickReplySelect = {
  id: true,
  shortcut: true,
  title: true,
  body: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} as const

function isManager(role: string) {
  return role === 'owner' || role === 'admin'
}

export class QuickReplyService {
  list(ctx: WorkspaceContext) {
    return db.quickReply.findMany({
      where: { workspaceId: ctx.workspaceId },
      select: quickReplySelect,
      orderBy: { shortcut: 'asc' },
    })
  }

  async create(ctx: WorkspaceContext, input: QuickReplyInput) {
    try {
      return await db.quickReply.create({
        data: {
          workspaceId: ctx.workspaceId,
          shortcut: normalizeShortcut(input.shortcut),
          title: input.title,
          body: input.body,
          createdByUserId: ctx.userId,
        },
        select: quickReplySelect,
      })
    } catch (error) {
      throw this.translate(error)
    }
  }

  async update(ctx: WorkspaceContext, id: string, input: QuickReplyInput) {
    await this.findEditable(ctx, id)
    try {
      return await db.quickReply.update({
        where: { id },
        data: { shortcut: normalizeShortcut(input.shortcut), title: input.title, body: input.body },
        select: quickReplySelect,
      })
    } catch (error) {
      throw this.translate(error)
    }
  }

  async remove(ctx: WorkspaceContext, id: string) {
    await this.findEditable(ctx, id)
    await db.quickReply.delete({ where: { id } })
  }

  /** Cualquiera del equipo usa las respuestas; sólo su autor o un owner/admin las cambia. */
  private async findEditable(ctx: WorkspaceContext, id: string) {
    const record = await db.quickReply.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      select: { id: true, createdByUserId: true },
    })
    if (!record) throw new NotFoundError('Respuesta rápida', id)
    if (!isManager(ctx.role) && record.createdByUserId !== ctx.userId) {
      throw new ForbiddenError('Sólo quien creó la respuesta o un administrador puede modificarla.')
    }
    return record
  }

  private translate(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictError('Ya existe una respuesta rápida con ese atajo.')
    }
    return error
  }
}
