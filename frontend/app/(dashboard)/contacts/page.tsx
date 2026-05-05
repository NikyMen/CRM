'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { contactsApi } from '@/lib/api'
import type { Contact, PaginatedResult } from '@/types'
import { Search, Plus, Mail, Phone, Tag, Loader2, Users, ChevronLeft, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import Link from 'next/link'

const STATUS_COLORS: Record<string, string> = {
  LEAD:      'border-sky-400 bg-sky-200 text-sky-950 dark:border-slate-400/60 dark:bg-slate-500/25 dark:text-slate-100',
  QUALIFIED: 'border-violet-400 bg-violet-200 text-violet-950 dark:border-slate-400/60 dark:bg-slate-500/25 dark:text-slate-100',
  ACTIVE:    'border-emerald-400 bg-emerald-200 text-emerald-950 dark:border-emerald-300/30 dark:bg-emerald-400/15 dark:text-emerald-100',
  CUSTOMER:  'border-green-400 bg-green-200 text-green-950 dark:border-emerald-300/30 dark:bg-emerald-400/15 dark:text-emerald-100',
  CHURNED:   'border-rose-400 bg-rose-200 text-rose-950 dark:border-rose-300/30 dark:bg-rose-400/15 dark:text-rose-100',
}

const PAGE_SIZE = 20

export default function ContactsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch]   = useState('')
  const [page, setPage]       = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    firstName: '',
    lastName:  '',
    email:     '',
    phone:     '',
    source:    'MANUAL',
  })

  // Resetear página al buscar
  function handleSearch(value: string) {
    setSearch(value)
    setPage(0)
  }

  const { data, isLoading } = useQuery<PaginatedResult<Contact>>({
    queryKey: ['contacts', search, page],
    queryFn:  () => contactsApi.list({
      search: search || undefined,
      limit:  PAGE_SIZE,
      page,
    }).then((r) => r.data),
  })

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => contactsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      setShowForm(false)
      setForm({ firstName: '', lastName: '', email: '', phone: '', source: 'MANUAL' })
    },
    onError: (err: any) => {
      if (err.response?.status === 409) {
        alert('Ese email o telefono ya esta siendo usado en otro contacto.')
      } else {
        alert('Error al crear el contacto: ' + (err.response?.data?.message || err.message))
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => contactsApi.delete(id),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['contacts'] }),
  })

  return (
    <div className="mx-auto max-w-7xl animate-fade-in p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Directorio de Contactos</h1>
          <p className="mt-1 font-medium text-slate-600">
            Gestiona y administra {data?.total ?? 0} contactos en tu cartera.
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus size={18} strokeWidth={2.5} />
          Anadir Contacto
        </button>
      </div>

      <div className="relative mb-8 max-w-xl">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-sky-700/70 dark:text-slate-400" size={18} strokeWidth={2.5} />
        <input
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Buscar por nombre, correo electronico o telefono..."
          className="w-full rounded-xl border border-sky-200 bg-[#eef8ff] py-3 pl-11 pr-4 text-sm font-semibold text-slate-800 shadow-sm transition-all placeholder:text-sky-700/55 focus:border-primary-500 focus:outline-none focus:ring-[3px] focus:ring-primary-500/25 dark:border-slate-600/80 dark:bg-slate-800/95 dark:text-slate-100 dark:placeholder:text-slate-400"
        />
      </div>

      {showForm && (
        <div className="interactive-card mb-8 animate-slide-up border-l-4 border-l-primary-500 p-6">
          <h3 className="mb-5 flex items-center gap-2 text-lg font-bold text-slate-900">
            <Plus size={20} className="text-primary-500" strokeWidth={3} /> Cargar Nuevo Perfil
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              { name: 'firstName', placeholder: 'Nombre *' },
              { name: 'lastName',  placeholder: 'Apellido' },
              { name: 'email',     placeholder: 'Correo electronico' },
              { name: 'phone',     placeholder: 'Numero de telefono' },
            ].map((field) => (
              <input
                key={field.name}
                placeholder={field.placeholder}
                value={form[field.name as keyof typeof form]}
                onChange={(e) => setForm({ ...form, [field.name]: e.target.value })}
                className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 transition-all placeholder:text-slate-500 focus:border-primary-500 focus:outline-none focus:ring-[3px] focus:ring-primary-500/30 dark:border-slate-600/80 dark:bg-slate-800/90 dark:text-slate-100 dark:placeholder:text-slate-400"
              />
            ))}
          </div>
          <div className="mt-6 flex gap-3 border-t border-slate-200 pt-5 dark:border-slate-600/70">
            <button
              onClick={() => createMutation.mutate(form)}
              disabled={!form.firstName || createMutation.isPending}
              className="btn-primary w-full px-6 py-2.5 sm:w-auto"
            >
              {createMutation.isPending && <Loader2 size={16} className="animate-spin" />}
              Guardar Perfil
            </button>
            <button onClick={() => setShowForm(false)} className="btn-secondary w-full px-6 py-2.5 sm:w-auto">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="animate-spin text-primary-500" size={40} />
        </div>
      ) : data?.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 py-24 text-center dark:border-slate-600/70 dark:bg-slate-800/60">
          <Users size={56} className="mx-auto mb-4 text-slate-400 dark:text-slate-500" strokeWidth={1.5} />
          <p className="text-lg font-medium text-slate-600 dark:text-slate-300">
            {search ? 'No se encontraron contactos' : 'Aun no hay contactos registrados'}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {search
              ? `No hay resultados para "${search}"`
              : 'Comenza cargando tu primer contacto usando el boton superior.'
            }
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {(data?.items ?? []).map((contact) => (
              <Link
                key={contact.id}
                href={`/contacts/${contact.id}`}
                className="interactive-card group flex flex-col gap-4 p-4 transition-colors hover:border-primary-300 dark:hover:border-slate-500/90 sm:flex-row sm:items-center"
              >
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-sky-300 bg-sky-200 text-sm font-black text-sky-950 shadow-sm dark:border-slate-500/80 dark:bg-slate-600 dark:text-slate-50">
                  <span className="relative z-10">
                    {contact.firstName[0]}
                    {contact.lastName?.[0] ?? ''}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="truncate text-base font-bold tracking-tight text-slate-900 transition-colors group-hover:text-primary-700 dark:group-hover:text-slate-50">
                      {contact.firstName} {contact.lastName}
                    </span>
                    <span className={clsx(
                      'rounded-md border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest shadow-sm',
                      STATUS_COLORS[contact.status] ?? 'border-slate-400 bg-slate-200 text-slate-900'
                    )}>
                      {contact.status}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
                    {contact.email && (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        <Mail size={14} className="text-slate-500 transition-colors group-hover:text-primary-500 dark:text-slate-400" />
                        {contact.email}
                      </span>
                    )}
                    {contact.phone && (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        <Phone size={14} className="text-slate-500 transition-colors group-hover:text-primary-500 dark:text-slate-400" />
                        {contact.phone}
                      </span>
                    )}
                  </div>

                  {contact.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Tag size={12} className="text-slate-500 dark:text-slate-400" />
                      {contact.tags.map((tag) => (
                        <span key={tag} className="rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:border-slate-500/60 dark:bg-slate-600/60 dark:text-slate-100">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex min-w-22 shrink-0 flex-col items-center justify-center border-l border-slate-200 px-4 text-center dark:border-slate-600/70">
                  <div className={clsx(
                    'mb-0.5 text-2xl font-black',
                    contact.score >= 70 ? 'text-emerald-600 dark:text-emerald-300' :
                    contact.score >= 40 ? 'text-amber-600 dark:text-amber-300' : 'text-slate-700 dark:text-slate-300'
                  )}>
                    {contact.score}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Score</div>
                </div>

                <button
                  onClick={(e) => {
                    e.preventDefault()
                    if (confirm(`Eliminar contacto ${contact.firstName}?`)) {
                      deleteMutation.mutate(contact.id)
                    }
                  }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
                >
                  x
                </button>
              </Link>
            ))}
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-5 dark:border-slate-600/70">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Página <span className="font-semibold text-slate-700 dark:text-slate-200">{page + 1}</span> de{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-200">{totalPages}</span>
                {' '}· {data?.total} contactos
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <ChevronLeft size={16} /> Anterior
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Siguiente <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}