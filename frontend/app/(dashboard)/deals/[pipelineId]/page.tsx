'use client'

import { startTransition, useEffect, useState } from 'react'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dealsApi, whatsappApi } from '@/lib/api'
import { auth } from '@/lib/auth'
import { useToast } from '@/components/ui/toast'
import type { KanbanBoard, KanbanCard, KanbanColumn, WhatsAppMessagesPayload } from '@/types'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Modifier,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS, getEventCoordinates } from '@dnd-kit/utilities'
import { DollarSign, GripVertical, Loader2, MessageCircle, Send, Trash2, X } from 'lucide-react'
import clsx from 'clsx'

function chatTitle(deal: KanbanCard) {
  const chat = deal.chat
  return chat?.contactName ?? chat?.displayName ?? deal.title ?? chat?.phoneNumber ?? chat?.jid ?? 'Sin chat vinculado'
}

function chatPhone(deal: KanbanCard) {
  const explicit = deal.chat?.phoneNumber
  if (explicit) return explicit
  const match = deal.chat?.jid.match(/^(\d+)(?=@s\.whatsapp\.net$)/)
  return match?.[1] ?? 'Sin telefono'
}

function chatInitial(deal: KanbanCard) {
  return chatTitle(deal).slice(0, 1).toUpperCase()
}

function formatMessageTime(value?: string | null) {
  if (!value) return ''
  return new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function recalcColumn(column: KanbanColumn): KanbanColumn {
  const deals = column.deals.map((deal, position) => ({ ...deal, position }))
  return {
    ...column,
    deals,
    count: deals.length,
    totalValue: deals.reduce((sum, deal) => sum + (deal.value ?? 0), 0),
  }
}

function findColumn(board: KanbanBoard, id: string) {
  return board.columns.find((column) =>
    column.stage.id === id || column.deals.some((deal) => deal.id === id)
  )
}

function moveCard(board: KanbanBoard, activeId: string, overId: string): KanbanBoard {
  const sourceColumn = findColumn(board, activeId)
  const targetColumn = findColumn(board, overId)
  if (!sourceColumn || !targetColumn) return board

  const activeDeal = sourceColumn.deals.find((deal) => deal.id === activeId)
  if (!activeDeal) return board

  const targetIndexFromOver = targetColumn.stage.id === overId
    ? targetColumn.deals.length
    : targetColumn.deals.findIndex((deal) => deal.id === overId)
  const targetIndex = targetIndexFromOver < 0 ? targetColumn.deals.length : targetIndexFromOver

  if (sourceColumn.stage.id === targetColumn.stage.id) {
    const currentIndex = sourceColumn.deals.findIndex((deal) => deal.id === activeId)
    if (currentIndex === targetIndex) return board

    const nextDeals = sourceColumn.deals.filter((deal) => deal.id !== activeId)
    nextDeals.splice(Math.min(targetIndex, nextDeals.length), 0, activeDeal)

    return {
      ...board,
      columns: board.columns.map((column) =>
        column.stage.id === sourceColumn.stage.id ? recalcColumn({ ...column, deals: nextDeals }) : column
      ),
    }
  }

  const sourceDeals = sourceColumn.deals.filter((deal) => deal.id !== activeId)
  const targetDeals = [...targetColumn.deals]
  targetDeals.splice(Math.min(targetIndex, targetDeals.length), 0, activeDeal)

  return {
    ...board,
    columns: board.columns.map((column) => {
      if (column.stage.id === sourceColumn.stage.id) return recalcColumn({ ...column, deals: sourceDeals })
      if (column.stage.id === targetColumn.stage.id) return recalcColumn({ ...column, deals: targetDeals })
      return column
    }),
  }
}

const snapOverlayToCursor: Modifier = ({ activatorEvent, draggingNodeRect, overlayNodeRect, transform }) => {
  if (!activatorEvent || !draggingNodeRect || !overlayNodeRect) return transform

  const coordinates = getEventCoordinates(activatorEvent)
  if (!coordinates) return transform

  const cursorOffsetX = coordinates.x - draggingNodeRect.left
  const cursorOffsetY = coordinates.y - draggingNodeRect.top

  return {
    ...transform,
    x: transform.x + cursorOffsetX - overlayNodeRect.width / 2,
    y: transform.y + cursorOffsetY - overlayNodeRect.height / 2,
  }
}

const pointerFirstCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args)
  if (pointerCollisions.length > 0) return pointerCollisions
  return closestCorners(args)
}

