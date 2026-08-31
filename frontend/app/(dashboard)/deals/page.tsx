'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { pipelinesApi } from '@/lib/api'
import { usePathname, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function DealsPage() {
  const router = useRouter()
  const pathname = usePathname()

  const { data: pipelines, isLoading } = useQuery({
    queryKey: ['pipelines'],
    queryFn: () => pipelinesApi.list().then((response) => response.data),
  })

  useEffect(() => {
    if (pathname === '/deals') {
      router.replace('/leads')
      return
    }

    const defaultPipeline = pipelines?.find((pipeline: { isDefault?: boolean }) => pipeline.isDefault)
    if (defaultPipeline || pipelines?.length) {
      router.push(`/leads/${defaultPipeline?.id ?? pipelines![0].id}`)
    }
  }, [pathname, pipelines, router])

  if (isLoading || pipelines?.length) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <Loader2 className="animate-spin text-primary-500" size={40} />
      </div>
    )
  }

  return null
}
