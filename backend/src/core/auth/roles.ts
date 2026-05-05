// ─── Roles del sistema ────────────────────────────────────────────
// Cada workspace tiene usuarios con estos roles.
// La jerarquía es: owner > admin > member > viewer

export const ROLES = ['owner', 'admin', 'member', 'viewer'] as const
export type Role = typeof ROLES[number]

// Roles que pueden invitar a otros usuarios al workspace
export const CAN_INVITE: Role[] = ['owner', 'admin']

// Roles que un admin puede asignar (no puede crear otros owners)
export const INVITABLE_ROLES: Role[] = ['admin', 'member', 'viewer']

// Tabla de permisos por acción
export const PERMISSIONS = {
  // Contactos
  'contacts:read':   ['owner', 'admin', 'member', 'viewer'] as Role[],
  'contacts:write':  ['owner', 'admin', 'member']           as Role[],
  'contacts:delete': ['owner', 'admin']                     as Role[],

  // Deals
  'deals:read':      ['owner', 'admin', 'member', 'viewer'] as Role[],
  'deals:write':     ['owner', 'admin', 'member']           as Role[],
  'deals:delete':    ['owner', 'admin']                     as Role[],

  // Webhooks
  'webhooks:read':   ['owner', 'admin']                     as Role[],
  'webhooks:write':  ['owner', 'admin']                     as Role[],

  // Pipelines
  'pipelines:read':  ['owner', 'admin', 'member', 'viewer'] as Role[],
  'pipelines:write': ['owner', 'admin']                     as Role[],

  // Equipo
  'team:read':       ['owner', 'admin']                     as Role[],
  'team:invite':     ['owner', 'admin']                     as Role[],
  'team:remove':     ['owner']                              as Role[],

  // API Keys
  'apikeys:manage':  ['owner', 'admin']                     as Role[],
} as const

export type Permission = keyof typeof PERMISSIONS

/** Verifica si un rol tiene un permiso dado */
export function hasPermission(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly string[]).includes(role)
}
