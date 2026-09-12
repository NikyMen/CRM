'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { teamApi } from '@/lib/api'
import { auth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/format'
import { SectionPanel } from './OperationalUI'

type Member = { id: string; role: string; user: { id: string; firstName: string; lastName: string | null; email: string } }
export function TeamAccessPanel({ members }: { members: Member[] }) {
  const [role, setRole] = useState<'admin' | 'member' | 'viewer'>('member')
  const [link, setLink] = useState('')
  const [expiry, setExpiry] = useState('')
  const [copied, setCopied] = useState(false)
  const [memberId, setMemberId] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const invitation = useMutation({ mutationFn: () => teamApi.createInvitation(role), onSuccess: ({ data }) => {
    setLink(`${window.location.origin}/register#${data.token}`)
    setExpiry(new Date(data.expiresAt).toLocaleString('es-PY', { timeZone: 'America/Asuncion' }))
    setCopied(false)
  } })
  const changePassword = useMutation({ mutationFn: () => teamApi.changePassword(memberId, password), onSuccess: () => {
    setPassword(''); setConfirmation('')
    if (members.find((member) => member.id === memberId)?.user.id === auth.get()?.userId) {
      auth.clear(); window.location.replace('/login')
    }
  } })
  const canSave = memberId && password.length >= 8 && password === confirmation
  return <div className="mb-8 grid gap-4 lg:grid-cols-2">
    <SectionPanel title="Invitar mediante enlace" description="Un registro por enlace. Vence a las 24 horas; la persona completa sus datos.">
      <div className="space-y-3 p-5">
        <label className="block text-xs font-semibold">Permisos<select className="ctrl-input mt-1" value={role} onChange={(e) => setRole(e.target.value as typeof role)}><option value="admin">Administrador</option><option value="member">Integrante</option><option value="viewer">Solo lectura</option></select></label>
        <button type="button" className="btn-primary" disabled={invitation.isPending} onClick={() => invitation.mutate()}>{invitation.isPending ? 'Generando…' : 'Generar enlace'}</button>
        {link ? <div className="space-y-2"><label className="block text-xs font-semibold">Enlace para compartir<input className="ctrl-input mt-1" readOnly value={link} onFocus={(e) => e.target.select()} /></label><p className="text-xs text-[var(--ink-tertiary)]">Vence: {expiry} (Paraguay). Compartilo sólo con la persona autorizada.</p><button type="button" className="btn-secondary" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true) } catch { setCopied(false) } }}>{copied ? 'Copiado' : 'Copiar enlace'}</button></div> : null}
        {invitation.isError ? <p role="alert" className="text-sm text-[var(--danger)]">{getErrorMessage(invitation.error)}</p> : null}
      </div>
    </SectionPanel>
    <SectionPanel title="Cambiar contraseña" description="Al guardar, se cierran las sesiones anteriores del usuario.">
      <form className="space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); if (canSave) changePassword.mutate() }}>
        <label className="block text-xs font-semibold">Usuario<select className="ctrl-input mt-1" required value={memberId} onChange={(e) => { setMemberId(e.target.value); changePassword.reset() }}><option value="">Seleccioná un usuario</option>{members.filter((m) => m.role !== 'owner' || m.user.id === auth.get()?.userId).map((m) => <option key={m.id} value={m.id}>{m.user.firstName} {m.user.lastName} · {m.user.email}</option>)}</select></label>
        <label className="block text-xs font-semibold">Nueva contraseña<input type="password" autoComplete="new-password" className="ctrl-input mt-1" minLength={8} maxLength={72} required value={password} onChange={(e) => { setPassword(e.target.value); changePassword.reset() }} /></label>
        <label className="block text-xs font-semibold">Repetir contraseña<input type="password" autoComplete="new-password" className="ctrl-input mt-1" required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label>
        {confirmation && password !== confirmation ? <p className="text-xs text-[var(--danger)]">Las contraseñas no coinciden.</p> : null}
        <button className="btn-primary" disabled={!canSave || changePassword.isPending}>{changePassword.isPending ? 'Guardando…' : 'Guardar contraseña'}</button>
        {changePassword.isSuccess ? <p role="status" className="text-sm text-[var(--success)]">Contraseña actualizada.</p> : null}
        {changePassword.isError ? <p role="alert" className="text-sm text-[var(--danger)]">{getErrorMessage(changePassword.error)}</p> : null}
      </form>
    </SectionPanel>
  </div>
}
