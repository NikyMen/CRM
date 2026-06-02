'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { branchesApi, regionsApi } from '@/lib/api'
import type { Branch, Region } from '@/types'
import { Building2, Plus, Trash2, Edit2, Check, X, Loader2, MapPin, ChevronDown } from 'lucide-react'
import clsx from 'clsx'

export default function BranchesSettingsPanel() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    regionId: '',
    name: '',
    address: '',
  })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    regionId: '',
    name: '',
    address: '',
  })

  const { data: branches = [], isLoading: loadingBranches } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list().then((r) => r.data),
  })

  const { data: regions = [], isLoading: loadingRegions } = useQuery<Region[]>({
    queryKey: ['regions'],
    queryFn: () => regionsApi.list().then((r) => r.data),
  })

  const createMutation = useMutation({
    mutationFn: () => branchesApi.create(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      setShowForm(false)
      setForm({ regionId: '', name: '', address: '' })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Parameters<typeof branchesApi.update>[1]> }) =>
      branchesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      // También invalidamos el equipo por si cambió la sucursal o su estado
      queryClient.invalidateQueries({ queryKey: ['team'] })
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => branchesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] })
    },
  })

  const startEdit = (branch: Branch) => {
    setEditingId(branch.id)
    setEditForm({
      regionId: branch.regionId,
      name: branch.name,
      address: branch.address || '',
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const toggleBranchStatus = (branch: Branch) => {
    const actionText = branch.isActive ? 'desactivar' : 'activar'
    if (confirm(`¿Estás seguro de que deseas ${actionText} la sucursal "${branch.name}"? Los gerentes y vendedores de esta sucursal perderán acceso inmediatamente.`)) {
      updateMutation.mutate({
        id: branch.id,
        data: { isActive: !branch.isActive },
      })
    }
  }

  const isLoading = loadingBranches || loadingRegions

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Sucursales Físicas</h2>
          <p className="text-slate-500 font-medium mt-1">
            Manejá los locales de venta de tu negocio y asignales regiones geográficas
          </p>
        </div>
        <button
          onClick={() => {
            if (regions.length === 0) {
              alert('Debes crear al menos una región antes de crear una sucursal.')
              return
            }
            setShowForm(true)
          }}
          className="btn-primary"
        >
          <Plus size={18} strokeWidth={2.5} />
          Crear Sucursal
        </button>
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="interactive-card p-6 mb-8 animate-slide-up">
          <h3 className="text-slate-900 font-bold mb-5 flex items-center gap-2 text-lg">
             <Building2 size={20} className="text-primary-500"/> Crear Nueva Sucursal
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="relative">
              <select
                value={form.regionId}
                onChange={(e) => setForm({ ...form, regionId: e.target.value })}
                className="appearance-none w-full bg-slate-50 border border-slate-200 text-slate-900 font-semibold rounded-xl pl-4 pr-10 py-3 text-sm focus:outline-none focus:ring-[3px] focus:ring-primary-500/30 border-primary-500 cursor-pointer"
              >
                <option value="">Seleccionar Región *</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" strokeWidth={2.5}/>
            </div>

            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nombre de la sucursal (ej: Local Centro) *"
              className="bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-[3px] focus:ring-primary-500/30 focus:border-primary-500 font-medium placeholder-slate-400 transition-all"
            />

            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Dirección física"
              className="bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-[3px] focus:ring-primary-500/30 focus:border-primary-500 font-medium placeholder-slate-400 transition-all"
            />
          </div>

          <div className="flex gap-3 pt-4 border-t border-slate-100">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!form.regionId || !form.name || createMutation.isPending}
              className="btn-primary py-2.5"
            >
              {createMutation.isPending && <Loader2 size={16} className="animate-spin" />}
              Crear Sucursal
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="btn-secondary py-2.5"
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
      ) : branches.length === 0 ? (
        <div className="text-center py-24 bg-slate-50/50 border border-dashed border-slate-200 rounded-2xl">
          <Building2 size={56} className="text-slate-300 mx-auto mb-4" strokeWidth={1.5} />
          <p className="text-slate-500 font-medium text-lg">No hay sucursales configuradas</p>
          <p className="text-slate-400 text-sm mt-1">
            Creá un local de venta físico y asignalo a una de tus regiones.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {branches.map((branch) => {
            const isEditing = editingId === branch.id

            return (
              <div
                key={branch.id}
                className="interactive-card p-5 flex flex-col md:flex-row md:items-center justify-between gap-5"
              >
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div className="w-12 h-12 bg-primary-50 border border-primary-100 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
                    <Building2 size={20} className="text-primary-500" strokeWidth={2.5}/>
                  </div>

                  {isEditing ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
                      <div className="relative">
                        <select
                          value={editForm.regionId}
                          onChange={(e) => setEditForm({ ...editForm, regionId: e.target.value })}
                          className="appearance-none w-full bg-white border border-slate-200 text-slate-900 font-semibold rounded-lg pl-3 pr-8 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
                        >
                          {regions.map((r) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                        <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" strokeWidth={2.5}/>
                      </div>

                      <input
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="bg-white border border-slate-200 text-slate-900 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 font-semibold"
                        placeholder="Nombre de la sucursal"
                      />

                      <input
                        value={editForm.address}
                        onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                        className="bg-white border border-slate-200 text-slate-900 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 font-semibold"
                        placeholder="Dirección"
                      />
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <p className="text-slate-900 text-base font-extrabold tracking-tight truncate">{branch.name}</p>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 mt-1 flex-wrap">
                        <span className="flex items-center gap-1">
                          <MapPin size={12} className="text-slate-300" />
                          {branch.region?.name || 'Región General'}
                        </span>
                        {branch.address && (
                          <>
                            <span className="text-slate-300">•</span>
                            <span className="truncate">{branch.address}</span>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Controles de estado y acciones */}
                <div className="flex items-center gap-3 justify-end">
                  {isEditing ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          updateMutation.mutate({
                            id: branch.id,
                            data: {
                              regionId: editForm.regionId,
                              name: editForm.name,
                              address: editForm.address || null,
                            },
                          })
                        }
                        disabled={!editForm.regionId || !editForm.name || updateMutation.isPending}
                        className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors border border-transparent hover:border-emerald-100"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="p-2 text-slate-400 hover:bg-slate-50 rounded-lg transition-colors border border-transparent hover:border-slate-100"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Estado activa / inactiva */}
                      <button
                        onClick={() => toggleBranchStatus(branch)}
                        className={clsx(
                          'px-2.5 py-1 rounded-full text-xs font-bold border transition-all active:scale-95',
                          branch.isActive
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100/50'
                            : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100/50'
                        )}
                      >
                        {branch.isActive ? 'Activa' : 'Inactiva'}
                      </button>

                      <button
                        onClick={() => startEdit(branch)}
                        className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-colors shrink-0"
                        title="Editar sucursal"
                      >
                        <Edit2 size={16} />
                      </button>

                      <button
                        onClick={() => {
                          if (confirm(`¿Estás seguro de que deseas eliminar la sucursal "${branch.name}"? Cualquier deal o contacto asignado a ella quedará sin sucursal asignada.`)) {
                            deleteMutation.mutate(branch.id)
                          }
                        }}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors shrink-0"
                        title="Eliminar sucursal"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