function Avatar({ deal, size = 'h-11 w-11', textSize = 'text-sm' }: { deal: KanbanCard; size?: string; textSize?: string }) {
  return (
    <div className={clsx('flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 font-bold text-slate-500', size, textSize)}>
      {deal.chat?.profileImageUrl ? (
        <img
          src={deal.chat.profileImageUrl}
          alt={chatTitle(deal)}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        chatInitial(deal)
      )}
    </div>
  )
}

function DealCard({ deal, onOpen }: { deal: KanbanCard; onOpen: (deal: KanbanCard) => void }) {
  const chat = deal.chat
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: deal.id })
  const stableTransform = transform ? { ...transform, x: 0 } : null

  return (
    <article
      ref={setNodeRef}
      style={{ transform: stableTransform ? CSS.Transform.toString(stableTransform) : undefined, transition }}
      {...attributes}
      className={clsx(
        'group relative rounded-lg border bg-white p-3 text-left shadow-sm outline-none transition-[border-color,box-shadow,opacity] duration-150',
        'select-none',
        isDragging
          ? 'opacity-0'
          : 'border-slate-200 hover:border-emerald-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-emerald-400/40'
      )}
      onClick={() => onOpen(deal)}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-label="Arrastrar lead"
          className="mt-0.5 flex h-8 w-7 shrink-0 cursor-grab items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing"
          onClick={(event) => event.stopPropagation()}
          {...listeners}
        >
          <GripVertical size={17} />
        </button>
        <Avatar deal={deal} />
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold leading-5 text-slate-950">{chatTitle(deal)}</p>
          <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{chatPhone(deal)}</p>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2">
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-emerald-950/75">
          {chat?.lastMessageFromMe ? 'Tu: ' : ''}{chat?.lastMessagePreview ?? 'Sin preview disponible.'}
        </p>
        {chat?.lastMessageAt ? (
          <p className="mt-1 text-[11px] font-semibold text-slate-400">{formatMessageTime(chat.lastMessageAt)}</p>
        ) : null}
      </div>
    </article>
  )
}

function KanbanColumnComponent({ column, onOpenDeal }: { column: KanbanColumn; onOpenDeal: (deal: KanbanCard) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.stage.id })

  return (
    <section className="flex max-h-full w-80 shrink-0 flex-col rounded-2xl border border-slate-200/70 bg-slate-50/80 shadow-sm">
      <div className="sticky top-0 z-10 rounded-t-2xl border-b border-slate-200/70 bg-white/80 p-4 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="h-3 w-3 shrink-0 rounded-full border border-black/5 shadow-inner" style={{ backgroundColor: column.stage.color }} />
            <span className="truncate text-sm font-extrabold tracking-tight text-slate-950">{column.stage.name}</span>
            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600 shadow-sm">
              {column.count}
            </span>
          </div>
        </div>
        {column.totalValue > 0 ? (
          <p className="mt-2 flex items-center gap-1 text-xs font-bold text-slate-600">
            <DollarSign size={12} strokeWidth={2.5} /> {column.totalValue.toLocaleString()}
          </p>
        ) : null}
      </div>

      <div
        ref={setNodeRef}
        className={clsx(
          'flex-1 space-y-3 overflow-y-auto rounded-b-2xl border-2 p-3 transition-colors duration-150',
          isOver ? 'border-dashed border-emerald-300 bg-emerald-50/70' : 'border-transparent'
        )}
      >
        <SortableContext items={column.deals.map((deal) => deal.id)} strategy={verticalListSortingStrategy}>
          {column.deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} onOpen={onOpenDeal} />
          ))}
        </SortableContext>

        {column.deals.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 px-3 py-6 text-center text-xs font-semibold leading-5 text-slate-400">
            Sin chats en esta etapa
          </div>
        ) : null}
      </div>
    </section>
  )
}

