'use client'

import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dealsApi, pipelinesApi, whatsappApi } from '@/lib/api'
import { auth } from '@/lib/auth'
import { useToast } from '@/components/ui/toast'
import type { KanbanBoard, KanbanCard, KanbanColumn, Pipeline, WhatsAppMessagesPayload } from '@/types'
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
import { Building2, Check, CheckCheck, ChevronDown, Hourglass, Loader2, Pencil, Search, Send, Settings, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import clsx from 'clsx'
import { ChatIdentityPanel } from '@/components/ChatIdentityPanel'
import PipelinesPage from '../../pipelines/page'
import { WhatsAppLogo } from '@/components/WhatsAppLogo'
import { COMMERCIAL_WHATSAPP, LineWhatsAppLinkDialog, LineWhatsAppPanel, useLineWhatsAppSession } from '@/components/romez/LineWhatsAppPanel'
import { chatListTime, messageTime, WaAvatar } from '@/components/romez/WaChatBits'

function chatTitle(deal: KanbanCard) {
  const chat = deal.chat
  return chat?.contactName ?? chat?.displayName ?? deal.title ?? chat?.phoneNumber ?? chat?.jid ?? 'Sin chat vinculado'
}

function chatPhone(deal: KanbanCard) {
  const raw = deal.chat?.phoneNumber ?? deal.chat?.jid.match(/^(\d+)(?=@s\.whatsapp\.net$)/)?.[1]
  if (!raw) return 'Sin teléfono'
  const digits = raw.replace(/\D/g, '')
  const paraguay = digits.match(/^595(\d{3})(\d{3})(\d{3})$/)
  if (paraguay) return `+595 ${paraguay[1]} ${paraguay[2]} ${paraguay[3]}`
  return digits ? `+${digits}` : raw
}

function matchesSearch(deal: KanbanCard, term: string) {
  if (!term) return true
  const digits = term.replace(/\D/g, '')
  return [chatTitle(deal), deal.title, deal.leadNumber, deal.chat?.lastMessagePreview].some((value) => value?.toLowerCase().includes(term))
    || Boolean(digits && (deal.chat?.phoneNumber ?? deal.chat?.jid ?? '').includes(digits))
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

function DealAvatar({ deal, className }: { deal: KanbanCard; className?: string }) {
  return <WaAvatar id={deal.id} name={chatTitle(deal)} imageUrl={deal.chat?.profileImageUrl} className={className} />
}

/** Contenido de la tarjeta, común a la tarjeta del tablero y a la que se ve mientras se arrastra. */
function DealCardBody({ deal }: { deal: KanbanCard }) {
  const chat = deal.chat
  const title = chatTitle(deal)
  const phone = chatPhone(deal)
  const unread = chat?.unreadCount ?? 0
  return <>
    <div className="flex items-center gap-2.5">
      <span className="relative">
        <DealAvatar deal={deal} className="h-9 w-9 text-xs" />
        {unread ? <span aria-hidden className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--wa-green)] ring-2 ring-[var(--paper)]" /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className={clsx('truncate text-sm leading-5 text-[var(--ink-primary)]', unread ? 'font-bold' : 'font-semibold')}>{title}</p>
        {phone.replace(/\D/g, '') !== title.replace(/\D/g, '') ? <p className="truncate text-[11px] text-[var(--ink-tertiary)]">{phone}</p> : null}
      </div>
      {chat?.lastMessageAt ? <span className={clsx('shrink-0 self-start text-[11px]', unread ? 'font-semibold text-[var(--wa-green)]' : 'text-[var(--ink-muted)]')}>{chatListTime(chat.lastMessageAt)}</span> : null}
    </div>
    <p className="mt-2 line-clamp-2 text-xs leading-[1.125rem] text-[var(--ink-secondary)]">
      {chat?.lastMessageFromMe ? <CheckCheck size={13} className="mr-1 inline -translate-y-px text-[var(--ink-muted)]" aria-label="Vos:" /> : null}
      {chat?.lastMessagePreview ?? (chat ? 'Sin mensajes todavía.' : 'Sin chat vinculado.')}
    </p>
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
      <span className="rounded-full bg-[var(--paper-inset)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ink-tertiary)]">#{deal.leadNumber}</span>
      {chat?.source === 'commercial' ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--wa-green-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--wa-green)]" title="Vino del WhatsApp comercial"><WhatsAppLogo size={10} /> Comercial</span> : null}
      {unread ? <span className="rounded-full bg-[var(--wa-green)] px-2 py-0.5 text-[10px] font-bold text-white">{unread} sin leer</span> : null}
      {deal.isRotten ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--warning-paper)] px-2 py-0.5 text-[10px] font-semibold text-[var(--warning)]" title="Lleva demasiado tiempo en esta etapa"><Hourglass size={10} /> {deal.daysInStage} d quieto</span> : deal.daysInStage > 0 ? <span className="text-[10px] text-[var(--ink-muted)]">{deal.daysInStage} d en la etapa</span> : null}
      {deal.companyId ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--ast-accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ast-accent)]"><Building2 size={10} /> Cliente</span> : null}
    </div>
  </>
}

