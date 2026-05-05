'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { webhooksApi } from '@/lib/api'
import type { Webhook as WebhookType } from '@/types'
import {
  Webhook as WebhookIcon, Plus, Trash2, TestTube2,
  CheckCircle2, XCircle, Loader2, Copy, Check
} from 'lucide-react'
import clsx from 'clsx'

const EVENT_OPTIONS = [
  'contact.created', 'contact.updated', 'contact.deleted',
  'deal.created',    'deal.updated',    'deal.stage_changed', 'deal.deleted',
]

const EVENT_LABELS: Record<string, string> = {
  'contact.created': 'Contacto creado',
  'contact.updated': 'Contacto actualizado',
  'contact.deleted': 'Contacto eliminado',
  'deal.created':    'Lead creado',
  'deal.updated':    'Lead actualizado',
  'deal.stage_changed': 'Lead movido',
  'deal.deleted':    'Lead eliminado',
}

export default function WebhooksPage() {
  const queryClient               = useQueryClient()
  const [showForm, setShowForm]   = useState(false)
  const [copiedId, setCopiedId]   = useState<string | null>(null)
  const [form, setForm]           = useState({
    name: '',
    url:    '',
    events: [] as string[],
    secret: '',
  })

  const { data: webhooks, isLoading } = useQuery<WebhookType[]>({
    queryKey: ['webhooks'],
    queryFn:  () => webhooksApi.list().then((r) => r.data),
  })

  const createMutation = useMutation({
    
    mutationFn: () => webhooksApi.create({
        ...form,
        secret: form.secret || undefined,  // ← enviar undefined si está vacío
    }),

    onSuccess:  () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] })
      setShowForm(false)
      setForm({ name: '', url: '', events: [], secret: '' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => webhooksApi.delete(id),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['webhooks'] }),
  })

  const testMutation = useMutation({
    mutationFn: (id: string) => webhooksApi.test(id),
  })

  function toggleEvent(event: string) {
    setForm((f) => ({
      ...f,
      events: f.events.includes(event)
        ? f.events.filter((e) => e !== event)
        : [...f.events, event],
    }))
  }

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Webhooks</h1>
          <p className="text-slate-500 font-medium mt-1">
            Notificaciones automáticas a sistemas externos
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary"
        >
          <Plus size={18} strokeWidth={2.5} />
          Nuevo webhook
        </button>
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="interactive-card p-6 mb-8 animate-slide-up">
          <h3 className="text-slate-900 font-bold mb-5 text-lg">Configurar nuevo webhook</h3>

          <div className="space-y-4">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nombre del webhook (ej: n8n contactos) *"
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-[3px] focus:ring-primary-500/30 focus:border-primary-500 placeholder-slate-400 font-medium transition-all"
            />

            <input
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://tu-servidor.com/webhook *"
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-[3px] focus:ring-primary-500/30 focus:border-primary-500 placeholder-slate-400 font-medium transition-all"
            />

            <input
              value={form.secret}
              onChange={(e) => setForm({ ...form, secret: e.target.value })}
              placeholder="Secret (opcional — para verificar firma HMAC)"
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-[3px] focus:ring-primary-500/30 focus:border-primary-500 placeholder-slate-400 font-medium transition-all"
            />

            <div>
              <p className="text-slate-600 text-xs font-bold mb-3 uppercase tracking-wider">Eventos a escuchar:</p>
              <div className="flex flex-wrap gap-2">
                {EVENT_OPTIONS.map((event) => (
                  <button
                    key={event}
                    onClick={() => toggleEvent(event)}
                    className={clsx(
                      'text-xs px-3.5 py-2 rounded-full font-bold transition-all border',
                      form.events.includes(event)
                        ? 'bg-primary-100 border-primary-300 text-primary-800 shadow-sm'
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                    )}
                  >
                    {EVENT_LABELS[event] ?? event}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-6 pt-5 border-t border-slate-100">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!form.name || !form.url || form.events.length === 0 || createMutation.isPending}
              className="btn-primary"
            >
              {createMutation.isPending && <Loader2 size={16} className="animate-spin" />}
              Guardar webhook
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="btn-secondary"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-primary-500" size={40} />
        </div>
      ) : webhooks?.length === 0 ? (
        <div className="text-center py-24 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
          <WebhookIcon size={56} className="mx-auto mb-4 text-slate-300" strokeWidth={1.5} />
          <p className="text-slate-500 font-medium text-lg">No hay webhooks configurados</p>
          <p className="text-slate-400 text-sm mt-1">Sincronizá tus datos con plataformas externas agregando uno.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {webhooks?.map((wh) => (
            <div
              key={wh.id}
              className="interactive-card p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">

                  {/* URL y estado */}
                  <div className="flex items-center gap-2 mb-3">
                    {wh.isActive ? (
                      <CheckCircle2 size={16} className="text-emerald-500 shrink-0" strokeWidth={2.5} />
                    ) : (
                      <XCircle size={16} className="text-red-500 shrink-0" strokeWidth={2.5} />
                    )}
                    <span className="text-slate-900 text-base font-semibold truncate tracking-tight">
                      {wh.url}
                    </span>
                    <button
                      onClick={() => copyToClipboard(wh.url, wh.id)}
                      className="text-slate-400 hover:text-primary-600 transition-colors shrink-0 p-1 hover:bg-primary-50 rounded-md"
                      title="Copiar URL"
                    >
                      {copiedId === wh.id
                        ? <Check size={14} className="text-emerald-500" />
                        : <Copy size={14} />
                      }
                    </button>
                  </div>

                  {/* Eventos */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {wh.events.map((event: string) => (
                      <span
                        key={event}
                        className="text-xs font-bold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md border border-slate-200"
                      >
                        {EVENT_LABELS[event] ?? event}
                      </span>
                    ))}
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-5 mt-2 bg-slate-50 px-3 py-2 rounded-lg inline-flex border border-slate-100">
                    <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                      {wh.successCount} exitosos
                    </span>
                    <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                      {wh.failureCount} fallidos
                    </span>
                    {wh.lastTriggeredAt && (
                      <span className="text-xs font-medium text-slate-400 border-l border-slate-200 pl-4">
                        Última vez: {new Date(wh.lastTriggeredAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Acciones */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => testMutation.mutate(wh.id)}
                    disabled={testMutation.isPending}
                    className="btn-secondary !text-xs !py-1.5 !px-3"
                    title="Enviar evento de prueba"
                  >
                    {testMutation.isPending
                      ? <Loader2 size={12} className="animate-spin" />
                      : <TestTube2 size={12} />
                    }
                    Test
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(wh.id)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
