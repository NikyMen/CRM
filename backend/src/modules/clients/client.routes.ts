import multipart from '@fastify/multipart'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../core/auth/auth.service'
import { requireRole } from '../../core/auth/require-role'
import { ValidationError, type WorkspaceContext } from '../../types'
import type { EventBus } from '../../core/event-bus'
import { config } from '../../core/config'
import { parseClientSpreadsheet } from './client-import'
import { ClientService, type ClientInput } from './client.service'
import { ClientDocumentService } from './client-document.service'
import { db } from '../../core/database'
import { ensureClientAccess } from './client-access'

const nullableText = (max: number) => z.preprocess(
  (value) => value === '' ? null : value,
  z.string().trim().max(max).nullable().optional()
)

const assignmentSchema = z.object({
  userId: z.string().min(1),
  area: z.string().trim().min(1).max(80).optional(),
})

const clientSchema = z.object({
  name: z.string().trim().min(1).max(180),
  personType: z.enum(['INDIVIDUAL', 'LEGAL_ENTITY']).default('LEGAL_ENTITY'),
  ruc: nullableText(32),
  dv: nullableText(2),
  legalName: nullableText(180),
  tradeName: nullableText(180),
  email: z.preprocess((value) => value === '' ? null : value, z.string().email().max(254).nullable().optional()),
  phone: nullableText(50),
  website: z.preprocess((value) => value === '' ? null : value, z.string().url().max(500).nullable().optional()),
  activity: nullableText(250),
  taxObligations: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
  address: nullableText(500),
  city: nullableText(120),
  department: nullableText(120),
  contactName: nullableText(180),
  contactPhone: nullableText(50),
  referenceNotes: nullableText(5000),
  country: z.string().trim().min(1).max(80).default('Paraguay'),
  status: z.enum(['PROSPECT', 'ACTIVE', 'INACTIVE', 'SUSPENDED']).default('ACTIVE'),
  ownerId: z.string().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
  customData: z.record(z.unknown()).default({}),
  assignments: z.array(assignmentSchema).max(100).optional(),
})

const filtersSchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(['PROSPECT', 'ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
  ownerId: z.string().optional(),
  hasDebt: z.preprocess((value) => value === 'true' ? true : value === 'false' ? false : value, z.boolean().optional()),
  page: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
})

const importQuerySchema = z.object({
  commit: z.preprocess((value) => value === 'true' || value === '1', z.boolean()).default(false),
})

export async function clientRoutes(app: FastifyInstance, options: { eventBus?: EventBus }) {
  const service = new ClientService(options.eventBus)
  const documents = new ClientDocumentService()

  await app.register(multipart, {
    limits: { files: 1, fileSize: config.UPLOAD_MAX_BYTES, fields: 5 },
  })

  app.addHook('onRequest', async (req) => authenticate(req))

  app.get('/', async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    return reply.send(await service.list(ctx, filtersSchema.parse(req.query)))
  })

  app.post('/', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const input = clientSchema.parse(req.body) as ClientInput
    return reply.status(201).send(await service.create(ctx, input))
  })

  app.post('/import', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { commit } = importQuerySchema.parse(req.query)
    const file = await req.file()
    if (!file) throw new ValidationError('Adjuntá un archivo .xlsx o .csv')
    if (!/\.(xlsx|csv)$/i.test(file.filename)) throw new ValidationError('Solo se admiten archivos .xlsx o .csv')
    const rows = await parseClientSpreadsheet(await file.toBuffer(), file.filename)
    if (rows.length === 0) throw new ValidationError('El archivo no contiene filas de clientes')
    return reply.send(await service.importRows(ctx, rows, commit))
  })

  app.get('/:id/summary', async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { id } = req.params as { id: string }
    return reply.send(await service.summary(ctx, id))
  })

  app.get('/:id/documents', async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { id } = req.params as { id: string }
    return reply.send(await documents.list(ctx, id))
  })

  app.get('/:id/contacts', async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { id } = req.params as { id: string }
    await ensureClientAccess(ctx, id)
    return reply.send(await db.contact.findMany({
      where: { workspaceId: ctx.workspaceId, companyId: id, isArchived: false },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    }))
  })

  app.get('/:id/notes', async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { id } = req.params as { id: string }
    await ensureClientAccess(ctx, id)
    const notes = await db.note.findMany({
      where: { workspaceId: ctx.workspaceId, entityType: 'client', entityId: id },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send(notes.map((note) => ({ ...note, clientId: id, author: note.user })))
  })

  app.post('/:id/notes', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { id } = req.params as { id: string }
    await ensureClientAccess(ctx, id, 'write')
    const { content } = z.object({ content: z.string().trim().min(1).max(10_000) }).parse(req.body)
    const note = await db.note.create({
      data: {
        workspaceId: ctx.workspaceId,
        entityType: 'client',
        entityId: id,
        userId: ctx.userId,
        content,
      },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    })
    return reply.status(201).send({ ...note, clientId: id, author: note.user })
  })

  app.get('/:id/account', async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { id } = req.params as { id: string }
    const summary = await service.summary(ctx, id)
    return reply.send(summary.account)
  })

  app.post('/:id/documents', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { id } = req.params as { id: string }
    const file = await req.file()
    if (!file) throw new ValidationError('Adjuntá un documento')
    const buffer = await file.toBuffer()
    const categoryField = file.fields.category
    const category = categoryField && !Array.isArray(categoryField) && categoryField.type === 'field'
      ? String(categoryField.value).trim().slice(0, 80) || undefined
      : undefined
    const document = await documents.upload(ctx, id, {
      filename: file.filename,
      mimetype: file.mimetype,
      buffer,
    }, category)
    return reply.status(201).send(document)
  })

  app.get('/:id/documents/:documentId/download', async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { id, documentId } = req.params as { id: string; documentId: string }
    const { document, stream } = await documents.download(ctx, id, documentId)
    const safeName = document.name.replace(/[\r\n"]/g, '_')
    reply.header('Content-Disposition', `attachment; filename="${safeName}"`)
    reply.type(document.mimeType || 'application/octet-stream')
    return reply.send(stream)
  })

  app.delete('/:id/documents/:documentId', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { id, documentId } = req.params as { id: string; documentId: string }
    await documents.remove(ctx, id, documentId)
    return reply.status(204).send()
  })

  app.get('/:id', async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { id } = req.params as { id: string }
    return reply.send(await service.findById(ctx, id))
  })

  app.patch('/:id', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { id } = req.params as { id: string }
    const input = clientSchema.partial().parse(req.body) as Partial<ClientInput>
    return reply.send(await service.update(ctx, id, input))
  })

  app.post('/:id/claim', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { id } = req.params as { id: string }
    return reply.send(await service.claim(ctx, id))
  })

  app.post('/:id/release', { preHandler: requireRole('owner', 'admin', 'member') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { id } = req.params as { id: string }
    return reply.send(await service.release(ctx, id))
  })

  app.delete('/:id', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { id } = req.params as { id: string }
    await service.archive(ctx, id)
    return reply.status(204).send()
  })
}