function DealCard({ deal, onOpen }: { deal: KanbanCard; onOpen: (deal: KanbanCard) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: deal.id })
  const stableTransform = transform ? { ...transform, x: 0 } : null

  return (
    <article
      ref={setNodeRef}
      style={{ transform: stableTransform ? CSS.Transform.toString(stableTransform) : undefined, transition }}
      {...attributes}
      {...listeners}
      aria-label={`${chatTitle(deal)}: abrir la conversación o arrastrar para cambiar de etapa`}
      title="Clic para abrir la conversación · arrastrá para cambiar de etapa"
      className={clsx(
        'group relative cursor-grab select-none rounded-2xl bg-[var(--paper)] p-3 text-left outline-none ring-1 transition-[box-shadow,opacity] duration-150 active:cursor-grabbing',
        isDragging
          ? 'opacity-0'
          : 'shadow-[var(--ast-card-shadow)] ring-[var(--line-soft)] hover:shadow-[var(--ast-float-shadow)] hover:ring-[var(--wa-green)]/40 focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]'
      )}
      onClick={() => onOpen(deal)}
      onKeyDown={(event) => { if (event.key === 'Enter') onOpen(deal) }}
    >
      <DealCardBody deal={deal} />
    </article>
  )
}

function columnHint(column: KanbanColumn, total: number) {
  if (column.stage.isWon) return 'Venta ganada'
  if (column.stage.isLost) return 'Venta perdida'
  return total ? `${Math.round((column.count / total) * 100)}% del embudo` : 'Sin leads todavía'
}

function KanbanColumnComponent({ column, deals, total, filtering, onOpenDeal }: { column: KanbanColumn; deals: KanbanCard[]; total: number; filtering: boolean; onOpenDeal: (deal: KanbanCard) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.stage.id })
  const unread = column.deals.filter((deal) => (deal.chat?.unreadCount ?? 0) > 0).length
  const StageIcon = column.stage.isWon ? ThumbsUp : column.stage.isLost ? ThumbsDown : null

  return (
    <section className={clsx('flex max-h-full w-[18.5rem] shrink-0 flex-col overflow-hidden rounded-[1.25rem] bg-[var(--paper-soft)] ring-1 transition', isOver ? 'ring-2 ring-[var(--wa-green)]/50' : 'ring-[var(--line-soft)]')} style={{ borderTop: `4px solid ${column.stage.color}` }}>
      <header className="px-3.5 pb-2.5 pt-3">
        <div className="flex items-center gap-2">
          {StageIcon ? <StageIcon size={14} style={{ color: column.stage.color }} className="shrink-0" /> : <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: column.stage.color }} />}
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--ink-primary)]">{column.stage.name.trim()}</h3>
          {unread ? <span className="rounded-full bg-[var(--wa-green)] px-1.5 py-0.5 text-[10px] font-bold text-white" title={`${unread} con mensajes sin leer`}>{unread}</span> : null}
          <span className="rounded-full bg-[var(--paper)] px-2 py-0.5 text-xs font-semibold text-[var(--ink-secondary)] ring-1 ring-[var(--line-soft)]">{filtering ? `${deals.length}/${column.count}` : column.count}</span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-[var(--ink-muted)]">{columnHint(column, total)}</p>
      </header>

      <div
        ref={setNodeRef}
        className={clsx('min-h-24 flex-1 space-y-2 overflow-y-auto px-2 pb-2 transition-colors duration-150', isOver && 'bg-[var(--wa-green-soft)]')}
      >
        <SortableContext items={deals.map((deal) => deal.id)} strategy={verticalListSortingStrategy}>
          {deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} onOpen={onOpenDeal} />
          ))}
        </SortableContext>

        {deals.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--line)] px-3 py-6 text-center text-xs text-[var(--ink-muted)]">
            {filtering && column.count ? 'Ningún lead coincide con la búsqueda' : 'Arrastrá un lead acá'}
          </div>
        ) : null}
      </div>
    </section>
  )
}

