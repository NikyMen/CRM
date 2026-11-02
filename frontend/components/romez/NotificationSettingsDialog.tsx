'use client'

import { useEffect, useState } from 'react'
import { Bell, Play, X } from 'lucide-react'
import {
  NOTIFICATION_LINES,
  desktopNotificationsSupported,
  onPrefsChange,
  playLineSound,
  readPrefs,
  requestDesktopPermission,
  savePrefs,
  type NotificationLine,
  type NotificationPrefs,
} from '@/lib/notifications'

export function NotificationSettingsDialog({ onClose }: { onClose: () => void }) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => readPrefs())
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => (desktopNotificationsSupported() ? Notification.permission : 'unsupported'))

  useEffect(() => onPrefsChange(() => setPrefs(readPrefs())), [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow }
  }, [onClose])

  const update = (patch: Partial<NotificationPrefs>) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    savePrefs(next)
  }
  const toggleLine = (line: NotificationLine) => update({ lines: { ...prefs.lines, [line]: !prefs.lines[line] } })
  const toggleDesktop = async () => {
    if (prefs.desktop) return update({ desktop: false })
    const result = await requestDesktopPermission()
    setPermission(result)
    update({ desktop: result === 'granted' })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm sm:items-center" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="notification-settings-title" className="paper-panel my-auto w-full max-w-lg animate-slide-up">
        <div className="flex items-center justify-between border-b border-[var(--line-soft)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Bell size={18} className="text-[var(--brand-blue)]" />
            <div>
              <h2 id="notification-settings-title" className="font-display text-sm font-extrabold">Notificaciones</h2>
              <p className="mt-0.5 text-xs text-[var(--ink-tertiary)]">Se guardan en este navegador. Cada número suena distinto.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-[var(--ink-tertiary)] hover:bg-[var(--paper-soft)]" aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="space-y-5 p-5">
          <label className="flex items-center justify-between gap-3">
            <span><span className="block text-sm font-bold text-[var(--ink-primary)]">Sonido de mensaje</span><span className="block text-xs text-[var(--ink-tertiary)]">Suena al llegar un mensaje nuevo de WhatsApp.</span></span>
            <input type="checkbox" className="h-4 w-4 accent-[var(--brand-blue)]" checked={prefs.sound} onChange={() => update({ sound: !prefs.sound })} />
          </label>

          <label className="block">
            <span className="mb-1.5 flex justify-between text-[11px] font-bold text-[var(--ink-secondary)]"><span>Volumen</span><span>{Math.round(prefs.volume * 100)}%</span></span>
            <input type="range" min={0} max={1} step={0.05} value={prefs.volume} disabled={!prefs.sound} onChange={(event) => update({ volume: Number(event.target.value) })} className="w-full accent-[var(--brand-blue)]" />
          </label>

          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Por número de WhatsApp</p>
            <div className="divide-y divide-[var(--line-soft)] rounded-lg border border-[var(--line)]">
              {NOTIFICATION_LINES.map((line) => (
                <div key={line.key} className="flex items-center gap-3 px-3 py-2.5">
                  <input id={`notify-${line.key}`} type="checkbox" className="h-4 w-4 accent-[var(--brand-blue)]" checked={prefs.lines[line.key]} onChange={() => toggleLine(line.key)} />
                  <label htmlFor={`notify-${line.key}`} className="min-w-0 flex-1"><span className="block text-sm font-bold text-[var(--ink-primary)]">{line.label}</span><span className="block truncate text-xs text-[var(--ink-tertiary)]">{line.description}</span></label>
                  <button type="button" className="btn-secondary px-3" onClick={() => playLineSound(line.key, prefs.volume || 0.7)} aria-label={`Probar sonido de ${line.label}`}><Play size={13} /> Probar</button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-[var(--line)] p-3">
            <label className="flex items-center justify-between gap-3">
              <span><span className="block text-sm font-bold text-[var(--ink-primary)]">Aviso del navegador</span><span className="block text-xs text-[var(--ink-tertiary)]">Muestra una notificación cuando la pestaña está en segundo plano.</span></span>
              <input type="checkbox" className="h-4 w-4 accent-[var(--brand-blue)]" checked={prefs.desktop && permission === 'granted'} disabled={permission === 'unsupported'} onChange={toggleDesktop} />
            </label>
            {permission === 'denied' ? <p className="mt-2 text-xs font-semibold text-[var(--danger)]">El navegador bloqueó las notificaciones. Habilitalas desde el candado de la barra de direcciones.</p> : null}
            {permission === 'unsupported' ? <p className="mt-2 text-xs text-[var(--ink-tertiary)]">Este navegador no admite notificaciones.</p> : null}
          </div>
        </div>

        <div className="flex justify-end border-t border-[var(--line-soft)] px-5 py-4"><button type="button" className="btn-primary" onClick={onClose}>Listo</button></div>
      </div>
    </div>
  )
}
