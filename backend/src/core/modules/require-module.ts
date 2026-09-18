import { db } from '../database'
import { ForbiddenError } from '../../types'
import { readMemberModuleState, type ModuleKey, type ModuleState } from './registry'

// Cache corto por workspace: la configuración cambia muy poco y esto
// evita una consulta extra en cada request de los módulos protegidos.
const CACHE_TTL_MS = 30_000
const cache = new Map<string, { state: ModuleState; expiresAt: number }>()

export function invalidateModuleCache(workspaceId?: string) {
  if (!workspaceId) return cache.clear()
  for (const key of cache.keys()) if (key.startsWith(`${workspaceId}:`)) cache.delete(key)
}

export async function getModuleState(workspaceId: string, userId: string, role: string): Promise<ModuleState> {
  const key = `${workspaceId}:${userId}`
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.state

  const membership = await db.workspaceUser.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { moduleAccess: true, workspace: { select: { settings: true } } },
  })
  const state = readMemberModuleState(membership?.workspace.settings, membership?.moduleAccess, role)
  cache.set(key, { state, expiresAt: Date.now() + CACHE_TTL_MS })
  return state
}

export async function isModuleEnabled(workspaceId: string, userId: string, role: string, key: ModuleKey) {
  return (await getModuleState(workspaceId, userId, role))[key]
}

/**
 * preHandler que bloquea un módulo apagado desde Configuración.
 * Se usa después de `authenticate`, porque necesita el workspace del JWT.
 */
export function requireModule(key: ModuleKey) {
  return async (req: any): Promise<void> => {
    if (req.method === 'OPTIONS') return
    const user = req.user as { workspaceId?: string; userId?: string; role?: string } | undefined
    if (!user?.workspaceId || !user.userId || !user.role) throw new ForbiddenError('No autenticado')
    if (!(await isModuleEnabled(user.workspaceId, user.userId, user.role, key))) {
      throw new ForbiddenError('Este módulo está desactivado para tu espacio de trabajo')
    }
  }
}
