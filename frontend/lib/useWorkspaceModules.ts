'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authApi } from './api'
import { DEFAULT_MODULE_STATE, normalizeModuleState, type ModuleState } from './modules'

export const WORKSPACE_MODULES_KEY = ['workspace-settings', 'modules'] as const
const CACHE_KEY = 'romez:workspace-modules'

function readCachedModules(): ModuleState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    return raw ? normalizeModuleState(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

/**
 * Estado de módulos del workspace. Mientras no hay datos del servidor usamos
 * el último estado conocido de este navegador; si no existe, `ready` queda en
 * false para que el menú no muestre secciones que después se ocultan.
 */
export function useWorkspaceModules(enabled = true) {
  const query = useQuery({
    queryKey: WORKSPACE_MODULES_KEY,
    queryFn: () => authApi.getWorkspaceSettings().then((response) => response.data),
    staleTime: 5 * 60 * 1000,
    enabled,
  })

  const serverModules = query.data ? normalizeModuleState(query.data.modules) : null
  const cachedModules = serverModules || !enabled ? null : readCachedModules()

  useEffect(() => {
    if (!serverModules) return
    try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(serverModules)) } catch { /* almacenamiento bloqueado */ }
  }, [serverModules && JSON.stringify(serverModules)]) // eslint-disable-line react-hooks/exhaustive-deps

  const modules: ModuleState = serverModules ?? cachedModules ?? DEFAULT_MODULE_STATE
  const ready = Boolean(serverModules || cachedModules || query.isError)

  return { modules, ready, isLoading: query.isLoading, definitions: query.data?.definitions ?? [] }
}
