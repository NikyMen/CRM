'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AtSign, Hash, Phone, UserRoundCheck } from 'lucide-react'
import { auth } from '@/lib/auth'
import { teamApi, whatsappApi } from '@/lib/api'
import type { KanbanBoard, Role, WhatsAppChat, WhatsAppMessagesPayload } from '@/types'

type Member = {
  id: string
  role: Role
  user: { id: string; firstName: string; lastName?: string | null; email: string }
}

export function ChatIdentityPanel({ chat, compact = false }: { chat: WhatsAppChat; compact?: boolean }) {
  const queryClient = useQueryClient()
  const user = auth.get()
  const [phone, setPhone] = useState(chat.phoneNumber ?? '')
  const isOwner = user?.role === 'owner'
  const isMine = chat.assignedToUserId === user?.userId

  const members = useQuery<Member[]>({
    queryKey: ['team'],
    queryFn: () => teamApi.list().then((response) => response.data),
    enabled: isOwner,
  })

  const assignment = useMutation({
    mutationFn: (assignedToUserId: string | null) => whatsappApi.updateAssignee(chat.jid, assignedToUserId),
    onMutate: async (assignedToUserId) => {
      const member = members.data?.find((item) => item.user.id === assignedToUserId)?.user
      const assignee = assignedToUserId
        ? member ?? (assignedToUserId === user?.userId ? { id: user.userId, firstName: user.firstName, lastName: user.lastName, email: user.email } : null)
        : null
      const updateChat = (value: WhatsAppChat) => value.jid === chat.jid ? { ...value, assignedToUserId, assignee } : value
      queryClient.setQueriesData<WhatsAppChat[]>({ queryKey: ['whatsapp-chats'] }, (current) => current?.map(updateChat))
      queryClient.setQueriesData<WhatsAppMessagesPayload>({ queryKey: ['whatsapp-messages'] }, (current) => current?.chat?.jid === chat.jid ? { ...current, chat: updateChat(current.chat) } : current)
      queryClient.setQueriesData<KanbanBoard>({ queryKey: ['kanban'] }, (current) => current ? { ...current, columns: current.columns.map((column) => ({ ...column, deals: column.deals.map((deal) => deal.chat?.jid === chat.jid ? { ...deal, chat: { ...deal.chat, assignedToUserId, assignee } } : deal) })) } : current)
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-chats'] })
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages'] })
      queryClient.invalidateQueries({ queryKey: ['kanban'] })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-chats'] })
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages'] })
      queryClient.invalidateQueries({ queryKey: ['kanban'] })
    },
  })

  const identity = useMutation({
    mutationFn: () => whatsappApi.updateIdentity(chat.jid, phone.replace(/\D/g, '')),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-chats'] })
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages'] })
      queryClient.invalidateQueries({ queryKey: ['kanban'] })
    },
  })

  const assigneeName = chat.assignee
    ? `${chat.assignee.firstName} ${chat.assignee.lastName ?? ''}`.trim()
    : 'Sin asignar'

  return (
    <aside className={compact ? 'identity-line rounded-xl p-3' : 'identity-line w-full shrink-0 rounded-2xl p-4 lg:w-56'}>
      <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--ink-tertiary)]">Identidad del lead</p>
      <div className="space-y-2.5 text-xs">
        <p className="flex items-center gap-2 font-extrabold text-[var(--ink-primary)]"><Hash size={14} /> {chat.leadNumber ?? 'Sin lead'}</p>
        <p className="flex items-center gap-2 font-bold text-[var(--ink-secondary)]"><Phone size={14} /> {chat.phoneNumber || 'Teléfono pendiente'}</p>
        <p className="flex items-start gap-2 break-all font-bold text-[var(--ink-secondary)]"><AtSign size={14} className="mt-0.5 shrink-0" /> {chat.lidJid || (chat.jid.endsWith('@lid') ? chat.jid : 'LID pendiente')}</p>
        <p className="flex items-center gap-2 font-bold text-[var(--ink-secondary)]"><UserRoundCheck size={14} /> {assigneeName}</p>
      </div>

      {isOwner ? (
        <select
          className="ctrl-input mt-4 w-full text-xs"
          value={chat.assignedToUserId ?? ''}
          onChange={(event) => assignment.mutate(event.target.value || null)}
          disabled={assignment.isPending}
          aria-label="Responsable"
        >
          <option value="">Sin asignar</option>
          {members.data?.filter((member) => member.role !== 'viewer').map((member) => (
            <option key={member.user.id} value={member.user.id}>
              {member.user.firstName} {member.user.lastName ?? ''}
            </option>
          ))}
        </select>
      ) : (
        <button
          type="button"
          className="mt-4 w-full rounded-xl bg-[var(--accent)] px-3 py-2 text-xs font-black text-[var(--accent-contrast)] disabled:opacity-50"
          onClick={() => assignment.mutate(isMine ? null : user?.userId ?? null)}
          disabled={assignment.isPending || (!!chat.assignedToUserId && !isMine)}
        >
          {isMine ? 'Liberar lead' : 'Tomar lead'}
        </button>
      )}

      {isOwner && !chat.phoneNumber && !compact && (
        <div className="mt-4 border-t border-[var(--panel-border)] pt-4">
          <label className="text-[10px] font-black uppercase tracking-wider text-[var(--ink-tertiary)]">Teléfono manual</label>
          <input className="ctrl-input mt-2 w-full text-xs" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="54911..." />
          <button type="button" className="mt-2 text-xs font-black text-[var(--accent-text)]" onClick={() => identity.mutate()} disabled={identity.isPending || phone.replace(/\D/g, '').length < 8}>Guardar teléfono</button>
        </div>
      )}
    </aside>
  )
}
