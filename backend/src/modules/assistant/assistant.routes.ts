import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AuthService, authenticate } from '../../core/auth/auth.service'
import { requireRole } from '../../core/auth/require-role'
import { UnauthorizedError, type WorkspaceContext } from '../../types'
import { isValidTime, isValidTimezone } from './assistant.logic'
import { AssistantService, type ServiceInput, type SettingsInput } from './assistant.service'

const time = z.string().refine(isValidTime, 'Usá el formato HH:MM, por ejemplo 08:30.')
const phoneList = z.array(z.string().trim().max(40)).max(200)

const settingsSchema = z.object({
  enabled: z.boolean(),
  testOnlyPhones: phoneList,
  excludedPhones: phoneList,
  notifyTo: z.string().trim().max(40).nullable(),
  pauseHours: z.number().int().min(1).max(168),
  waitSeconds: z.number().int().min(2).max(60),
  maxAudioSeconds: z.number().int().min(10).max(600),
  maxRepliesPerHour: z.number().int().min(1).max(100),
  timezone: z.string().trim().refine(isValidTimezone, 'La zona horaria no es válida.'),
  officeDays: z.array(z.number().int().min(1).max(7)).max(7),
  officeFrom: time,
  officeTo: time,
  followUpEnabled: z.boolean(),
  followUpHours: z.number().int().min(1).max(72),
  followUpFrom: time,
  followUpTo: time,
  followUpMessage: z.string().trim().max(1000),
  fallbackMessage: z.string().trim().max(1000),
  extraInstructions: z.string().trim().max(4000),
  handoffTopics: z.array(z.string().max(200)).max(40),
  crmSyncEnabled: z.boolean(),
}).strict()

const serviceSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(300),
  body: z.string().trim().min(1).max(3500),
  amount: z.string().trim().regex(/^\d{1,15}$/, 'El precio va en guaraníes, sólo números y sin decimales.').nullable(),
  active: z.boolean(),
}).strict()

const createServiceSchema = serviceSchema.extend({
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'El código usa letras mayúsculas, números y guion bajo (por ejemplo EAS_COSTO).'),
}).strict()

const authService = new AuthService()

/**
 * Panel del asistente comercial (módulo oculto `/asistente`): sólo owner y admin.
 * No depende de un módulo del registro, así no aparece en Configuración ni en el menú.
 */
export async function assistantRoutes(app: FastifyInstance) {
  const service = new AssistantService()
  app.addHook('onRequest', async (req) => authenticate(req))
  app.addHook('preHandler', requireRole('owner', 'admin'))

  app.get('/settings', async (req, reply) => reply.send(await service.getSettings(req.user as WorkspaceContext)))

  app.put('/settings', async (req, reply) => {
    const input = settingsSchema.parse(req.body) as SettingsInput
    return reply.send(await service.updateSettings(req.user as WorkspaceContext, input))
  })

  app.get('/services', async (req, reply) => reply.send(await service.listServices(req.user as WorkspaceContext)))

  app.post('/services', async (req, reply) => {
    const { code, ...input } = createServiceSchema.parse(req.body)
    return reply.status(201).send(await service.createService(req.user as WorkspaceContext, code, input as ServiceInput))
  })

  app.put<{ Params: { id: string } }>('/services/:id', async (req, reply) => {
    const input = serviceSchema.parse(req.body) as ServiceInput
    return reply.send(await service.updateService(req.user as WorkspaceContext, req.params.id, input))
  })

  app.delete<{ Params: { id: string } }>('/services/:id', async (req, reply) => {
    await service.removeService(req.user as WorkspaceContext, req.params.id)
    return reply.status(204).send()
  })

  app.put('/services-order', async (req, reply) => {
    const { ids } = z.object({ ids: z.array(z.string().min(1)).min(1).max(200) }).parse(req.body)
    return reply.send(await service.reorderServices(req.user as WorkspaceContext, ids))
  })

  app.post('/services/restore-defaults', async (req, reply) => reply.send(await service.restoreDefaults(req.user as WorkspaceContext)))

  app.get('/insights', async (req, reply) => {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(90).default(14) }).parse(req.query)
    return reply.send(await service.insights(req.user as WorkspaceContext, days))
  })

  /** Vista previa exacta de lo que lee n8n. */
  app.get('/flow-config', async (req, reply) => reply.send(await service.flowConfig((req.user as WorkspaceContext).workspaceId)))
}

/** Lectura de la configuración desde n8n con X-API-Key (mismo esquema que `/inbound/*`). */
export async function assistantInboundRoutes(app: FastifyInstance) {
  const service = new AssistantService()

  app.get('/config', async (req, reply) => {
    const key = req.headers['x-api-key'] as string | undefined
    if (!key) throw new UnauthorizedError('Falta el header X-API-Key')
    const result = await authService.verifyApiKey(key)
    if (!result) throw new UnauthorizedError('API Key inválida o expirada')
    reply.header('cache-control', 'no-store')
    return reply.send(await service.flowConfig(result.workspaceId))
  })
}

