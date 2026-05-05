'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { authApi } from '@/lib/api'
import { auth } from '@/lib/auth'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await authApi.login(email, password)
      const data = res.data

      auth.save({
        token:         data.accessToken,
        userId:        data.user.id,
        workspaceId:   data.workspace.id,
        role:          data.role,
        firstName:     data.user.firstName,
        email:         data.user.email,
        workspaceName: data.workspace.name,
      })

      router.push('/contacts')
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4 sm:p-8 animate-fade-in relative overflow-hidden">
      {/* Elementos decorativos de fondo */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary-200/40 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary-300/20 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10">

        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl shadow-lg shadow-primary-700/30 mb-5 relative group">
            <span className="text-white text-2xl font-black tracking-tighter">C</span>
            <div className="absolute inset-0 border border-white/20 rounded-2xl"></div>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Bienvenido</h1>
          <p className="text-slate-500 mt-2 font-medium">Ingresá a tu espacio de trabajo CRM</p>
        </div>

        {/* Card */}
        <div className="interactive-card p-8 sm:p-10 !border-slate-100 !shadow-xl !shadow-slate-200/50">
          <form onSubmit={handleSubmit} className="space-y-6">

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 focus:outline-none focus:ring-[3px] focus:ring-primary-500/30 focus:border-primary-500 placeholder-slate-400 transition-all font-medium"
                placeholder="tu@email.com"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 focus:outline-none focus:ring-[3px] focus:ring-primary-500/30 focus:border-primary-500 placeholder-slate-400 transition-all font-medium"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl px-4 py-3 text-sm font-medium animate-slide-up flex items-start gap-2">
                <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3.5 text-base mt-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  Ingresando...
                </>
              ) : 'Ingresar al CRM'}
            </button>

            <div className="text-center mt-4">
              <Link href="/forgot-password" className="text-sm text-indigo-400 hover:text-indigo-300">
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
          </form>

          <p className="mt-8 text-center text-sm font-medium text-slate-500">
            ¿No tenés cuenta?{' '}
            <Link href="/register" className="text-primary-600 hover:text-primary-700 font-bold hover:underline transition-colors">
              Registrate gratis
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}