/** Barra del embudo: cuántos leads hay en cada etapa. */
function FunnelBar({ columns, total }: { columns: KanbanColumn[]; total: number }) {
  if (!total) return null
  return (
    <div className="mt-4">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--ast-track)]" role="img" aria-label="Leads por etapa">
        {columns.map((column) => column.count ? <div key={column.stage.id} className="h-full transition-all" style={{ width: `${(column.count / total) * 100}%`, background: column.stage.color }} title={`${column.stage.name.trim()}: ${column.count}`} /> : null)}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {columns.map((column) => (
          <li key={column.stage.id} className="flex items-center gap-1.5 text-xs text-[var(--ink-tertiary)]">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: column.stage.color }} />
            {column.stage.name.trim()} <b className="font-semibold text-[var(--ink-primary)]">{column.count}</b>
            <span className="text-[var(--ink-muted)]">· {Math.round((column.count / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Stat({ value, label, tone = 'default' }: { value: number; label: string; tone?: 'default' | 'green' }) {
  return <span className={clsx('inline-flex items-baseline gap-1 rounded-full px-3 py-1 text-xs', tone === 'green' ? 'bg-[var(--wa-green-soft)] text-[var(--wa-green)]' : 'bg-[var(--paper-inset)] text-[var(--ink-tertiary)]')}><b className={clsx('text-sm font-semibold', tone === 'green' ? 'text-[var(--wa-green)]' : 'text-[var(--ink-primary)]')}>{value}</b> {label}</span>
}

function LeadChatModal({
  deal,
  onClose,
}: {
  deal: KanbanCard | null
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const queryClient = useQueryClient()
  const router = useRouter()
  const { toast } = useToast()
  const currentRole = auth.get()?.role
  const canConvert = Boolean(currentRole && currentRole !== 'viewer')
  const jid = deal?.chat?.jid ?? null

  const messagesQuery = useQuery<WhatsAppMessagesPayload>({
    queryKey: ['whatsapp-messages', jid],
    queryFn: () => whatsappApi.listMessages(jid!, { limit: 80 }).then((response) => response.data),
    enabled: Boolean(jid),
  })

  const sendMutation = useMutation({
    mutationFn: () => whatsappApi.sendMessage(jid!, { text: text.trim() }),
    onSuccess: () => {
      setText('')
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages', jid] })
      queryClient.invalidateQueries({ queryKey: ['kanban'] })
    },
  })

  const convertMutation = useMutation({
    mutationFn: () => dealsApi.convertToClient(deal!.id),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['kanban'] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      toast({ type: 'success', title: response.data.created ? 'Cliente creado' : 'Cliente vinculado', description: 'La oportunidad quedó asociada al legajo contable.' })
      onClose()
      router.push(`/clients/${response.data.client.id}`)
    },
    onError: () => toast({ type: 'error', title: 'No pudimos convertir la oportunidad', description: 'Revisá sus datos y volvé a intentar.' }),
  })

  if (!deal) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
      <section className="ast-rise flex h-[min(760px,90vh)] w-full max-w-3xl flex-col overflow-hidden rounded-[1.5rem] border border-[var(--line-soft)] bg-[var(--paper)] shadow-[var(--ast-float-shadow)]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--line-soft)] px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <DealAvatar deal={deal} className="h-11 w-11 text-sm" />
            <div className="min-w-0">
              <p className="truncate font-display text-[15px] font-semibold text-[var(--ink-primary)]">{chatTitle(deal)}</p>
              <p className="mt-0.5 truncate text-xs text-[var(--ink-tertiary)]">{chatPhone(deal)} · Lead #{deal.leadNumber}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {deal.companyId ? <button type="button" onClick={() => { onClose(); router.push(`/clients/${deal.companyId}`) }} className="btn-secondary"><Building2 size={15} /> Abrir cliente</button> : deal.status === 'WON' && canConvert ? <button type="button" disabled={convertMutation.isPending} onClick={() => convertMutation.mutate()} className="btn-primary"><Building2 size={15} /> {convertMutation.isPending ? 'Convirtiendo…' : 'Convertir en cliente'}</button> : null}
            <button type="button" onClick={onClose} aria-label="Cerrar" className="grid h-9 w-9 place-items-center rounded-full text-[var(--ink-tertiary)] hover:bg-[var(--paper-soft)] hover:text-[var(--ink-primary)]">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="wa-thread flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 lg:flex-row">
          {messagesQuery.data?.chat ? <ChatIdentityPanel chat={messagesQuery.data.chat} /> : null}
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-1">
          {!jid ? (
            <div className="rounded-2xl bg-[var(--warning-paper)] px-4 py-3 text-sm font-semibold text-[var(--warning)]">
              Esta oportunidad no tiene un chat de WhatsApp vinculado.
            </div>
          ) : messagesQuery.isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="animate-spin text-[var(--wa-green)]" size={28} />
            </div>
          ) : (
            (messagesQuery.data?.items ?? []).map((message) => (
              <div key={message.id} className={clsx('flex', message.fromMe ? 'justify-end' : 'justify-start')}>
                <div className={clsx(
                  'max-w-[78%] rounded-xl px-2.5 pb-1 pt-1.5 text-sm leading-5 shadow-[0_1px_0.5px_rgba(11,20,26,.13)]',
                  message.fromMe ? 'rounded-tr-sm bg-[var(--wa-out)] text-[var(--wa-out-ink)]' : 'rounded-tl-sm bg-[var(--wa-in)] text-[var(--ink-primary)]'
                )}>
                  <p className="whitespace-pre-wrap break-words">{message.text ?? `[${message.messageType}]`}</p>
                  <p className="mt-0.5 text-right text-[10px] text-[var(--wa-meta)]">{messageTime(message.sentAt)}</p>
                </div>
              </div>
            ))
          )}
          </div>
        </div>

        <footer className="flex shrink-0 items-end gap-2 border-t border-[var(--line-soft)] bg-[var(--paper)] px-3 py-2.5">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={1}
            disabled={!jid || sendMutation.isPending}
            placeholder="Escribí un mensaje"
            className="min-h-10 flex-1 resize-none rounded-3xl border border-[var(--line-soft)] bg-[var(--paper-inset)] px-4 py-2.5 text-sm text-[var(--ink-primary)] outline-none placeholder:text-[var(--ink-muted)] focus:border-[var(--wa-green)] disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => text.trim() && sendMutation.mutate()}
            disabled={!jid || !text.trim() || sendMutation.isPending}
            aria-label="Enviar"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--wa-green)] text-white shadow-sm hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sendMutation.isPending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
          </button>
        </footer>
      </section>
    </div>
  )
}

