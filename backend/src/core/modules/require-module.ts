import { db } from '../database'
import { ForbiddenError } from '../../types'
import { readModuleState, type ModuleKey, type ModuleState } from './registry'

// Cache corto por workspace: la configuración cambia muy poco y esto
// evita una consulta extra en cada request de los módulos protegidos.
const CACHE_TTL_MS = 30_000
const cache = new Map<string, { state: ModuleState; expiresAt: number }>()

export function invalidateModuleCache(workspaceId?: string) {
  if (workspaceId) cache.delete(workspaceId)
  else cache.clear()
}

export async function getModuleState(workspaceId: string): Promise<ModuleState> {
  const cached = cache.get(workspaceId)
  if (cached && cached.expiresAt > Date.now()) return cached.state

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { settings: true },
  })
  const state = readModuleState(workspace?.settings)
  cache.set(workspaceId, { state, expiresAt: Date.now() + CACHE_TTL_MS })
  return state
}

export async function isModuleEnabled(workspaceId: string, key: ModuleKey) {
  return (await getModuleState(workspaceId))[key]
}

/**
 * preHandler que bloquea un módulo apagado desde Configuración.
 * Se usa después de `authenticate`, porque necesita el workspace del JWT.
 */
export function requireModule(key: ModuleKey) {
  return async (req: any): Promise<void> => {
    if (req.method === 'OPTIONS') return
    const workspaceId = (req.user as { workspaceId?: string } | undefined)?.workspaceId
    if (!workspaceId) throw new ForbiddenError('No autenticado')
    if (!(await isModuleEnabled(workspaceId, key))) {
      throw new ForbiddenError('Este módulo está desactivado para tu espacio de trabajo')
    }
  }
}
