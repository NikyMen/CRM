'use client'

import { useQuery } from '@tanstack/react-query'
import { BASE_URL, brandingApi } from '@/lib/api'
import { brand } from '@/lib/brand'

export const BRANDING_KEY = ['branding'] as const

/** La API devuelve rutas relativas a /api/v1 (`/branding/assets/logo?v=…`). */
const assetUrl = (path: string | null | undefined) => (path ? `${BASE_URL}${path}` : null)

/**
 * Marca visible: lo cargado en Configuración → Marca y, para lo que falte, la del
 * .env (`lib/brand.ts`). `ready` evita mostrar un instante el logo del .env antes
 * del cargado.
 */
export function useBranding() {
  const query = useQuery({
    queryKey: BRANDING_KEY,
    queryFn: () => brandingApi.get().then((response) => response.data),
    staleTime: 5 * 60 * 1000,
  })
  const data = query.data
  return {
    ...brand,
    name: data?.name ?? brand.name,
    tagline: data?.tagline ?? brand.tagline,
    logo: assetUrl(data?.logo) ?? brand.logo,
    logoOnDark: assetUrl(data?.logoDark) ?? brand.logoOnDark,
    favicon: assetUrl(data?.favicon) ?? brand.favicon,
    custom: data ?? null,
    ready: query.isFetched || query.isError,
  }
}
