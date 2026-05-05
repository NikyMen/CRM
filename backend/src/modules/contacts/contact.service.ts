import { db } from '../../core/database'
import { EventBus } from '../../core/event-bus'
import { LeadScoringEngine } from './lead-scoring.engine'
import {
  NotFoundError,
  ConflictError,
  paginate,
  ActivityType,
  type PaginationQuery,
  type PaginatedResult,
} from '../../types'
import { type Prisma } from '@prisma/client'

type Contact = Prisma.ContactGetPayload<object>

// ─── DTOs ─────────────────────────────────────────────────────────
// DTO = Data Transfer Object
// Define exactamente qué datos se esperan en cada operación
// Es diferente al modelo de Prisma porque puede tener campos
// opcionales distintos o transformaciones

export interface CreateContactDto {
  firstName: string
  lastName?: string
  email?: string
  phone?: string
  avatar?: string
  status?: string
  source?: string
  tags?: string[]
  companyId?: string
  ownerId?: string
  customData?: Record<string, unknown>
}

export interface UpdateContactDto extends Partial<CreateContactDto> {}

export interface ContactFilters extends PaginationQuery {
  search?: string
  status?: string | string[]
  source?: string | string[]
  ownerId?: string
  companyId?: string
  tags?: string[]
  scoreMin?: number
  scoreMax?: number
}

// ─── Servicio ─────────────────────────────────────────────────────

export class ContactService {
  private scoring = new LeadScoringEngine()

  constructor(private readonly eventBus: EventBus) {}

  // ─── Crear ──────────────────────────────────────────────────────
  async create(
    workspaceId: string,
    data: CreateContactDto,
    userId?: string
  ): Promise<Contact> {

    // 1. Deduplicación — evitar contactos duplicados por email o tel
    if (data.email || data.phone) {
      const duplicate = await this.findDuplicate(
        workspaceId,
        data.email,
        data.phone
      )
      if (duplicate) {
        throw new ConflictError(
          `Ya existe un contacto con este ${data.email ? 'email' : 'teléfono'}. ID: ${duplicate.id}`
        )
      }
    }

    // 2. Crear en la base de datos
    const contact = await db.contact.create({
      data: {
        workspaceId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        avatar: data.avatar,
        status: data.status ?? 'LEAD',
        source: data.source ?? 'MANUAL',
        tags: data.tags ?? [],
        companyId: data.companyId,
        ownerId: data.ownerId,
        customData: (data.customData ?? {}) as Prisma.InputJsonValue,
      },
    })

    // 3. Calcular lead score inicial
    const score = this.scoring.calculate(contact)
    if (score > 0) {
      await db.contact.update({
        where: { id: contact.id },
        data: { score },
      })
      contact.score = score
    }

    // 4. Registrar en el log de actividades
    await this.logActivity(
      workspaceId,
      contact.id,
      ActivityType.CONTACT_CREATED,
      userId
    )

    // 5. Emitir evento — esto dispara los webhooks hacia n8n
    await this.eventBus.emit('contact.created', {
      workspaceId,
      contact: this.sanitize(contact),
      createdBy: userId ?? 'system',
    })

    return contact
  }

  // ─── Buscar por ID ───────────────────────────────────────────────
  async findById(workspaceId: string, id: string): Promise<Contact> {
    const contact = await db.contact.findFirst({
      where: { id, workspaceId, isArchived: false },
    })
    if (!contact) throw new NotFoundError('Contact', id)
    return contact
  }

  // ─── Buscar con filtros ──────────────────────────────────────────
  async search(
    workspaceId: string,
    filters: ContactFilters
  ): Promise<PaginatedResult<Contact>> {
    const page = filters.page ?? 0
    const limit = Math.min(filters.limit ?? 25, 100)

    const where = this.buildWhereClause(workspaceId, filters)

    const [items, total] = await Promise.all([
      db.contact.findMany({
        where,
        take: limit,
        skip: page * limit,
        orderBy: this.buildOrderBy(filters.sortBy, filters.sortDir),
      }),
      db.contact.count({ where }),
    ])

    return paginate(items, total, page, limit)
  }

