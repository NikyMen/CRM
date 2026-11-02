export type NotificationLine = 'tickets' | 'collections' | 'commercial'

export const NOTIFICATION_LINES: Array<{ key: NotificationLine; label: string; description: string }> = [
  { key: 'tickets', label: 'Tickets', description: 'Mensajes del número de atención al cliente' },
  { key: 'collections', label: 'Cobranzas', description: 'Mensajes del número de cobranzas' },
  { key: 'commercial', label: 'Gestión comercial', description: 'Mensajes del número comercial' },
]

export type NotificationPrefs = {
  sound: boolean
  desktop: boolean
  volume: number
  lines: Record<NotificationLine, boolean>
}

const STORAGE_KEY = 'romez-notification-prefs'
const CHANGE_EVENT = 'romez_notification_prefs'
const MIN_GAP_MS = 1500

export const DEFAULT_PREFS: NotificationPrefs = {
  sound: true,
  desktop: false,
  volume: 0.7,
  lines: { tickets: true, collections: true, commercial: true },
}

export function readPrefs(): NotificationPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<NotificationPrefs> | null
    if (!raw) return DEFAULT_PREFS
    return {
      sound: raw.sound ?? DEFAULT_PREFS.sound,
      desktop: raw.desktop ?? DEFAULT_PREFS.desktop,
      volume: typeof raw.volume === 'number' ? Math.min(1, Math.max(0, raw.volume)) : DEFAULT_PREFS.volume,
      lines: { ...DEFAULT_PREFS.lines, ...(raw.lines ?? {}) },
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export function savePrefs(prefs: NotificationPrefs) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)) } catch { /* almacenamiento bloqueado */ }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function onPrefsChange(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener)
  window.addEventListener('storage', listener)
  return () => { window.removeEventListener(CHANGE_EVENT, listener); window.removeEventListener('storage', listener) }
}

// Una melodía corta distinta por número: [frecuencia Hz, duración s].
const MELODIES: Record<NotificationLine, { wave: OscillatorType; notes: Array<[number, number]> }> = {
  tickets: { wave: 'sine', notes: [[880, 0.12], [1318.5, 0.2]] },
  collections: { wave: 'triangle', notes: [[523.25, 0.12], [659.25, 0.12], [783.99, 0.22]] },
  commercial: { wave: 'square', notes: [[1046.5, 0.08], [783.99, 0.08], [1046.5, 0.08], [1318.5, 0.16]] },
}

let audioContext: AudioContext | null = null
const lastPlayed: Partial<Record<NotificationLine, number>> = {}

function getContext() {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  audioContext ??= new Ctor()
  return audioContext
}

/** Los navegadores sólo permiten audio tras un gesto del usuario: lo habilitamos en la primera interacción. */
export function unlockAudioOnFirstGesture() {
  const unlock = () => {
    void getContext()?.resume().catch(() => {})
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
  return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock) }
}

export function playLineSound(line: NotificationLine, volume = readPrefs().volume) {
  const context = getContext()
  if (!context || volume <= 0) return
  void context.resume().catch(() => {})
  const { wave, notes } = MELODIES[line]
  let start = context.currentTime + 0.02
  for (const [frequency, duration] of notes) {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = wave
    oscillator.frequency.value = frequency
    // Sobre cuadrada suena más fuerte: se compensa para que todas se perciban parecido.
    const peak = Math.max(0.0001, volume * (wave === 'square' ? 0.12 : 0.3))
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(start)
    oscillator.stop(start + duration + 0.02)
    start += duration + 0.03
  }
}

export function desktopNotificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

export async function requestDesktopPermission() {
  if (!desktopNotificationsSupported()) return 'denied' as NotificationPermission
  if (Notification.permission !== 'default') return Notification.permission
  return Notification.requestPermission()
}

/** Se invoca por cada mensaje entrante en vivo: aplica las preferencias de este navegador. */
export function notifyIncomingMessage(line: NotificationLine) {
  const prefs = readPrefs()
  if (!prefs.lines[line]) return
  const now = Date.now()
  if (now - (lastPlayed[line] ?? 0) < MIN_GAP_MS) return
  lastPlayed[line] = now
  if (prefs.sound) playLineSound(line, prefs.volume)
  if (prefs.desktop && desktopNotificationsSupported() && Notification.permission === 'granted' && document.visibilityState === 'hidden') {
    const label = NOTIFICATION_LINES.find((item) => item.key === line)?.label ?? 'WhatsApp'
    try { new Notification(`Nuevo mensaje · ${label}`, { body: 'Tenés un mensaje nuevo en WhatsApp.', tag: `romez-${line}` }) } catch { /* notificación no disponible */ }
  }
}
