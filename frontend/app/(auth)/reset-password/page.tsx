'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Eye, EyeOff, LoaderCircle, LockKeyhole } from 'lucide-react'
import { authApi } from '@/lib/api'
import { AuthBrand, DevelopedBy } from '@/components/AuthBrand'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (password !== confirm) return setError('Las contraseñas no coinciden.')
    if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    setLoading(true)
    setError('')
    try {
      const token = new URLSearchParams(window.location.search).get('token') ?? ''
      if (!token) return setError('El enlace no es válido. Solicitá uno nuevo.')
      await authApi.resetPassword(token, password)
      router.replace('/login?reset=true')
    } catch (candidate: unknown) {
      const requestError = candidate as { response?: { data?: { message?: string } } }
      setError(requestError.response?.data?.message ?? 'El enlace expiró o no es válido.')
    } finally { setLoading(false) }
  }

  return <main className="flex min-h-[100dvh] items-center justify-center bg-[var(--paper-soft)] p-5"><div className="w-full max-w-md"><AuthBrand title="Nueva contraseña" subtitle="Protegé tu acceso a Gestión ROMEZ" /><form onSubmit={handleSubmit} className="paper-panel space-y-5 p-6"><PasswordField label="Nueva contraseña" value={password} setValue={setPassword} show={showPassword} toggle={() => setShowPassword((current) => !current)} /><PasswordField label="Confirmar contraseña" value={confirm} setValue={setConfirm} show={showPassword} />{error ? <p className="rounded-lg border border-[var(--danger-line)] bg-[var(--danger-paper)] p-3 text-xs font-semibold text-[var(--danger)]">{error}</p> : null}<button type="submit" disabled={!password || !confirm || loading} className="btn-primary w-full">{loading ? <LoaderCircle size={16} className="animate-spin" /> : <LockKeyhole size={16} />}{loading ? 'Guardando…' : 'Cambiar contraseña'}</button><Link href="/login" className="flex items-center justify-center gap-2 text-xs font-bold text-[var(--brand-blue)]"><ArrowLeft size={14} /> Volver al ingreso</Link></form><DevelopedBy /></div></main>
}

function PasswordField({ label, value, setValue, show, toggle }: { label: string; value: string; setValue: (value: string) => void; show: boolean; toggle?: () => void }) { return <label className="block"><span className="mb-2 block text-xs font-bold text-[var(--ink-secondary)]">{label}</span><span className="relative block"><input type={show ? 'text' : 'password'} value={value} onChange={(event) => setValue(event.target.value)} className="ctrl-input pr-10" placeholder="Mínimo 8 caracteres" required />{toggle ? <button type="button" onClick={toggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button> : null}</span></label> }
