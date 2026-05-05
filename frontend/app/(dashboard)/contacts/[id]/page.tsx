'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { contactsApi, activitiesApi, notesApi } from '@/lib/api'
import type { Contact, Activity, Note } from '@/types'
import { useRouter, useParams } from 'next/navigation'
import {
  ArrowLeft, Phone, Mail, Tag, Loader2,
  Plus, Trash2, MessageSquare, Clock,
  PhoneCall, Calendar, CheckSquare, Send,
} from 'lucide-react'
import clsx from 'clsx'

// ─── Ícono por tipo de actividad ──────────────────────────────────
const ACTIVITY_ICONS: Record<string, any> = {
  CALL:    PhoneCall,
  EMAIL:   Send,
  MEETING: Calendar,
  TASK:    CheckSquare,
  NOTE:    MessageSquare,
  OTHER:   Clock,
}

const ACTIVITY_COLORS: Record<string, string> = {
  CALL:    'text-blue-600 bg-blue-50',
  EMAIL:   'text-purple-600 bg-purple-50',
  MEETING: 'text-emerald-600 bg-emerald-50',
  TASK:    'text-amber-600 bg-amber-50',
  NOTE:    'text-slate-500 bg-slate-100',
  OTHER:   'text-slate-500 bg-slate-100',
}

