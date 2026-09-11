'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, LoaderCircle, Mail } from 'lucide-react'
import { authApi } from '@/lib/api'
import { AuthBrand, DevelopedBy } from '@/components/AuthBrand'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try { await authApi.forgotPassword(email); setSent(true) }
    catch { setError('No pudimos procesar la solicitud. Intentá nuevamente.') }
    finally { setLoading(false) }
  }

  return <main className="flex min-h-[100dvh] items-center justify-center bg-[var(--paper-soft)] p-5"><div className="w-full max-w-md">{sent ? <div className="paper-panel p-7 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-lg border border-[var(--success-line)] bg-[var(--success-paper)] text-[var(--success)]"><CheckCircle2 size={22} /></span><h1 className="mt-5 font-display text-xl font-extrabold text-[var(--ink-primary)]">Revisá tu correo</h1><p className="mt-3 text-sm leading-6 text-[var(--ink-secondary)]">Si <strong>{email}</strong> está registrado, vas a recibir un enlace seguro para restablecer tu contraseña.</p><Link href="/login" className="btn-secondary mt-6"><ArrowLeft size={15} /> Volver al ingreso</Link></div> : <><AuthBrand title="Recuperar acceso" subtitle="Te enviaremos un enlace seguro" /><form onSubmit={handleSubmit} className="paper-panel space-y-5 p-6"><label className="block"><span className="mb-2 block text-xs font-bold text-[var(--ink-secondary)]">Correo electrónico</span><span className="relative block"><Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" /><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="ctrl-input pl-10" placeholder="nombre@romez.com.py" required /></span></label>{error ? <p className="rounded-lg border border-[var(--danger-line)] bg-[var(--danger-paper)] p-3 text-xs font-semibold text-[var(--danger)]">{error}</p> : null}<button type="submit" disabled={!email || loading} className="btn-primary w-full">{loading ? <LoaderCircle size={16} className="animate-spin" /> : <Mail size={16} />}{loading ? 'Enviando…' : 'Enviar enlace'}</button><Link href="/login" className="flex items-center justify-center gap-2 text-xs font-bold text-[var(--brand-blue)]"><ArrowLeft size={14} /> Volver al ingreso</Link></form></>}<DevelopedBy /></div></main>
}
