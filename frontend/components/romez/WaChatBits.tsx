'use client'

import clsx from 'clsx'
import { AlertCircle, Check, CheckCheck, Clock } from 'lucide-react'

/** Piezas visuales del chat estilo WhatsApp (líneas propias y tablero de leads). */

const ZONE = 'America/Asuncion'
const AVATAR_COLORS = ['#0ea5e9', '#8b5cf6', '#d97706', '#0d9488', '#e11d48', '#6366f1', '#16a34a', '#ea580c']

/** Día calendario de Paraguay (AAAA-MM-DD) para agrupar mensajes. */
export function dayKey(value: string | number | Date) {
  return new Date(value).toLocaleDateString('en-CA', { timeZone: ZONE })
}

export function messageTime(value?: string | null) {
  if (!value) return ''
  return new Intl.DateTimeFormat('es-PY', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONE }).format(new Date(value))
}

/** "Hoy", "Ayer" o "martes 18 de noviembre". */
export function dayLabel(value: string) {
  const key = dayKey(value)
  const today = dayKey(Date.now())
  if (key === today) return 'Hoy'
  if (key === dayKey(Date.now() - 86_400_000)) return 'Ayer'
  return new Date(value).toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long', timeZone: ZONE })
}

/** Hora si es de hoy, "Ayer", día de la semana en la última semana o fecha corta. */
export function chatListTime(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const key = dayKey(date)
  if (key === dayKey(Date.now())) return messageTime(value)
  if (key === dayKey(Date.now() - 86_400_000)) return 'Ayer'
  if (Date.now() - date.getTime() < 6 * 86_400_000) return date.toLocaleDateString('es-PY', { weekday: 'short', timeZone: ZONE })
  return date.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', timeZone: ZONE })
}

export function initials(name: string) {
  const clean = name.replace(/^\+/, '').trim()
  if (!clean) return '#'
  if (/^\d/.test(clean)) return clean.slice(-2)
  return clean.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

/** Avatar redondo con color estable por id, o la foto de perfil si existe. */
export function WaAvatar({ id, name, imageUrl, className = 'h-11 w-11 text-sm' }: { id: string; name: string; imageUrl?: string | null; className?: string }) {
  const color = AVATAR_COLORS[[...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % AVATAR_COLORS.length]
  return (
    <span className={clsx('flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white', className)} style={{ background: color }}>
      {imageUrl
        // eslint-disable-next-line @next/next/no-img-element -- foto de perfil de WhatsApp, URL externa firmada.
        ? <img src={imageUrl} alt={name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        : initials(name)}
    </span>
  )
}

/**
 * Tildes de WhatsApp de un mensaje enviado: reloj mientras sale, una tilde gris (enviado),
 * dos grises (entregado) y dos azules (visto). Lo que llega del teléfono vía Baileys se
 * normaliza en el backend a sending | sent | delivered | read | error.
 */
export function MessageTicks({ status, pending = false, size = 14, className }: { status?: string | null; pending?: boolean; size?: number; className?: string }) {
  if (pending || status === 'sending') return <Clock size={size - 3} className={clsx('shrink-0', className)} aria-label="Enviando" />
  if (status === 'error') return <AlertCircle size={size - 2} className="shrink-0 text-[var(--danger)]" aria-label="No se pudo enviar" />
  if (status === 'read') return <CheckCheck size={size} className="shrink-0 text-[#53bdeb]" aria-label="Visto" />
  if (status === 'delivered') return <CheckCheck size={size} className={clsx('shrink-0', className)} aria-label="Entregado" />
  return <Check size={size} className={clsx('shrink-0', className)} aria-label="Enviado" />
}
