'use client'

import { useParams } from 'next/navigation'
import { LeadBoard } from '@/components/leads/LeadBoard'

export default function KanbanPage() {
  const { pipelineId } = useParams<{ pipelineId: string }>()
  return <LeadBoard pipelineId={pipelineId} />
}
