// Reglas puras de la sección Tareas: qué cambió entre dos versiones de una tarea y quién puede hacer qué.

export const TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const
export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const
export type TaskStatusValue = (typeof TASK_STATUSES)[number]
export type TaskPriorityValue = (typeof TASK_PRIORITIES)[number]

export const STATUS_LABELS: Record<TaskStatusValue, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En curso',
  DONE: 'Hecha',
  CANCELLED: 'Cancelada',
}

export const PRIORITY_LABELS: Record<TaskPriorityValue, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
}

/** Versión legible de una tarea: lo que se muestra en el historial (nombres en vez de ids). */
export type TaskSnapshot = {
  title: string
  description: string
  status: TaskStatusValue
  priority: TaskPriorityValue
  assignee: string | null
  client: string | null
  /** AAAA-MM-DD */
  dueDate: string | null
}

export type TaskChange = { field: keyof TaskSnapshot; label: string; from: string | null; to: string | null }

const FIELDS: { field: keyof TaskSnapshot; label: string }[] = [
  { field: 'title', label: 'Título' },
  { field: 'description', label: 'Descripción' },
  { field: 'status', label: 'Estado' },
  { field: 'priority', label: 'Prioridad' },
  { field: 'assignee', label: 'Responsable' },
  { field: 'client', label: 'Cliente' },
  { field: 'dueDate', label: 'Vencimiento' },
]

function display(field: keyof TaskSnapshot, value: string | null): string | null {
  if (value === null || value === '') return null
  if (field === 'status') return STATUS_LABELS[value as TaskStatusValue] ?? value
  if (field === 'priority') return PRIORITY_LABELS[value as TaskPriorityValue] ?? value
  if (field === 'dueDate') {
    const [year, month, day] = value.split('-')
    return day && month && year ? `${day}/${month}/${year}` : value
  }
  return value
}

/**
 * Campos que cambiaron entre `before` y `after`, con el valor anterior y el nuevo ya legibles. Sin `before` (alta de
 * la tarea) se listan los campos que tienen algún valor.
 */
export function diffTask(before: TaskSnapshot | null, after: TaskSnapshot): TaskChange[] {
  const changes: TaskChange[] = []
  for (const { field, label } of FIELDS) {
    const from = before ? display(field, before[field]) : null
    const to = display(field, after[field])
    if (from !== to) changes.push({ field, label, from, to })
  }
  return changes
}

/** El tipo de evento: si sólo cambió el estado se marca aparte, para filtrarlo y mostrarlo distinto. */
export function eventTypeFor(changes: TaskChange[]): 'status' | 'updated' {
  return changes.length > 0 && changes.every((change) => change.field === 'status') ? 'status' : 'updated'
}

export type Viewer = { userId: string; role: string }
type TaskOwnership = { assignedToUserId: string | null; createdByUserId: string | null }

export function isTaskManager(role: string) {
  return role === 'owner' || role === 'admin'
}

/** Owner y admin ven todas; el resto, las que tiene asignadas o creó. */
export function canSeeTask(viewer: Viewer, task: TaskOwnership) {
  return isTaskManager(viewer.role) || task.assignedToUserId === viewer.userId || task.createdByUserId === viewer.userId
}

/** Cambiar el estado: owner/admin o el responsable de la tarea (un viewer nunca). */
export function canChangeStatus(viewer: Viewer, task: TaskOwnership) {
  if (viewer.role === 'viewer') return false
  return isTaskManager(viewer.role) || task.assignedToUserId === viewer.userId
}

/** completedAt se completa al pasar a «Hecha» y se limpia si vuelve a otro estado. */
export function nextCompletedAt(previous: Date | null, status: TaskStatusValue, now = new Date()) {
  if (status !== 'DONE') return null
  return previous ?? now
}
