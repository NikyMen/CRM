import type { FastifyInstance } from 'fastify'
import { db } from '../../core/database'
import { z } from 'zod'
import { AuthService } from '../../core/auth/auth.service'
import { requireRole } from '../../core/auth/require-role'
import { INVITABLE_ROLES } from '../../core/auth/roles'
import { authenticate } from '../../core/auth/auth.service'
import { NotFoundError, ForbiddenError } from '../../types'

const authService = new AuthService()

export async function authRoutes(app: FastifyInstance) {

  // ─── POST /auth/register ───────────────────────────────────────
  // Crea usuario + workspace + pipeline por defecto
  app.post('/register', {
    config: {
      rateLimit: {
        max: 3,                 // 3 registros...
        timeWindow: '60 minutes'  // ...cada hora por IP, para evitar spamming de base de datos
      }
    }
  }, async (req, reply) => {
    const schema = z.object({
      email:         z.string().email(),
      password:      z.string().min(8),
      firstName:     z.string().min(1),
      lastName:      z.string().optional(),
      workspaceName: z.string().min(2).max(100),
    })

    const body = schema.parse(req.body) as Parameters<typeof authService.register>[0]
    const { user, workspace } = await authService.register(body)

    // Generar JWT con los datos del usuario y workspace
    const token = app.jwt.sign({
      sub:         user.id,
      userId:      user.id,
      workspaceId: workspace.id,
      role:        'owner',
      type:        'access',
    }, { expiresIn: '7d' })

    return reply.status(201).send({
      user: {
        id:        user.id,
        email:     user.email,
        firstName: user.firstName,
        lastName:  user.lastName,
        avatar:    user.avatar,
      },
      workspace: {
        id:   workspace.id,
        name: workspace.name,
        slug: workspace.slug,
      },
      role:        'owner',
      branchId:    null,
      regionId:    null,
      accessToken: token,
    })
  })

  // ─── POST /auth/login ──────────────────────────────────────────
  app.post('/login', {
    config: {
      rateLimit: {
        max: 5,               // Solo 5 intentos de login...
        timeWindow: '5 minutes' // ...cada 5 minutos por IP
      }
    }
  }, async (req, reply) => {
    const schema = z.object({
      email:    z.string().email(),
      password: z.string(),
    })

    const body = schema.parse(req.body)
    const result = await authService.login(body.email, body.password)

    const token = app.jwt.sign({
      sub:         result.user.id,
      userId:      result.user.id,
      workspaceId: result.workspace.id,
      role:        result.role,
      type:        'access',
    }, { expiresIn: '7d' })

    return reply.send({
      user:        result.user,
      workspace:   result.workspace,
      role:        result.role,
      branchId:    result.branchId,
      regionId:    result.regionId,
      accessToken: token,
    })
  })

  // ─── GET /auth/me ──────────────────────────────────────────────
  // Verificar token y obtener datos del usuario actual
  app.get('/me', {
    preHandler: [authenticate]
  }, async (req, reply) => {
    const ctx = req.user as any
    const user = await db.user.findUnique({
      where: { id: ctx.userId },
      select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
    })

    return reply.send({
      userId:      ctx.userId,
      workspaceId: ctx.workspaceId,
      role:        ctx.role,
      branchId:    ctx.branchId,
      regionId:    ctx.regionId,
      user,
    })
  })

  app.patch('/me/avatar', async (req, reply) => {
    await req.jwtVerify()
    const ctx = req.user as { sub: string; userId?: string }

    const { avatar } = z.object({
      avatar: z.string().trim().max(500_000).nullable(),
    }).parse(req.body)

    if (
      avatar &&
      !['preset:emerald', 'preset:blue', 'preset:amber', 'preset:rose', 'preset:slate'].includes(avatar) &&
      !avatar.startsWith('data:image/') &&
      !/^https?:\/\//i.test(avatar)
    ) {
      return reply.status(422).send({
        error: 'VALIDATION_ERROR',
        message: 'Avatar invalido',
      })
    }

    const user = await db.user.update({
      where: { id: ctx.userId ?? ctx.sub },
      data: { avatar },
      select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
    })

    return reply.send({ user })
  })

  // ─── POST /auth/api-keys ───────────────────────────────────────
  // Crear una API Key para conectar n8n
  app.post('/api-keys', async (req, reply) => {
    await req.jwtVerify()
    const ctx = req.user as { workspaceId: string }

    const { name } = z.object({
      name: z.string().min(1).max(100)
    }).parse(req.body)

    const { apiKey, rawKey } = await authService.createApiKey(
      ctx.workspaceId,
      name
    )

    return reply.status(201).send({
      id:        apiKey.id,
      name:      apiKey.name,
      prefix:    apiKey.keyPrefix,
      rawKey,    // ⚠️ Solo se muestra una vez — igual que GitHub tokens
      createdAt: apiKey.createdAt,
    })
  })

  // ─── GET /auth/api-keys ────────────────────────────────────────
  // Listar API Keys del workspace (sin mostrar las claves)
  app.get('/api-keys', async (req, reply) => {
    await req.jwtVerify()
    const ctx = req.user as { workspaceId: string }

    const keys = await db.apiKey.findMany({
      where: { workspaceId: ctx.workspaceId, isActive: true },
      orderBy: { createdAt: 'desc' },
    })

    return reply.send(
      keys.map(({ keyHash: _h, ...k }: any) => k)
    )
  })

  app.delete('/api-keys/:id', async (req, reply) => {
    await req.jwtVerify()
    const ctx = req.user as { workspaceId: string; userId: string }
    const { id } = req.params as { id: string }

    await db.apiKey.deleteMany({
      where: { id, workspaceId: ctx.workspaceId },
    })

    return reply.code(204).send()
  })

  // ─── POST /auth/invite ─────────────────────────────────────────
  // Invita a un usuario al workspace con un rol específico.
  // Solo owner y regional_manager pueden invitar.
  app.post('/invite', {
    preHandler: [authenticate, requireRole('owner', 'regional_manager')],
  }, async (req, reply) => {
    const ctx = req.user as any

    const schema = z.object({
      email:     z.string().email(),
      firstName: z.string().min(1),
      lastName:  z.string().optional(),
      password:  z.string().min(8),
      role: z.enum(['regional_manager', 'branch_manager', 'vendor']).refine(
        (r) => ctx.role === 'owner' || r !== 'regional_manager',
        { message: 'Solo el owner puede invitar regional managers' }
      ),
    })

    const body = schema.parse(req.body) as any
    const result = await authService.inviteUser({
      workspaceId: ctx.workspaceId,
      ...body,
    })

    return reply.status(201).send(result)
  })

  // ─── GET /auth/team ─────────────────────────────────────────────
  // Lista todos los miembros del workspace
  app.get('/team', {
    preHandler: [authenticate, requireRole('owner', 'regional_manager', 'branch_manager', 'vendor')],
  }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string; role: string; branchId?: string | null; regionId?: string | null }
    const members = await authService.listMembers(ctx.workspaceId)

    if (ctx.role === 'vendor') {
      // Filtrar: compañeros de sucursal + gerente regional de su región
      const filtered = members.filter((m) => {
        const isTeammate = m.branchId && m.branchId === ctx.branchId
        const isMyRegionalManager = m.role === 'regional_manager' && m.regionId && m.regionId === ctx.regionId
        return isTeammate || isMyRegionalManager
      })
      return reply.send(filtered)
    }

    return reply.send(members)
  })

  // Cambia el rol y opcionalmente sucursal/región de un miembro
  app.patch('/team/:id/role', {
    preHandler: [authenticate, requireRole('owner', 'branch_manager')],
  }, async (req, reply) => {
    const ctx = req.user as any
    const { id } = req.params as { id: string }
    
    // El body puede recibir role, branchId y regionId
    const { role, branchId, regionId } = z.object({
      role: z.enum(['regional_manager', 'branch_manager', 'vendor']).optional(),
      branchId: z.string().nullable().optional(),
      regionId: z.string().nullable().optional(),
    }).parse(req.body)

    const targetUser = await db.workspaceUser.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
    })
    if (!targetUser) throw new NotFoundError('WorkspaceMember', id)
    if (targetUser.role === 'owner') {
      throw new ForbiddenError('No se puede modificar la asignación del owner')
    }

    if (ctx.role === 'branch_manager') {
      if (!ctx.branchId) {
        throw new ForbiddenError('No tienes sucursal asignada')
      }
      if (branchId !== undefined && branchId !== ctx.branchId) {
        throw new ForbiddenError('Solo puedes asignar usuarios a tu propia sucursal')
      }
      if (targetUser.branchId && targetUser.branchId !== ctx.branchId) {
        throw new ForbiddenError('No puedes modificar usuarios de otras sucursales')
      }
      if (role && ['owner', 'regional_manager'].includes(role)) {
        throw new ForbiddenError('No tienes permisos para asignar este rol')
      }
      if (regionId !== undefined) {
        throw new ForbiddenError('Solo el owner puede asignar regiones directamente')
      }
    }

    // Si se pasa regionId directamente, validar que exista
    if (regionId) {
      const regionExists = await db.region.findFirst({
        where: { id: regionId, workspaceId: ctx.workspaceId },
      })
      if (!regionExists) throw new NotFoundError('Region', regionId)
    }

    // Resolve regionId automatically if branchId is supplied
    let resolvedRegionId = regionId
    if (branchId) {
      const branch = await db.branch.findFirst({
        where: { id: branchId, workspaceId: ctx.workspaceId },
      })
      if (!branch) throw new NotFoundError('Branch', branchId)
      resolvedRegionId = branch.regionId
    } else if (branchId === null) {
      // Si se remueve la sucursal, también se remueve la región de manera implícita, a menos que se asigne otra
      if (regionId === undefined) {
        resolvedRegionId = null
      }
    }

    const updated = await db.workspaceUser.update({
      where: { id },
      data: {
        ...(role !== undefined && { role }),
        ...(branchId !== undefined && { branchId }),
        ...(resolvedRegionId !== undefined && { regionId: resolvedRegionId }),
      },
    })

    return reply.send(updated)
  })

  // Solo el owner puede eliminar miembros
  app.delete('/team/:id', {
    preHandler: [authenticate, requireRole('owner')],
  }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const { id } = req.params as { id: string }
    await authService.removeMember(ctx.workspaceId, id)
    return reply.code(204).send()
  })

  // ─── POST /auth/forgot-password ───────────────────────────────
  // Genera token y llama a n8n para enviar el email
  app.post('/forgot-password', {
    config: {
      rateLimit: {
        max:        3,
        timeWindow: '15 minutes',
      },
    },
  }, async (req, reply) => {
    const { email } = z.object({
      email: z.string().email(),
    }).parse(req.body)

    const user = await db.user.findUnique({ where: { email } })

    // Siempre responder igual — no revelar si el email existe
    if (!user) {
      return reply.send({ message: 'Si el email existe, recibirás un link de recuperación.' })
    }

    // Generar token seguro
    const crypto      = await import('crypto')
    const resetToken  = crypto.randomBytes(32).toString('hex')
    const expiry      = new Date(Date.now() + 1000 * 60 * 60) // 1 hora

    await db.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpiry: expiry,
      },
    })

    // Llamar a n8n vía webhook
    const n8nWebhookUrl = process.env.N8N_RESET_WEBHOOK_URL
    if (n8nWebhookUrl) {
      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`
      await fetch(n8nWebhookUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          email,
          firstName: user.firstName,
          resetUrl,
        }),
      }).catch(() => {}) // No fallar si n8n no está disponible
    }

    return reply.send({ message: 'Si el email existe, recibirás un link de recuperación.' })
  })

  // ─── POST /auth/reset-password ────────────────────────────────
  // Verifica el token y actualiza la contraseña
  app.post('/reset-password', {
    config: {
      rateLimit: {
        max:        5,
        timeWindow: '15 minutes',
      },
    },
  }, async (req, reply) => {
    const { token, password } = z.object({
      token:    z.string().min(1),
      password: z.string().min(8),
    }).parse(req.body)

    const user = await db.user.findFirst({
      where: {
        resetToken:       token,
        resetTokenExpiry: { gt: new Date() }, // Token no expirado
      },
    })

    if (!user) {
      return reply.status(400).send({
        error:   'INVALID_TOKEN',
        message: 'El link de recuperación es inválido o expiró.',
      })
    }

    const bcrypt      = await import('bcryptjs')
    const passwordHash = await bcrypt.hash(password, 12)

    await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken:       null,
        resetTokenExpiry: null,
      },
    })

    return reply.send({ message: 'Contraseña actualizada correctamente.' })
  })
}
