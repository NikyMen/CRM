'use client'

import { useEffect, useState } from 'react'
import { ImageOff, Loader2 } from 'lucide-react'
import { propertiesApi } from '@/lib/api'

// Las fotos piden sesión: se descargan como blob y se cachean por versión durante la visita.
const cache = new Map<string, Promise<string>>()

function load(id: string, version: number) {
  const key = `${id}:${version}`
  if (!cache.has(key)) cache.set(key, propertiesApi.image(id).then((response) => URL.createObjectURL(response.data)))
  return cache.get(key)!
}

export function PropertyImage({ id, version, hasImage, alt, className = 'h-full w-full object-cover' }: { id: string; version: number; hasImage: boolean; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!hasImage) return
    let active = true
    load(id, version).then((value) => { if (active) setUrl(value) }).catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [id, version, hasImage])
  if (!hasImage || failed) return <div className="grid h-full w-full place-items-center bg-[var(--paper-inset)] text-[var(--ink-muted)]"><ImageOff size={22} /></div>
  // eslint-disable-next-line @next/next/no-img-element -- blob local de una imagen autenticada.
  return url ? <img src={url} alt={alt} className={className} /> : <div className="grid h-full w-full place-items-center bg-[var(--paper-inset)]"><Loader2 size={18} className="animate-spin text-[var(--ink-muted)]" /></div>
}
