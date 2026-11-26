// Ajustes de la interfaz por instalación (cliente), fijados al compilar como la marca.
// Next inlinea `process.env.NEXT_PUBLIC_*`: cambiarlos exige recompilar.

export type UserMenuItem = 'notifications' | 'settings' | 'team'

/**
 * `NEXT_PUBLIC_USER_MENU_HIDE`: entradas del menú del usuario que no se muestran, separadas
 * por coma (por ejemplo `notifications,settings`). Ocultarlas no bloquea las páginas: a
 * Configuración se sigue entrando por la URL `/settings`.
 */
const hidden = new Set(
  (process.env.NEXT_PUBLIC_USER_MENU_HIDE ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean),
)

export function userMenuItemVisible(item: UserMenuItem) {
  return !hidden.has(item)
}
