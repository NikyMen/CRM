'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { teamApi, regionsApi, branchesApi } from '@/lib/api'
import { auth } from '@/lib/auth'
import type { Role, Region, Branch } from '@/types'
import { UserPlus, Trash2, Shield, Loader2, ChevronDown, Building2, MapPin, Network, Users } from 'lucide-react'
import clsx from 'clsx'
import { UserAvatar } from '@/components/UserAvatar'

const ROLE_LABELS: Record<Role, string> = {
  owner:  'Owner',
  regional_manager: 'Reg. Manager',
  branch_manager: 'Branch Manager',
  vendor: 'Vendor',
}

const ROLE_COLORS: Record<Role, string> = {
  owner:  'bg-amber-50 text-amber-600 border-amber-200',
  regional_manager: 'bg-indigo-50 text-indigo-600 border-indigo-200',
  branch_manager: 'bg-primary-50 text-primary-600 border-primary-200',
  vendor: 'bg-emerald-50 text-emerald-600 border-emerald-200',
}

type Member = {
  id:       string
  role:     Role
  joinedAt: string
  branchId?: string | null
  regionId?: string | null
  branch?: {
    id: string
    name: string
    isActive: boolean
    region?: {
      id: string
      name: string
    }
  } | null
  region?: {
    id: string
    name: string
  } | null
  user: {
    id:        string
    email:     string
    firstName: string
    lastName:  string | null
    avatar:    string | null
  }
}

