'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, Download, FileText, ImageIcon, Loader2, Lock, Play, RotateCcw, SmilePlus, X } from 'lucide-react'
import clsx from 'clsx'
import { getErrorMessage } from '@/lib/format'
import type { MessageReaction } from '@/types'
import { brand } from '@/lib/brand'

/** Emojis rápidos para reaccionar. ✅ y 👀 sirven para marcar archivos hechos o en revisión. */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '✅', '👀']

const MEDIA_PLACEHOLDER = /^\[(Imagen|Video|Audio|Documento|Sticker)\]$/

/** Oculta textos de relleno como "[Imagen]" cuando el archivo ya se muestra. */
export function visibleMessageText(text: string | null | undefined, messageType?: string | null, fileName?: string | null) {
  if (!text) return null
  if (isMediaType(messageType) && MEDIA_PLACEHOLDER.test(text.trim())) return null
  if (messageType === 'document' && fileName && text === fileName) return null
  return text
}

export function isMediaType(messageType?: string | null) {
  return ['image', 'audio', 'video', 'document'].includes(messageType ?? '')
}

function formatBytes(bytes?: number | null) {
  if (!bytes) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDuration(seconds?: number | null) {
  if (!seconds) return null
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
}

/** Carga perezosa: el archivo se pide recién cuando la burbuja entra en pantalla. */
function useInView<T extends Element>() {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node || inView) return
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setInView(true); observer.disconnect() }
    }, { rootMargin: '200px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [inView])
  return { ref, inView }
}

/**
 * Imagen, video, audio o documento de un mensaje de WhatsApp. Las imágenes,
 * videos y audios se muestran solos dentro del chat; los documentos quedan
 * como tarjeta para descargar.
 */
