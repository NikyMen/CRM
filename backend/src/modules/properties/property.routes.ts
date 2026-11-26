import { randomInt } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { authenticate } from '../../core/auth/auth.service'
import { requireRole } from '../../core/auth/require-role'
import { db } from '../../core/database'
import { requireModule } from '../../core/modules/require-module'
import { AppError, NotFoundError, type WorkspaceContext } from '../../types'
import { decodeOutboundFile, outboundFileSchema } from '../whatsapp/whatsapp.outbound-file'
import { assertAssignAllowed, assertAssignableMember, isAssignmentManager } from '../social/chat-assignment'

const IMAGE_MAX_BYTES = 8 * 1024 * 1024
const operationSchema = z.enum(['sale', 'rent'])
const typeSchema = z.enum(['house', 'apartment', 'land', 'commercial', 'country', 'other'])
const statusSchema = z.enum(['available', 'reserved', 'closed'])

const propertyInput = z.object({
  title: z.string().trim().min(3, 'Poné un título de al menos 3 letras.').max(120),
  operation: operationSchema,
  propertyType: typeSchema,
  status: statusSchema.default('available'),
  price: z.union([z.number().nonnegative().max(1e12), z.null()]).optional(),
  currency: z.enum(['USD', 'ARS']).default('USD'),
  address: z.string().trim().max(160).nullish(),
  city: z.string().trim().max(80).nullish(),
  neighborhood: z.string().trim().max(80).nullish(),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  bedrooms: z.number().int().min(0).max(50).nullish(),
  bathrooms: z.number().int().min(0).max(50).nullish(),
  areaM2: z.number().int().min(0).max(1_000_000).nullish(),
  description: z.string().trim().max(4000).default(''),
  assignedToUserId: z.string().min(1).nullish(),
  image: outboundFileSchema.optional(),
})

const select = {
  id: true, code: true, title: true, operation: true, propertyType: true, status: true, price: true, currency: true,
  address: true, city: true, neighborhood: true, latitude: true, longitude: true, bedrooms: true, bathrooms: true, areaM2: true,
  description: true, coverMimeType: true, assignedToUserId: true, createdAt: true, updatedAt: true,
  assignedTo: { select: { id: true, firstName: true, lastName: true, avatar: true } },
} satisfies Prisma.PropertySelect

type PropertyRow = Prisma.PropertyGetPayload<{ select: typeof select }>

function serialize(row: PropertyRow) {
  const { coverMimeType, price, ...rest } = row
  return { ...rest, price: price === null ? null : price.toString(), hasImage: Boolean(coverMimeType), imageVersion: row.updatedAt.getTime() }
}

/** La imagen se valida por contenido (JPG, PNG o WebP), no por la extensión. */
function readImage(file: z.infer<typeof outboundFileSchema>) {
  const decoded = decodeOutboundFile(file)
  const b = decoded.buffer
  if (b.length > IMAGE_MAX_BYTES) throw new AppError(422, 'La foto supera el límite de 8 MB.', 'VALIDATION_ERROR')
  const mime = b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg'
    : b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 ? 'image/png'
    : b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' ? 'image/webp'
    : null
  if (!mime) throw new AppError(422, 'La foto tiene que ser JPG, PNG o WebP.', 'VALIDATION_ERROR')
  return { buffer: b, mime }
}

async function newCode(workspaceId: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = `P-${randomInt(1000, 10000)}`
    if (!(await db.property.findFirst({ where: { workspaceId, code }, select: { id: true } }))) return code
  }
  throw new AppError(500, 'No se pudo generar el código de la propiedad.', 'PROPERTY_CODE')
}

/** El responsable de una propiedad lo cambian owner/admin; el resto sólo toma una libre o libera la suya. */
async function changeAssignee(ctx: WorkspaceContext, current: string | null, requested: string | null) {
  if (current === requested) return
  assertAssignAllowed(ctx, current, requested)
  await assertAssignableMember(ctx.workspaceId, requested)
}

/**
 * Catálogo de propiedades. Todo el equipo ve el catálogo completo (es lo que se ofrece);
 * el responsable indica quién la atiende.
 */
