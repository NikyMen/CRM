'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

const WAIT_SECONDS = 5

type ConfirmOptions = { title?: string; message: string; confirmLabel?: string }
type Pending = ConfirmOptions & { resolve: (confirmed: boolean) => void }

const ConfirmDeleteContext = createContext<((options: ConfirmOptions | string) => Promise<boolean>) | null>(null)

/** Confirmación de borrado: el botón se habilita recién después de 5 segundos. */
export function useConfirmDelete() {
  const confirmDelete = useContext(ConfirmDeleteContext)
  if (!confirmDelete) throw new Error('useConfirmDelete requiere ConfirmDeleteProvider')
  return confirmDelete
}

export function ConfirmDeleteProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const pendingRef = useRef<Pending | null>(null)

  const confirmDelete = useCallback((options: ConfirmOptions | string) => new Promise<boolean>((resolve) => {
    pendingRef.current?.resolve(false)
    const next = { ...(typeof options === 'string' ? { message: options } : options), resolve }
    pendingRef.current = next
    setPending(next)
  }), [])

  const close = (confirmed: boolean) => {
    pendingRef.current?.resolve(confirmed)
    pendingRef.current = null
    setPending(null)
  }

  return <ConfirmDeleteContext.Provider value={confirmDelete}>{children}{pending ? <ConfirmDeleteDialog key={pending.message} options={pending} close={close} /> : null}</ConfirmDeleteContext.Provider>
}

function ConfirmDeleteDialog({ options, close }: { options: ConfirmOptions; close: (confirmed: boolean) => void }) {
  const [remaining, setRemaining] = useState(WAIT_SECONDS)

  useEffect(() => {
    if (remaining <= 0) return
    const timer = window.setTimeout(() => setRemaining((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [remaining])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])

  return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(false) }}>
    <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-delete-title" aria-describedby="confirm-delete-message" className="paper-panel w-full max-w-md animate-slide-up p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--danger-paper)] text-[var(--danger)]"><AlertTriangle size={20} /></span>
        <div className="min-w-0">
          <h2 id="confirm-delete-title" className="font-display text-base font-extrabold text-[var(--ink-primary)]">{options.title ?? '¿Estás seguro que querés eliminar?'}</h2>
          <p id="confirm-delete-message" className="mt-2 text-sm text-[var(--ink-secondary)]">{options.message}</p>
        </div>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn-secondary" autoFocus onClick={() => close(false)}>Cancelar</button>
        <button type="button" className="btn-danger" disabled={remaining > 0} onClick={() => close(true)}>{remaining > 0 ? `Esperá ${remaining}s…` : options.confirmLabel ?? 'Sí, eliminar'}</button>
      </div>
    </div>
  </div>
}
