'use client'

import { useState } from 'react'
import { authApi } from '@/lib/api'
import Link from 'next/link'
import { Loader2, ArrowLeft, Mail } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('')
  const [sent, setSent]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await authApi.forgotPassword(email)
      setSent(true)
    } catch {
      setError('Ocurrió un error. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-600/20 border border-indigo-500/30">
            <Mail size={28} className="text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Revisá tu email</h1>
          <p className="text-gray-400 mb-6">
            Si el email <span className="text-white font-medium">{email}</span> está registrado,
            vas a recibir un link para restablecer tu contraseña.
          </p>
          <Link
            href="/login"
            className="text-indigo-400 hover:text-indigo-300 text-sm flex items-center justify-center gap-2"
          >
            <ArrowLeft size={16} /> Volver al login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <Link
            href="/login"
            className="text-gray-400 hover:text-white text-sm flex items-center gap-2 mb-6"
          >
            <ArrowLeft size={16} /> Volver al login
          </Link>
          <h1 className="text-2xl font-bold text-white">Olvidaste tu contraseña?</h1>
          <p className="text-gray-400 mt-1 text-sm">
            Ingresá tu email y te enviamos un link para restablecerla.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
              className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={!email || loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            Enviar link de recuperación
          </button>
        </form>
      </div>
    </div>
  )
}