export function ChatMedia({ messageType, mimeType, fileName, sizeBytes, durationSeconds, outgoing, load, canAccess = true, deniedLabel = 'Sin acceso al archivo' }: {
  messageType?: string | null
  mimeType?: string | null
  fileName?: string | null
  sizeBytes?: number | null
  durationSeconds?: number | null
  outgoing: boolean
  load: () => Promise<Blob>
  canAccess?: boolean
  deniedLabel?: string
}) {
  const kind = messageType === 'image' || mimeType?.startsWith('image/') ? 'image'
    : messageType === 'video' || mimeType?.startsWith('video/') ? 'video'
    : messageType === 'audio' || mimeType?.startsWith('audio/') ? 'audio'
    : 'document'
  const inline = kind !== 'document'
  const { ref, inView } = useInView<HTMLDivElement>()
  const [url, setUrl] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')
  const [viewerOpen, setViewerOpen] = useState(false)
  const loadRef = useRef(load)
  useEffect(() => { loadRef.current = load }, [load])
  const urlRef = useRef<string | null>(null)
  const label = fileName || (kind === 'image' ? 'Imagen' : kind === 'video' ? 'Video' : kind === 'audio' ? 'Audio' : 'Documento')

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])

  async function fetchUrl() {
    if (urlRef.current) return urlRef.current
    setState('loading')
    setError('')
    try {
      const blob = await loadRef.current()
      const objectUrl = URL.createObjectURL(blob)
      urlRef.current = objectUrl
      setUrl(objectUrl)
      setState('idle')
      return objectUrl
    } catch (candidate) {
      setError(getErrorMessage(candidate, 'No se pudo cargar el archivo.'))
      setState('error')
      return null
    }
  }

  useEffect(() => {
    // fetchUrl usa refs; sólo debe correr al entrar en pantalla.
    if (inline && inView && canAccess && !urlRef.current) void fetchUrl()
  }, [inline, inView, canAccess])

  async function download() {
    const objectUrl = await fetchUrl()
    if (!objectUrl) return
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = label
    anchor.click()
  }

  const muted = outgoing ? 'text-white/75' : 'text-[var(--ink-tertiary)]'
  const frame = clsx('relative overflow-hidden rounded-md', outgoing ? 'bg-black/15' : 'bg-[var(--paper-soft)]')

  if (!canAccess) {
    return <div ref={ref} className={clsx('mt-2 flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-bold', outgoing ? 'border-white/20 bg-white/10' : 'border-[var(--line)] bg-[var(--paper-soft)] text-[var(--ink-tertiary)]')}><Lock size={14} className="shrink-0" /><span className="truncate">{label} · {deniedLabel}</span></div>
  }

  if (kind === 'document') {
    const meta = [mimeType?.split('/')[1]?.split(';')[0]?.toUpperCase(), formatBytes(sizeBytes)].filter(Boolean).join(' · ')
    return <div ref={ref} className="mt-2">
      <button type="button" onClick={download} disabled={state === 'loading'} className={clsx('flex w-full min-w-56 max-w-sm items-center gap-3 rounded-md border px-3 py-2.5 text-left', outgoing ? 'border-white/20 bg-white/10 hover:bg-white/15' : 'border-[var(--line)] bg-[var(--paper-soft)] hover:bg-[var(--paper)]')}>
        <span className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-md', outgoing ? 'bg-white/15' : 'bg-[var(--brand-paper)] text-[var(--brand-navy)] dark:text-[var(--brand-blue)]')}><FileText size={20} /></span>
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{label}</span>{meta ? <span className={clsx('block text-[10px] font-semibold', muted)}>{meta}</span> : null}</span>
        {state === 'loading' ? <Loader2 size={16} className="shrink-0 animate-spin" /> : <Download size={16} className="shrink-0" />}
      </button>
      {state === 'error' ? <p className={clsx('mt-1 text-[10px] font-semibold', outgoing ? 'text-white/80' : 'text-[var(--danger)]')}>{error}</p> : null}
    </div>
  }

  if (kind === 'audio') {
    return <div ref={ref} className="mt-2 min-w-[16rem] max-w-sm">
      {url ? <audio controls preload="metadata" src={url} className="h-10 w-full" /> : <div className={clsx(frame, 'flex h-10 items-center gap-2 px-3 text-xs font-bold', muted)}>{state === 'error' ? <MediaError error={error} retry={fetchUrl} outgoing={outgoing} /> : <><Loader2 size={14} className="animate-spin" /> Cargando audio{formatDuration(durationSeconds) ? ` · ${formatDuration(durationSeconds)}` : ''}…</>}</div>}
    </div>
  }

  return <div ref={ref} className="mt-1.5 -mx-1">
    {url ? (
      kind === 'image'
        // eslint-disable-next-line @next/next/no-img-element -- blob: local autenticado, next/image no aporta nada acá.
        ? <button type="button" onClick={() => setViewerOpen(true)} className="block overflow-hidden rounded-md" aria-label={`Ampliar ${label}`}><img src={url} alt={label} className="block max-h-80 w-auto max-w-full cursor-zoom-in object-contain sm:max-w-sm" /></button>
        : <video controls playsInline preload="metadata" src={url} className="block max-h-80 w-full max-w-sm rounded-md bg-black" />
    ) : (
      <div className={clsx(frame, 'grid h-48 w-64 max-w-full place-items-center')}>
        {state === 'error' ? <MediaError error={error} retry={fetchUrl} outgoing={outgoing} /> : <div className={clsx('flex flex-col items-center gap-2 text-xs font-bold', muted)}>{kind === 'image' ? <ImageIcon size={26} /> : <Play size={26} />}<span className="inline-flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Cargando {kind === 'image' ? 'imagen' : 'video'}…</span></div>}
      </div>
    )}
    {url ? <div className={clsx('mt-1 flex items-center justify-between gap-2 px-1 text-[10px] font-semibold', muted)}><span className="truncate">{[formatDuration(durationSeconds), formatBytes(sizeBytes)].filter(Boolean).join(' · ')}</span><button type="button" onClick={download} className="inline-flex items-center gap-1 hover:underline"><Download size={11} /> Descargar</button></div> : null}
    {viewerOpen && url ? <MediaViewer url={url} label={label} onDownload={download} onClose={() => setViewerOpen(false)} /> : null}
  </div>
}

function MediaError({ error, retry, outgoing }: { error: string; retry: () => void; outgoing: boolean }) {
  return <div className={clsx('flex flex-col items-center gap-1.5 px-3 text-center text-[11px] font-semibold', outgoing ? 'text-white/85' : 'text-[var(--danger)]')}>
    <span className="inline-flex items-center gap-1.5"><AlertCircle size={14} /> {error}</span>
    <button type="button" onClick={retry} className="inline-flex items-center gap-1 underline"><RotateCcw size={11} /> Reintentar</button>
  </div>
}

