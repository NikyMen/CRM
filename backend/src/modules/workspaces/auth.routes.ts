import type { FastifyInstance } from 'fastify'
import { db } from '../../core/database'
import { z } from 'zod'
import { AuthService, authenticate, normalizeAuthEmail } from '../../core/auth/auth.service'
import { requireRole } from '../../core/auth/require-role'
import { INVITABLE_ROLES } from '../../core/auth/roles'
import { config } from '../../core/config'
import { Prisma } from '@prisma/client'
import {
  MODULE_DEFINITIONS,
  mergeModuleState,
  readModuleState,
  writeModuleState,
} from '../../core/modules/registry'
import { invalidateModuleCache } from '../../core/modules/require-module'

const authService = new AuthService()
const authEmailSchema = z.string().transform(normalizeAuthEmail).pipe(z.string().email())

export async function authRoutes(app: FastifyInstance) {

  app.get('/workspace-settings', { preHandler: authenticate }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string; role: string }
    const workspace = await db.workspace.findUnique({
      where: { id: ctx.workspaceId },
      select: { settings: true },
    })
    const modules = readModuleState(workspace?.settings)
    return reply.send({
      modules,
      definitions: MODULE_DEFINITIONS,
      stockVisible: modules.stock,
    })
  })

  app.patch('/workspace-settings', {
    preHandler: [authenticate, requireRole('owner', 'admin')],
  }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const body = z.object({
      stockVisible: z.boolean().optional(),
      modules: z.record(z.string(), z.boolean()).optional(),
    }).parse(req.body)

    const workspace = await db.workspace.findUnique({
      where: { id: ctx.workspaceId },
      select: { settings: true },
    })
    const patch: Record<string, boolean> = { ...(body.modules ?? {}) }
    if (typeof body.stockVisible === 'boolean' && patch.stock === undefined) {
      patch.stock = body.stockVisible
    }

    const modules = mergeModuleState(readModuleState(workspace?.settings), patch)
    await db.workspace.update({
      where: { id: ctx.workspaceId },
      data: { settings: writeModuleState(workspace?.settings, modules) as Prisma.InputJsonValue },
    })
    invalidateModuleCache(ctx.workspaceId)

    return reply.send({ modules, definitions: MODULE_DEFINITIONS, stockVisible: modules.stock })
  })

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
    if (!config.ALLOW_PUBLIC_REGISTRATION) {
      return reply.status(404).send({
        error: 'REGISTRATION_DISABLED',
        message: 'El alta de usuarios se realiza desde Equipo.',
      })
    }

    const schema = z.object({
      email:         authEmailSchema,
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
      email:    authEmailSchema,
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
      accessToken: token,
    })
  })

  // ─── GET /auth/me ──────────────────────────────────────────────
  // Verificar token y obtener datos del usuario actual
  app.get('/me', async (req, reply) => {
    await authenticate(req)
    const ctx = req.user as {
      sub: string
      workspaceId: string
      role: string
    }
    const user = await db.user.findUnique({
      where: { id: ctx.sub },
      select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
    })

    return reply.send({
      userId:      ctx.sub,
      workspaceId: ctx.workspaceId,
      role:        ctx.role,
      user,
    })
  })

  app.patch('/me/avatar', async (req, reply) => {
    await authenticate(req)
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
  app.post('/api-keys', {
    preHandler: [authenticate, requireRole('owner', 'admin')],
  }, async (req, reply) => {
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
  app.get('/api-keys', {
    preHandler: [authenticate, requireRole('owner', 'admin')],
  }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string }

    const keys = await db.apiKey.findMany({
      where: { workspaceId: ctx.workspaceId, isActive: true },
      orderBy: { createdAt: 'desc' },
    })

    return reply.send(
      keys.map(({ keyHash: _h, ...k }: any) => k)
    )
  })

  app.delete('/api-keys/:id', {
    preHandler: [authenticate, requireRole('owner', 'admin')],
  }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string; userId: string }
    const { id } = req.params as { id: string }

    await db.apiKey.deleteMany({
      where: { id, workspaceId: ctx.workspaceId },
    })

    return reply.code(204).send()
  })

  // ─── POST /auth/invite ─────────────────────────────────────────
  // Invita a un usuario al workspace con un rol específico.
  // Solo owner y admin pueden invitar.
  app.post('/invite', {
    preHandler: [authenticate, requireRole('owner', 'admin')],
  }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string; role: string }

    const schema = z.object({
      email:     authEmailSchema,
      firstName: z.string().min(1),
      lastName:  z.string().optional(),
      password:  z.string().min(8),
      // Admin solo puede invitar member/viewer, no otros admins
      role: z.enum(['admin', 'member', 'viewer']).refine(
        (r) => ctx.role === 'owner' || r !== 'admin',
        { message: 'Solo el owner puede invitar admins' }
      ),
    })

    const body = schema.parse(req.body) as Omit<Parameters<typeof authService.inviteUser>[0], 'workspaceId'>
    const result = await authService.inviteUser({
      workspaceId: ctx.workspaceId,
      ...body,
    })

    return reply.status(201).send(result)
  })

  // ─── GET /auth/team ─────────────────────────────────────────────
  // Lista todos los miembros del workspace
  app.get('/team', {
    preHandler: [authenticate, requireRole('owner', 'admin')],
  }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string }
    const members = await authService.listMembers(ctx.workspaceId)
    return reply.send(members)
  })

  // Cambia el rol de un miembro (no se puede cambiar el del owner)
  app.patch('/team/:id/role', {
    preHandler: [authenticate, requireRole('owner', 'admin')],
  }, async (req, reply) => {
    const ctx = req.user as { workspaceId: string; role: string }
    const { id } = req.params as { id: string }
    const { role } = z.object({
      role: z.enum(['admin', 'member', 'viewer']),
    }).parse(req.body)

    const updated = await authService.updateMemberRole(ctx.workspaceId, id, role, ctx.role)
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
      email: authEmailSchema,
    }).parse(req.body)

    const user = await db.user.findUnique({ where: { email } })

    // Siempre responder igual — no revelar si el email existe
    if (!user) {
      return reply.send({ message: 'Si el email existe, recibirás un link de recuperación.' })
    }

    if (!config.N8N_RESET_WEBHOOK_URL) {
      req.log.error('N8N_RESET_WEBHOOK_URL no está configurada; no se emitió token de recuperación')
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
    const resetUrl = `${config.FRONTEND_URL.replace(/\/$/, '')}/reset-password?token=${resetToken}`
    try {
      const response = await fetch(config.N8N_RESET_WEBHOOK_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          email,
          firstName: user.firstName,
          resetUrl,
        }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error(`Webhook respondió ${response.status}`)
    } catch (error) {
      await db.user.updateMany({
        where: { id: user.id, resetToken },
        data: { resetToken: null, resetTokenExpiry: null },
      })
      req.log.error({ err: error }, 'No se pudo entregar la recuperación de contraseña')
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
