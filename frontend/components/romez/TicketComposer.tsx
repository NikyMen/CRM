'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Loader2, Paperclip, Pencil, Plus, Search, Send, Trash2, X, Zap } from 'lucide-react'
import clsx from 'clsx'
import { quickRepliesApi } from '@/lib/api'
import { getErrorMessage } from '@/lib/format'
import type { OutboundFilePayload, QuickReply, QuickReplyInput } from '@/types'

// Mismo límite que el backend para archivos salientes de WhatsApp.
const MAX_FILE_BYTES = 8 * 1024 * 1024
const EMPTY_FORM: QuickReplyInput = { shortcut: '', title: '', body: '' }

export type ComposerPayload = { text?: string; file?: OutboundFilePayload }

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function readAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]*;base64,/, ''))
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo.'))
    reader.readAsDataURL(file)
  })
}

/** "/sal" al principio del mensaje abre las respuestas rápidas filtradas por "sal". */
function slashQuery(draft: string) {
  const match = /^\/(\S*)$/.exec(draft)
  return match ? match[1].toLowerCase() : null
}

export function TicketComposer({ canReply, placeholder, hint, canManage, currentUserId, send }: {
  canReply: boolean
  placeholder: string
  hint: string
  canManage: boolean
  currentUserId?: string
  send: (payload: ComposerPayload) => Promise<unknown>
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [draft, setDraft] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [highlight, setHighlight] = useState(0)

  const slash = slashQuery(draft)
  const showPicker = canReply && (pickerOpen || slash !== null)
  const quickRepliesQuery = useQuery<QuickReply[]>({ queryKey: ['quick-replies'], queryFn: () => quickRepliesApi.list().then((response) => response.data), enabled: canReply, staleTime: 60_000 })
  const term = (slash ?? pickerSearch).trim().toLowerCase()
  const matches = useMemo(() => (quickRepliesQuery.data ?? []).filter((item) => !term || [item.shortcut, item.title, item.body].some((value) => value.toLowerCase().includes(term))), [quickRepliesQuery.data, term])

  useEffect(() => setHighlight(0), [term])

  const resize = () => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 180)}px`
  }
  useEffect(resize, [draft])

  const closePicker = () => { setPickerOpen(false); setPickerSearch('') }

  // Inserta la respuesta como borrador: nunca se envía sola.
  const applyQuickReply = (item: QuickReply) => {
    setDraft((current) => slashQuery(current) !== null || !current.trim() ? item.body : `${current.replace(/\s+$/, '')}\n${item.body}`)
    closePicker()
    requestAnimationFrame(() => {
      const element = textareaRef.current
      if (!element) return
      element.focus()
      element.setSelectionRange(element.value.length, element.value.length)
    })
  }

  const chooseFile = (selected?: File | null) => {
    setError('')
    if (!selected) return
    if (selected.size > MAX_FILE_BYTES) { setError(`"${selected.name}" pesa ${formatBytes(selected.size)}; el máximo es 8 MB.`); return }
    setFile(selected)
  }

  const isAudio = Boolean(file && file.type.startsWith('audio/'))
  const text = draft.trim()
  const audioWithText = isAudio && Boolean(text)
  // Con "/" al principio, Enter elige una respuesta; sólo se envía como texto si no hay coincidencias.
  const canSend = canReply && !sending && (Boolean(text) || Boolean(file)) && (slash === null || !matches.length) && !audioWithText

  const submit = async () => {
    if (!canSend) return
    setSending(true)
    setError('')
    try {
      const payload: ComposerPayload = { text: text || undefined }
      if (file) payload.file = { fileName: file.name, mimeType: file.type || 'application/octet-stream', dataBase64: await readAsBase64(file) }
      await send(payload)
      setDraft('')
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (candidate) {
      setError(getErrorMessage(candidate, 'No se pudo enviar el mensaje.'))
    } finally {
      setSending(false)
    }
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slash !== null && matches.length) {
      if (event.key === 'ArrowDown') { event.preventDefault(); setHighlight((current) => (current + 1) % matches.length); return }
      if (event.key === 'ArrowUp') { event.preventDefault(); setHighlight((current) => (current - 1 + matches.length) % matches.length); return }
      if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); applyQuickReply(matches[highlight] ?? matches[0]); return }
    }
    if (event.key === 'Escape' && showPicker) { event.preventDefault(); closePicker(); if (slash !== null) setDraft(''); return }
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit() }
  }

  return (
    <div className="relative border-t border-[var(--line)] bg-[var(--paper)] p-3 sm:p-4">
      {showPicker ? <QuickReplyPicker items={matches} filtering={Boolean(term)} loading={quickRepliesQuery.isLoading} error={quickRepliesQuery.error} slashMode={slash !== null} search={pickerSearch} setSearch={setPickerSearch} highlight={highlight} pick={applyQuickReply} close={() => { closePicker(); if (slash !== null) setDraft('') }} canManage={canManage} currentUserId={currentUserId} /> : null}
      {file ? (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--paper-soft)] px-3 py-2">
          <FileText size={16} className="shrink-0 text-[var(--brand-blue)]" />
          <p className="min-w-0 flex-1 truncate text-xs font-bold text-[var(--ink-primary)]">{file.name} <span className="font-semibold text-[var(--ink-muted)]">· {formatBytes(file.size)}</span></p>
          <button type="button" disabled={sending} onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }} className="rounded-md p-1 text-[var(--ink-tertiary)] hover:bg-[var(--paper)]" aria-label="Quitar archivo"><X size={14} /></button>
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <textarea ref={textareaRef} disabled={!canReply || sending} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} className="ctrl-input min-h-11 flex-1 resize-none py-3" rows={1} placeholder={canReply ? `${placeholder} · "/" para respuestas rápidas` : placeholder} />
        <input ref={fileRef} type="file" className="sr-only" tabIndex={-1} onChange={(event) => chooseFile(event.target.files?.[0])} />
        <button type="button" className="btn-secondary h-11 w-11 shrink-0 px-0" disabled={!canReply || sending} onClick={() => fileRef.current?.click()} aria-label="Adjuntar archivo" title="Adjuntar archivo"><Paperclip size={17} /></button>
        <button type="button" className={clsx('btn-secondary h-11 w-11 shrink-0 px-0', showPicker && 'border-[var(--brand-blue)] text-[var(--brand-blue)]')} disabled={!canReply || sending} onClick={() => (showPicker ? closePicker() : setPickerOpen(true))} aria-label="Respuestas rápidas" aria-expanded={showPicker} title="Respuestas rápidas"><Zap size={17} /></button>
        <button type="button" className="btn-primary h-11 w-11 shrink-0 px-0" disabled={!canSend} onClick={() => void submit()} aria-label="Enviar respuesta">{sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}</button>
      </div>
      {error ? <p className="mt-2 text-xs font-semibold text-[var(--danger)]">{error}</p> : audioWithText ? <p className="mt-2 text-xs font-semibold text-[var(--warning)]">WhatsApp no permite texto junto a un audio: enviá el audio solo o borrá el texto.</p> : <p className="mt-2 text-[10px] text-[var(--ink-muted)]">{hint}</p>}
    </div>
  )
}

function QuickReplyPicker({ items, filtering, loading, error, slashMode, search, setSearch, highlight, pick, close, canManage, currentUserId }: {
  items: QuickReply[]
  filtering: boolean
  loading: boolean
  error: unknown
  slashMode: boolean
  search: string
  setSearch: (value: string) => void
  highlight: number
  pick: (item: QuickReply) => void
  close: () => void
  canManage: boolean
  currentUserId?: string
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<QuickReply | 'new' | null>(null)
  const [form, setForm] = useState<QuickReplyInput>(EMPTY_FORM)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['quick-replies'] })
  const save = useMutation({
    mutationFn: () => editing && editing !== 'new' ? quickRepliesApi.update(editing.id, form) : quickRepliesApi.create(form),
    onSuccess: () => { refresh(); setEditing(null); setForm(EMPTY_FORM) },
  })
  const remove = useMutation({ mutationFn: (id: string) => quickRepliesApi.remove(id), onSuccess: refresh })
  const canEdit = (item: QuickReply) => canManage || item.createdByUserId === currentUserId
  const startEdit = (item: QuickReply | 'new') => { setEditing(item); setForm(item === 'new' ? EMPTY_FORM : { shortcut: item.shortcut, title: item.title, body: item.body }); save.reset() }

  return (
    <div className="absolute bottom-full left-3 right-3 z-20 mb-2 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--paper)] shadow-xl sm:left-4 sm:right-4" role="dialog" aria-label="Respuestas rápidas">
      <div className="flex items-center gap-2 border-b border-[var(--line-soft)] px-3 py-2.5">
        <Zap size={15} className="text-[var(--brand-blue)]" />
        <p className="flex-1 text-xs font-extrabold text-[var(--ink-primary)]">Respuestas rápidas</p>
        {!editing ? <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold text-[var(--brand-blue)] hover:bg-[var(--paper-soft)]" onClick={() => startEdit('new')}><Plus size={13} /> Nueva</button> : null}
        <button type="button" className="rounded-md p-1 text-[var(--ink-tertiary)] hover:bg-[var(--paper-soft)]" onClick={close} aria-label="Cerrar respuestas rápidas"><X size={15} /></button>
      </div>
      {editing ? (
        <div className="space-y-2 p-3">
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
            <label className="relative block"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-[var(--ink-muted)]">/</span><input autoFocus className="ctrl-input pl-6" value={form.shortcut} onChange={(event) => setForm((current) => ({ ...current, shortcut: event.target.value }))} placeholder="atajo" aria-label="Atajo" maxLength={40} /></label>
            <input className="ctrl-input" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Título (ej. Pedido de facturas)" aria-label="Título" maxLength={80} />
          </div>
          <textarea className="ctrl-input min-h-24 resize-y" value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} placeholder="Texto que se va a cargar en el chat" aria-label="Texto de la respuesta" maxLength={4096} />
          <div className="flex items-center justify-between gap-2">
            {save.isError ? <p className="text-xs font-semibold text-[var(--danger)]">{getErrorMessage(save.error, 'No se pudo guardar la respuesta.')}</p> : <span className="text-[10px] text-[var(--ink-muted)]">La ven y la usan todos los del equipo.</span>}
            <div className="flex gap-2"><button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancelar</button><button type="button" className="btn-primary" disabled={!form.shortcut.trim() || !form.title.trim() || !form.body.trim() || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Guardando…' : 'Guardar'}</button></div>
          </div>
        </div>
      ) : (
        <>
          {!slashMode ? <div className="border-b border-[var(--line-soft)] p-2"><label className="relative block"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" /><input autoFocus className="ctrl-input pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar respuesta…" /></label></div> : null}
          <div className="max-h-64 overflow-y-auto">
            {loading ? <p className="p-4 text-center text-xs text-[var(--ink-tertiary)]">Cargando respuestas…</p> : error ? <p className="p-4 text-center text-xs font-semibold text-[var(--danger)]">{getErrorMessage(error)}</p> : items.length ? items.map((item, index) => (
              <div key={item.id} className={clsx('group flex items-start gap-2 border-b border-[var(--line-soft)] px-3 py-2.5 last:border-b-0', slashMode && index === highlight ? 'bg-[var(--brand-paper)]' : 'hover:bg-[var(--paper-soft)]')}>
                <button type="button" className="min-w-0 flex-1 text-left" onMouseDown={(event) => event.preventDefault()} onClick={() => pick(item)}>
                  <p className="flex items-center gap-2 text-xs font-bold text-[var(--ink-primary)]"><span className="font-mono text-[var(--brand-blue)]">/{item.shortcut}</span><span className="truncate">{item.title}</span></p>
                  <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-xs text-[var(--ink-tertiary)]">{item.body}</p>
                </button>
                {canEdit(item) ? <div className="flex shrink-0 gap-1 opacity-70 group-hover:opacity-100">
                  <button type="button" className="rounded-md p-1.5 text-[var(--ink-tertiary)] hover:bg-[var(--paper)]" onClick={() => startEdit(item)} aria-label={`Editar /${item.shortcut}`}><Pencil size={13} /></button>
                  <button type="button" className="rounded-md p-1.5 text-[var(--danger)] hover:bg-[var(--paper)]" disabled={remove.isPending} onClick={() => { if (window.confirm(`¿Eliminar la respuesta rápida /${item.shortcut}?`)) remove.mutate(item.id) }} aria-label={`Eliminar /${item.shortcut}`}><Trash2 size={13} /></button>
                </div> : null}
              </div>
            )) : <div className="p-4 text-center"><p className="text-xs font-semibold text-[var(--ink-secondary)]">{filtering ? 'No hay respuestas con ese atajo.' : 'Todavía no hay respuestas rápidas.'}</p><button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[var(--brand-blue)]" onClick={() => startEdit('new')}><Plus size={13} /> Crear una</button></div>}
          </div>
          {slashMode && items.length ? <p className="border-t border-[var(--line-soft)] px-3 py-1.5 text-[10px] text-[var(--ink-muted)]">↑ ↓ para elegir · Enter para cargarla en el mensaje · Esc para cancelar</p> : null}
          {remove.isError ? <p className="border-t border-[var(--line-soft)] px-3 py-2 text-xs font-semibold text-[var(--danger)]">{getErrorMessage(remove.error, 'No se pudo eliminar la respuesta.')}</p> : null}
        </>
      )}
    </div>
  )
}
