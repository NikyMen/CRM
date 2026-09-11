'use client'

import { useQuery } from '@tanstack/react-query'
import { authApi } from './api'
import { DEFAULT_MODULE_STATE, normalizeModuleState, type ModuleState } from './modules'

export const WORKSPACE_MODULES_KEY = ['workspace-settings', 'modules'] as const

/**
 * Estado de módulos del workspace. Mientras carga devolvemos los valores por
 * defecto para no parpadear el menú en cada navegación.
 */
export function useWorkspaceModules(enabled = true) {
  const query = useQuery({
    queryKey: WORKSPACE_MODULES_KEY,
    queryFn: () => authApi.getWorkspaceSettings().then((response) => response.data),
    staleTime: 5 * 60 * 1000,
    enabled,
  })

  const modules: ModuleState = query.data
    ? normalizeModuleState(query.data.modules)
    : DEFAULT_MODULE_STATE

  return { modules, isLoading: query.isLoading, definitions: query.data?.definitions ?? [] }
}