function PipelineSwitchModal({
  open,
  pipelines,
  currentPipelineId,
  isLoading,
  onClose,
  onSelect,
}: {
  open: boolean
  pipelines: Pipeline[]
  currentPipelineId: string
  isLoading: boolean
  onClose: () => void
  onSelect: (pipeline: Pipeline) => void
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-24" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="pipeline-switch-title"
        className="ast-rise w-full max-w-md overflow-hidden rounded-[1.5rem] border border-[var(--line-soft)] bg-[var(--paper)] shadow-[var(--ast-float-shadow)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[var(--line-soft)] px-5 py-4">
          <div>
            <h2 id="pipeline-switch-title" className="text-base font-semibold text-[var(--ink-primary)]">Cambiar embudo</h2>
            <p className="mt-0.5 text-xs text-[var(--ink-tertiary)]">Elegí qué embudo comercial querés ver.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="grid h-9 w-9 place-items-center rounded-full text-[var(--ink-tertiary)] hover:bg-[var(--paper-soft)]">
            <X size={18} />
          </button>
        </header>

        <div className="max-h-[52vh] overflow-y-auto p-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="animate-spin text-[var(--wa-green)]" size={24} />
            </div>
          ) : pipelines.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-[var(--ink-tertiary)]">No hay embudos disponibles.</div>
          ) : (
            pipelines.map((pipeline) => {
              const isCurrent = pipeline.id === currentPipelineId

              return (
                <button
                  key={pipeline.id}
                  type="button"
                  onClick={() => onSelect(pipeline)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left hover:bg-[var(--paper-soft)]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--ink-primary)]">{pipeline.name}</p>
                    <p className="mt-0.5 text-xs text-[var(--ink-tertiary)]">{pipeline.stages.length} etapas</p>
                  </div>
                  {isCurrent ? (
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--wa-green-soft)] text-[var(--wa-green)]">
                      <Check size={16} strokeWidth={2.5} />
                    </span>
                  ) : null}
                </button>
              )
            })
          )}
        </div>
      </section>
    </div>
  )
}

