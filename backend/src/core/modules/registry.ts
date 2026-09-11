// ─── Registro de módulos del producto ─────────────────────────────
// Fuente de verdad de qué módulos existen y cuáles se pueden apagar
// desde Configuración. El frontend tiene un espejo de esta lista en
// `frontend/lib/modules.ts`; si agregás uno acá, agregalo allá también.

export const MODULE_KEYS = [
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

export interface ModuleDefinition {
  key: ModuleKey
  label: string
  description: string
  /** Si el workspace no configuró nada todavía, este es el estado inicial. */
  defaultEnabled: boolean
}

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
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

/** Inicio y Configuración no se pueden apagar: sin ellos no hay forma de volver. */
export const ALWAYS_ON_PATHS = ['/dashboard', '/settings'] as const

const DEFINITION_BY_KEY = new Map(MODULE_DEFINITIONS.map((item) => [item.key, item]))

export function isModuleKey(value: string): value is ModuleKey {
  return DEFINITION_BY_KEY.has(value as ModuleKey)
}

export type ModuleState = Record<ModuleKey, boolean>

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

/**
 * Lee el estado de módulos guardado en `workspace.settings`.
 * Acepta el flag histórico `stockVisible` para no perder la
 * configuración de los workspaces que ya lo tenían apagado.
 */
export function readModuleState(settings: unknown): ModuleState {
  const root = asRecord(settings)
  const stored = asRecord(root.modules)
  const state = {} as ModuleState

  for (const definition of MODULE_DEFINITIONS) {
    const value = stored[definition.key]
    state[definition.key] = typeof value === 'boolean' ? value : definition.defaultEnabled
  }

  if (typeof stored.stock !== 'boolean' && typeof root.stockVisible === 'boolean') {
    state.stock = root.stockVisible
  }

  return state
}

/** Aplica cambios parciales sobre el estado actual, ignorando claves desconocidas. */
export function mergeModuleState(current: ModuleState, patch: Record<string, boolean | undefined>): ModuleState {
  const next = { ...current }
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === 'boolean' && isModuleKey(key)) next[key] = value
  }
  return next
}

/** Serializa el estado dentro de `workspace.settings` conservando el resto de las claves. */
export function writeModuleState(settings: unknown, state: ModuleState): Record<string, unknown> {
  return {
    ...asRecord(settings),
    modules: { ...state },
    stockVisible: state.stock,
  }
}
