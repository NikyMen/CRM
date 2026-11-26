'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { CircleAlert, ExternalLink, ImagePlus, Loader2, Send, Trash2, X } from 'lucide-react'
import { socialApi, type SocialPost } from '@/lib/api'
import { auth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/format'
import { useConfirmDelete } from '@/components/romez/ConfirmDelete'
import { useSocialStatus } from './SocialConnection'
import { InstagramLogo, NETWORKS } from './networks'

const CAPTION_MAX = 2200
// Instagram acepta proporciones entre 4:5 y 1,91:1; fuera de eso recorta o rechaza.
const RATIO_MIN = 0.8
const RATIO_MAX = 1.91

type Draft = { dataBase64: string; previewUrl: string; fileName: string; width: number; height: number }

/** Pasa cualquier imagen a JPG (lo único que acepta la API de Instagram) y la achica a 1440 px. */
async function toJpeg(file: File): Promise<Draft> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1440 / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('El navegador no pudo procesar la imagen.')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const previewUrl = canvas.toDataURL('image/jpeg', 0.9)
  return { dataBase64: previewUrl.slice(previewUrl.indexOf(',') + 1), previewUrl, fileName: file.name.replace(/\.[^.]+$/, '') + '.jpg', width, height }
}

const STATUS: Record<SocialPost['status'], { label: string; className: string }> = {
  draft: { label: 'Borrador', className: 'bg-[var(--paper-inset)] text-[var(--ink-secondary)]' },
  publishing: { label: 'Publicando…', className: 'bg-[var(--warning-paper)] text-[var(--warning)]' },
  published: { label: 'Publicada', className: 'bg-[var(--success-paper,#e6f6ec)] text-[var(--success)]' },
  failed: { label: 'No se publicó', className: 'bg-[var(--danger-paper)] text-[var(--danger)]' },
}

