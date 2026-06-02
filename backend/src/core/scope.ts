import { type Prisma } from '@prisma/client'

export interface ScopeParams {
  role: string
  userId: string
  branchId?: string | null
  regionId?: string | null
}

/**
 * Retorna el filtro de Prisma (where clause) correspondiente al alcance del usuario según su rol.
 * Este filtro se puede aplicar tanto a consultas de Deals como de Contacts.
 */
export function getScopeFilter(params: ScopeParams): Prisma.DealWhereInput & Prisma.ContactWhereInput {
  const { role, userId, branchId, regionId } = params

  switch (role) {
    case 'owner':
      // El administrador ve todo, no aplica ningún filtro adicional
      return {}

    case 'regional_manager':
      // Ve deals/contactos de sucursales que pertenecen a su región
      if (!regionId) {
        // Si no tiene región asignada, por seguridad no ve nada
        return { id: 'none' }
      }
      return {
        branch: {
          regionId: regionId,
        },
      }

    case 'branch_manager':
      // Ve deals/contactos de su propia sucursal
      if (!branchId) {
        // Si no tiene sucursal asignada, por seguridad no ve nada
        return { branchId: 'none' }
      }
      return {
        branchId: branchId,
      }

    case 'vendor':
      // El vendedor solo ve deals/contactos de los que es el propietario directo
      return {
        ownerId: userId,
      }

    default:
      // Por defecto, cualquier otro rol o caso no ve nada por seguridad
      return { id: 'none' }
  }
}

/**
 * Retorna el filtro de Prisma (where clause) correspondiente al alcance del usuario para los Pipelines.
 */
export function getPipelineScopeFilter(params: {
  role: string
  branchId?: string | null
  regionId?: string | null
}): Prisma.PipelineWhereInput {
  const { role, branchId, regionId } = params

  switch (role) {
    case 'owner':
      // El owner ve todos los pipelines (generales, de región y sucursales)
      return {}

    case 'regional_manager':
      // Ve pipelines asociados a su región, o a sucursales de su región
      if (!regionId) {
        return { id: 'none' }
      }
      return {
        OR: [
          { regionId: regionId },
          { branch: { regionId: regionId } }
        ]
      }

    case 'branch_manager':
    case 'vendor':
      // Ve pipelines asociados a su propia sucursal o a su región (compartidos)
      if (!branchId) {
        return { branchId: 'none' }
      }
      return {
        OR: [
          { branchId: branchId },
          { regionId: regionId || 'none' }
        ]
      }

    default:
      // Cualquier otro caso no ve nada
      return { id: 'none' }
  }
}