const STATUS_COLORS: Record<string, string> = {
  LEAD:      'bg-blue-50 text-blue-600 border-blue-200',
  QUALIFIED: 'bg-purple-50 text-purple-600 border-purple-200',
  ACTIVE:    'bg-emerald-50 text-emerald-600 border-emerald-200',
  CUSTOMER:  'bg-green-50 text-green-600 border-green-200',
  CHURNED:   'bg-rose-50 text-rose-600 border-rose-200',
}

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router       = useRouter()
  const queryClient  = useQueryClient()
  const [tab, setTab]               = useState<'actividades' | 'notas'>('actividades')
  const [showActivityForm, setShowActivityForm] = useState(false)
  const [noteContent, setNoteContent]           = useState('')
  const [activityForm, setActivityForm] = useState({
    type:        'CALL',
    title:       '',
    description: '',
  })

  // ─── Queries ─────────────────────────────────────────────────
  const { data: contact, isLoading: contactLoading } = useQuery<Contact>({
    queryKey: ['contact', id],
    queryFn:  () => contactsApi.get(id).then((r) => r.data),
  })

  const { data: activities, isLoading: activitiesLoading } = useQuery<Activity[]>({
    queryKey: ['activities', id],
    queryFn:  () => activitiesApi.list(id).then((r) => r.data),
  })

  const { data: notes, isLoading: notesLoading } = useQuery<Note[]>({
    queryKey: ['notes', id],
    queryFn:  () => notesApi.list(id).then((r) => r.data),
  })

  // ─── Mutaciones ───────────────────────────────────────────────
  const createActivity = useMutation({
    mutationFn: () => activitiesApi.create({
      contactId:   id,
      type:        activityForm.type,
      title:       activityForm.title,
      description: activityForm.description || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities', id] })
      setShowActivityForm(false)
      setActivityForm({ type: 'CALL', title: '', description: '' })
    },
  })

  const deleteActivity = useMutation({
    mutationFn: (actId: string) => activitiesApi.delete(actId),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['activities', id] }),
  })

  const createNote = useMutation({
    mutationFn: () => notesApi.create({ contactId: id, content: noteContent }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', id] })
      setNoteContent('')
    },
  })

  const deleteNote = useMutation({
    mutationFn: (noteId: string) => notesApi.delete(noteId),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['notes', id] }),
  })

  if (contactLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-primary-500" size={40} />
      </div>
    )
  }

  if (!contact) return null

  return (
    <div className="flex flex-col h-full bg-[var(--background)] overflow-hidden">
      {/* Header */}
      <div className="bg-white px-6 py-5 border-b border-slate-200 flex items-center gap-4 shrink-0 shadow-sm z-10 animate-fade-in relative">
        <button
          onClick={() => router.push('/contacts')}
          className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-400 hover:text-primary-600 hover:bg-primary-50 transition-colors border border-transparent hover:border-primary-100"
        >
          <ArrowLeft size={20} strokeWidth={2.5}/>
        </button>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-primary-50 to-primary-100 border border-primary-200 flex items-center justify-center text-primary-600 font-extrabold text-lg shrink-0 shadow-sm relative overflow-hidden">
             <span className="relative z-10">{contact.firstName[0]}{contact.lastName?.[0] ?? ''}</span>
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              {contact.firstName} {contact.lastName}
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <span className={clsx(
                'text-[10px] font-bold px-2.5 py-0.5 rounded-md border tracking-widest uppercase',
                STATUS_COLORS[contact.status] ?? 'bg-slate-50 text-slate-500 border-slate-200'
              )}>
                {contact.status}
              </span>
              <span className="text-[11px] text-slate-400 font-bold tracking-widest uppercase flex items-center gap-1.5">
                Score: <span className={clsx(
                  'text-sm font-black',
                  contact.score >= 70 ? 'text-emerald-500' :
                  contact.score >= 40 ? 'text-amber-500' : 'text-slate-400'
                )}>{contact.score}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden animate-slide-up bg-slate-50/50">
        {/* Panel izquierdo — info del contacto */}
        <div className="w-80 bg-white border-r border-slate-200 p-6 overflow-y-auto shrink-0 z-0">
          <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4">
            Detalles del Contacto
          </h3>

          <div className="space-y-4">
            {contact.email && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 shrink-0 shadow-sm">
                   <Mail size={14} strokeWidth={2.5}/>
                </div>
                <span className="text-sm font-semibold text-slate-700 truncate">{contact.email}</span>
              </div>
            )}
            {contact.phone && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 shrink-0 shadow-sm">
                   <Phone size={14} strokeWidth={2.5}/>
                </div>
                <span className="text-sm font-semibold text-slate-700">{contact.phone}</span>
              </div>
            )}
            {contact.tags.length > 0 && (
              <div className="flex items-start gap-3 mt-1">
                <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 shrink-0 shadow-sm">
                   <Tag size={14} strokeWidth={2.5}/>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {contact.tags.map((tag) => (
                    <span key={tag} className="text-[10px] bg-slate-100 border border-slate-200 font-bold text-slate-500 px-2 py-0.5 rounded-md uppercase tracking-wider">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
              Fuente de Adquisición
            </h3>
            <span className="text-sm font-semibold text-slate-700 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 inline-block">{contact.source}</span>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
              Fecha de Registro
            </h3>
            <span className="text-sm font-semibold text-slate-700">
              {new Date(contact.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Panel derecho — actividades y notas */}
        <div className="flex-1 flex flex-col min-h-0 bg-[var(--background)]">
          {/* Tabs */}
          <div className="flex px-6 bg-white border-b border-slate-200 shrink-0 pt-2 shadow-sm z-0">
            {(['actividades', 'notas'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={clsx(
                  'px-5 py-4 text-sm font-bold uppercase tracking-wider transition-all border-b-[3px] -mb-[1px]',
                  tab === t
                    ? 'text-primary-600 border-primary-600'
                    : 'text-slate-400 border-transparent hover:text-slate-600 hover:border-slate-300'
                )}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Contenido del tab */}
          <div className="flex-1 overflow-y-auto p-6 sm:p-8">
            <div className="max-w-3xl mx-auto">
              
              {/* Tab actividades */}
              {tab === 'actividades' && (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">
                      {activities?.length ?? 0} {activities?.length === 1 ? 'Actividad Registrada' : 'Actividades Registradas'}
                    </p>
                    <button
                      onClick={() => setShowActivityForm(true)}
                      className="btn-primary py-2 px-4 shadow-sm text-sm"
                    >
                      <Plus size={16} strokeWidth={2.5}/> Nueva actividad
                    </button>
                  </div>

                  {/* Formulario nueva actividad */}
                  {showActivityForm && (
                    <div className="interactive-card p-6 mb-6 animate-slide-up border-l-4 border-l-primary-500">
                      <div className="space-y-4">
                        <select
                          value={activityForm.type}
                          onChange={(e) => setActivityForm({ ...activityForm, type: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-[3px] focus:ring-primary-500/30 focus:border-primary-500 transition-all cursor-pointer appearance-none"
                        >
                          {['CALL', 'EMAIL', 'MEETING', 'TASK', 'NOTE', 'OTHER'].map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <input
                          value={activityForm.title}
                          onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })}
                          placeholder="Título de la tarea *"
                          className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-[3px] focus:ring-primary-500/30 focus:border-primary-500 placeholder-slate-400 font-medium transition-all"
                        />
                        <textarea
                          value={activityForm.description}
                          onChange={(e) => setActivityForm({ ...activityForm, description: e.target.value })}
                          placeholder="Descripción (opcional)"
                          rows={3}
                          className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-[3px] focus:ring-primary-500/30 focus:border-primary-500 placeholder-slate-400 font-medium transition-all resize-none"
                        />
                      </div>
                      <div className="flex gap-3 mt-5 pt-5 border-t border-slate-100">
                        <button
                          onClick={() => createActivity.mutate()}
                          disabled={!activityForm.title || createActivity.isPending}
                          className="btn-primary py-2 px-6"
                        >
                          {createActivity.isPending && <Loader2 size={16} className="animate-spin" />}
                          Guardar Actividad
                        </button>
                        <button
                          onClick={() => setShowActivityForm(false)}
                          className="btn-secondary py-2 px-6"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Lista actividades */}
                  {activitiesLoading ? (
                    <Loader2 className="animate-spin text-primary-500 mx-auto mt-10" size={32} />
                  ) : activities?.length === 0 ? (
                    <p className="text-center text-slate-400 font-medium text-sm py-12 bg-white border border-slate-200 border-dashed rounded-2xl">
                      Aún no hay actividades registradas en el historial.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {activities?.map((activity) => {
                        const Icon  = ACTIVITY_ICONS[activity.type] ?? Clock
                        const color = ACTIVITY_COLORS[activity.type] ?? ACTIVITY_COLORS.OTHER
                        return (
                          <div
                            key={activity.id}
                            className="interactive-card p-5 flex items-start gap-4 transition-all"
                          >
                            <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm border border-transparent', color, color.replace('bg-', 'border-').replace('50', '200'))}>
                              <Icon size={18} strokeWidth={2.5}/>
                            </div>
                            <div className="flex-1 min-w-0 pt-0.5">
                              <p className="text-slate-900 text-base font-bold tracking-tight">{activity.title}</p>
                              {activity.description && (
                                <p className="text-slate-500 text-sm font-medium mt-1 leading-relaxed">{activity.description}</p>
                              )}
                              <p className="text-slate-400 text-[11px] font-bold tracking-wider mt-3 uppercase">
                                {new Date(activity.createdAt).toLocaleDateString()} a las {new Date(activity.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                              </p>
                            </div>
                            <button
                              onClick={() => {
                                if(confirm('¿Seguro quieres eliminar esta actividad?')) deleteActivity.mutate(activity.id)
                              }}
                              className="w-8 h-8 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors shrink-0"
                            >
                              <Trash2 size={16} strokeWidth={2.5}/>
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Tab notas */}
              {tab === 'notas' && (
                <div>
                  {/* Input nueva nota */}
                  <div className="interactive-card p-6 mb-8 border-l-4 border-l-amber-400">
                    <textarea
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                      placeholder="Escribí una nota privada sobre este contacto..."
                      rows={3}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-[3px] focus:ring-amber-500/30 focus:border-amber-400 placeholder-slate-400 font-medium transition-all resize-none"
                    />
                    <div className="flex justify-end mt-4 pt-4 border-t border-slate-100">
                      <button
                        onClick={() => createNote.mutate()}
                        disabled={!noteContent.trim() || createNote.isPending}
                        className="bg-amber-500 text-white font-bold px-6 py-2.5 rounded-xl shadow-md hover:bg-amber-600 hover:shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 text-sm"
                      >
                        {createNote.isPending && <Loader2 size={16} className="animate-spin" />}
                        Guardar Nota
                      </button>
                    </div>
                  </div>

                  {/* Lista notas */}
                  {notesLoading ? (
                    <Loader2 className="animate-spin text-amber-500 mx-auto mt-10" size={32} />
                  ) : notes?.length === 0 ? (
                    <p className="text-center text-slate-400 font-medium text-sm py-12 bg-white border border-slate-200 border-dashed rounded-2xl">
                      Aún no hay notas privadas para este contacto.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {notes?.map((note) => (
                        <div
                          key={note.id}
                          className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow relative"
                        >
                          <div className="absolute top-0 right-8 w-8 h-3 bg-amber-200/60 rounded-b-md"></div>
                          <div className="flex items-start justify-between gap-4 mt-1">
                            <p className="text-slate-700 font-medium text-sm whitespace-pre-wrap flex-1 leading-relaxed">
                              {note.content}
                            </p>
                            <button
                              onClick={() => {
                                if(confirm('¿Borrar nota?')) deleteNote.mutate(note.id)
                              }}
                              className="w-8 h-8 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 flex flex-shrink-0 items-center justify-center transition-colors -mt-1 -mr-2"
                            >
                              <Trash2 size={16} strokeWidth={2.5}/>
                            </button>
                          </div>
                          <p className="text-slate-400 text-[11px] font-bold tracking-wider mt-4 uppercase flex items-center gap-1.5">
                            <Clock size={12} strokeWidth={3}/>
                            {new Date(note.createdAt).toLocaleDateString()} a las {new Date(note.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}