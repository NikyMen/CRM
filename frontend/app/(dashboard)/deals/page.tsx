'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { pipelinesApi } from '@/lib/api'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowRight, KanbanSquare, Loader2 } from 'lucide-react'

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

    if (pipelines?.length === 1) {
      router.push(`/leads/${pipelines[0].id}`)
    }
  }, [pathname, pipelines, router])

  if (isLoading || pipelines?.length === 1) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <Loader2 className="animate-spin text-primary-500" size={40} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl animate-fade-in p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Leads con chat</h1>
        <p className="mt-1 font-medium text-slate-500">
          Selecciona un pipeline para administrar solo leads vinculados a una conversacion
        </p>
      </div>

      <div className="grid max-w-3xl grid-cols-1 gap-4 md:grid-cols-2">
        {pipelines?.map((pipeline: any) => (
          <button
            key={pipeline.id}
            onClick={() => router.push(`/leads/${pipeline.id}`)}
            className="interactive-card group flex items-center justify-between p-5 text-left"
          >
            <div className="flex items-center gap-4">
              <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-primary-100 bg-primary-50 text-primary-600 shadow-sm">
                <KanbanSquare size={20} className="relative z-10 text-primary-600" strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-lg font-bold tracking-tight text-slate-900 transition-colors group-hover:text-primary-600">{pipeline.name}</p>
                <p className="mt-0.5 text-sm font-medium text-slate-500">{pipeline.stages.length} etapas</p>
              </div>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-100 bg-white text-slate-400 transition-all group-hover:border-primary-100 group-hover:bg-primary-50 group-hover:text-primary-600">
              <ArrowRight size={16} strokeWidth={2.5} />
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
