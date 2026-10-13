'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export const TOPBAR_SLOT_ID = 'romez-topbar-slot'

/** Lugar de la barra superior del layout donde cada página puede poner su título y acciones. */
export function TopbarSlot() {
  return <div id={TOPBAR_SLOT_ID} className="flex min-w-0 flex-1 items-center gap-3" />
}

/** Renderiza su contenido dentro de la barra superior, en lugar del encabezado de la página. */
export function TopbarContent({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  useEffect(() => setTarget(document.getElementById(TOPBAR_SLOT_ID)), [])
  return target ? createPortal(children, target) : null
}
