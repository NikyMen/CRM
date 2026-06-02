export interface UserContext {
  userId: string
  role: string
  branchId?: string | null
  regionId?: string | null
}

export interface ResourceContext {
  id: string
  ownerId?: string | null
  branchId?: string | null
  branch?: {
    regionId?: string | null
  } | null
}

/**
 * Reglas de permisos y autorizaciones para Deals y Contactos.
 */
export const permissions = {
  deal: {
    canCreate(user: UserContext): boolean {
      // El vendor NO puede crear deals (acceso de lectura estricto)
      if (user.role === 'vendor') return false
      return ['owner', 'regional_manager', 'branch_manager'].includes(user.role)
    },

    canRead(user: UserContext, deal: ResourceContext): boolean {
      if (user.role === 'owner') return true
      if (user.role === 'regional_manager') {
        return deal.branch?.regionId === user.regionId
      }
      if (user.role === 'branch_manager') {
        return deal.branchId === user.branchId
      }
      if (user.role === 'vendor') {
        return deal.ownerId === user.userId
      }
      return false
    },

    canUpdate(user: UserContext, deal: ResourceContext, updateData?: { ownerId?: string | null }): boolean {
      if (user.role === 'owner') return true

      if (user.role === 'regional_manager') {
        return deal.branch?.regionId === user.regionId
      }

      if (user.role === 'branch_manager') {
        return deal.branchId === user.branchId
      }

      // El vendor NO tiene permisos de escritura (lectura estricta)
      return false
    },

    canDelete(user: UserContext, deal: ResourceContext): boolean {
      if (user.role === 'owner') return true

      if (user.role === 'regional_manager') {
        return deal.branch?.regionId === user.regionId
      }

      if (user.role === 'branch_manager') {
        return deal.branchId === user.branchId
      }

      // El vendor NO puede borrar deals
      return false
    }
  },

  contact: {
    canCreate(user: UserContext): boolean {
      // El vendor NO puede crear contactos (acceso de lectura estricto)
      if (user.role === 'vendor') return false
      return ['owner', 'regional_manager', 'branch_manager'].includes(user.role)
    },

    canRead(user: UserContext, contact: ResourceContext): boolean {
      if (user.role === 'owner') return true
      if (user.role === 'regional_manager') {
        return contact.branch?.regionId === user.regionId
      }
      if (user.role === 'branch_manager') {
        return contact.branchId === user.branchId
      }
      if (user.role === 'vendor') {
        return contact.ownerId === user.userId
      }
      return false
    },

    canUpdate(user: UserContext, contact: ResourceContext, updateData?: { ownerId?: string | null }): boolean {
      if (user.role === 'owner') return true

      if (user.role === 'regional_manager') {
        return contact.branch?.regionId === user.regionId
      }

      if (user.role === 'branch_manager') {
        return contact.branchId === user.branchId
      }

      // El vendor NO tiene permisos de escritura (lectura estricta)
      return false
    },

    canDelete(user: UserContext, contact: ResourceContext): boolean {
      if (user.role === 'owner') return true

      if (user.role === 'regional_manager') {
        return contact.branch?.regionId === user.regionId
      }

      if (user.role === 'branch_manager') {
        return contact.branchId === user.branchId
      }

      // El vendor NO puede borrar contactos
      return false
    }
  }
}
