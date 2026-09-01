'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { AlertCircle, ArrowRight, CheckCircle2, LoaderCircle, LockKeyhole, Mail } from 'lucide-react'
import { authApi } from '@/lib/api'
import { auth } from '@/lib/auth'
import { DevelopedBy } from '@/components/AuthBrand'

const CAPABILITIES = [
  'Legajos y obligaciones en un solo lugar',
  'Cobranzas y vencimientos bajo control',
  'WhatsApp convertido en tickets asignables',
]

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await authApi.login(email, password)
      auth.save({
        token: data.accessToken,
        userId: data.user.id,
        workspaceId: data.workspace.id,
        role: data.role,
        firstName: data.user.firstName,
        lastName: data.user.lastName,
        email: data.user.email,
        workspaceName: data.workspace.name,
        avatar: data.user.avatar,
      })
      router.replace('/dashboard')
    } catch (candidate: unknown) {
      const requestError = candidate as { response?: { data?: { message?: string } } }
      setError(requestError.response?.data?.message ?? 'No pudimos validar tus datos. Revisalos e intentá nuevamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="grid min-h-[100dvh] bg-[var(--paper)] lg:grid-cols-[minmax(360px,0.86fr)_minmax(480px,1.14fr)]">
      <section className="relative hidden overflow-hidden bg-[var(--brand-navy-deep)] p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
        <div className="absolute inset-y-0 right-0 w-px bg-white/12" />
        <div>
          <Image src="/brand/romez-light.jpg" alt="ROMEZ Servicios Contables" width={176} height={176} className="h-40 w-40 object-contain" priority />
          <p className="mt-8 max-w-lg font-display text-4xl font-extrabold leading-tight tracking-[-0.04em]">Cada cliente, vencimiento y conversación en orden.</p>
          <p className="mt-4 max-w-md text-sm leading-6 text-white/66">El espacio de trabajo diario del estudio para resolver pendientes con contexto y responsabilidad clara.</p>
        </div>
        <div className="space-y-4 border-t border-white/12 pt-7">
          {CAPABILITIES.map((capability) => <div key={capability} className="flex items-center gap-3 text-sm font-semibold text-white/84"><CheckCircle2 size={17} className="text-[#9fb9e9]" />{capability}</div>)}
        </div>
      </section>

      <section className="flex items-center justify-center bg-[var(--paper-soft)] px-5 py-10 sm:px-10">
        <div className="w-full max-w-[430px]">
          <div className="mb-8 lg:hidden">
            <Image src="/brand/romez-navy.jpg" alt="ROMEZ Servicios Contables" width={128} height={128} className="mx-auto h-28 w-28 object-contain" priority />
          </div>
          <div className="mb-7">
            <p className="section-label">Gestión ROMEZ</p>
            <h1 className="page-title mt-2">Ingresá a tu mesa de trabajo</h1>
            <p className="page-subtitle">Acceso exclusivo para el equipo autorizado del estudio.</p>
          </div>

          <form onSubmit={handleSubmit} className="paper-panel space-y-5 p-5 sm:p-7">
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-[var(--ink-secondary)]">Correo electrónico</span>
              <span className="relative block">{!email ? <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" /> : null}<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="ctrl-input pl-10" placeholder="nombre@romez.com.py" required /></span>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-[var(--ink-secondary)]">Contraseña</span>
              <span className="relative block">{!password ? <LockKeyhole size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" /> : null}<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="ctrl-input pl-10" placeholder="Tu contraseña" required /></span>
            </label>

            {error ? <div className="flex gap-2 rounded-lg border border-[var(--danger-line)] bg-[var(--danger-paper)] px-3 py-2.5 text-xs font-semibold text-[var(--danger)]" role="alert"><AlertCircle size={16} className="mt-px shrink-0" />{error}</div> : null}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? <><LoaderCircle size={16} className="animate-spin" /> Validando acceso…</> : <>Ingresar <ArrowRight size={16} /></>}
            </button>
          </form>
          <DevelopedBy />
        </div>
      </section>
    </main>
  )
}
