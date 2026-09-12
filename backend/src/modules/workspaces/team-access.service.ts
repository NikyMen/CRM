import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { db } from '../../core/database'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError, type WorkspaceContext } from '../../types'
import { normalizeAuthEmail } from '../../core/auth/auth.service'

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export class TeamAccessService {
  async createInvitation(ctx: WorkspaceContext, role: 'admin' | 'member' | 'viewer') {
    if (ctx.role !== 'owner') throw new ForbiddenError('Solo el propietario puede generar enlaces')
    const creator = await db.workspaceUser.findFirst({ where: { workspaceId: ctx.workspaceId, userId: ctx.userId, role: 'owner' } })
    if (!creator) throw new ForbiddenError()
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
    await db.teamInvitation.create({ data: { tokenHash: hashToken(token), role, createdById: creator.id, expiresAt } })
    return { token, expiresAt }
  }

  async acceptInvitation(input: { token: string; email: string; password: string; firstName: string; lastName: string }) {
    const tokenHash = hashToken(input.token)
    const available = await db.teamInvitation.findFirst({ where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() }, createdBy: { role: 'owner' } } })
    if (!available) throw new ValidationError('El enlace es inválido, ya fue usado o venció')
    const passwordHash = await bcrypt.hash(input.password, 12)
    try { await db.$transaction(async (tx) => {
      // El consumo y el alta son atómicos: dos solicitudes no pueden usar el mismo enlace.
      const consumed = await tx.teamInvitation.updateMany({
        where: { id: available.id, tokenHash, usedAt: null, expiresAt: { gt: new Date() }, createdBy: { role: 'owner' } },
        data: { usedAt: new Date() },
      })
      if (consumed.count !== 1) throw new ValidationError('El enlace es inválido, ya fue usado o venció')
      const invitation = await tx.teamInvitation.findUniqueOrThrow({ where: { id: available.id }, include: { createdBy: true } })
      const email = normalizeAuthEmail(input.email)
      if (await tx.user.findUnique({ where: { email } })) throw new ConflictError('El correo ya tiene una cuenta. Solicitá al propietario que te agregue desde Equipo.')
      await tx.user.create({ data: {
        email, passwordHash, firstName: input.firstName, lastName: input.lastName,
        workspaces: { create: { workspaceId: invitation.createdBy.workspaceId, role: invitation.role } },
      } })
    }) } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictError('El correo ya tiene una cuenta')
      throw error
    }
    return { message: 'Cuenta creada. Ya podés iniciar sesión.' }
  }

  async changePassword(ctx: WorkspaceContext, memberId: string, password: string) {
    if (ctx.role !== 'owner') throw new ForbiddenError('Solo el propietario puede cambiar contraseñas')
    const passwordHash = await bcrypt.hash(password, 12)
    await db.$transaction(async (tx) => {
      const member = await tx.workspaceUser.findFirst({ where: { id: memberId, workspaceId: ctx.workspaceId } })
      if (!member) throw new NotFoundError('Integrante')
      if (member.role === 'owner' && member.userId !== ctx.userId) throw new ForbiddenError('No se puede cambiar la contraseña de otro propietario')
      // Una cuenta global con acceso a otros espacios no puede ser tomada por un owner local.
      const otherAccess = await tx.workspaceUser.count({ where: { userId: member.userId, workspaceId: { not: ctx.workspaceId } } })
      if (otherAccess && member.userId !== ctx.userId) throw new ForbiddenError('La cuenta pertenece a otros espacios; debe usar recuperación de contraseña')
      await tx.user.update({ where: { id: member.userId }, data: { passwordHash, resetToken: null, resetTokenExpiry: null, sessionVersion: { increment: 1 } } })
    })
  }
}