function LeadChatModal({
  deal,
  onClose,
  onDeleteLead,
  canDeleteLead,
  isDeletingLead,
}: {
  deal: KanbanCard | null
  onClose: () => void
  onDeleteLead: (deal: KanbanCard) => void
  canDeleteLead: boolean
  isDeletingLead: boolean
}) {
  const [text, setText] = useState('')
  const queryClient = useQueryClient()
  const jid = deal?.chat?.jid ?? null

  const messagesQuery = useQuery<WhatsAppMessagesPayload>({
    queryKey: ['lead-chat-messages', jid],
    queryFn: () => whatsappApi.listMessages(jid!, { limit: 80 }).then((response) => response.data),
    enabled: Boolean(jid),
    refetchInterval: jid ? 5000 : false,
  })

  const sendMutation = useMutation({
    mutationFn: () => whatsappApi.sendMessage(jid!, text.trim()),
    onSuccess: () => {
      setText('')
      queryClient.invalidateQueries({ queryKey: ['lead-chat-messages', jid] })
      queryClient.invalidateQueries({ queryKey: ['kanban'] })
    },
  })

  if (!deal) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <section className="flex h-[min(760px,90vh)] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar deal={deal} size="h-12 w-12" />
            <div className="min-w-0">
              <p className="truncate text-base font-extrabold text-slate-950">{chatTitle(deal)}</p>
              <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{chatPhone(deal)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canDeleteLead ? (
              <button
                type="button"
                onClick={() => onDeleteLead(deal)}
                disabled={isDeletingLead}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-rose-200 px-3 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDeletingLead ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Eliminar lead
              </button>
            ) : null}
            <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 px-5 py-4">
          {!jid ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
              Este lead no tiene chat de WhatsApp vinculado.
            </div>
          ) : messagesQuery.isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="animate-spin text-emerald-500" size={28} />
            </div>
          ) : (
            (messagesQuery.data?.items ?? []).map((message) => (
              <div key={message.id} className={clsx('flex', message.fromMe ? 'justify-end' : 'justify-start')}>
                <div className={clsx(
                  'max-w-[78%] rounded-lg px-3 py-2 text-sm leading-6 shadow-sm',
                  message.fromMe ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-white text-slate-900'
                )}>
                  <p className="whitespace-pre-wrap">{message.text ?? `[${message.messageType}]`}</p>
                  <p className={clsx('mt-1 text-[11px] font-semibold', message.fromMe ? 'text-emerald-50/80' : 'text-slate-400')}>
                    {formatMessageTime(message.sentAt)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        <footer className="flex shrink-0 items-end gap-3 border-t border-slate-200 bg-white p-4">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={2}
            disabled={!jid || sendMutation.isPending}
            placeholder="Escribir mensaje"
            className="min-h-12 flex-1 resize-none rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50"
          />
          <button
            type="button"
            onClick={() => text.trim() && sendMutation.mutate()}
            disabled={!jid || !text.trim() || sendMutation.isPending}
            className="flex h-12 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sendMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Enviar
          </button>
        </footer>
      </section>
    </div>
  )
}

export default function KanbanPage() {
  const { pipelineId } = useParams<{ pipelineId: string }>()
  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const storedAuth = auth.get()
  const canDeleteLead = storedAuth?.role === 'owner' || storedAuth?.role === 'admin'
  const [activeId, setActiveId] = useState<string | null>(null)
  const [openDeal, setOpenDeal] = useState<KanbanCard | null>(null)

  useEffect(() => {
    if (pathname.startsWith('/deals/')) {
      router.replace(`/leads/${pipelineId}`)
    }
  }, [pathname, pipelineId, router])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  )

  const { data: board, isLoading } = useQuery<KanbanBoard>({
    queryKey: ['kanban', pipelineId],
    queryFn: () => dealsApi.getKanban(pipelineId).then((response) => response.data),
  })

  const moveMutation = useMutation({
    mutationFn: ({ dealId, stageId, position }: { dealId: string; stageId: string; position: number }) =>
      dealsApi.move(dealId, stageId, position),
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban', pipelineId] })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban', pipelineId] })
    },
  })

  const deleteLeadMutation = useMutation({
    mutationFn: (dealId: string) => dealsApi.delete(dealId),
    onSuccess: () => {
      setOpenDeal(null)
      queryClient.invalidateQueries({ queryKey: ['kanban', pipelineId] })
      toast({ type: 'success', title: 'Lead eliminado' })
    },
    onError: (error: any) => {
      toast({
        type: 'error',
        title: 'No se pudo eliminar el lead',
        description: error?.response?.data?.message ?? error?.message ?? 'Error inesperado.',
      })
    },
  })

  const activeDeal = board?.columns.flatMap((column) => column.deals).find((deal) => deal.id === activeId)

  function handleOpenDeal(deal: KanbanCard) {
    startTransition(() => setOpenDeal(deal))
  }

  function handleDeleteLead(deal: KanbanCard) {
    if (!canDeleteLead) return
    if (!window.confirm(`Vas a eliminar el lead "${chatTitle(deal)}". Esta accion lo saca del tablero.`)) return
    deleteLeadMutation.mutate(deal.id)
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  function handleDragOver(event: DragOverEvent) {
    const overId = event.over?.id as string | undefined
    const draggedId = event.active.id as string
    if (!overId || draggedId === overId) return

    queryClient.setQueryData<KanbanBoard>(['kanban', pipelineId], (current) =>
      current ? moveCard(current, draggedId, overId) : current
    )
  }

  function handleDragEnd(event: DragEndEvent) {
    const dealId = event.active.id as string
    const latestBoard = queryClient.getQueryData<KanbanBoard>(['kanban', pipelineId])
    setActiveId(null)
    if (!latestBoard) return

    const targetColumn = latestBoard.columns.find((column) => column.deals.some((deal) => deal.id === dealId))
    if (!targetColumn) return

    const targetPosition = targetColumn.deals.findIndex((deal) => deal.id === dealId)
    if (targetPosition < 0) return

    moveMutation.mutate({
      dealId,
      stageId: targetColumn.stage.id,
      position: targetPosition,
    })
  }

  function handleDragCancel() {
    setActiveId(null)
    queryClient.invalidateQueries({ queryKey: ['kanban', pipelineId] })
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="animate-spin text-emerald-500" size={32} />
      </div>
    )
  }

  if (!board) return null

  const totalDeals = board.columns.reduce((sum, column) => sum + column.count, 0)
  const totalValue = board.columns.reduce((sum, column) => sum + column.totalValue, 0)

  return (
    <div className="relative flex h-full flex-col bg-white">
      <header className="sticky top-0 z-10 shrink-0 border-b border-slate-200 bg-white px-8 py-6">
        <div className="flex items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">Leads con chat</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-500">
              <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{board.pipeline.name}</span>
              <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{totalDeals} leads activos</span>
              {totalValue > 0 ? (
                <span className="rounded-md border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                  Monto proyectado: ${totalValue.toLocaleString()}
                </span>
              ) : null}
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-x-auto p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={pointerFirstCollisionDetection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="flex h-full items-start gap-3">
            {board.columns.map((column) => (
              <KanbanColumnComponent key={column.stage.id} column={column} onOpenDeal={handleOpenDeal} />
            ))}
          </div>

          <DragOverlay adjustScale={false} dropAnimation={null} modifiers={[snapOverlayToCursor]}>
            {activeDeal ? (
              <div className="w-[296px] cursor-grabbing rounded-xl border border-emerald-300 bg-white p-3 shadow-xl shadow-slate-900/15">
                <div className="flex items-start gap-3">
                  <Avatar deal={activeDeal} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold leading-5 text-slate-950">{chatTitle(activeDeal)}</p>
                    <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{chatPhone(activeDeal)}</p>
                  </div>
                </div>
                <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/70 px-2.5 py-2 text-xs font-bold text-emerald-800">
                  <MessageCircle size={13} className="mr-1.5 inline" />
                  {activeDeal.chat?.lastMessagePreview ?? 'Chat activo'}
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <LeadChatModal
        deal={openDeal}
        onClose={() => setOpenDeal(null)}
        onDeleteLead={handleDeleteLead}
        canDeleteLead={Boolean(canDeleteLead)}
        isDeletingLead={deleteLeadMutation.isPending}
      />
    </div>
  )
}