/** Visor a pantalla completa para imágenes. */
function MediaViewer({ url, label, onDownload, onClose }: { url: string; label: string; onDownload: () => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/90" role="dialog" aria-modal="true" aria-label={label} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="flex items-center gap-3 px-4 py-3 text-white">
        <p className="min-w-0 flex-1 truncate text-sm font-bold">{label}</p>
        <button type="button" onClick={onDownload} className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 px-3 py-1.5 text-xs font-bold hover:bg-white/10"><Download size={14} /> Descargar</button>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Cerrar"><X size={20} /></button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        {/* eslint-disable-next-line @next/next/no-img-element -- blob: local autenticado */}
        <img src={url} alt={label} className="max-h-full max-w-full object-contain" />
      </div>
    </div>,
    document.body,
  )
}

/** Reacciones debajo de la burbuja, agrupadas por emoji como en WhatsApp. */
export function MessageReactions({ reactions, outgoing, contactLabel = 'Cliente' }: { reactions?: MessageReaction[] | null; outgoing: boolean; contactLabel?: string }) {
  if (!reactions?.length) return null
  const groups = new Map<string, MessageReaction[]>()
  for (const reaction of reactions) groups.set(reaction.emoji, [...(groups.get(reaction.emoji) ?? []), reaction])
  return <div className={clsx('relative z-[1] -mt-2 flex flex-wrap gap-1 px-2', outgoing ? 'justify-end' : 'justify-start')}>
    {[...groups.entries()].map(([emoji, items]) => (
      <span key={emoji} title={items.map((item) => item.fromMe ? `Equipo ${brand.shortName}` : contactLabel).join(', ')} className="inline-flex items-center gap-0.5 rounded-full border border-[var(--line)] bg-[var(--paper)] px-1.5 py-0.5 text-sm leading-none shadow-sm">
        {emoji}{items.length > 1 ? <span className="text-[10px] font-bold text-[var(--ink-tertiary)]">{items.length}</span> : null}
      </span>
    ))}
  </div>
}

/**
 * Botón para reaccionar que aparece al pasar por la burbuja. Tocar el emoji que
 * ya pusiste lo quita.
 */
export function ReactionButton({ current, onReact, outgoing }: { current?: string | null; onReact: (emoji: string) => Promise<unknown>; outgoing: boolean }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  async function pick(emoji: string) {
    const next = emoji === current ? '' : emoji
    setPending(emoji)
    setError('')
    try {
      await onReact(next)
      setOpen(false)
    } catch (candidate) {
      setError(getErrorMessage(candidate, 'No se pudo enviar la reacción.'))
    } finally {
      setPending(null)
    }
  }

  return <div ref={rootRef} className="relative self-center">
    <button type="button" onClick={() => setOpen((value) => !value)} aria-label="Reaccionar" title="Reaccionar" className={clsx('grid h-8 w-8 place-items-center rounded-full text-[var(--ink-tertiary)] transition hover:bg-[var(--paper-soft)] hover:text-[var(--ink-primary)] focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100', open && 'bg-[var(--paper-soft)] sm:opacity-100')}>
      <SmilePlus size={17} />
    </button>
    {open ? (
      <div className={clsx('absolute bottom-full z-20 mb-1 w-max rounded-full border border-[var(--line)] bg-[var(--paper)] p-1 shadow-xl', outgoing ? 'right-0' : 'left-0')}>
        <div className="flex items-center gap-0.5">
          {QUICK_REACTIONS.map((emoji) => (
            <button key={emoji} type="button" disabled={pending !== null} onClick={() => pick(emoji)} aria-label={emoji === current ? `Quitar ${emoji}` : `Reaccionar con ${emoji}`} className={clsx('grid h-9 w-9 place-items-center rounded-full text-xl transition hover:scale-110 hover:bg-[var(--paper-soft)] disabled:opacity-50', emoji === current && 'bg-[var(--brand-paper)] ring-1 ring-[var(--brand-blue)]')}>
              {pending === emoji ? <Loader2 size={16} className="animate-spin" /> : emoji}
            </button>
          ))}
        </div>
        {error ? <p className="max-w-72 px-3 pb-1.5 pt-1 text-[11px] font-semibold text-[var(--danger)]">{error}</p> : null}
      </div>
    ) : null}
  </div>
}

/** Mi reacción actual en un mensaje, para marcarla en el selector. */
export function myReaction(reactions?: MessageReaction[] | null) {
  return reactions?.find((reaction) => reaction.fromMe)?.emoji ?? null
}