export async function propertyRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req) => authenticate(req))
  app.addHook('preHandler', requireModule('properties'))
  const write = { preHandler: requireRole('owner', 'admin', 'member') }

  app.get('/', async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const q = z.object({
      search: z.string().trim().max(120).optional(),
      operation: operationSchema.optional(),
      status: statusSchema.optional(),
    }).parse(req.query)
    const term = q.search?.trim()
    const rows = await db.property.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        isArchived: false,
        ...(q.operation ? { operation: q.operation } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(term ? {
          OR: [
            { title: { contains: term, mode: 'insensitive' } },
            { code: { contains: term, mode: 'insensitive' } },
            { address: { contains: term, mode: 'insensitive' } },
            { city: { contains: term, mode: 'insensitive' } },
            { neighborhood: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
          ],
        } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select,
    })
    return reply.send({ properties: rows.map(serialize) })
  })

  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const row = await db.property.findFirst({ where: { id: req.params.id, workspaceId: ctx.workspaceId, isArchived: false }, select })
    if (!row) throw new NotFoundError('Propiedad', req.params.id)
    return reply.send(serialize(row))
  })

  app.get<{ Params: { id: string } }>('/:id/image', async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const row = await db.property.findFirst({ where: { id: req.params.id, workspaceId: ctx.workspaceId }, select: { coverImage: true, coverMimeType: true } })
    if (!row?.coverImage || !row.coverMimeType) throw new NotFoundError('Foto')
    return reply.header('content-type', row.coverMimeType).header('cache-control', 'private, max-age=86400').send(Buffer.from(row.coverImage))
  })

  app.post('/', { ...write, bodyLimit: Math.ceil(IMAGE_MAX_BYTES * 1.5) }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const body = propertyInput.parse(req.body) as z.infer<typeof propertyInput>
    // Quien no es owner/admin sólo puede dejarla libre o a su nombre.
    const assignee = body.assignedToUserId ?? null
    if (!isAssignmentManager(ctx) && assignee && assignee !== ctx.userId) throw new AppError(403, 'Sólo podés asignarte la propiedad a vos.', 'FORBIDDEN')
    await assertAssignableMember(ctx.workspaceId, assignee)
    const image = body.image ? readImage(body.image) : null
    const created = await db.property.create({
      data: {
        workspaceId: ctx.workspaceId, code: await newCode(ctx.workspaceId), title: body.title, operation: body.operation, propertyType: body.propertyType,
        status: body.status, price: body.price ?? null, currency: body.currency, address: body.address || null, city: body.city || null,
        neighborhood: body.neighborhood || null, latitude: body.latitude ?? null, longitude: body.longitude ?? null, bedrooms: body.bedrooms ?? null,
        bathrooms: body.bathrooms ?? null, areaM2: body.areaM2 ?? null, description: body.description, assignedToUserId: assignee,
        createdByUserId: ctx.userId, coverImage: image?.buffer ?? null, coverMimeType: image?.mime ?? null,
      },
      select,
    })
    return reply.status(201).send(serialize(created))
  })

  app.patch<{ Params: { id: string } }>('/:id', { ...write, bodyLimit: Math.ceil(IMAGE_MAX_BYTES * 1.5) }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const body = propertyInput.partial().parse(req.body) as Partial<z.infer<typeof propertyInput>>
    const current = await db.property.findFirst({ where: { id: req.params.id, workspaceId: ctx.workspaceId, isArchived: false }, select: { id: true, assignedToUserId: true } })
    if (!current) throw new NotFoundError('Propiedad', req.params.id)
    if (!isAssignmentManager(ctx) && current.assignedToUserId && current.assignedToUserId !== ctx.userId) {
      throw new AppError(403, 'Sólo el responsable o un administrador puede editar esta propiedad.', 'FORBIDDEN')
    }
    if (body.assignedToUserId !== undefined) await changeAssignee(ctx, current.assignedToUserId, body.assignedToUserId ?? null)
    const image = body.image ? readImage(body.image) : null
    const { image: _image, ...fields } = body
    const updated = await db.property.update({
      where: { id: current.id },
      data: {
        ...fields,
        ...(fields.assignedToUserId !== undefined ? { assignedToUserId: fields.assignedToUserId ?? null } : {}),
        ...(image ? { coverImage: image.buffer, coverMimeType: image.mime } : {}),
      },
      select,
    })
    return reply.send(serialize(updated))
  })

  // Responsable, con las reglas de los chats (tomar, liberar o asignar).
  app.put<{ Params: { id: string } }>('/:id/assignee', write, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const { assignedToUserId } = z.object({ assignedToUserId: z.string().min(1).nullable() }).parse(req.body)
    const current = await db.property.findFirst({ where: { id: req.params.id, workspaceId: ctx.workspaceId, isArchived: false }, select: { id: true, assignedToUserId: true } })
    if (!current) throw new NotFoundError('Propiedad', req.params.id)
    await changeAssignee(ctx, current.assignedToUserId, assignedToUserId)
    const result = await db.property.updateMany({ where: { id: current.id, assignedToUserId: current.assignedToUserId }, data: { assignedToUserId } })
    if (!result.count) throw new AppError(409, 'Otra persona cambió el responsable. Actualizá y volvé a intentar.', 'ASSIGNEE_CHANGED')
    return reply.send(serialize(await db.property.findUniqueOrThrow({ where: { id: current.id }, select })))
  })

  // Archiva (no borra): los leads y el historial pueden seguir mencionándola.
  app.delete<{ Params: { id: string } }>('/:id', { preHandler: requireRole('owner', 'admin') }, async (req, reply) => {
    const ctx = req.user as WorkspaceContext
    const result = await db.property.updateMany({ where: { id: req.params.id, workspaceId: ctx.workspaceId, isArchived: false }, data: { isArchived: true } })
    if (!result.count) throw new NotFoundError('Propiedad', req.params.id)
    return reply.code(204).send()
  })
}
