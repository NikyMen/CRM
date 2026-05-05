import { ForbiddenError } from '../../types'
import type { Role } from './roles'

/**
 * Middleware reutilizable que verifica que el rol del usuario
 * en el JWT esté dentro de los roles permitidos.
 *
 * Uso en cualquier ruta:
 *   app.delete('/:id', { preHandler: requireRole('owner', 'admin') }, handler)
 *
 * También se puede usar como hook global en un plugin:
 *   app.addHook('onRequest', requireRole('owner', 'admin'))
 */
export function requireRole(...allowedRoles: Role[]) {
  return async (req: any): Promise<void> => {
    // Permitir preflight requests de CORS
    if (req.method === 'OPTIONS') {
      return
    }

    const ctx = req.user as { role?: string } | undefined
    
    if (!ctx?.role) {
      throw new ForbiddenError('No autenticado o rol no definido')
    }

    if (!allowedRoles.includes(ctx.role as Role)) {
      throw new ForbiddenError(
        `Rol '${ctx.role}' no tiene acceso a esta acción. ` +
        `Se requiere: ${allowedRoles.join(' o ')}`
      )
    }
  }
}

