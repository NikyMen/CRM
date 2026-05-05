'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/lib/api'
import type { ApiKey } from '@/types'
import { Key, Plus, Trash2, Copy, Check, Loader2, Eye, EyeOff } from 'lucide-react'

export default function ApiKeysPage() {
  const queryClient                   = useQueryClient()
  const [showForm, setShowForm]       = useState(false)
  const [name, setName]               = useState('')
  const [newKey, setNewKey]           = useState<string | null>(null)
  const [copiedId, setCopiedId]       = useState<string | null>(null)
  const [visibleId, setVisibleId]     = useState<string | null>(null)

  const { data: apiKeys, isLoading } = useQuery<ApiKey[]>({
    queryKey: ['api-keys'],
    queryFn:  () => authApi.listApiKeys().then((r) => r.data),
  })

  const createMutation = useMutation({
    mutationFn: () => authApi.createApiKey({ name }),
    onSuccess: (res) => {
      // El backend devuelve la key completa UNA SOLA VEZ
      // después solo guarda el hash — por eso la mostramos ahora
      setNewKey(res.data.rawKey)
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      setShowForm(false)
      setName('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => authApi.deleteApiKey(id),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
  })

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">API Keys</h1>
          <p className="text-slate-500 font-medium mt-1">
            Gestioná tokens de acceso para integraciones externas
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary"
        >
          <Plus size={18} strokeWidth={2.5} />
          Crear API Key
        </button>
      </div>

      {/* Alerta — nueva key recién creada */}
      {newKey && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-8 shadow-sm animate-slide-up">
          <p className="text-amber-800 text-sm font-bold mb-3 flex items-center gap-2">
            <span className="bg-amber-100 p-1 rounded">⚠️</span> Importante: Copiá esta key ahora. Por seguridad, no se volverá a mostrar.
          </p>
          <div className="flex items-center gap-3 bg-white border border-amber-200/60 rounded-xl p-2 pl-4">
            <code className="text-emerald-600 font-bold text-sm flex-1 break-all font-mono tracking-tight">
              {newKey}
            </code>
            <button
              onClick={() => copyToClipboard(newKey, 'new')}
              className="text-slate-400 hover:text-primary-600 bg-slate-50 hover:bg-primary-50 px-3 py-2 rounded-lg transition-colors shrink-0 border border-slate-200 hover:border-primary-200 flex items-center gap-2 font-bold text-xs"
            >
              {copiedId === 'new' ? (
                <><Check size={16} className="text-emerald-500" /> Copiada</>
              ) : (
                <><Copy size={16} /> Copiar</>
              )}
            </button>
          </div>
          <button
            onClick={() => setNewKey(null)}
            className="text-xs font-bold text-amber-700/60 hover:text-amber-700 mt-4 transition-colors"
          >
            Cerrar este mensaje
          </button>
        </div>
      )}

      {/* Formulario */}
      {showForm && (
        <div className="interactive-card p-6 mb-8 animate-slide-up">
          <h3 className="text-slate-900 font-bold mb-5 flex items-center gap-2 text-lg">
             <Key size={20} className="text-primary-500"/> Registrar nueva credencial
          </h3>
          <div className="flex flex-col sm:flex-row gap-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre identificador (ej: n8n producción) *"
              className="flex-1 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-[3px] focus:ring-primary-500/30 focus:border-primary-500 font-medium placeholder-slate-400 transition-all"
              autoFocus
            />
            <div className="flex gap-3">
                <button
                onClick={() => createMutation.mutate()}
                disabled={!name || createMutation.isPending}
                className="btn-primary py-3"
                >
                {createMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={18} strokeWidth={2.5} />}
                Generar Token
                </button>
                <button
                onClick={() => setShowForm(false)}
                className="btn-secondary py-3"
                >
                Cancelar
                </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-primary-500" size={40} />
        </div>
      ) : apiKeys?.length === 0 ? (
        <div className="text-center py-24 bg-slate-50/50 border border-dashed border-slate-200 rounded-2xl">
          <Key size={56} className="text-slate-300 mx-auto mb-4" strokeWidth={1.5} />
          <p className="text-slate-500 font-medium text-lg">No hay API Keys generadas</p>
          <p className="text-slate-400 text-sm mt-1">
            Creá una credencial para automatizar el CRM con otros servicios.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {apiKeys?.map((apiKey) => (
            <div
              key={apiKey.id}
              className="interactive-card p-5 flex items-center gap-5"
            >
              {/* Ícono */}
              <div className="w-12 h-12 bg-primary-50 border border-primary-100 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
                <Key size={20} className="text-primary-500" strokeWidth={2.5}/>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-slate-900 text-base font-extrabold tracking-tight">{apiKey.name}</p>
                <div className="flex items-center gap-3 mt-1.5">
                  <code className="text-xs font-bold text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1 rounded-md tracking-wider">
                    {visibleId === apiKey.id
                      ? apiKey.keyPrefix + '••••••••••••••••'
                      : apiKey.keyPrefix + '••••'
                    }
                  </code>
                  <button
                    onClick={() =>
                      setVisibleId(visibleId === apiKey.id ? null : apiKey.id)
                    }
                    className="p-1 px-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 rounded-md transition-colors flex items-center justify-center"
                    title={visibleId === apiKey.id ? 'Ocultar resto del token' : 'Revelar logitud del token'}
                  >
                    {visibleId === apiKey.id
                      ? <EyeOff size={14} />
                      : <Eye size={14} />
                    }
                  </button>
                </div>
                <div className="flex items-center gap-4 mt-2">
                    <p className="text-xs font-medium text-slate-400">
                    Generada el {new Date(apiKey.createdAt).toLocaleDateString()}
                    </p>
                    {apiKey.lastUsedAt && (
                        <p className="text-xs font-medium text-primary-600 bg-primary-50 px-2.5 py-0.5 rounded-md border border-primary-100">
                        Último uso: {new Date(apiKey.lastUsedAt).toLocaleDateString()}
                        </p>
                    )}
                </div>
              </div>

              {/* Eliminar */}
              <button
                onClick={() => {
                   if (confirm(`¿Estás seguro que querés revocar la API Key "${apiKey.name}"? Cualquier integración que la use dejará de funcionar.`)) {
                       deleteMutation.mutate(apiKey.id)
                   }
                }}
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors shrink-0"
                title="Revocar key permanentemente"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Explicación de uso */}
      <div className="mt-12 bg-slate-50 border border-slate-200 rounded-2xl p-6">
        <h3 className="text-slate-900 text-sm font-bold mb-4 uppercase tracking-widest flex items-center gap-2">
            <Key size={16} className="text-primary-500" strokeWidth={2.5}/> Cómo autenticar consultas API
        </h3>
        <p className="text-slate-600 text-sm font-medium mb-3">
          Deberás incluir un encabezado HTTP personalizado en cada petición que hagas a los servidores del CRM:
        </p>
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm text-sm">
            <span className="font-bold text-slate-400">Header:</span> <code className="font-bold text-slate-900">X-API-Key</code>
            <br />
            <span className="font-bold text-slate-400">Value:</span> <code className="font-bold text-primary-600">crm_tu_token_seguro_aqui</code>
        </div>
      </div>

    </div>
  )
}