// Espejo de `backend/src/core/modules/registry.ts`.
// Si agregás un módulo allá, agregalo acá con su ruta.

export const MODULE_KEYS = [
  'home',
  'clients',
  'sales',
  'commercial',
  'collections',
  'customer-service',
  'tickets',
  'internal-chat',
  'stock',
  'team',
  'integrations',
] as const

export type ModuleKey = typeof MODULE_KEYS[number]
export type ModuleState = Record<ModuleKey, boolean>

export type ModuleDefinition = {
  key: ModuleKey
  label: string
  description: string
  defaultEnabled: boolean
}

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  { key: 'home', label: 'Inicio', description: 'Panel de resumen con los indicadores del estudio.', defaultEnabled: true },
  { key: 'clients', label: 'Clientes', description: 'Legajo de clientes, responsables y documentos.', defaultEnabled: true },
  { key: 'sales', label: 'Ventas', description: 'Registro de ventas con ítems, totales y comprobantes.', defaultEnabled: true },
  { key: 'commercial', label: 'Gestión comercial', description: 'Leads, embudos y negocios.', defaultEnabled: true },
  { key: 'collections', label: 'Cobranzas', description: 'Cuentas por cobrar, pagos y planes recurrentes.', defaultEnabled: true },
  { key: 'customer-service', label: 'Atención al cliente', description: 'Bandeja de WhatsApp y atención.', defaultEnabled: true },
  { key: 'tickets', label: 'Tickets', description: 'Pedidos internos y seguimiento.', defaultEnabled: true },
  { key: 'internal-chat', label: 'Chat interno', description: 'Mensajería entre el equipo.', defaultEnabled: true },
  { key: 'stock', label: 'Stock', description: 'Inventario, movimientos y caja.', defaultEnabled: false },
  { key: 'team', label: 'Equipo', description: 'Miembros del estudio, invitaciones y roles.', defaultEnabled: true },
  { key: 'integrations', label: 'Integraciones', description: 'Webhooks, API Keys y el endpoint de Meta API.', defaultEnabled: true },
]

export const DEFAULT_MODULE_STATE: ModuleState = MODULE_DEFINITIONS.reduce((state, definition) => {
  state[definition.key] = definition.defaultEnabled
  return state
}, {} as ModuleState)

/**
 * Rutas del dashboard que dependen de cada módulo. Cubre todas las páginas
 * salvo Configuración, que nunca se apaga.
 */
export const MODULE_PATHS: Record<ModuleKey, string[]> = {
  home: ['/dashboard'],
  clients: ['/clients'],
  sales: ['/sales'],
  commercial: ['/commercial', '/leads', '/deals', '/pipelines', '/contacts'],
  collections: ['/collections'],
  'customer-service': ['/customer-service', '/whatsapp', '/inbox', '/channels', '/messenger-instagram'],
  tickets: ['/tickets'],
  'internal-chat': ['/internal-chat'],
  stock: ['/stock'],
  team: ['/team'],
  integrations: ['/webhooks', '/api-keys', '/api-meta'],
}

export function normalizeModuleState(value: unknown): ModuleState {
  const stored = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const state = { ...DEFAULT_MODULE_STATE }
  for (const definition of MODULE_DEFINITIONS) {
    const flag = stored[definition.key]
    if (typeof flag === 'boolean') state[definition.key] = flag
  }
  return state
}

/** Devuelve el módulo dueño de una ruta, o null si la ruta es siempre visible. */
export function moduleForPath(pathname: string): ModuleKey | null {
  for (const key of MODULE_KEYS) {
    const owned = MODULE_PATHS[key].some((path) => pathname === path || pathname.startsWith(path + '/'))
    if (owned) return key
  }
  return null
}

export function isPathEnabled(pathname: string, modules: ModuleState) {
  const key = moduleForPath(pathname)
  return key ? modules[key] : true
}
