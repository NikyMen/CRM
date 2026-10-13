'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingState, PageFrame } from '@/components/romez/OperationalUI'

/** Atención al cliente quedó unificada con Tickets: los enlaces viejos siguen funcionando. */
export default function CustomerServicePage() {
  const router = useRouter()
  useEffect(() => { router.replace(`/tickets${window.location.search}`) }, [router])
  return <PageFrame><LoadingState label="Abriendo la bandeja de tickets…" /></PageFrame>
}
