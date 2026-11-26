'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { Check, ChevronDown, Hand, Loader2, UserMinus, UserRound } from 'lucide-react'
import { socialApi, type TeamMember } from '@/lib/api'
import { auth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/format'
import { WaAvatar } from '@/components/romez/WaChatBits'

/** Personas que pueden ser responsables de un chat (no viewers). */
export function useTeamMembers() {
  return useQuery<TeamMember[]>({ queryKey: ['social-team'], queryFn: () => socialApi.team().then((response) => response.data.members), staleTime: 60_000 })
}

type MemberLike = { id: string; firstName: string; lastName?: string | null; avatar?: string | null }

export function memberName(member?: Pick<MemberLike, 'firstName' | 'lastName'> | null) {
  return member ? [member.firstName, member.lastName].filter(Boolean).join(' ') : ''
}

export function MemberAvatar({ member, className = 'h-6 w-6 text-[10px]' }: { member: MemberLike; className?: string }) {
  return <WaAvatar id={member.id} name={memberName(member)} imageUrl={member.avatar} className={className} />
}

/**
 * Responsable de un chat, como en Tickets: owner y admin eligen a cualquiera del equipo;
 * el resto puede tomar un chat libre o liberar el suyo.
 */
export function AssigneeControl({ assignedToUserId, onAssign }: { assignedToUserId: string | null | undefined; onAssign: (userId: string | null) => Promise<unknown> }) {
  const user = auth.get()
  const manager = user?.role === 'owner' || user?.role === 'admin'
  const canWrite = user?.role !== 'viewer'
  const team = useTeamMembers()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const assign = useMutation({ mutationFn: (userId: string | null) => onAssign(userId), onSuccess: () => setOpen(false) })
  const current = team.data?.find((member) => member.id === assignedToUserId) ?? null
  const mine = Boolean(user?.userId && assignedToUserId === user.userId)

  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false) } }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey) }
  }, [open])

  const label = current ? (mine ? 'Vos' : memberName(current)) : assignedToUserId ? 'Asignado' : 'Sin responsable'
  const error = assign.isError ? <p role="alert" className="absolute right-0 top-full z-10 mt-1 w-64 rounded-lg bg-[var(--danger-paper)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--danger)] shadow-sm">{getErrorMessage(assign.error, 'No se pudo cambiar el responsable.')}</p> : null

  if (!manager) {
    return (
      <div className="relative flex shrink-0 items-center gap-1.5">
        <span className="hidden items-center gap-1.5 text-xs text-[var(--ink-tertiary)] sm:inline-flex">
          {current ? <MemberAvatar member={current} className="h-6 w-6 text-[10px]" /> : <UserRound size={14} />}
          {label}
        </span>
        {canWrite && !assignedToUserId ? <button type="button" className="btn-primary !min-h-9 !px-3" disabled={assign.isPending} onClick={() => assign.mutate(user?.userId ?? null)} title="Asignarte este chat: deja de estar libre para el resto">{assign.isPending ? <Loader2 size={14} className="animate-spin" /> : <Hand size={14} />} Tomar</button> : null}
        {canWrite && mine ? <button type="button" className="btn-secondary !min-h-9 !px-3" disabled={assign.isPending} onClick={() => assign.mutate(null)} title="Dejar el chat libre para que lo tome otra persona">{assign.isPending ? <Loader2 size={14} className="animate-spin" /> : <UserMinus size={14} />} Liberar</button> : null}
        {error}
      </div>
    )
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-haspopup="listbox" aria-expanded={open} title="Responsable del chat" className={clsx('inline-flex h-9 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition', current ? 'border-[var(--line)] bg-[var(--paper)] text-[var(--ink-primary)]' : 'border-dashed border-[var(--line)] bg-[var(--paper-soft)] text-[var(--ink-tertiary)]', 'hover:border-[var(--brand-blue)]')}>
        {assign.isPending ? <Loader2 size={14} className="animate-spin" /> : current ? <MemberAvatar member={current} className="h-6 w-6 text-[10px]" /> : <UserRound size={14} />}
        <span className="max-w-[9rem] truncate">{label}</span>
        <ChevronDown size={14} className="text-[var(--ink-muted)]" />
      </button>
      {open ? (
        <ul role="listbox" aria-label="Elegir responsable" className="absolute right-0 top-full z-30 mt-1.5 max-h-80 w-60 overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--paper)] py-1 shadow-lg">
          <li>
            <button type="button" role="option" aria-selected={!assignedToUserId} onClick={() => assign.mutate(null)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[var(--ink-secondary)] hover:bg-[var(--paper-soft)]">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--paper-inset)]"><UserMinus size={14} /></span>
              <span className="flex-1">Sin responsable</span>
              {!assignedToUserId ? <Check size={15} className="text-[var(--brand-blue)]" /> : null}
            </button>
          </li>
          {team.isLoading ? <li className="flex items-center gap-2 px-3 py-2 text-xs text-[var(--ink-tertiary)]"><Loader2 size={13} className="animate-spin" /> Cargando equipo…</li> : null}
          {team.data?.map((member) => (
            <li key={member.id}>
              <button type="button" role="option" aria-selected={member.id === assignedToUserId} onClick={() => assign.mutate(member.id)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[var(--ink-primary)] hover:bg-[var(--paper-soft)]">
                <MemberAvatar member={member} className="h-7 w-7 text-[10px]" />
                <span className="min-w-0 flex-1 truncate">{memberName(member)}{member.id === user?.userId ? <span className="text-[var(--ink-muted)]"> (vos)</span> : null}</span>
                {member.id === assignedToUserId ? <Check size={15} className="text-[var(--brand-blue)]" /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error}
    </div>
  )
}