export default function KanbanPage() {
  const { pipelineId } = useParams<{ pipelineId: string }>()
  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()
  const storedAuth = auth.get()
  const canEditBoard = storedAuth?.role === 'owner' || storedAuth?.role === 'admin'
  const [activeId, setActiveId] = useState<string | null>(null)
  const [openDeal, setOpenDeal] = useState<KanbanCard | null>(null)
  const [isPipelineSwitcherOpen, setIsPipelineSwitcherOpen] = useState(false)
  const [editingBoard, setEditingBoard] = useState(false)
  const [search, setSearch] = useState('')
  // Después de soltar una tarjeta no se abre su chat por el clic que cierra el arrastre.
  const justDragged = useRef(false)
  // WhatsApp propio de Gestión comercial: panel de chats y popup de vinculación por QR.
  const [whatsAppPanel, setWhatsAppPanel] = useState<{ chatId?: string } | null>(null)
  const [whatsAppLinkOpen, setWhatsAppLinkOpen] = useState(false)
  const commercialSession = useLineWhatsAppSession(COMMERCIAL_WHATSAPP)
  const commercialConnected = commercialSession.data?.status === 'CONNECTED'

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
    // Los leads nuevos del WhatsApp comercial aparecen solos; no refresca mientras se arrastra.
    refetchInterval: activeId || editingBoard ? false : 15_000,
  })

  const { data: pipelines = [], isLoading: isLoadingPipelines } = useQuery<Pipeline[]>({
    queryKey: ['pipelines'],
    queryFn: () => pipelinesApi.list().then((response) => response.data),
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

  const term = search.trim().toLowerCase()
  const visibleDeals = useMemo(() => new Map((board?.columns ?? []).map((column) => [column.stage.id, column.deals.filter((deal) => matchesSearch(deal, term))])), [board, term])
  const activeDeal = board?.columns.flatMap((column) => column.deals).find((deal) => deal.id === activeId)

  function handleOpenDeal(deal: KanbanCard) {
    if (justDragged.current) return
    // Los leads del WhatsApp comercial abren su chat en el panel del número comercial.
    if (deal.chat?.source === 'commercial') {
      setWhatsAppPanel({ chatId: deal.chat.id })
      return
    }
    startTransition(() => setOpenDeal(deal))
  }

  function handleSelectPipeline(pipeline: Pipeline) {
    setIsPipelineSwitcherOpen(false)
    if (pipeline.id === pipelineId) return
    setOpenDeal(null)
    router.push(`/leads/${pipeline.id}`)
  }

  function releaseDragGuard() {
    window.setTimeout(() => { justDragged.current = false }, 0)
  }

  function handleDragStart(event: DragStartEvent) {
    justDragged.current = true
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
    releaseDragGuard()
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
    releaseDragGuard()
    queryClient.invalidateQueries({ queryKey: ['kanban', pipelineId] })
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="animate-spin text-[var(--wa-green)]" size={32} />
      </div>
    )
  }

  if (!board) return null

  const totalDeals = board.columns.reduce((sum, column) => sum + column.count, 0)
  const activeDeals = board.columns
    .filter((column) => !column.stage.isWon && !column.stage.isLost)
    .reduce((sum, column) => sum + column.count, 0)
  const closedDeals = totalDeals - activeDeals
  const unreadDeals = board.columns.reduce((sum, column) => sum + column.deals.filter((deal) => (deal.chat?.unreadCount ?? 0) > 0).length, 0)
  const wonDeals = board.columns.filter((column) => column.stage.isWon).reduce((sum, column) => sum + column.count, 0)

  return (
    <div className="relative flex h-full flex-col bg-[var(--background)]">
      <header className="shrink-0 px-4 pb-3 pt-4 sm:px-6">
        <div className="ast-card ast-rise px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-[var(--ast-accent-2)]">Gestión comercial · embudo</p>
              {pipelines.length > 1 ? (
                <button type="button" onClick={() => setIsPipelineSwitcherOpen(true)} className="mt-0.5 inline-flex max-w-full items-center gap-1.5 rounded-lg text-left font-display text-xl font-semibold tracking-tight text-[var(--ink-primary)] hover:text-[var(--ast-accent)]" title="Cambiar de embudo">
                  <span className="truncate">{board.pipeline.name}</span> <ChevronDown size={18} className="shrink-0 text-[var(--ink-muted)]" />
                </button>
              ) : <h1 className="mt-0.5 truncate font-display text-xl font-semibold tracking-tight text-[var(--ink-primary)]">{board.pipeline.name}</h1>}
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--wa-green)] px-4 text-[13px] font-semibold text-white shadow-sm hover:brightness-110" onClick={() => setWhatsAppPanel({})} title={commercialConnected ? `WhatsApp comercial conectado${commercialSession.data?.phoneNumber ? ` · +${commercialSession.data.phoneNumber}` : ''}` : 'WhatsApp comercial sin conexión'}>
                <span className={clsx('h-2 w-2 rounded-full', commercialConnected ? 'bg-white' : 'bg-red-300')} aria-hidden />
                <WhatsAppLogo size={16} /> Chats de WhatsApp
              </button>
              {canEditBoard ? <button type="button" className="btn-secondary !px-3" onClick={() => setWhatsAppLinkOpen(true)} aria-label="Configurar WhatsApp de Gestión comercial" title="Vincular, reconectar o desvincular el WhatsApp comercial (QR)"><Settings size={15} /></button> : null}
              {canEditBoard && <button type="button" onClick={() => setEditingBoard((value) => !value)} className="btn-secondary"><Pencil size={15} />{editingBoard ? 'Volver al tablero' : 'Editar tablero'}</button>}
            </div>
          </div>
          {!editingBoard ? <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="relative w-full sm:w-72">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} className="ctrl-input !rounded-full pl-9" placeholder="Buscar lead, teléfono o mensaje" aria-label="Buscar en el tablero" />
              </label>
              <Stat value={activeDeals} label="activos" />
              {unreadDeals ? <Stat value={unreadDeals} label="sin leer" tone="green" /> : null}
              {wonDeals ? <Stat value={wonDeals} label="ganados" /> : null}
              {closedDeals - wonDeals > 0 ? <Stat value={closedDeals - wonDeals} label="perdidos" /> : null}
              <span className="ml-auto hidden text-xs text-[var(--ink-muted)] lg:inline">Clic abre el chat · arrastrá la tarjeta para cambiar de etapa</span>
            </div>
            <FunnelBar columns={board.columns} total={totalDeals} />
          </> : null}
        </div>
      </header>

      {editingBoard ? <div className="flex-1 overflow-y-auto"><PipelinesPage /></div> : <div className="min-h-0 flex-1 overflow-x-auto px-4 pb-4 sm:px-6">
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
              <KanbanColumnComponent key={column.stage.id} column={column} deals={visibleDeals.get(column.stage.id) ?? []} total={totalDeals} filtering={Boolean(term)} onOpenDeal={handleOpenDeal} />
            ))}
          </div>

          <DragOverlay adjustScale={false} dropAnimation={null} modifiers={[snapOverlayToCursor]}>
            {activeDeal ? (
              <div className="w-[17.5rem] rotate-[1.5deg] cursor-grabbing rounded-2xl bg-[var(--paper)] p-3 shadow-[var(--ast-float-shadow)] ring-2 ring-[var(--wa-green)]/50">
                <DealCardBody deal={activeDeal} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>}

      {whatsAppPanel ? <LineWhatsAppPanel line={COMMERCIAL_WHATSAPP} initialChatId={whatsAppPanel.chatId} canWrite={storedAuth?.role !== 'viewer'} canManage={canEditBoard} currentUserId={storedAuth?.userId} onClose={() => { setWhatsAppPanel(null); queryClient.invalidateQueries({ queryKey: ['kanban', pipelineId] }) }} /> : null}
      {whatsAppLinkOpen ? <LineWhatsAppLinkDialog line={COMMERCIAL_WHATSAPP} canManage={canEditBoard} onClose={() => setWhatsAppLinkOpen(false)} /> : null}
      <LeadChatModal
        deal={openDeal}
        onClose={() => setOpenDeal(null)}
      />
      <PipelineSwitchModal
        open={isPipelineSwitcherOpen}
        pipelines={pipelines}
        currentPipelineId={pipelineId}
        isLoading={isLoadingPipelines}
        onClose={() => setIsPipelineSwitcherOpen(false)}
        onSelect={handleSelectPipeline}
      />
    </div>
  )
}
