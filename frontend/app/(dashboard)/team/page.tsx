'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { teamApi } from '@/lib/api'
import { auth } from '@/lib/auth'
import type { Role } from '@/types'
import { UserPlus, Trash2, Shield, Loader2, ChevronDown } from 'lucide-react'
import clsx from 'clsx'

const ROLE_LABELS: Record<Role, string> = {
  owner:  'Owner',
  admin:  'Admin',
  member: 'Member',
  viewer: 'Viewer',
}

const ROLE_COLORS: Record<Role, string> = {
  owner:  'bg-amber-50 text-amber-600 border-amber-200',
  admin:  'bg-primary-50 text-primary-600 border-primary-200',
  member: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  viewer: 'bg-slate-50 text-slate-600 border-slate-200',
}

type Member = {
  id:       string
  role:     Role
  joinedAt: string
  user: {
    id:        string
    email:     string
    firstName: string
    lastName:  string | null
    avatar:    string | null
  }
}

export default function TeamPage() {
  const currentUser  = auth.get()
  const queryClient  = useQueryClient()
  const [showInvite, setShowInvite] = useState(false)
  const [form, setForm] = useState({
    firstName: '',
    lastName:  '',
    email:     '',
    password:  '',
    role:      'member' as 'admin' | 'member' | 'viewer',
  })

  const { data: members = [], isLoading } = useQuery<Member[]>({
    queryKey: ['team'],
    queryFn:  () => teamApi.list().then((r) => r.data),
  })

  const inviteMutation = useMutation({
    mutationFn: () => teamApi.invite(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] })
      setShowInvite(false)
      setForm({ firstName: '', lastName: '', email: '', password: '', role: 'member' })
    },
  })

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: 'admin' | 'member' | 'viewer' }) =>
      teamApi.updateRole(id, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team'] }),
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => teamApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team'] }),
  })

  const isOwner = currentUser?.role === 'owner'

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Cuentas y Equipo</h1>
          <p className="text-slate-500 font-medium mt-1">
            {members.length} miembro{members.length !== 1 ? 's' : ''} en tu entorno de trabajo
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="btn-primary"
        >
          <UserPlus size={18} strokeWidth={2.5} />
          Invitar usuario
        </button>
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

          <div className="mt-5 flex items-center gap-3 pt-5 border-t border-slate-100">
            <div className="relative">
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as typeof form.role })}
                className="appearance-none bg-slate-50 border border-slate-200 text-slate-900 font-semibold rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-[3px] focus:ring-primary-500/30 border-primary-500 cursor-pointer"
              >
                {isOwner && <option value="admin">Permisos Admin</option>}
                <option value="member">Permisos Member</option>
                <option value="viewer">Permisos Viewer</option>
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" strokeWidth={2.5}/>
            </div>

            <button
              onClick={() => inviteMutation.mutate()}
              disabled={!form.firstName || !form.email || !form.password || inviteMutation.isPending}
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
                Error al invitar. Verificá que el email sea válido y la contraseña tenga al menos 8 caracteres.
            </div>
          )}
        </div>
      )}

      {/* Lista de miembros */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-primary-500" size={40} />
        </div>
      ) : (
        <div className="space-y-3">
          {members.map((member) => {
            const isMe    = member.user.id === currentUser?.userId
            const isOwnerMember = member.role === 'owner'

            return (
              <div
                key={member.id}
                className="interactive-card p-4 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4 flex-1">
                  {/* Avatar Elegante */}
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-slate-100 to-slate-200 border border-slate-300/50 flex items-center justify-center text-slate-600 font-bold text-sm shrink-0 shadow-sm">
                    {member.user.firstName[0]}{member.user.lastName?.[0] ?? ''}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-900 font-bold text-base tracking-tight">
                        {member.user.firstName} {member.user.lastName}
                      </span>
                      {isMe && (
                        <span className="text-[10px] font-bold uppercase tracking-widest text-primary-500 bg-primary-50 px-2 py-0.5 rounded-full border border-primary-200">vos</span>
                      )}
                    </div>
                    <p className="text-slate-500 text-sm font-medium">{member.user.email}</p>
                  </div>
                </div>

                {/* Rol — editable si no es owner y el usuario actual es owner */}
                <div className="flex items-center gap-4">
                  {isOwner && !isOwnerMember && !isMe ? (
                    <div className="relative">
                      <select
                        value={member.role}
                        onChange={(e) =>
                          updateRoleMutation.mutate({
                            id:   member.id,
                            role: e.target.value as 'admin' | 'member' | 'viewer',
                          })
                        }
                        className="appearance-none bg-slate-50 border border-slate-200 text-slate-700 font-semibold rounded-lg pl-3 pr-8 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer hover:bg-slate-100 transition-colors"
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" strokeWidth={2.5} />
                    </div>
                  ) : (
                    <span className={clsx(
                      member.role === 'owner' ? 'badge-owner' : 
                      member.role === 'admin' ? 'badge-admin' :
                      member.role === 'member' ? 'badge-member' : 'badge-viewer'
                    )}>
                      {ROLE_LABELS[member.role]}
                    </span>
                  )}

                  {/* Botón de eliminar — solo owner, no a sí mismo ni a otros owners */}
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

      {/* Leyenda de roles mejorada y espaciada */}
      <div className="mt-12 bg-slate-50 border border-slate-200 rounded-2xl p-6">
        <p className="text-slate-500 text-xs font-bold mb-4 uppercase tracking-widest flex items-center gap-2">
          <Shield size={14}/> Matriz de Permisos
        </p>
        <div className="grid sm:grid-cols-2 gap-4 text-sm text-slate-600">
          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
            <span className="badge-owner mb-2 inline-block">Owner</span>
            <p className="leading-relaxed">Control total. Puede borrar el equipo, invitar, revocar accesos y cambiar la configuración del negocio.</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
            <span className="badge-admin mb-2 inline-block">Admin</span>
            <p className="leading-relaxed">Gestiona contactos, leads, webhooks y pipelines. Puede invitar nuevos Members y Viewers a la plataforma.</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
            <span className="badge-member mb-2 inline-block">Member</span>
            <p className="leading-relaxed">Operario diario. Crea, edita y mueve Leads y Contactos diariamente. No maneja configuraciones maestras.</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
            <span className="badge-viewer mb-2 inline-block">Viewer</span>
            <p className="leading-relaxed">Solo lectura. Puede revisar auditorías, contactos y leads pero no tiene capacidad de modificar ni interactuar.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
