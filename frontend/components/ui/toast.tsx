'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import clsx from 'clsx'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  title: string
  description?: string
}

interface ToastContextType {
  toasts: Toast[]
  toast: (options: Omit<Toast, 'id'>) => void
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

const ICONS: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

const STYLES: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: { bg: 'var(--semantic-success-bg)', border: 'rgba(22,163,74,0.2)', icon: 'var(--semantic-success)' },
  error: { bg: 'var(--semantic-danger-bg)', border: 'rgba(220,38,38,0.2)', icon: 'var(--semantic-danger)' },
  warning: { bg: 'var(--semantic-warning-bg)', border: 'rgba(217,119,6,0.2)', icon: 'var(--semantic-warning)' },
  info: { bg: 'var(--accent-muted)', border: 'rgba(124,58,237,0.2)', icon: 'var(--accent)' },
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const Icon = ICONS[toast.type]
  const style = STYLES[toast.type]

  return (
    <div
      className="animate-slide-up pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg p-4 shadow-lg"
      style={{
        background: style.bg,
        border: `1px solid ${style.border}`,
      }}
    >
      <Icon size={18} style={{ color: style.icon }} className="shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--ink-primary)' }}>
          {toast.title}
        </p>
        {toast.description && (
          <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-secondary)' }}>
            {toast.description}
          </p>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="shrink-0 rounded p-1 transition-colors"
        style={{ color: 'var(--ink-tertiary)' }}
        onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'}
        onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = 'transparent'}
      >
        <X size={14} />
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((options: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { ...options, id }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
