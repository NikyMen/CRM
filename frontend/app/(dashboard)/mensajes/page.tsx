'use client'

import { useQuery } from '@tanstack/react-query'
import { pipelinesApi } from '@/lib/api'
import type { Pipeline } from '@/types'
import { LeadBoard } from '@/components/leads/LeadBoard'
import { EmptyState, ErrorState, LoadingState, PageFrame } from '@/components/romez/OperationalUI'
import { getErrorMessage } from '@/lib/format'

/** Bandeja de Mensajes: el tablero del embudo principal con las tres redes y filtro por red. */
export default function MessagesPage() {
  const pipelines = useQuery<Pipeline[]>({ queryKey: ['pipelines'], queryFn: () => pipelinesApi.list().then((response) => response.data) })
  if (pipelines.isLoading) return <PageFrame><LoadingState label="Abriendo el tablero de mensajes…" /></PageFrame>
  if (pipelines.isError) return <PageFrame><ErrorState message={getErrorMessage(pipelines.error)} retry={() => pipelines.refetch()} /></PageFrame>
  const pipeline = pipelines.data?.find((item) => item.isDefault) ?? pipelines.data?.[0]
  if (!pipeline) return <PageFrame><EmptyState title="Todavía no hay un tablero" description="Falta crear el embudo del espacio de trabajo." /></PageFrame>
  return <LeadBoard pipelineId={pipeline.id} variant="messages" />
}