  // ─── Actualizar ──────────────────────────────────────────────────
  async update(
    workspaceId: string,
    id: string,
    data: UpdateContactDto,
    userId?: string
  ): Promise<Contact> {
    // Verificar que existe
    await this.findById(workspaceId, id)

    // Verificar duplicados si cambia email o phone
    if (data.email || data.phone) {
      const dup = await this.findDuplicate(
        workspaceId,
        data.email,
        data.phone,
        id // excluir el contacto actual de la búsqueda
      )
      if (dup) {
        throw new ConflictError('Otro contacto ya tiene este email o teléfono')
      }
    }

    const contact = await db.contact.update({
      where: { id, workspaceId },
      data: {
        ...(data.firstName !== undefined && { firstName: data.firstName }),
        ...(data.lastName !== undefined && { lastName: data.lastName }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.avatar !== undefined && { avatar: data.avatar }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.source !== undefined && { source: data.source }),
        ...(data.tags !== undefined && { tags: data.tags }),
        ...(data.companyId !== undefined && { companyId: data.companyId }),
        ...(data.ownerId !== undefined && { ownerId: data.ownerId }),
        ...(data.customData !== undefined && {
          customData: data.customData as Prisma.InputJsonValue,
        }),
      },
    })

    // Recalcular score con los nuevos datos
    const score = this.scoring.calculate(contact)
    if (score !== contact.score) {
      await db.contact.update({ where: { id }, data: { score } })
      contact.score = score
    }

    await this.logActivity(
      workspaceId,
      id,
      ActivityType.CONTACT_UPDATED,
      userId
    )

    await this.eventBus.emit('contact.updated', {
      workspaceId,
      contact: this.sanitize(contact),
      updatedBy: userId ?? 'system',
    })

    return contact
  }

  // ─── Eliminar (soft delete) ──────────────────────────────────────
  async delete(
    workspaceId: string,
    id: string,
    userId?: string
  ): Promise<void> {
    await this.findById(workspaceId, id)

    // Soft delete — no borramos el registro, solo lo marcamos
    // como archivado. Los datos históricos se preservan.
    await db.contact.update({
      where: { id, workspaceId },
      data: { isArchived: true },
    })

    await this.eventBus.emit('contact.deleted', {
      workspaceId,
      contactId: id,
      deletedBy: userId ?? 'system',
    })
  }

