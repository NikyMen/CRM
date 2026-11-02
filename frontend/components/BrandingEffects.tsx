'use client'

import { useEffect } from 'react'
import { brand } from '@/lib/brand'
import { useBranding } from '@/lib/useBranding'

/**
 * Título de la pestaña y favicon se fijan al compilar (`app/layout.tsx`). Si en
 * Configuración → Marca hay otros, se aplican acá en el navegador. Next vuelve a
 * escribir el <head> al navegar, así que se reaplican cada vez que cambia.
 */
export function BrandingEffects() {
  const { custom, favicon } = useBranding()
  const name = custom?.name && custom.name !== brand.name ? custom.name : null
  const icon = custom?.favicon ? favicon : null

  useEffect(() => {
    if (!name && !icon) return
    const apply = () => {
      if (name && document.title.includes(brand.name) && !document.title.includes(name)) {
        document.title = document.title.split(brand.name).join(name)
      }
      if (icon) {
        const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'))
        if (!links.length) {
          const link = document.createElement('link')
          link.rel = 'icon'
          document.head.appendChild(link)
          links.push(link)
        }
        for (const link of links) {
          if (link.getAttribute('href') === icon) continue
          link.removeAttribute('type')
          link.removeAttribute('sizes')
          link.setAttribute('href', icon)
        }
      }
    }
    apply()
    const observer = new MutationObserver(apply)
    observer.observe(document.head, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['href'] })
    return () => observer.disconnect()
  }, [name, icon])

  return null
}