// Visual Tree Component for hierarchies
function HierarchyTree({ members, regions, branches, currentUser }: { members: Member[], regions: Region[], branches: Branch[], currentUser: any }) {
  const isOwner = currentUser?.role === 'owner'
  const isRegionalManager = currentUser?.role === 'regional_manager'
  const isBranchManager = currentUser?.role === 'branch_manager'

  const renderCard = (member?: Member, fallbackTitle = '', fallbackIcon?: React.ReactNode) => {
    if (!member) {
      return (
        <div className="border border-dashed border-slate-200 bg-slate-50/50 rounded-2xl p-4 w-60 mx-auto text-center shrink-0">
          <div className="mx-auto w-8 h-8 rounded-full border border-dashed border-slate-300 flex items-center justify-center text-slate-300 mb-1.5">
            {fallbackIcon}
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{fallbackTitle}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Sin asignar</p>
        </div>
      )
    }

    const isMe = member.user.id === currentUser?.userId

    return (
      <div className={clsx(
        "p-3.5 w-60 text-left shrink-0 transition-transform duration-200 hover:scale-[1.02] border rounded-2xl relative bg-white shadow-sm",
        member.role === 'owner' && 'border-amber-300 bg-amber-50/10',
        member.role === 'regional_manager' && 'border-indigo-300 bg-indigo-50/10',
        member.role === 'branch_manager' && 'border-primary-300 bg-primary-50/10',
        member.role === 'vendor' && 'border-emerald-200'
      )}>
        <div className="flex items-center gap-3">
          <UserAvatar
            avatar={member.user.avatar}
            firstName={member.user.firstName}
            lastName={member.user.lastName}
            email={member.user.email}
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-900 truncate">
              {member.user.firstName} {member.user.lastName}
            </p>
            <p className="text-[10px] text-slate-400 truncate">{member.user.email}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={clsx(
                "inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-full border",
                ROLE_COLORS[member.role]
              )}>
                {ROLE_LABELS[member.role]}
              </span>
              {isMe && (
                <span className="text-[9px] font-bold uppercase tracking-widest text-primary-500 bg-primary-50 px-1 py-0.2 rounded border border-primary-200">VOS</span>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Branch Manager Tree
  if (isBranchManager) {
    const myBranchId = currentUser?.branchId
    const myBranch = branches.find(b => b.id === myBranchId)
    const branchManager = members.find(m => m.role === 'branch_manager' && m.branchId === myBranchId)
    const branchVendors = members.filter(m => m.role === 'vendor' && m.branchId === myBranchId)

    return (
      <div className="flex flex-col items-center py-8 w-full overflow-x-auto">
        <div className="flex flex-col items-center">
          <div className="bg-primary-50 border border-primary-200 text-primary-700 font-bold px-4 py-2 rounded-2xl text-xs flex items-center gap-1.5 shadow-xs mb-3">
            <Building2 size={14} />
            {myBranch?.name || 'Mi Sucursal'}
          </div>
          {renderCard(branchManager, 'Gerente de Sucursal', <Building2 size={14} />)}
        </div>

        {branchVendors.length > 0 && (
          <>
            <div className="w-0.5 h-6 bg-slate-200"></div>
            <div className="flex items-start justify-center">
              {branchVendors.map((vendor, index) => (
                <div key={vendor.id} className="relative flex flex-col items-center px-4">
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-slate-200"
                       style={{
                         left: index === 0 ? '50%' : '0%',
                         right: index === branchVendors.length - 1 ? '50%' : '0%'
                       }}>
                  </div>
                  <div className="w-0.5 h-6 bg-slate-200"></div>
                  {renderCard(vendor)}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  // Regional Manager Tree
  if (isRegionalManager) {
    const myRegionId = currentUser?.regionId
    const myRegion = regions.find(r => r.id === myRegionId)
    const regionalManager = members.find(m => m.role === 'regional_manager' && m.regionId === myRegionId)
    const regionBranches = branches.filter(b => b.regionId === myRegionId)

    return (
      <div className="flex flex-col items-center py-8 w-full overflow-x-auto">
        <div className="flex flex-col items-center">
          <div className="bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold px-4 py-2 rounded-2xl text-xs flex items-center gap-1.5 shadow-xs mb-3">
            <MapPin size={14} />
            {myRegion?.name || 'Mi Región'}
          </div>
          {renderCard(regionalManager, 'Gerente Regional', <MapPin size={14} />)}
        </div>

        {regionBranches.length > 0 && (
          <>
            <div className="w-0.5 h-6 bg-slate-200"></div>
            <div className="flex items-start justify-center">
              {regionBranches.map((branch, index) => {
                const manager = members.find(m => m.role === 'branch_manager' && m.branchId === branch.id)
                const vendors = members.filter(m => m.role === 'vendor' && m.branchId === branch.id)

                return (
                  <div key={branch.id} className="relative flex flex-col items-center px-6">
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-slate-200"
                         style={{
                           left: index === 0 ? '50%' : '0%',
                           right: index === regionBranches.length - 1 ? '50%' : '0%'
                         }}>
                    </div>
                    <div className="w-0.5 h-6 bg-slate-200"></div>

                    <div className="bg-primary-50 border border-primary-200 text-primary-700 font-bold px-3 py-1.5 rounded-xl text-[11px] flex items-center gap-1 shadow-xs mb-3">
                      <Building2 size={12} />
                      {branch.name}
                    </div>
                    {renderCard(manager, 'Gerente de Sucursal', <Building2 size={12} />)}

                    {vendors.length > 0 && (
                      <>
                        <div className="w-0.5 h-6 bg-slate-200"></div>
                        <div className="flex items-start justify-center">
                          {vendors.map((vendor, vIndex) => (
                            <div key={vendor.id} className="relative flex flex-col items-center px-2">
                              <div className="absolute top-0 left-0 right-0 h-0.5 bg-slate-200"
                                   style={{
                                     left: vIndex === 0 ? '50%' : '0%',
                                     right: vIndex === vendors.length - 1 ? '50%' : '0%'
                                   }}>
                              </div>
                              <div className="w-0.5 h-4 bg-slate-200"></div>
                              {renderCard(vendor)}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    )
  }

  // Owner Tree (Full hierarchy)
  const owners = members.filter(m => m.role === 'owner')

  return (
    <div className="flex flex-col items-center py-8 w-full overflow-x-auto">
      {/* Owner Nodes */}
      <div className="flex gap-4">
        {owners.map(owner => (
          <div key={owner.id} className="flex flex-col items-center">
            {renderCard(owner)}
          </div>
        ))}
      </div>

      {regions.length > 0 && (
        <>
          <div className="w-0.5 h-8 bg-slate-200"></div>
          <div className="flex items-start justify-center">
            {regions.map((region, rIndex) => {
              const regManager = members.find(m => m.role === 'regional_manager' && m.regionId === region.id)
              const regionBranches = branches.filter(b => b.regionId === region.id)

              return (
                <div key={region.id} className="relative flex flex-col items-center px-6">
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-slate-200"
                       style={{
                         left: rIndex === 0 ? '50%' : '0%',
                         right: rIndex === regions.length - 1 ? '50%' : '0%'
                       }}>
                  </div>
                  <div className="w-0.5 h-6 bg-slate-200"></div>

                  <div className="bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1 shadow-xs mb-3">
                    <MapPin size={12} />
                    {region.name}
                  </div>
                  {renderCard(regManager, 'Gerente Regional', <MapPin size={12} />)}

                  {regionBranches.length > 0 && (
                    <>
                      <div className="w-0.5 h-6 bg-slate-200"></div>
                      <div className="flex items-start justify-center">
                        {regionBranches.map((branch, bIndex) => {
                          const manager = members.find(m => m.role === 'branch_manager' && m.branchId === branch.id)
                          const vendors = members.filter(m => m.role === 'vendor' && m.branchId === branch.id)

                          return (
                            <div key={branch.id} className="relative flex flex-col items-center px-4">
                              <div className="absolute top-0 left-0 right-0 h-0.5 bg-slate-200"
                                   style={{
                                     left: bIndex === 0 ? '50%' : '0%',
                                     right: bIndex === regionBranches.length - 1 ? '50%' : '0%'
                                   }}>
                              </div>
                              <div className="w-0.5 h-4 bg-slate-200"></div>

                              <div className="bg-primary-50 border border-primary-200 text-primary-700 font-bold px-2 py-1 rounded-lg text-[10px] flex items-center gap-1 shadow-xs mb-2">
                                <Building2 size={10} />
                                {branch.name}
                              </div>
                              {renderCard(manager, 'Gerente de Sucursal', <Building2 size={10} />)}

                              {vendors.length > 0 && (
                                <>
                                  <div className="w-0.5 h-6 bg-slate-200"></div>
                                  <div className="flex items-start justify-center">
                                    {vendors.map((vendor, vIndex) => (
                                      <div key={vendor.id} className="relative flex flex-col items-center px-2">
                                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-slate-200"
                                             style={{
                                               left: vIndex === 0 ? '50%' : '0%',
                                               right: vIndex === vendors.length - 1 ? '50%' : '0%'
                                             }}>
                                        </div>
                                        <div className="w-0.5 h-4 bg-slate-200"></div>
                                        {renderCard(vendor)}
                                      </div>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export default function TeamPage() {
  const currentUser  = auth.get()
  const queryClient  = useQueryClient()
  const [showInvite, setShowInvite] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('list')
  const [form, setForm] = useState({
    firstName: '',
    lastName:  '',
    email:     '',
    password:  '',
    role:      'vendor' as Role,
    branchId:  '' as string,
    regionId:  '' as string,
  })

  const isOwner = currentUser?.role === 'owner'
  const isRegionalManager = currentUser?.role === 'regional_manager'
  const isBranchManager = currentUser?.role === 'branch_manager'
  const isVendor = currentUser?.role === 'vendor'
  const canInvite = isOwner || isRegionalManager

  const { data: members = [], isLoading } = useQuery<Member[]>({
    queryKey: ['team'],
    queryFn:  () => teamApi.list().then((r) => r.data),
  })

  const { data: regions = [] } = useQuery<Region[]>({
    queryKey: ['regions'],
    queryFn: () => regionsApi.list().then((r) => r.data),
    enabled: canInvite || isBranchManager,
  })

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list().then((r) => r.data),
    enabled: canInvite || isBranchManager,
  })

  const inviteMutation = useMutation({
    mutationFn: () => {
      const inviteData = {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.password,
        role: form.role,
        branchId: ['branch_manager', 'vendor'].includes(form.role) && form.branchId ? form.branchId : null,
        regionId: form.role === 'regional_manager' && form.regionId ? form.regionId : null,
      } as any

      if (isRegionalManager && currentUser?.regionId) {
        inviteData.regionId = currentUser.regionId
      }

      if (isBranchManager && currentUser?.branchId) {
        inviteData.branchId = currentUser.branchId
      }

      return teamApi.invite(inviteData)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] })
      setShowInvite(false)
      setForm({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        role: 'vendor',
        branchId: '',
        regionId: '',
      })
    },
  })

  const updateMemberMutation = useMutation({
    mutationFn: ({ id, role, branchId, regionId }: { id: string; role?: Role; branchId?: string | null; regionId?: string | null }) =>
      teamApi.updateRole(id, { role, branchId, regionId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] })
    },
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => teamApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team'] }),
  })

  const canEditMember = (member: Member) => {
    if (member.role === 'owner') return false
    if (isOwner) return true
    if (isBranchManager && currentUser?.branchId === member.branchId) return true
    return false
  }

  const getVisibleBranches = () => {
    if (isOwner) return branches
    if (isRegionalManager && currentUser?.regionId) {
      return branches.filter((b) => b.regionId === currentUser.regionId)
    }
    if (isBranchManager && currentUser?.branchId) {
      return branches.filter((b) => b.id === currentUser.branchId)
    }
    return []
  }

  const getVisibleRegions = () => {
    if (isOwner) return regions
    if (isRegionalManager && currentUser?.regionId) {
      return regions.filter((r) => r.id === currentUser.regionId)
    }
    return []
  }

  const visibleBranches = getVisibleBranches()
  const visibleRegions = getVisibleRegions()

  // Layout for Vendor (Teammates & Regional Manager only)
  if (isVendor) {
    const regionalManager = members.find((m) => m.role === 'regional_manager')
    const teammates = members.filter((m) => m.role !== 'regional_manager' && m.user.id !== currentUser?.userId)

    return (
      <div className="p-6 max-w-5xl mx-auto animate-fade-in">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Mi Equipo</h1>
          <p className="text-slate-500 font-medium mt-1">Miembros de mi sucursal asignada</p>
        </div>

        {/* Gerente Regional (Top Card) */}
        {regionalManager && (
          <div className="mb-8 interactive-card p-6 border-indigo-200 bg-indigo-50/20">
            <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-3 flex items-center gap-1">
              <MapPin size={14} />
              Gerente Regional del Territorio
            </p>
            <div className="flex items-center gap-4">
              <UserAvatar
                avatar={regionalManager.user.avatar}
                firstName={regionalManager.user.firstName}
                lastName={regionalManager.user.lastName}
                email={regionalManager.user.email}
                size="lg"
              />
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {regionalManager.user.firstName} {regionalManager.user.lastName}
                </h3>
                <p className="text-sm text-slate-500 font-medium">{regionalManager.user.email}</p>
                {regionalManager.region && (
                  <span className="inline-block mt-2 text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md font-semibold">
                    Región: {regionalManager.region.name}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Compañeros de equipo (Grid) */}
        <h2 className="text-xl font-bold text-slate-900 tracking-tight mb-4 flex items-center gap-2">
          <Users size={20} className="text-emerald-500" />
          Compañeros de Trabajo
        </h2>

        {teammates.length === 0 ? (
          <div className="text-center py-10 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
            <p className="text-slate-400 font-bold text-sm">No se encontraron otros compañeros en tu sucursal.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {teammates.map((mate) => (
              <div key={mate.id} className="interactive-card p-4 flex items-center gap-4">
                <UserAvatar
                  avatar={mate.user.avatar}
                  firstName={mate.user.firstName}
                  lastName={mate.user.lastName}
                  email={mate.user.email}
                />
                <div className="min-w-0 flex-1">
                  <h4 className="text-slate-900 font-bold text-sm truncate">
                    {mate.user.firstName} {mate.user.lastName}
                  </h4>
                  <p className="text-slate-500 text-xs truncate">{mate.user.email}</p>
                  <span className="inline-block mt-1 text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-bold uppercase">
                    {ROLE_LABELS[mate.role]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Layout for Owner, Regional Manager, Branch Manager
  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Cuentas y Equipo</h1>
          <p className="text-slate-500 font-medium mt-1">
            {members.length} miembro{members.length !== 1 ? 's' : ''} en tu entorno de trabajo
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* List vs Hierarchical Tree Selector */}
          {(isOwner || isBranchManager || isRegionalManager) && (
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
              <button
                onClick={() => setViewMode('list')}
                className={clsx(
                  'px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5',
                  viewMode === 'list'
                    ? 'bg-white text-slate-800 shadow-xs border border-slate-200'
                    : 'text-slate-500 hover:text-slate-800'
                )}
              >
                <Users size={13} />
                Lista
              </button>
              <button
                onClick={() => setViewMode('tree')}
                className={clsx(
                  'px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5',
                  viewMode === 'tree'
                    ? 'bg-white text-slate-800 shadow-xs border border-slate-200'
                    : 'text-slate-500 hover:text-slate-800'
                )}
              >
                <Network size={13} />
                Jerarquía
              </button>
            </div>
          )}

          {canInvite && (
            <button
              onClick={() => setShowInvite(true)}
              className="btn-primary"
            >
              <UserPlus size={18} strokeWidth={2.5} />
              Invitar usuario
            </button>
          )}
        </div>
      </div>

      {/* Formulario de invitación */}
      {showInvite && (
        <div className="interactive-card p-6 mb-8 animate-slide-up">
          <h3 className="text-slate-900 font-bold mb-5 text-lg flex items-center gap-2">
            <UserPlus size={20} className="text-primary-600" />
            Otorgar acceso a nuevo miembro
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { key: 'firstName', placeholder: 'Nombre *' },
              { key: 'lastName',  placeholder: 'Apellido'  },
              { key: 'email',     placeholder: 'Email corporativo *'   },
              { key: 'password',  placeholder: 'Contraseña temporal * (mín. 8 caracteres)' },
            ].map(({ key, placeholder }) => (
              <input
                key={key}
                type={key === 'password' ? 'password' : 'text'}
                placeholder={placeholder}
                value={form[key as keyof typeof form]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-[3px] focus:ring-primary-500/30 focus:border-primary-500 placeholder-slate-400 font-medium transition-all"
              />
            ))}
          </div>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4 pt-5 border-t border-slate-100">
            {/* Selector de Rol */}
            <div className="relative">
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Rol</label>
              <div className="relative">
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as Role, branchId: '', regionId: '' })}
                  className="appearance-none w-full bg-slate-50 border border-slate-200 text-slate-900 font-semibold rounded-xl pl-4 pr-10 py-3 text-sm focus:outline-none focus:ring-[3px] focus:ring-primary-500/30 border-primary-500 cursor-pointer"
                >
                  {isOwner && <option value="regional_manager">Reg. Manager</option>}
                  <option value="branch_manager">Branch Manager</option>
                  <option value="vendor">Vendor</option>
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" strokeWidth={2.5}/>
              </div>
            </div>

            {/* Selector de Región (Visible si es Regional Manager e Owner) */}
            {form.role === 'regional_manager' && isOwner && (
              <div className="relative">
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Región Asignada</label>
                <div className="relative">
                  <select
                    value={form.regionId}
                    onChange={(e) => setForm({ ...form, regionId: e.target.value })}
                    className="appearance-none w-full bg-slate-50 border border-slate-200 text-slate-900 font-semibold rounded-xl pl-4 pr-10 py-3 text-sm focus:outline-none focus:ring-[3px] focus:ring-primary-500/30 border-primary-500 cursor-pointer"
                  >
                    <option value="">Seleccionar región...</option>
                    {visibleRegions.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" strokeWidth={2.5}/>
                </div>
              </div>
            )}

            {/* Selector de Sucursal (Visible si es Branch Manager o Vendor) */}
            {['branch_manager', 'vendor'].includes(form.role) && (
              <div className="relative">
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Sucursal Asignada</label>
                <div className="relative">
                  <select
                    value={form.branchId}
                    onChange={(e) => setForm({ ...form, branchId: e.target.value })}
                    className="appearance-none w-full bg-slate-50 border border-slate-200 text-slate-900 font-semibold rounded-xl pl-4 pr-10 py-3 text-sm focus:outline-none focus:ring-[3px] focus:ring-primary-500/30 border-primary-500 cursor-pointer"
                  >
                    <option value="">Seleccionar sucursal...</option>
                    {visibleBranches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name} ({b.region?.name || 'Región General'})</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" strokeWidth={2.5}/>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 flex items-center gap-3 pt-5 border-t border-slate-100">
            <button
              onClick={() => inviteMutation.mutate()}
              disabled={
                !form.firstName || 
                !form.email || 
                !form.password || 
                (form.role === 'regional_manager' && isOwner && !form.regionId) ||
                (['branch_manager', 'vendor'].includes(form.role) && !form.branchId) ||
                inviteMutation.isPending
              }
              className="btn-primary py-2.5"
            >
              {inviteMutation.isPending && <Loader2 size={16} className="animate-spin" />}
              Enviar invitación
            </button>
            <button
              onClick={() => setShowInvite(false)}
              className="btn-secondary py-2.5"
            >
              Cancelar
            </button>
          </div>

          {inviteMutation.isError && (
            <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl px-4 py-3 mt-4 text-sm font-medium animate-slide-up flex items-start gap-2">
                <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Error al invitar. Verificá que el email sea válido, la contraseña tenga al menos 8 caracteres y hayas seleccionado una sucursal/región.
            </div>
          )}
        </div>
      )}

      {/* Main Content Areas */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-primary-500" size={40} />
        </div>
      ) : viewMode === 'tree' ? (
        <div className="w-full bg-slate-50/50 border border-slate-200 rounded-3xl p-6 shadow-inner overflow-x-auto">
          <HierarchyTree
            members={members}
            regions={regions}
            branches={branches}
            currentUser={currentUser}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {members.map((member) => {
            const isMe = member.user.id === currentUser?.userId
            const isOwnerMember = member.role === 'owner'
            const editable = canEditMember(member)

            return (
              <div
                key={member.id}
                className="interactive-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4 flex-1">
                  <UserAvatar
                    avatar={member.user.avatar}
                    firstName={member.user.firstName}
                    lastName={member.user.lastName}
                    email={member.user.email}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-slate-900 font-bold text-base tracking-tight">
                        {member.user.firstName} {member.user.lastName}
                      </span>
                      {isMe && (
                        <span className="text-[10px] font-bold uppercase tracking-widest text-primary-500 bg-primary-50 px-2 py-0.5 rounded-full border border-primary-200">vos</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 mt-0.5">
                      <p className="text-slate-500 text-sm font-medium">{member.user.email}</p>
                      
                      {member.branch && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold">
                          <Building2 size={13} className="text-slate-400" />
                          <span>{member.branch.name}</span>
                          {member.branch.region && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="text-slate-400 font-medium">{member.branch.region.name}</span>
                            </>
                          )}
                          {!member.branch.isActive && (
                            <span className="bg-red-50 text-red-600 border border-red-200 text-[9px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wide">Inactiva</span>
                          )}
                        </div>
                      )}
                      {!member.branch && member.region && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold">
                          <MapPin size={13} className="text-slate-400" />
                          <span>Región: {member.region.name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto">
                  {editable ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <select
                          value={member.role}
                          onChange={(e) =>
                            updateMemberMutation.mutate({
                              id: member.id,
                              role: e.target.value as Role,
                              branchId: null,
                              regionId: null,
                            })
                          }
                          className="appearance-none bg-slate-50 border border-slate-200 text-slate-700 font-semibold rounded-lg pl-3 pr-8 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer hover:bg-slate-100 transition-colors"
                        >
                          {isOwner && <option value="regional_manager">Reg. Manager</option>}
                          <option value="branch_manager">Branch Manager</option>
                          <option value="vendor">Vendor</option>
                        </select>
                        <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" strokeWidth={2.5} />
                      </div>

                      {member.role === 'regional_manager' && isOwner && (
                        <div className="relative">
                          <select
                            value={member.regionId || ''}
                            onChange={(e) =>
                              updateMemberMutation.mutate({
                                id: member.id,
                                regionId: e.target.value || null,
                              })
                            }
                            className="appearance-none bg-slate-50 border border-slate-200 text-slate-700 font-semibold rounded-lg pl-3 pr-8 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer hover:bg-slate-100 transition-colors"
                          >
                            <option value="">Sin región</option>
                            {regions.map((r) => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
                          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" strokeWidth={2.5} />
                        </div>
                      )}

                      {['branch_manager', 'vendor'].includes(member.role) && (
                        <div className="relative">
                          <select
                            value={member.branchId || ''}
                            disabled={isBranchManager}
                            onChange={(e) =>
                              updateMemberMutation.mutate({
                                id: member.id,
                                branchId: e.target.value || null,
                              })
                            }
                            className="disabled:opacity-60 appearance-none bg-slate-50 border border-slate-200 text-slate-700 font-semibold rounded-lg pl-3 pr-8 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer hover:bg-slate-100 transition-colors"
                          >
                            <option value="">Sin sucursal</option>
                            {branches.map((b) => (
                              <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                          </select>
                          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" strokeWidth={2.5} />
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className={clsx(
                      'border px-2 py-0.5 rounded-full text-xs font-semibold',
                      ROLE_COLORS[member.role]
                    )}>
                      {ROLE_LABELS[member.role]}
                    </span>
                  )}

                  {isOwner && !isOwnerMember && !isMe ? (
                    <button
                      onClick={() => {
                        if (confirm(`¿Eliminar a ${member.user.firstName} del workspace?`)) {
                          removeMutation.mutate(member.id)
                        }
                      }}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                      title="Eliminar usuario"
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : (
                    <div className="w-8"></div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Leyenda de roles */}
      <div className="mt-12 bg-slate-50 border border-slate-200 rounded-2xl p-6">
        <p className="text-slate-500 text-xs font-bold mb-4 uppercase tracking-widest flex items-center gap-2">
          <Shield size={14}/> Matriz de Permisos
        </p>
        <div className="grid sm:grid-cols-2 gap-4 text-sm text-slate-600">
          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs">
            <span className="badge-owner mb-2 inline-block">Owner</span>
            <p className="leading-relaxed">Control total del espacio de trabajo. Puede borrar y gestionar el equipo, crear regiones/sucursales, ver todos los datos e integraciones.</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs">
            <span className="bg-indigo-50 text-indigo-600 border border-indigo-200 px-2 py-0.5 rounded-full text-xs font-semibold mb-2 inline-block">Reg. Manager</span>
            <p className="leading-relaxed">Gestiona su región asignada. Puede ver deals/contactos de todas las sucursales de su región e invitar gerentes o vendedores a las mismas.</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs">
            <span className="bg-primary-50 text-primary-600 border border-primary-200 px-2 py-0.5 rounded-full text-xs font-semibold mb-2 inline-block">Branch Manager</span>
            <p className="leading-relaxed">Administrador de su propia sucursal física. Puede ver y gestionar deals/contactos de su sucursal, y reasignar roles y tareas de sus vendedores locales.</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs">
            <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded-full text-xs font-semibold mb-2 inline-block">Vendor</span>
            <p className="leading-relaxed">Vendedor con acceso estricto de lectura. Solo visualiza los deals y contactos asignados directamente a él, sin poder modificarlos ni borrarlos.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