function PostImage({ postId, alt }: { postId: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let revoked = false
    let objectUrl: string | null = null
    socialApi.postImage(postId).then((response) => {
      if (revoked) return
      objectUrl = URL.createObjectURL(response.data)
      setUrl(objectUrl)
    }).catch(() => {})
    return () => { revoked = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [postId])
  return url
    // eslint-disable-next-line @next/next/no-img-element -- blob local de una imagen autenticada.
    ? <img src={url} alt={alt} className="h-full w-full object-cover" />
    : <div className="grid h-full w-full place-items-center bg-[var(--paper-inset)]"><Loader2 size={18} className="animate-spin text-[var(--ink-muted)]" /></div>
}

/** Sección «Publicar» de Instagram: armar una publicación (imagen + texto), guardarla y enviarla. */
export function InstagramPublisher() {
  const queryClient = useQueryClient()
  const confirmDelete = useConfirmDelete()
  const status = useSocialStatus()
  const canWrite = auth.get()?.role !== 'viewer'
  const fileInput = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [caption, setCaption] = useState('')
  const [imageError, setImageError] = useState<string | null>(null)
  const posts = useQuery<SocialPost[]>({ queryKey: ['social-posts'], queryFn: () => socialApi.posts().then((response) => response.data.posts) })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['social-posts'] })

  const instagram = status.data?.networks.find((item) => item.network === 'instagram')
  const connected = instagram?.connection?.status === 'connected'
  const canPublish = connected && Boolean(status.data?.publicApiReady)
  const blocker = !status.data ? null : !connected ? 'Falta conectar la cuenta de Instagram (pestaña Conexión).' : !status.data.publicApiReady ? 'Esta instalación es local: Instagram no puede descargar la imagen, así que no se puede publicar de verdad desde acá.' : null

  const pick = async (file: File | undefined) => {
    setImageError(null)
    if (!file) return
    if (!file.type.startsWith('image/')) { setImageError('Elegí un archivo de imagen (JPG o PNG).'); return }
    try { setDraft(await toJpeg(file)) } catch (error) { setImageError(getErrorMessage(error, 'No pudimos leer esa imagen.')) }
  }
  const reset = () => { setDraft(null); setCaption(''); if (fileInput.current) fileInput.current.value = '' }

  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      const created = (await socialApi.createPost({ caption: caption.trim(), image: { fileName: draft!.fileName, mimeType: 'image/jpeg', dataBase64: draft!.dataBase64 } })).data
      // Si falla el envío, la publicación ya quedó guardada como borrador.
      if (publish) { reset(); refresh(); await socialApi.publishPost(created.id) }
    },
    onSuccess: () => reset(),
    onSettled: refresh,
  })
  const publish = useMutation({ mutationFn: (id: string) => socialApi.publishPost(id), onSettled: refresh })
  const remove = useMutation({ mutationFn: (id: string) => socialApi.deletePost(id), onSettled: refresh })

  const ratio = draft ? draft.width / draft.height : 1
  const ratioWarning = draft && (ratio < RATIO_MIN - 0.01 || ratio > RATIO_MAX + 0.01)
  const ready = Boolean(draft) && caption.trim().length > 0 && !save.isPending

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
      <section className="h-fit rounded-2xl border border-[var(--line-soft)] bg-[var(--paper)] p-5 shadow-[var(--ast-card-shadow)]">
        <p className="font-display text-[15px] font-semibold text-[var(--ink-primary)]">Nueva publicación</p>
        <p className="mt-1 text-sm text-[var(--ink-tertiary)]">Una imagen y su texto. Podés guardarla como borrador y publicarla después.</p>

        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id="instagram-post-image" onChange={(event) => pick(event.target.files?.[0])} disabled={!canWrite} />
        {draft ? (
          <div className="relative mt-4 overflow-hidden rounded-xl bg-[var(--paper-inset)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local de la imagen elegida. */}
            <img src={draft.previewUrl} alt="Vista previa de la publicación" className="max-h-[420px] w-full object-contain" />
            <button type="button" onClick={() => { setDraft(null); if (fileInput.current) fileInput.current.value = '' }} aria-label="Quitar la imagen" className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white hover:bg-black/75"><X size={16} /></button>
          </div>
        ) : (
          <label htmlFor="instagram-post-image" className={clsx('mt-4 flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--line)] bg-[var(--paper-soft)] text-center hover:border-[var(--brand-blue)]', !canWrite && 'pointer-events-none opacity-60')}>
            <ImagePlus size={28} className="text-[var(--ink-muted)]" />
            <span className="text-sm font-semibold text-[var(--ink-primary)]">Elegí la imagen</span>
            <span className="max-w-[16rem] text-xs text-[var(--ink-tertiary)]">JPG o PNG. Cuadrada o vertical 4:5 es lo que mejor se ve en Instagram.</span>
          </label>
        )}
        {imageError ? <p role="alert" className="mt-2 text-xs font-semibold text-[var(--danger)]">{imageError}</p> : null}
        {ratioWarning ? <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-[var(--warning)]"><CircleAlert size={13} className="mt-0.5 shrink-0" /> Esta proporción está fuera de lo que admite Instagram (entre 4:5 y 1,91:1): puede rechazarla.</p> : null}

        <label className="mt-4 block">
          <span className="flex items-baseline justify-between text-xs font-semibold text-[var(--ink-secondary)]"><span>Texto de la publicación</span><span className={clsx('font-medium', caption.length > CAPTION_MAX - 100 ? 'text-[var(--warning)]' : 'text-[var(--ink-muted)]')}>{caption.length}/{CAPTION_MAX}</span></span>
          <textarea value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={CAPTION_MAX} rows={6} disabled={!canWrite} className="ctrl-input mt-1 min-h-32 resize-y !rounded-xl py-2.5 leading-5" placeholder={'🏡 Casa 3 dormitorios en Santa Ana\nCochera, patio y parrilla.\n📲 Consultas por mensaje'} />
        </label>

        {blocker ? <p className="mt-3 flex items-start gap-2 rounded-xl bg-[var(--warning-paper)] px-3 py-2 text-xs font-medium text-[var(--warning)]"><CircleAlert size={14} className="mt-0.5 shrink-0" /> {blocker}</p> : null}
        {save.isError ? <p role="alert" className="mt-3 text-sm font-semibold text-[var(--danger)]">{getErrorMessage(save.error, 'No se pudo guardar la publicación.')}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-primary" disabled={!ready || !canPublish} onClick={() => save.mutate(true)} title={blocker ?? undefined} style={ready && canPublish ? { background: NETWORKS.instagram.color, borderColor: NETWORKS.instagram.color } : undefined}>{save.isPending && save.variables ? <Loader2 size={15} className="animate-spin" /> : <InstagramLogo size={15} />} Publicar ahora</button>
          <button type="button" className="btn-secondary" disabled={!ready} onClick={() => save.mutate(false)}>{save.isPending && !save.variables ? <Loader2 size={15} className="animate-spin" /> : null} Guardar borrador</button>
        </div>
      </section>

      <section>
        <p className="mb-3 font-display text-[15px] font-semibold text-[var(--ink-primary)]">Publicaciones</p>
        {publish.isError ? <p role="alert" className="mb-3 rounded-xl bg-[var(--danger-paper)] px-3 py-2 text-sm font-semibold text-[var(--danger)]">{getErrorMessage(publish.error, 'No se pudo publicar.')}</p> : null}
        {posts.isLoading ? <div className="grid place-items-center p-10"><Loader2 className="animate-spin text-[var(--ink-muted)]" size={24} /></div>
          : posts.isError ? <p className="text-sm font-semibold text-[var(--danger)]">{getErrorMessage(posts.error)}</p>
          : posts.data?.length ? (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {posts.data.map((post) => (
                <li key={post.id} className="flex flex-col overflow-hidden rounded-2xl border border-[var(--line-soft)] bg-[var(--paper)] shadow-[var(--ast-card-shadow)]">
                  <div className="aspect-square"><PostImage postId={post.id} alt={post.caption.slice(0, 80)} /></div>
                  <div className="flex flex-1 flex-col p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS[post.status].className)}>{STATUS[post.status].label}</span>
                      <span className="text-[11px] text-[var(--ink-muted)]">{new Date(post.publishedAt ?? post.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}{post.createdBy ? ` · ${post.createdBy.firstName}` : ''}</span>
                    </div>
                    <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-5 text-[var(--ink-secondary)]">{post.caption}</p>
                    {post.status === 'failed' && post.errorMessage ? <p className="mt-2 text-xs font-medium text-[var(--danger)]">{post.errorMessage}</p> : null}
                    <div className="mt-auto flex items-center gap-2 pt-3">
                      {post.status === 'published'
                        ? post.permalink ? <a href={post.permalink} target="_blank" rel="noreferrer" className="btn-secondary !min-h-9 !px-3"><ExternalLink size={14} /> Ver en Instagram</a> : null
                        : post.status !== 'publishing' && canWrite ? <button type="button" className="btn-secondary !min-h-9 !px-3" disabled={!canPublish || publish.isPending} title={blocker ?? undefined} onClick={() => publish.mutate(post.id)}>{publish.isPending && publish.variables === post.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} {post.status === 'failed' ? 'Reintentar' : 'Publicar'}</button> : null}
                      {canWrite && post.status !== 'publishing' ? <button type="button" aria-label="Borrar la publicación del CRM" title={post.status === 'published' ? 'Borrarla del CRM (sigue en Instagram)' : 'Borrar'} className="ml-auto grid h-9 w-9 place-items-center rounded-full text-[var(--ink-tertiary)] hover:bg-[var(--danger-paper)] hover:text-[var(--danger)]" onClick={async () => { if (await confirmDelete({ title: '¿Borrar esta publicación?', message: post.status === 'published' ? 'Se borra del CRM. En Instagram sigue publicada.' : 'El borrador se pierde.' })) remove.mutate(post.id) }}><Trash2 size={15} /></button> : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : <div className="rounded-2xl border border-dashed border-[var(--line)] p-10 text-center text-sm text-[var(--ink-tertiary)]">Todavía no hay publicaciones. Armá la primera a la izquierda.</div>}
      </section>
    </div>
  )
}