  // ─── Merge de duplicados ─────────────────────────────────────────
  async merge(
    workspaceId: string,
    winnerId: string,
    loserId: string,
    userId?: string
  ): Promise<Contact> {
    const [winner, loser] = await Promise.all([
      this.findById(workspaceId, winnerId),
      this.findById(workspaceId, loserId),
    ])

    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      // Reasignar deals y notas del perdedor al ganador
      await tx.dealContact.updateMany({
        where: { contactId: loserId },
        data: { contactId: winnerId },
      })
      await tx.note.updateMany({
        where: { contactId: loserId },
        data: { contactId: winnerId },
      })
      await tx.activity.updateMany({
        where: { contactId: loserId },
        data: { contactId: winnerId },
      })

      // Completar campos vacíos del ganador con datos del perdedor
      const mergedData: Record<string, unknown> = {}
      if (!winner.email && loser.email) mergedData.email = loser.email
      if (!winner.phone && loser.phone) mergedData.phone = loser.phone
      if (!winner.avatar && loser.avatar) mergedData.avatar = loser.avatar
      if (!winner.companyId && loser.companyId) {
        mergedData.companyId = loser.companyId
      }

      // Combinar tags de ambos sin repetir
      const mergedTags = [...new Set([...winner.tags, ...loser.tags])]

      await tx.contact.update({
        where: { id: winnerId, workspaceId },
        data: { ...mergedData, tags: mergedTags },
      })

      // Archivar el perdedor apuntando al ganador
      await tx.contact.update({
        where: { id: loserId, workspaceId },
        data: { isArchived: true, mergedInto: winnerId },
      })
    })

    const merged = await this.findById(workspaceId, winnerId)

    await this.logActivity(
      workspaceId,
      winnerId,
      ActivityType.CONTACT_MERGED,
      userId,
      { mergedFrom: loserId }
    )

    await this.eventBus.emit('contact.merged', {
      workspaceId,
      winnerId,
      loserId,
      mergedBy: userId ?? 'system',
    })

    return merged
  }

  // ─── Helpers privados ────────────────────────────────────────────

  private async findDuplicate(
    workspaceId: string,
    email?: string,
    phone?: string,
    excludeId?: string
  ): Promise<Contact | null> {
    if (!email && !phone) return null

    return db.contact.findFirst({
      where: {
        workspaceId,
        isArchived: false,
        ...(excludeId && { id: { not: excludeId } }),
        OR: [
          ...(email ? [{ email }] : []),
          ...(phone ? [{ phone }] : []),
        ],
      },
    })
  }

  private buildWhereClause(
    workspaceId: string,
    f: ContactFilters
  ): Prisma.ContactWhereInput {
    const where: Prisma.ContactWhereInput = {
      workspaceId,
      isArchived: false,
    }

    if (f.search) {
      where.OR = [
        { firstName: { contains: f.search, mode: 'insensitive' } },
        { lastName:  { contains: f.search, mode: 'insensitive' } },
        { email:     { contains: f.search, mode: 'insensitive' } },
        { phone:     { contains: f.search, mode: 'insensitive' } },
      ]
    }

    if (f.status) {
      where.status = Array.isArray(f.status)
        ? { in: f.status }
        : f.status
    }

    if (f.source) {
      where.source = Array.isArray(f.source)
        ? { in: f.source }
        : f.source
    }

    if (f.ownerId)   where.ownerId   = f.ownerId
    if (f.companyId) where.companyId = f.companyId

    if (f.tags?.length) {
      where.tags = { hasSome: f.tags }
    }

    if (f.scoreMin !== undefined || f.scoreMax !== undefined) {
      where.score = {
        ...(f.scoreMin !== undefined && { gte: f.scoreMin }),
        ...(f.scoreMax !== undefined && { lte: f.scoreMax }),
      }
    }

    return where
  }

  private buildOrderBy(
    sortBy = 'createdAt',
    sortDir: 'asc' | 'desc' = 'desc'
  ): Prisma.ContactOrderByWithRelationInput {
    const allowed = [
      'firstName', 'lastName', 'email',
      'score', 'createdAt', 'updatedAt', 'lastContactedAt',
    ]
    const field = allowed.includes(sortBy) ? sortBy : 'createdAt'
    return { [field]: sortDir }
  }

  private async logActivity(
    workspaceId: string,
    contactId: string,
    type: ActivityType,
    userId?: string,
    metadata?: Record<string, unknown>
  ) {
    const titles: Record<string, string> = {
      [ActivityType.CONTACT_CREATED]: 'Contacto creado',
      [ActivityType.CONTACT_UPDATED]: 'Contacto actualizado',
      [ActivityType.CONTACT_MERGED]:  'Contactos mergeados',
    }

    await db.activity.create({
      data: {
        workspaceId,
        type,
        entityType: 'contact',
        entityId: contactId,
        contactId,
        userId,
        title: titles[type] ?? type,
        metadata: metadata as Prisma.InputJsonValue ?? null,
      },
    })
  }

  // Remover campos sensibles antes de emitir eventos externos
  private sanitize(contact: Contact) {
    return {
      id: contact.id,
      workspaceId: contact.workspaceId,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: contact.phone,
      status: contact.status,
      source: contact.source,
      score: contact.score,
      tags: contact.tags,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
    }
  }
}