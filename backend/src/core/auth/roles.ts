// ─── Roles del sistema ────────────────────────────────────────────
// Cada workspace tiene usuarios con estos roles.
// La jerarquía es: owner > regional_manager > branch_manager > vendor

export const ROLES = ['owner', 'regional_manager', 'branch_manager', 'vendor'] as const
export type Role = typeof ROLES[number]

// Roles que pueden invitar a otros usuarios al workspace
export const CAN_INVITE: Role[] = ['owner', 'regional_manager']

// Roles que se pueden asignar (no se puede crear otro owner desde la invitación)
export const INVITABLE_ROLES: Role[] = ['regional_manager', 'branch_manager', 'vendor']

// Tabla de permisos por acción
export const PERMISSIONS = {
  // Contactos
  'contacts:read':   ['owner', 'regional_manager', 'branch_manager', 'vendor'] as Role[],
  'contacts:write':  ['owner', 'regional_manager', 'branch_manager']           as Role[], // vendor es de lectura estricta
  'contacts:delete': ['owner', 'regional_manager', 'branch_manager']           as Role[],

  // Deals
  'deals:read':      ['owner', 'regional_manager', 'branch_manager', 'vendor'] as Role[],
  'deals:write':     ['owner', 'regional_manager', 'branch_manager']           as Role[], // vendor es de lectura estricta
  'deals:delete':    ['owner', 'regional_manager', 'branch_manager']           as Role[],

  // Webhooks
  'webhooks:read':   ['owner'] as Role[],
  'webhooks:write':  ['owner'] as Role[],

  // Pipelines
  'pipelines:read':  ['owner', 'regional_manager', 'branch_manager', 'vendor'] as Role[],
  'pipelines:write': ['owner']                                                 as Role[],

  // Equipo
  'team:read':       ['owner', 'regional_manager', 'branch_manager'] as Role[],
  'team:invite':     ['owner', 'regional_manager']                   as Role[],
  'team:remove':     ['owner']                                       as Role[],

  // API Keys
  'apikeys:manage':  ['owner'] as Role[],
} as const

export type Permission = keyof typeof PERMISSIONS

/** Verifica si un rol tiene un permiso dado */
export function hasPermission(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly string[]).includes(role)
}
