import { api } from './api'

// Tipos y API de la sección Tareas (/tareas).

export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED'
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH'

type Person = { id: string; firstName: string; lastName: string | null }

export type Task = {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  /** ISO; sólo importa la fecha (AAAA-MM-DD). */
  dueDate: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  assignedToUserId: string | null
  createdByUserId: string | null
  companyId: string | null
  assignedTo: Person | null
  createdBy: Person | null
  company: { id: string; name: string } | null
  _count: { events: number }
}

export type TaskInput = {
  title: string
  description: string
  priority: TaskPriority
  status: TaskStatus
  assignedToUserId: string | null
  companyId: string | null
  dueDate: string | null
}

export type TaskChange = { field: string; label: string; from: string | null; to: string | null }

export type TaskEvent = {
  id: string
  taskId: string
  type: 'created' | 'updated' | 'status' | 'deleted' | string
  taskTitle: string
  changes: TaskChange[]
  createdAt: string
  actor: Person | null
}

export type TaskFilters = { status?: TaskStatus | 'open'; assignedToUserId?: string; search?: string }

export const tasksApi = {
  list: (params: TaskFilters) => api.get<Task[]>('/tasks', { params }),
  create: (data: TaskInput) => api.post<Task>('/tasks', data),
  update: (id: string, data: TaskInput) => api.put<Task>(`/tasks/${id}`, data),
  setStatus: (id: string, status: TaskStatus) => api.patch<Task>(`/tasks/${id}/status`, { status }),
  remove: (id: string) => api.delete(`/tasks/${id}`),
  history: (params: { taskId?: string; before?: string; limit?: number }) => {
    const { taskId, ...query } = params
    return api.get<{ items: TaskEvent[]; hasMore: boolean }>(taskId ? `/tasks/${taskId}/history` : '/tasks/history', { params: query })
  },
}

export const STATUS_LABEL: Record<TaskStatus, string> = { PENDING: 'Pendiente', IN_PROGRESS: 'En curso', DONE: 'Hecha', CANCELLED: 'Cancelada' }
export const PRIORITY_LABEL: Record<TaskPriority, string> = { LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta' }

export function toInput(task: Task): TaskInput {
  return {
    title: task.title,
    description: task.description,
    priority: task.priority,
    status: task.status,
    assignedToUserId: task.assignedToUserId,
    companyId: task.companyId,
    dueDate: task.dueDate ? task.dueDate.slice(0, 10) : null,
  }
}

/** Fecha de hoy en Paraguay, AAAA-MM-DD. */
export function todayInParaguay() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' }).format(new Date())
}

export function isOverdue(task: Pick<Task, 'dueDate' | 'status'>, today = todayInParaguay()) {
  return Boolean(task.dueDate) && (task.status === 'PENDING' || task.status === 'IN_PROGRESS') && (task.dueDate as string).slice(0, 10) < today
}

/** "2026-11-20" → "20/11/2026" */
export function formatDay(value: string | null) {
  if (!value) return null
  const [year, month, day] = value.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}
