'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { regionsApi } from '@/lib/api'
import type { Region } from '@/types'
import { MapPin, Plus, Trash2, Edit2, Check, X, Loader2 } from 'lucide-react'

export default function RegionsSettingsPanel() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const { data: regions = [], isLoading } = useQuery<Region[]>({
    queryKey: ['regions'],
    queryFn: () => regionsApi.list().then((r) => r.data),
  })

  const createMutation = useMutation({
    mutationFn: () => regionsApi.create({ name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regions'] })
      setShowForm(false)
      setName('')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => regionsApi.update(id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regions'] })
      setEditingId(null)
      setEditName('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => regionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regions'] })
      // También invalidamos sucursales porque están vinculadas
      queryClient.invalidateQueries({ queryKey: ['branches'] })
    },
  })

  const startEdit = (region: Region) => {
    setEditingId(region.id)
    setEditName(region.name)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName('')
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Regiones Geográficas</h2>
          <p className="text-slate-500 font-medium mt-1">
            Manejá las regiones geográficas para organizar tus sucursales y gerentes
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary"
        >
          <Plus size={18} strokeWidth={2.5} />
          Crear Región
        </button>
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="interactive-card p-6 mb-8 animate-slide-up">
          <h3 className="text-slate-900 font-bold mb-5 flex items-center gap-2 text-lg">
             <MapPin size={20} className="text-primary-500"/> Crear Nueva Región
          </h3>
          <div className="flex flex-col sm:flex-row gap-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre de la región (ej: Región Metropolitana) *"
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
                Crear Región
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
      ) : regions.length === 0 ? (
        <div className="text-center py-24 bg-slate-50/50 border border-dashed border-slate-200 rounded-2xl">
          <MapPin size={56} className="text-slate-300 mx-auto mb-4" strokeWidth={1.5} />
          <p className="text-slate-500 font-medium text-lg">No hay regiones configuradas</p>
          <p className="text-slate-400 text-sm mt-1">
            Creá una región para empezar a agrupar tus sucursales de venta.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {regions.map((region) => {
            const isEditing = editingId === region.id
            const branchCount = region.branches?.length || 0

            return (
              <div
                key={region.id}
                className="interactive-card p-5 flex items-center justify-between gap-5"
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-12 h-12 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
                    <MapPin size={20} className="text-indigo-500" strokeWidth={2.5}/>
                  </div>

                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 max-w-md bg-slate-50 border border-slate-200 text-slate-900 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 font-semibold"
                        autoFocus
                      />
                      <button
                        onClick={() => updateMutation.mutate({ id: region.id, name: editName })}
                        disabled={!editName || updateMutation.isPending}
                        className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors border border-transparent hover:border-emerald-100 shrink-0"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="p-2 text-slate-400 hover:bg-slate-50 rounded-lg transition-colors border border-transparent hover:border-slate-100 shrink-0"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <p className="text-slate-900 text-base font-extrabold tracking-tight truncate">{region.name}</p>
                      <p className="text-xs font-semibold text-indigo-500 mt-1">
                        {branchCount} sucursal{branchCount !== 1 ? 'es' : ''} asignada{branchCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                  )}
                </div>

                {!isEditing && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => startEdit(region)}
                      className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-colors shrink-0"
                      title="Editar nombre"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`¿Estás seguro de que deseas eliminar la región "${region.name}"? Esto eliminará todas las sucursales asignadas a ella.`)) {
                          deleteMutation.mutate(region.id)
                        }
                      }}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors shrink-0"
                      title="Eliminar región"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
