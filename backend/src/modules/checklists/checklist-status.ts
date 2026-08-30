import type { ChecklistStatus } from '@prisma/client'
import { isPastParaguayDate } from '../collections/collection-calculations'

export function deriveChecklistStatus(
  items: Array<{ isRequired: boolean; isCompleted: boolean }>,
  dueDate: Date | null,
  now = new Date()
): ChecklistStatus {
  const required = items.filter((item) => item.isRequired)
  if (required.length > 0 && required.every((item) => item.isCompleted)) return 'COMPLETED'
  if (dueDate && isPastParaguayDate(dueDate, now)) return 'OVERDUE'
  if (items.some((item) => item.isCompleted)) return 'IN_PROGRESS'
  return 'PENDING'
}
