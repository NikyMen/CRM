import { Prisma } from '@prisma/client'
import { db } from '../../core/database'
import { ForbiddenError, NotFoundError, ValidationError, type WorkspaceContext } from '../../types'
import {
  canChangeStatus,
  canSeeTask,
  diffTask,
  eventTypeFor,
  isTaskManager,
  nextCompletedAt,
  type TaskChange,
  type TaskPriorityValue,
  type TaskSnapshot,
  type TaskStatusValue,
} from './task.logic'

export type TaskInput = {
  title: string
  description: string
  priority: TaskPriorityValue
  status: TaskStatusValue
  assignedToUserId: string | null
  companyId: string | null
  /** AAAA-MM-DD */
  dueDate: string | null
}

export type TaskListFilters = { status?: TaskStatusValue | 'open'; assignedToUserId?: string; search?: string }

const person = { select: { id: true, firstName: true, lastName: true } } as const

const taskSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  dueDate: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  assignedToUserId: true,
  createdByUserId: true,
  companyId: true,
  assignedTo: person,
  createdBy: person,
  company: { select: { id: true, name: true } },
  _count: { select: { events: true } },
} as const

type TaskRecord = Prisma.TaskGetPayload<{ select: typeof taskSelect }>

const eventSelect = {
  id: true,
  taskId: true,
  type: true,
  taskTitle: true,
  changes: true,
  createdAt: true,
  actor: person,
} as const

function fullName(user: { firstName: string; lastName: string | null } | null) {
  return user ? `${user.firstName} ${user.lastName ?? ''}`.trim() : null
}

function toDateOnly(value: string | null) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null
}

function snapshot(task: TaskRecord): TaskSnapshot {
  return {
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    assignee: fullName(task.assignedTo),
    client: task.company?.name ?? null,
    dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
  }
}

export class TaskService {
  async list(ctx: WorkspaceContext, filters: TaskListFilters) {
    const where: Prisma.TaskWhereInput = { workspaceId: ctx.workspaceId, deletedAt: null }
    if (!isTaskManager(ctx.role)) where.OR = [{ assignedToUserId: ctx.userId }, { createdByUserId: ctx.userId }]
    if (filters.status === 'open') where.status = { in: ['PENDING', 'IN_PROGRESS'] }
    else if (filters.status) where.status = filters.status
    if (filters.assignedToUserId) where.assignedToUserId = filters.assignedToUserId === 'none' ? null : filters.assignedToUserId
    if (filters.search) {
      where.AND = [{
        OR: [
          { title: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
          { company: { name: { contains: filters.search, mode: 'insensitive' } } },
        ],
      }]
    }
    return db.task.findMany({
      where,
      select: taskSelect,
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 500,
    })
  }

  async create(ctx: WorkspaceContext, input: TaskInput) {
    await this.checkReferences(ctx, input)
    return db.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          workspaceId: ctx.workspaceId,
          title: input.title,
          description: input.description,
          priority: input.priority,
          status: input.status,
          assignedToUserId: input.assignedToUserId,
          companyId: input.companyId,
          dueDate: toDateOnly(input.dueDate),
          completedAt: nextCompletedAt(null, input.status),
          createdByUserId: ctx.userId,
        },
        select: taskSelect,
      })
      await this.record(tx, ctx, task, 'created', diffTask(null, snapshot(task)))
      return task
    })
  }

  async update(ctx: WorkspaceContext, id: string, input: TaskInput) {
    const current = await this.find(ctx, id)
    await this.checkReferences(ctx, input)
    return db.$transaction(async (tx) => {
      const task = await tx.task.update({
        where: { id },
        data: {
          title: input.title,
          description: input.description,
          priority: input.priority,
          status: input.status,
          assignedToUserId: input.assignedToUserId,
          companyId: input.companyId,
          dueDate: toDateOnly(input.dueDate),
          completedAt: nextCompletedAt(current.completedAt, input.status),
        },
        select: taskSelect,
      })
      const changes = diffTask(snapshot(current), snapshot(task))
      if (changes.length) await this.record(tx, ctx, task, eventTypeFor(changes), changes)
      return task
    })
  }

  async setStatus(ctx: WorkspaceContext, id: string, status: TaskStatusValue) {
    const current = await this.find(ctx, id)
    if (!canChangeStatus(ctx, current)) throw new ForbiddenError('Sólo el responsable de la tarea o un administrador puede cambiar su estado.')
    if (current.status === status) return current
    return db.$transaction(async (tx) => {
      const task = await tx.task.update({
        where: { id },
        data: { status, completedAt: nextCompletedAt(current.completedAt, status) },
        select: taskSelect,
      })
      await this.record(tx, ctx, task, 'status', diffTask(snapshot(current), snapshot(task)))
      return task
    })
  }

  /** No se borra de verdad: queda archivada para conservar su historial. */
  async remove(ctx: WorkspaceContext, id: string) {
    const current = await this.find(ctx, id)
    await db.$transaction(async (tx) => {
      await tx.task.update({ where: { id }, data: { deletedAt: new Date() } })
      await this.record(tx, ctx, current, 'deleted', [])
    })
  }

  /** Historial de una tarea, o de todas si no se indica (sólo owner/admin). Del más nuevo al más viejo. */
  async history(ctx: WorkspaceContext, options: { taskId?: string; before?: string; limit: number }) {
    if (options.taskId) {
      const task = await db.task.findFirst({
        where: { id: options.taskId, workspaceId: ctx.workspaceId },
        select: { assignedToUserId: true, createdByUserId: true },
      })
      if (!task || !canSeeTask(ctx, task)) throw new NotFoundError('Tarea', options.taskId)
    } else if (!isTaskManager(ctx.role)) {
      throw new ForbiddenError('El historial completo sólo lo ven los administradores.')
    }
    const events = await db.taskEvent.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        ...(options.taskId ? { taskId: options.taskId } : {}),
        ...(options.before ? { createdAt: { lt: new Date(options.before) } } : {}),
      },
      select: eventSelect,
      orderBy: { createdAt: 'desc' },
      take: options.limit + 1,
    })
    const hasMore = events.length > options.limit
    return { items: events.slice(0, options.limit), hasMore }
  }

  private async find(ctx: WorkspaceContext, id: string) {
    const task = await db.task.findFirst({ where: { id, workspaceId: ctx.workspaceId, deletedAt: null }, select: taskSelect })
    if (!task || !canSeeTask(ctx, task)) throw new NotFoundError('Tarea', id)
    return task
  }

  private async checkReferences(ctx: WorkspaceContext, input: TaskInput) {
    if (input.assignedToUserId) {
      const member = await db.workspaceUser.findUnique({
        where: { workspaceId_userId: { workspaceId: ctx.workspaceId, userId: input.assignedToUserId } },
        select: { id: true },
      })
      if (!member) throw new ValidationError('El responsable no pertenece al equipo.')
    }
    if (input.companyId) {
      const company = await db.company.findFirst({ where: { id: input.companyId, workspaceId: ctx.workspaceId }, select: { id: true } })
      if (!company) throw new ValidationError('El cliente no existe.')
    }
  }

  private record(tx: Prisma.TransactionClient, ctx: WorkspaceContext, task: { id: string; title: string }, type: string, changes: TaskChange[]) {
    return tx.taskEvent.create({
      data: {
        workspaceId: ctx.workspaceId,
        taskId: task.id,
        actorUserId: ctx.userId,
        type,
        taskTitle: task.title,
        changes: changes as unknown as Prisma.InputJsonValue,
      },
    })
  }
}
