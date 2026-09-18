import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { db } from '../database'
import { config } from '../config'
import {
  UnauthorizedError,
  ConflictError,
  NotFoundError,
  ForbiddenError,
} from '../../types'
import { Prisma } from '@prisma/client'
import type { Role } from './roles'

export const normalizeAuthEmail = (email: string): string => email.trim().toLowerCase()


export class AuthService {

  // ─── Registro ────────────────────────────────────────────────────
  async register(data: {
    email: string
    password: string
    firstName: string
    lastName?: string
    workspaceName: string
  }) {
    const email = normalizeAuthEmail(data.email)

    // 1. Verificar que el email no esté registrado
    const existing = await db.user.findUnique({
      where: { email }
    })
    if (existing) {
      throw new ConflictError('El email ya está registrado')
    }

    // 2. Hashear la contraseña
    // El número 12 es el "cost factor" — cuánto trabajo le cuesta
    // al servidor calcular el hash. Más alto = más seguro pero más lento.
    // 12 es el balance recomendado para producción.
    const passwordHash = await bcrypt.hash(data.password, 12)

    // 3. Generar slug único para el workspace.
    // El sufijo aleatorio (4 bytes = 8 hex chars) elimina la necesidad de
    // pre-verificar disponibilidad con un SELECT separado, evitando la
    // race condition que ocurría cuando dos usuarios se registraban
    // simultáneamente con el mismo workspaceName.
    const baseSlug = this.generateSlug(data.workspaceName)
    const uniqueSuffix = crypto.randomBytes(4).toString('hex') // ej: "a3f8b2c1"
    const finalSlug = `${baseSlug}-${uniqueSuffix}`

    // 4. Crear usuario + workspace en una transacción
    // Si algo falla en el medio, ninguno de los dos se crea.
    // Nunca querés un usuario sin workspace o un workspace sin owner.
    let result: { user: Awaited<ReturnType<typeof db.user.create>>; workspace: Awaited<ReturnType<typeof db.workspace.create>> }
    try {
      result = await db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            passwordHash,
            firstName: data.firstName,
            lastName: data.lastName,
          },
        })

        const workspace = await tx.workspace.create({
          data: {
            name: data.workspaceName,
            slug: finalSlug,
            users: {
              create: {
                userId: user.id,
                role: 'owner',
              },
            },
          },
        })

        // 5. Crear pipeline por defecto con sus etapas
        // Todo workspace nuevo arranca con un pipeline listo para usar
        await tx.pipeline.create({
          data: {
            workspaceId: workspace.id,
            name: 'Sales Pipeline',
            isDefault: true,
            stages: {
              create: [
                { name: 'Nuevo Lead',  position: 0, color: '#94a3b8', probability: 10  },
                { name: 'Contactado',  position: 1, color: '#60a5fa', probability: 25  },
                { name: 'Calificado',  position: 2, color: '#818cf8', probability: 50  },
                { name: 'Propuesta',   position: 3, color: '#f59e0b', probability: 75  },
                { name: 'Ganado',      position: 4, color: '#22c55e', probability: 100, isWon: true  },
                { name: 'Perdido',     position: 5, color: '#ef4444', probability: 0,   isLost: true },
              ],
            },
          },
        })

        return { user, workspace }
      })
    } catch (err) {
      // P2002 = unique constraint violation de Prisma.
      // Aunque el slug ya lleva sufijo aleatorio, capturamos igualmente
      // para manejar cualquier otro campo único que pueda colisionar.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('No se pudo crear el workspace. Intentá nuevamente.')
      }
      throw err
    }

    return result
  }

  // ─── Login ───────────────────────────────────────────────────────
  async login(email: string, password: string) {
    const normalizedEmail = normalizeAuthEmail(email)

    // 1. Buscar el usuario
    const user = await db.user.findUnique({ where: { email: normalizedEmail } })
    if (!user) {
      // Importante: no decir "usuario no encontrado" para no
      // revelar qué emails están registrados
      throw new UnauthorizedError('Credenciales inválidas')
    }

    // 2. Verificar la contraseña contra el hash
    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      throw new UnauthorizedError('Credenciales inválidas')
    }

    // 3. Obtener el workspace del usuario
    const workspaceUser = await db.workspaceUser.findFirst({
      where: { userId: user.id },
      include: { workspace: true },
      orderBy: { createdAt: 'asc' },
    })

    if (!workspaceUser) {
      throw new ForbiddenError('El usuario no pertenece a ningún workspace')
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
      },
      workspace: {
        id: workspaceUser.workspace.id,
        name: workspaceUser.workspace.name,
        slug: workspaceUser.workspace.slug,
      },
      role: workspaceUser.role,
      sessionVersion: user.sessionVersion,
    }
  }

  // ─── API Keys ─────────────────────────────────────────────────────
  async createApiKey(workspaceId: string, name: string) {
    // 1. Generar una clave aleatoria de 32 bytes en hexadecimal
    // Ejemplo: "crm_a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0"
    const raw = `${config.API_KEY_PREFIX}_${crypto.randomBytes(32).toString('hex')}`

    // 2. Guardar solo los primeros caracteres para identificarla en la UI
    // El usuario verá "crm_a3f8b2c1" pero no la clave completa
    const keyPrefix = raw.substring(0, 12)

    // 3. Hashear la clave — lo que se guarda en la DB
    const keyHash = crypto
      .createHash('sha256')
      .update(raw)
      .digest('hex')

    const apiKey = await db.apiKey.create({
      data: {
        workspaceId,
        name,
        keyHash,
        keyPrefix,
      },
    })

    // Retornamos el raw UNA SOLA VEZ
    // Después de esto es imposible recuperarla — igual que GitHub tokens
    return { apiKey, rawKey: raw }
  }

  async verifyApiKey(rawKey: string): Promise<{ workspaceId: string } | null> {
    // Hashear la clave recibida y buscar si existe ese hash
    const keyHash = crypto
      .createHash('sha256')
      .update(rawKey)
      .digest('hex')

    const apiKey = await db.apiKey.findUnique({ where: { keyHash } })

    if (!apiKey || !apiKey.isActive) return null
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null

    // Actualizar lastUsedAt sin bloquear la respuesta
    db.apiKey
      .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {})

    return { workspaceId: apiKey.workspaceId }
  }

  // ─── Invitar usuario ──────────────────────────────────────────────
  // Agrega un usuario existente (o crea uno nuevo) al workspace con el
  // rol indicado. Solo owner y admin pueden invocar este método —
  // la verificación de rol se hace en la ruta antes de llegar aquí.
  async inviteUser(data: {
    workspaceId: string
    email:       string
    firstName:   string
    lastName?:   string
    role:        Role
    password:    string
  }) {
    const email = normalizeAuthEmail(data.email)

    // Verificar si el email ya tiene cuenta global
    let user = await db.user.findUnique({ where: { email } })

    if (!user) {
      // Crear usuario nuevo
      const passwordHash = await bcrypt.hash(data.password, 12)
      user = await db.user.create({
        data: {
          email,
          passwordHash,
          firstName:    data.firstName,
          lastName:     data.lastName,
        },
      })
    }

    // Verificar que no sea ya miembro del workspace
    const existing = await db.workspaceUser.findUnique({
      where: { workspaceId_userId: { workspaceId: data.workspaceId, userId: user.id } },
    })
    if (existing) {
      throw new ConflictError('El usuario ya es miembro de este workspace')
    }

    // Asociar al workspace con el rol elegido
    await db.workspaceUser.create({
      data: {
        workspaceId: data.workspaceId,
        userId:      user.id,
        role:        data.role,
      },
    })

    return {
      user: {
        id:        user.id,
        email:     user.email,
        firstName: user.firstName,
        lastName:  user.lastName,
      },
      role: data.role,
    }
  }

  // ─── Listar miembros del workspace ────────────────────────────────
  async listMembers(workspaceId: string) {
    const members = await db.workspaceUser.findMany({
      where:   { workspaceId },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true, avatar: true, createdAt: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return members.map((m) => ({
      id:        m.id,
      role:      m.role,
      joinedAt:  m.createdAt,
      moduleAccess: m.moduleAccess,
      user:      m.user,
    }))
  }

  // ─── Cambiar rol de un miembro ────────────────────────────────────
  async updateMemberRole(workspaceId: string, memberId: string, newRole: Role, actorRole: string) {
    const member = await db.workspaceUser.findFirst({
      where: { id: memberId, workspaceId },
    })
    if (!member) throw new NotFoundError('WorkspaceMember', memberId)
    if (member.role === 'owner') {
      throw new ForbiddenError('No se puede cambiar el rol del owner')
    }
    if (actorRole !== 'owner' && (member.role === 'admin' || newRole === 'admin')) {
      throw new ForbiddenError('Solo el owner puede promover o modificar administradores')
    }

    return db.workspaceUser.update({
      where: { id: memberId },
      data:  { role: newRole },
    })
  }

  // ─── Remover miembro ──────────────────────────────────────────────
  async removeMember(workspaceId: string, memberId: string) {
    const member = await db.workspaceUser.findFirst({
      where: { id: memberId, workspaceId },
    })
    if (!member) throw new NotFoundError('WorkspaceMember', memberId)
    if (member.role === 'owner') {
      throw new ForbiddenError('No se puede eliminar al owner del workspace')
    }

    await db.$transaction([
      db.clientAssignment.deleteMany({
        where: { workspaceId, userId: member.userId },
      }),
      db.company.updateMany({
        where: { workspaceId, ownerId: member.userId },
        data: { ownerId: null },
      }),
      db.contact.updateMany({
        where: { workspaceId, ownerId: member.userId },
        data: { ownerId: null },
      }),
      db.deal.updateMany({
        where: { workspaceId, ownerId: member.userId, isArchived: false },
        data: { ownerId: null },
      }),
      db.whatsAppChat.updateMany({
        where: { workspaceId, assignedToUserId: member.userId },
        data: { assignedToUserId: null },
      }),
      db.ticket.updateMany({
        where: {
          workspaceId,
          assignedToUserId: member.userId,
          status: { in: ['NEW', 'OPEN', 'WAITING_CUSTOMER', 'RESOLVED'] },
        },
        data: { assignedToUserId: null },
      }),
      db.clientChecklist.updateMany({
        where: { workspaceId, assignedToUserId: member.userId },
        data: { assignedToUserId: null },
      }),
      db.workspaceUser.delete({ where: { id: memberId } }),
    ])
  }

  // ─── Helpers ──────────────────────────────────────────────────────
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')  // quitar caracteres especiales
      .replace(/\s+/g, '-')           // espacios → guiones
      .replace(/-+/g, '-')            // múltiples guiones → uno solo
      .substring(0, 50)               // máximo 50 caracteres
  }

  // ─── Hook de autenticación ────────────────────────────────────────
  // Las rutas de usuario aceptan exclusivamente JWT. Las API keys se
  // verifican de forma explícita dentro de `/inbound`, con alcance acotado.
  static async authenticate(req: any): Promise<void> {
    await req.jwtVerify()

    const token = req.user as {
      sub?: string
      userId?: string
      workspaceId?: string
      type?: string
      sessionVersion?: number
    }
    const userId = token.userId ?? token.sub
    if (!userId || !token.workspaceId || token.type !== 'access') {
      throw new UnauthorizedError('Sesión inválida')
    }

    const membership = await db.workspaceUser.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: token.workspaceId,
          userId,
        },
      },
      select: { role: true, user: { select: { sessionVersion: true } } },
    })
    if (!membership) throw new UnauthorizedError('La sesión ya no tiene acceso a este espacio')
    if ((token.sessionVersion ?? 0) !== membership.user.sessionVersion) throw new UnauthorizedError('La contraseña cambió. Iniciá sesión nuevamente.')

    req.user = {
      ...token,
      sub: userId,
      userId,
      workspaceId: token.workspaceId,
      role: membership.role,
      type: 'access',
    }
  }
}
// Re-exportacion para compatibilidad con los modulos de rutas que
// importan `authenticate` directamente: import { authenticate } from '...'
// Delega al metodo estatico de la clase para no duplicar logica.
export const authenticate = AuthService.authenticate.bind(AuthService)
