'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pipelinesApi, regionsApi, branchesApi } from '@/lib/api'
import { auth } from '@/lib/auth'
import type { Pipeline, Stage, Region, Branch } from '@/types'
import {
  Plus, Trash2, Pencil, Check, X,
  Loader2, ChevronRight, Layers, MapPin, Building2, Target
} from 'lucide-react'
import clsx from 'clsx'
import Link from 'next/link'

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#06b6d4', '#a855f7', '#64748b',
]

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {COLORS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={clsx(
            'w-5 h-5 rounded-full transition-transform',
            value === c ? 'ring-2 ring-white ring-offset-1 ring-offset-gray-900 scale-110' : ''
          )}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  )
}

export default function PipelinesPage() {
  const currentUser = auth.get()
  const isOwner = currentUser?.role === 'owner'
  const isRegional = currentUser?.role === 'regional_manager'

  const queryClient = useQueryClient()
  const [newPipelineName, setNewPipelineName]     = useState('')
  const [newPipelineRegionId, setNewPipelineRegionId] = useState('')
  const [newPipelineBranchId, setNewPipelineBranchId] = useState('')

  const [editingPipeline, setEditingPipeline]     = useState<string | null>(null)
  const [editingPipelineData, setEditingPipelineData] = useState({ name: '', regionId: '', branchId: '' })

  const [expandedPipeline, setExpandedPipeline]   = useState<string | null>(null)
  const [newStageName, setNewStageName]           = useState('')
  const [newStageColor, setNewStageColor]         = useState('#6366f1')
  const [newStageTargetBranchId, setNewStageTargetBranchId] = useState('')
  const [newStageTargetRegionId, setNewStageTargetRegionId] = useState('')
  const [editingStage, setEditingStage]           = useState<string | null>(null)
  const [editingStageData, setEditingStageData]   = useState({ name: '', color: '', targetBranchId: '' as string, targetRegionId: '' as string })

  const { data: pipelines, isLoading } = useQuery<Pipeline[]>({
    queryKey: ['pipelines'],
    queryFn:  () => pipelinesApi.list().then((r) => r.data),
  })

  const { data: regions = [] } = useQuery<Region[]>({
    queryKey: ['regions'],
    queryFn:  () => regionsApi.list().then((r) => r.data),
  })

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn:  () => branchesApi.list().then((r) => r.data),
  })

  const createPipeline = useMutation({
    mutationFn: () => pipelinesApi.create({
      name: newPipelineName,
      regionId: newPipelineRegionId || null,
      branchId: newPipelineBranchId || null,
    }),
    onSuccess:  () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] })
      setNewPipelineName('')
      setNewPipelineRegionId('')
      setNewPipelineBranchId('')
    },
  })

  const updatePipeline = useMutation({
    mutationFn: (id: string) => pipelinesApi.update(id, {
      name: editingPipelineData.name,
      regionId: editingPipelineData.regionId || null,
      branchId: editingPipelineData.branchId || null,
    }),
    onSuccess:  () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] })
      setEditingPipeline(null)
    },
  })

  const deletePipeline = useMutation({
    mutationFn: (id: string) => pipelinesApi.delete(id),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['pipelines'] }),
  })

  const createStage = useMutation({
    mutationFn: (pipelineId: string) =>
      pipelinesApi.createStage(pipelineId, {
        name: newStageName,
        color: newStageColor,
        targetBranchId: newStageTargetBranchId || null,
        targetRegionId: newStageTargetRegionId || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] })
      setNewStageName('')
      setNewStageColor('#6366f1')
      setNewStageTargetBranchId('')
      setNewStageTargetRegionId('')
    },
  })

  const updateStage = useMutation({
    mutationFn: ({ pipelineId, stageId }: { pipelineId: string; stageId: string }) =>
      pipelinesApi.updateStage(pipelineId, stageId, {
        name: editingStageData.name,
        color: editingStageData.color,
        targetBranchId: editingStageData.targetBranchId || null,
        targetRegionId: editingStageData.targetRegionId || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] })
      setEditingStage(null)
    },
  })

  const deleteStage = useMutation({
    mutationFn: ({ pipelineId, stageId }: { pipelineId: string; stageId: string }) =>
      pipelinesApi.deleteStage(pipelineId, stageId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipelines'] }),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-indigo-500" size={32} />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Embudo de Ventas (Pipelines)</h1>
        <p className="text-slate-500 font-medium mt-1">Configurá las etapas por las que pasan tus leads</p>
      </div>

      {/* Crear pipeline */}
      <div className="interactive-card p-5 mb-8 flex flex-col gap-4 shadow-sm shadow-slate-200/50">
        <div className="flex gap-3">
          <input
            value={newPipelineName}
            onChange={(e) => setNewPipelineName(e.target.value)}
            placeholder="Nombre del nuevo embudo (Ej: Proceso B2B)..."
            className="flex-1 bg-slate-50 border border-slate-200 text-slate-900 font-medium rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-[3px] focus:ring-primary-500/30 focus:border-primary-500 placeholder-slate-400 transition-all"
          />
          <button
            onClick={() => createPipeline.mutate()}
            disabled={!newPipelineName || createPipeline.isPending}
            className="btn-primary whitespace-nowrap px-6"
          >
            {createPipeline.isPending
              ? <Loader2 size={16} className="animate-spin" />
              : <Plus size={18} strokeWidth={2.5}/>
            }
            Crear embudo
          </button>
        </div>

        {(isOwner || isRegional) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Región (Opcional)</label>
              <select
                value={newPipelineRegionId}
                onChange={(e) => {
                  setNewPipelineRegionId(e.target.value)
                  setNewPipelineBranchId('') // Reset branch when region changes
                }}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 font-semibold rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-primary-500/30"
              >
                <option value="">General (Sin asignar)</option>
                {regions.map((region) => (
                  <option key={region.id} value={region.id}>{region.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Sucursal (Opcional)</label>
              <select
                value={newPipelineBranchId}
                onChange={(e) => {
                  setNewPipelineBranchId(e.target.value)
                  if (e.target.value) {
                    // Auto-set Region based on Branch
                    const selectedBranch = branches.find(b => b.id === e.target.value)
                    if (selectedBranch) {
                      setNewPipelineRegionId(selectedBranch.regionId)
                    }
                  }
                }}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 font-semibold rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-primary-500/30"
              >
                <option value="">General (Sin asignar)</option>
                {branches
                  .filter(b => !newPipelineRegionId || b.regionId === newPipelineRegionId)
                  .map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))
                }
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Lista de pipelines */}
      {pipelines?.length === 0 ? (
        <div className="text-center py-24 bg-slate-50/50 border border-dashed border-slate-200 rounded-2xl">
          <Layers size={56} className="text-slate-300 mx-auto mb-4" strokeWidth={1.5} />
          <p className="text-slate-500 font-medium text-lg">No tenés embudos configurados</p>
          <p className="text-slate-400 text-sm mt-1">Creá uno arriba para empezar a organizar tus ventas</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pipelines?.map((pipeline) => (
            <div key={pipeline.id} className="interactive-card overflow-hidden">

              {/* Header del pipeline */}
              <div className="flex items-center gap-4 p-5">
                <button
                  onClick={() => setExpandedPipeline(
                    expandedPipeline === pipeline.id ? null : pipeline.id
                  )}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-all shrink-0"
                >
                  <ChevronRight
                    size={20}
                    className={clsx('transition-transform duration-200', expandedPipeline === pipeline.id && 'rotate-90')}
                  />
                </button>

                {editingPipeline === pipeline.id ? (
                  <div className="flex flex-col gap-3 flex-1">
                    <div className="flex items-center gap-3">
                      <input
                        value={editingPipelineData.name}
                        onChange={(e) => setEditingPipelineData({ ...editingPipelineData, name: e.target.value })}
                        className="flex-1 bg-white border border-slate-300 text-slate-900 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-primary-500/30 focus:border-primary-500 shadow-sm"
                        autoFocus
                      />
                      <button
                        onClick={() => updatePipeline.mutate(pipeline.id)}
                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                      >
                        <Check size={18} strokeWidth={2.5} />
                      </button>
                      <button
                        onClick={() => setEditingPipeline(null)}
                        className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-md transition-colors"
                      >
                        <X size={18} strokeWidth={2.5} />
                      </button>
                    </div>

                    {(isOwner || isRegional) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <select
                          value={editingPipelineData.regionId}
                          onChange={(e) => {
                            setEditingPipelineData({
                              ...editingPipelineData,
                              regionId: e.target.value,
                              branchId: '', // Reset branch when region changes
                            })
                          }}
                          className="bg-white border border-slate-200 text-slate-900 font-semibold rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                        >
                          <option value="">General (Sin asignar)</option>
                          {regions.map((region) => (
                            <option key={region.id} value={region.id}>{region.name}</option>
                          ))}
                        </select>

                        <select
                          value={editingPipelineData.branchId}
                          onChange={(e) => {
                            let regionId = editingPipelineData.regionId
                            if (e.target.value) {
                              const b = branches.find(x => x.id === e.target.value)
                              if (b) regionId = b.regionId
                            }
                            setEditingPipelineData({
                              ...editingPipelineData,
                              branchId: e.target.value,
                              regionId,
                            })
                          }}
                          className="bg-white border border-slate-200 text-slate-900 font-semibold rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                        >
                          <option value="">General (Sin asignar)</option>
                          {branches
                            .filter(b => !editingPipelineData.regionId || b.regionId === editingPipelineData.regionId)
                            .map((branch) => (
                              <option key={branch.id} value={branch.id}>{branch.name}</option>
                            ))
                          }
                        </select>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center flex-wrap gap-2.5 flex-1 min-w-0"
                       onClick={() => setExpandedPipeline(expandedPipeline === pipeline.id ? null : pipeline.id)}
                       style={{ cursor: 'pointer' }}
                  >
                    <span className="text-slate-900 font-bold text-lg truncate">{pipeline.name}</span>
                    <span className="text-xs font-bold text-primary-600 bg-primary-50 px-2 py-0.5 rounded-md border border-primary-100 whitespace-nowrap">
                      {pipeline.stages.length} etapas
                    </span>
                    {pipeline.branch && (
                      <span className="text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <Building2 size={12} className="text-slate-400" /> {pipeline.branch.name}
                      </span>
                    )}
                    {!pipeline.branch && pipeline.region && (
                      <span className="text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <MapPin size={12} className="text-slate-400" /> {pipeline.region.name}
                      </span>
                    )}
                    {!pipeline.branch && !pipeline.region && (
                      <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                        General
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 shrink-0 ml-auto">
                  <Link
                      href={`/leads/${pipeline.id}`}
                    className="text-xs font-bold text-primary-600 hover:text-primary-700 hover:bg-primary-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-primary-100 mr-2"
                  >
                    Ver tablero Kanban
                  </Link>
                  <button
                    onClick={() => {
                      setEditingPipeline(pipeline.id)
                      setEditingPipelineData({
                        name: pipeline.name,
                        regionId: pipeline.regionId || '',
                        branchId: pipeline.branchId || '',
                      })
                    }}
                    className="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 rounded-lg transition-colors"
                    title="Editar nombre"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => {
                        if (confirm(`¿Eliminar todo el embudo "${pipeline.name}"?`)) {
                            deletePipeline.mutate(pipeline.id)
                        }
                    }}
                    className="p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors"
                    title="Eliminar embudo"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Etapas expandidas */}
              {expandedPipeline === pipeline.id && (
                <div className="border-t border-slate-100 p-5 bg-slate-50/50">
                  <div className="space-y-3 mb-6">
                    {/* Lista de etapas */}
                    {pipeline.stages.map((stage) => (
                      <div key={stage.id} className="flex items-center gap-3 bg-white border border-slate-200 shadow-sm rounded-xl px-4 py-3 group">
                        {editingStage === stage.id ? (
                          <div className="flex flex-col gap-3 flex-1">
                            <div className="flex items-center gap-3 flex-wrap">
                              <input
                                value={editingStageData.name}
                                onChange={(e) => setEditingStageData({ ...editingStageData, name: e.target.value })}
                                className="flex-1 min-w-[150px] bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-3 py-1.5 text-sm font-semibold focus:outline-none focus:ring-[3px] focus:ring-primary-500/30 focus:border-primary-500"
                                autoFocus
                              />
                              <ColorPicker
                                value={editingStageData.color}
                                onChange={(c) => setEditingStageData({ ...editingStageData, color: c })}
                              />
                              <div className="flex items-center gap-1 shrink-0">
                                  <button
                                  onClick={() => updateStage.mutate({ pipelineId: pipeline.id, stageId: stage.id })}
                                  className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                                  >
                                  <Check size={16} strokeWidth={2.5}/>
                                  </button>
                                  <button
                                  onClick={() => setEditingStage(null)}
                                  className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-md transition-colors"
                                  >
                                  <X size={16} strokeWidth={2.5}/>
                                  </button>
                              </div>
                            </div>
                            {isOwner && !pipeline.branchId && !pipeline.regionId && (
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vincular a:</span>
                                <select
                                  value={editingStageData.targetBranchId ? `branch:${editingStageData.targetBranchId}` : editingStageData.targetRegionId ? `region:${editingStageData.targetRegionId}` : ''}
                                  onChange={(e) => {
                                    const val = e.target.value
                                    if (val.startsWith('branch:')) {
                                      setEditingStageData({ ...editingStageData, targetBranchId: val.replace('branch:', ''), targetRegionId: '' })
                                    } else if (val.startsWith('region:')) {
                                      setEditingStageData({ ...editingStageData, targetRegionId: val.replace('region:', ''), targetBranchId: '' })
                                    } else {
                                      setEditingStageData({ ...editingStageData, targetBranchId: '', targetRegionId: '' })
                                    }
                                  }}
                                  className="bg-white border border-slate-200 text-slate-900 font-semibold rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                                >
                                  <option value="">Etapa normal (sin vínculo)</option>
                                  {regions.length > 0 && <option disabled className="font-bold text-slate-400">── Regiones ──</option>}
                                  {regions.map((r) => (
                                    <option key={r.id} value={`region:${r.id}`}>📍 {r.name}</option>
                                  ))}
                                  {branches.length > 0 && <option disabled className="font-bold text-slate-400">── Sucursales ──</option>}
                                  {branches.map((b) => (
                                    <option key={b.id} value={`branch:${b.id}`}>🏢 {b.name}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        ) : (
                          <>
                            <div
                              className="w-4 h-4 rounded-full shrink-0 shadow-inner"
                              style={{ backgroundColor: stage.color }}
                            />
                            <span className="text-sm font-bold text-slate-800 flex-1">{stage.name}</span>
                            {stage.targetBranchId && (
                              <span className="text-[10px] font-bold text-cyan-700 bg-cyan-50 border border-cyan-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                                <Building2 size={10} className="text-cyan-500" />
                                {branches.find(b => b.id === stage.targetBranchId)?.name ?? 'Sucursal'}
                              </span>
                            )}
                            {stage.targetRegionId && !stage.targetBranchId && (
                              <span className="text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                                <MapPin size={10} className="text-violet-500" />
                                {regions.find(r => r.id === stage.targetRegionId)?.name ?? 'Región'}
                              </span>
                            )}
                            <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-md">Pos. {stage.position}</span>
                            
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                onClick={() => {
                                    setEditingStage(stage.id)
                                    setEditingStageData({ name: stage.name, color: stage.color, targetBranchId: stage.targetBranchId || '', targetRegionId: stage.targetRegionId || '' })
                                }}
                                className="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 rounded-md transition-colors"
                                >
                                <Pencil size={14} />
                                </button>
                                <button
                                onClick={() => {
                                    if (confirm(`¿Borrar etapa "${stage.name}"?`)) {
                                       deleteStage.mutate({ pipelineId: pipeline.id, stageId: stage.id })
                                    }
                                }}
                                className="p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-md transition-colors"
                                >
                                <Trash2 size={14} />
                                </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Agregar nueva etapa */}
                  <div className="bg-white border border-slate-200 border-dashed rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 hover:border-primary-300 transition-colors">
                    <div className="flex-1 w-full space-y-3">
                        <p className="text-xs text-primary-600 font-bold uppercase tracking-wider flex items-center gap-1">
                            <Plus size={12} strokeWidth={3}/> Configurar nueva etapa
                        </p>
                        <input
                        value={newStageName}
                        onChange={(e) => setNewStageName(e.target.value)}
                        placeholder="Nombre de la etapa (ej: Negociación)..."
                        className="w-full bg-slate-50 border border-slate-200 text-slate-900 font-medium rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-primary-500/30 focus:border-primary-500 placeholder-slate-400 transition-all"
                        />
                        <div className="flex items-center gap-3 flex-wrap">
                             <span className="text-xs text-slate-500 font-medium">Color:</span>
                             <ColorPicker value={newStageColor} onChange={setNewStageColor} />
                        </div>
                        {isOwner && !pipeline.branchId && !pipeline.regionId && (
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-xs text-slate-500 font-medium">Vincular a sucursal/región:</span>
                            <select
                              value={newStageTargetBranchId ? `branch:${newStageTargetBranchId}` : newStageTargetRegionId ? `region:${newStageTargetRegionId}` : ''}
                              onChange={(e) => {
                                const val = e.target.value
                                if (val.startsWith('branch:')) {
                                  setNewStageTargetBranchId(val.replace('branch:', ''))
                                  setNewStageTargetRegionId('')
                                } else if (val.startsWith('region:')) {
                                  setNewStageTargetRegionId(val.replace('region:', ''))
                                  setNewStageTargetBranchId('')
                                } else {
                                  setNewStageTargetBranchId('')
                                  setNewStageTargetRegionId('')
                                }
                              }}
                              className="bg-white border border-slate-200 text-slate-900 font-semibold rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                            >
                              <option value="">Etapa normal (sin vínculo)</option>
                              {regions.length > 0 && <option disabled className="font-bold text-slate-400">── Regiones ──</option>}
                              {regions.map((r) => (
                                <option key={r.id} value={`region:${r.id}`}>📍 {r.name}</option>
                              ))}
                              {branches.length > 0 && <option disabled className="font-bold text-slate-400">── Sucursales ──</option>}
                              {branches.map((b) => (
                                <option key={b.id} value={`branch:${b.id}`}>🏢 {b.name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                    </div>
                    
                    <button
                      onClick={() => createStage.mutate(pipeline.id)}
                      disabled={!newStageName || createStage.isPending}
                      className="btn-primary whitespace-nowrap self-end sm:self-center mt-2 sm:mt-0"
                    >
                      {createStage.isPending
                        ? <Loader2 size={16} className="animate-spin" />
                        : <Plus size={16} strokeWidth={2.5}/>
                      }
                      Agregar etapa
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
