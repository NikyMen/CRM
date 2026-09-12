'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useMutation } from '@tanstack/react-query'
import { teamApi } from '@/lib/api'
import { getErrorMessage } from '@/lib/format'

export default function RegisterPage() {
  const [token, setToken] = useState<string | null>(null)
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' })
  const [confirmation, setConfirmation] = useState('')
  useEffect(() => { setToken(window.location.hash.slice(1)) }, [])
  const register = useMutation({ mutationFn: () => teamApi.acceptInvitation({ ...form, token: token ?? '' }), onSuccess: () => {
    window.history.replaceState(null, '', '/register')
    setForm({ firstName: '', lastName: '', email: '', password: '' }); setConfirmation('')
  } })
  return <main className="flex min-h-screen items-center justify-center bg-[var(--canvas)] p-6"><div className="w-full max-w-md space-y-5 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-6">
    <div><p className="text-xs font-bold text-[var(--brand-blue)]">Gestión ROMEZ</p><h1 className="mt-2 text-2xl font-bold">Completá tu registro</h1><p className="mt-2 text-sm text-[var(--ink-tertiary)]">Acceso autorizado por el propietario. El enlace sirve una sola vez y vence a las 24 horas.</p></div>
    {register.isSuccess ? <p role="status">Cuenta creada. Ya podés iniciar sesión.</p> : token === null ? <p>Cargando invitación…</p> : !/^[a-f0-9]{64}$/.test(token) ? <p role="alert">Necesitás un enlace de invitación válido. Solicitáselo al propietario.</p> : <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (form.password === confirmation) register.mutate() }}>
      {([{ key: 'firstName', label: 'Nombre', type: 'text', auto: 'given-name' }, { key: 'lastName', label: 'Apellido', type: 'text', auto: 'family-name' }, { key: 'email', label: 'Correo electrónico', type: 'email', auto: 'email' }, { key: 'password', label: 'Contraseña (mínimo 8 caracteres)', type: 'password', auto: 'new-password' }] as const).map(({ key, label, type, auto }) => <label key={key} className="block text-sm font-semibold">{label}<input className="ctrl-input mt-1" required type={type} autoComplete={auto} minLength={key === 'password' ? 8 : 1} maxLength={key === 'password' ? 72 : key === 'email' ? 254 : 100} value={form[key]} onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))} /></label>)}
      <label className="block text-sm font-semibold">Repetir contraseña<input className="ctrl-input mt-1" type="password" autoComplete="new-password" required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label>
      {confirmation && form.password !== confirmation ? <p className="text-xs text-[var(--danger)]">Las contraseñas no coinciden.</p> : null}
      {register.isError ? <p role="alert" className="text-sm text-[var(--danger)]">{getErrorMessage(register.error)}</p> : null}
      <button className="btn-primary w-full" disabled={register.isPending || !confirmation || form.password !== confirmation}>{register.isPending ? 'Creando cuenta…' : 'Crear mi cuenta'}</button>
    </form>}
    <Link href="/login" className="inline-block text-sm font-semibold text-[var(--brand-blue)]">Ir a iniciar sesión</Link>
  </div></main>
}
