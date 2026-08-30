'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Check, Circle, Download, FileText, MessageSquareText, Pencil, Plus, Save, UserCheck, UserMinus, Upload, UsersRound, WalletCards, X } from 'lucide-react'
import clsx from 'clsx'
import { checklistsApi, clientsApi, collectionsApi, contactsApi, teamApi } from '@/lib/api'
import { auth } from '@/lib/auth'
import type { AccountSummary, Client, ClientChecklist, ClientDocument, ClientNote, ClientSummary, Contact, PaginatedResult, Receivable, Role } from '@/types'
import { formatDate, formatMoney, fullName, getErrorMessage } from '@/lib/format'
import { ClientIdentityStrip, EmptyState, ErrorState, LoadingState, PageFrame, PageHeader, SectionPanel, StatusPill } from '@/components/romez/OperationalUI'

type Tab = 'ficha' | 'contactos' | 'cuenta' | 'personal' | 'checklist' | 'tickets' | 'documentos'
type Member = { id: string; role: Role; user: { id: string; firstName: string; lastName?: string | null; email: string } }
type AssignmentInput = { userId: string; area: string }

const COLLABORATION_AREAS = ['GENERAL', 'CONTABILIDAD', 'IMPUESTOS', 'LABORAL', 'COBRANZAS', 'ATENCION AL CLIENTE']

function normalizeArea(area: string) {
  return area.trim().toUpperCase() || 'GENERAL'
}

function sanitizeAssignments(assignments: AssignmentInput[], ownerId?: string | null) {
  const unique = new Map<string, AssignmentInput>()
  for (const assignment of assignments) {
    if (!assignment.userId || assignment.userId === ownerId) continue
    const normalized = { userId: assignment.userId, area: normalizeArea(assignment.area) }
    unique.set(`${normalized.userId}:${normalized.area}`, normalized)
  }
  return [...unique.values()]
}

const TABS: Array<{ id: Tab; label: string; icon: typeof Building2 }> = [
  { id: 'ficha', label: 'Ficha fiscal', icon: Building2 },
  { id: 'contactos', label: 'Contactos', icon: UsersRound },
  { id: 'cuenta', label: 'Cuenta corriente', icon: WalletCards },
  { id: 'personal', label: 'Personal asignado', icon: UsersRound },
  { id: 'checklist', label: 'Checklist', icon: Check },
  { id: 'tickets', label: 'Tickets', icon: MessageSquareText },
  { id: 'documentos', label: 'Documentos y notas', icon: FileText },
]

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('ficha')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Partial<Client>>({})
  const [note, setNote] = useState('')
  const [role, setRole] = useState<Role>()
  const canManage = role === 'owner' || role === 'admin'

  useEffect(() => {
    const syncRole = () => setRole(auth.get()?.role as Role | undefined)
    syncRole()
    window.addEventListener('crm_user_updated', syncRole)
    window.addEventListener('storage', syncRole)
    return () => {
      window.removeEventListener('crm_user_updated', syncRole)
      window.removeEventListener('storage', syncRole)
    }
  }, [])

  const summaryQuery = useQuery<ClientSummary>({ queryKey: ['client-summary', id], queryFn: () => clientsApi.summary(id).then((response) => response.data) })
  const documentsQuery = useQuery<ClientDocument[]>({ queryKey: ['client-documents', id], queryFn: () => clientsApi.listDocuments(id).then((response) => response.data) })
  const receivablesQuery = useQuery<PaginatedResult<Receivable>>({ queryKey: ['receivables', { companyId: id }], queryFn: () => collectionsApi.listReceivables({ companyId: id, page: 0, limit: 100 }).then((response) => response.data) })
  const teamQuery = useQuery<Member[]>({ queryKey: ['team'], queryFn: () => teamApi.list().then((response) => response.data), enabled: canManage })

  const updateClient = useMutation({
    mutationFn: (data: Parameters<typeof clientsApi.update>[1]) => clientsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-summary', id] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      setEditing(false)
      setDraft({})
    },
  })

  const uploadDocument = useMutation({
    mutationFn: (file: File) => clientsApi.uploadDocument(id, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client-documents', id] }),
  })

  const updateChecklistItem = useMutation({
    mutationFn: ({ checklistId, itemId, isCompleted }: { checklistId: string; itemId: string; isCompleted: boolean }) => checklistsApi.updateItem(id, checklistId, itemId, isCompleted),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-summary', id] })
      queryClient.invalidateQueries({ queryKey: ['checklists-summary'] })
    },
  })

  const createContact = useMutation({
    mutationFn: (contact: { firstName: string; lastName?: string; email?: string; phone?: string }) => contactsApi.create({ ...contact, companyId: id, source: 'MANUAL' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client-summary', id] }),
  })

  const addNote = useMutation({
    mutationFn: () => clientsApi.addNote(id, note.trim()),
    onSuccess: () => {
      setNote('')
      queryClient.invalidateQueries({ queryKey: ['client-summary', id] })
    },
  })
  const refreshClient = () => {
    queryClient.invalidateQueries({ queryKey: ['client-summary', id] })
    queryClient.invalidateQueries({ queryKey: ['clients'] })
  }
  const updateAssignments = useMutation({
    mutationFn: (assignments: AssignmentInput[]) => clientsApi.update(id, { assignments }),
    onSuccess: refreshClient,
  })
  const claimClient = useMutation({ mutationFn: () => clientsApi.claim(id), onSuccess: refreshClient })
  const releaseClient = useMutation({ mutationFn: () => clientsApi.release(id), onSuccess: () => { setEditing(false); refreshClient() } })

  if (summaryQuery.isLoading) return <PageFrame><LoadingState label="Abriendo legajo…" /></PageFrame>
  if (summaryQuery.isError || !summaryQuery.data) return <PageFrame><ErrorState message={getErrorMessage(summaryQuery.error, 'No pudimos abrir este legajo.')} retry={() => summaryQuery.refetch()} /></PageFrame>

  const summary = summaryQuery.data
  const client = summary.client
  const currentUserId = auth.get()?.userId
  const memberAssigned = Boolean(currentUserId && (client.ownerId === currentUserId || client.assignments.some((assignment) => assignment.userId === currentUserId)))
  const canWrite = canManage || role === 'member' && memberAssigned
  const canClaim = role === 'member' && !client.ownerId && !memberAssigned
  const canRelease = role === 'member' && client.ownerId === currentUserId
  const account = summary.account.find((item) => item.currency === 'PYG') ?? summary.account[0]
  const pending = summary.checklists.reduce((count, checklist) => count + checklist.items.filter((item) => !item.isCompleted).length, 0)
    + summary.tickets.filter((ticket) => !['RESOLVED', 'CLOSED'].includes(ticket.status)).length
  const assignmentInputs = client.assignments.map(({ userId, area }) => ({ userId, area }))
  const saveClient = () => {
    const nextOwnerId = draft.ownerId !== undefined ? draft.ownerId : client.ownerId
    updateClient.mutate({
      ...draft,
      ...(canManage ? { assignments: sanitizeAssignments(assignmentInputs, nextOwnerId) } : {}),
    })
  }
  const saveAssignments = (assignments: AssignmentInput[]) => {
    updateAssignments.mutate(sanitizeAssignments(assignments, client.ownerId))
  }

  function startEditing() {
    setDraft({
      name: client.name,
      legalName: client.legalName,
      tradeName: client.tradeName,
      personType: client.personType,
      ruc: client.ruc,
      dv: client.dv,
      email: client.email,
      phone: client.phone,
      activity: client.activity,
      address: client.address,
      city: client.city,
      department: client.department,
      taxObligations: client.taxObligations,
      status: client.status,
      ...(canManage ? { ownerId: client.ownerId } : {}),
    })
    setEditing(true)
  }

  return (
    <PageFrame>
      <PageHeader eyebrow="Legajo contable" title={client.name} description={client.legalName || 'Información fiscal y operativa consolidada.'} backHref="/clients" action={canClaim || canRelease || canWrite ? <div className="flex flex-wrap gap-2">{canClaim ? <button type="button" className="btn-primary" disabled={claimClient.isPending} onClick={() => claimClient.mutate()}><UserCheck size={16} />{claimClient.isPending ? 'Tomando…' : 'Tomar cliente'}</button> : null}{canRelease ? <button type="button" className="btn-secondary" disabled={releaseClient.isPending} onClick={() => releaseClient.mutate()}><UserMinus size={16} />{releaseClient.isPending ? 'Liberando…' : 'Liberar cliente'}</button> : null}{canWrite ? <button type="button" className="btn-secondary" onClick={editing ? () => setEditing(false) : startEditing}>{editing ? <X size={16} /> : <Pencil size={16} />}{editing ? 'Cancelar' : 'Editar legajo'}</button> : null}</div> : undefined} />
      {claimClient.isError || releaseClient.isError ? <p className="rounded-lg border border-[var(--danger-line)] bg-[var(--danger-paper)] px-4 py-3 text-xs font-semibold text-[var(--danger)]">{getErrorMessage(claimClient.error || releaseClient.error, 'No pudimos cambiar el responsable del cliente.')}</p> : null}
      <ClientIdentityStrip client={client} account={account} pending={pending} />

      <div className="overflow-x-auto border-b border-[var(--line)]">
        <nav className="flex min-w-max gap-1" aria-label="Secciones del legajo">
          {TABS.map(({ id: tabId, label, icon: Icon }) => <button key={tabId} type="button" onClick={() => setTab(tabId)} className={clsx('flex min-h-11 items-center gap-2 border-b-2 px-3 text-xs font-bold', tab === tabId ? 'border-[var(--brand-blue)] text-[var(--brand-navy)] dark:text-[var(--brand-blue)]' : 'border-transparent text-[var(--ink-tertiary)] hover:text-[var(--ink-primary)]')}><Icon size={15} />{label}</button>)}
        </nav>
      </div>

      {editing && canWrite ? <EditClientPanel draft={draft} setDraft={setDraft} members={teamQuery.data ?? []} canManage={canManage} saving={updateClient.isPending} error={updateClient.error} save={saveClient} /> : null}
      {tab === 'ficha' ? <FiscalTab client={client} /> : null}
      {tab === 'contactos' ? <ContactsTab contacts={summary.contacts ?? client.contacts ?? []} canWrite={canWrite} create={(value) => createContact.mutate(value)} creating={createContact.isPending} error={createContact.error} /> : null}
      {tab === 'cuenta' ? <AccountTab accounts={summary.account} payments={summary.recentPayments} receivables={receivablesQuery.data?.items ?? []} loading={receivablesQuery.isLoading} /> : null}
      {tab === 'personal' ? <StaffTab client={client} members={teamQuery.data ?? []} canManage={canManage} onEdit={startEditing} saveAssignments={saveAssignments} saving={updateAssignments.isPending} error={updateAssignments.error} /> : null}
      {tab === 'checklist' ? <ChecklistTab checklists={summary.checklists} canWrite={canWrite} toggle={(checklistId, itemId, completed) => updateChecklistItem.mutate({ checklistId, itemId, isCompleted: !completed })} pending={updateChecklistItem.isPending} /> : null}
      {tab === 'tickets' ? <TicketsTab tickets={summary.tickets} /> : null}
      {tab === 'documentos' ? <DocumentsAndNotesTab clientId={id} documents={documentsQuery.data ?? summary.documents} notes={summary.notes} canWrite={canWrite} loading={documentsQuery.isLoading} upload={(file) => uploadDocument.mutate(file)} uploading={uploadDocument.isPending} note={note} setNote={setNote} addNote={() => addNote.mutate()} addingNote={addNote.isPending} noteError={addNote.error} /> : null}
    </PageFrame>
  )
}

function EditClientPanel({ draft, setDraft, members, canManage, saving, error, save }: { draft: Partial<Client>; setDraft: React.Dispatch<React.SetStateAction<Partial<Client>>>; members: Member[]; canManage: boolean; saving: boolean; error: unknown; save: () => void }) {
  const update = (field: keyof Client, value: unknown) => setDraft((current) => ({ ...current, [field]: value }))
  return <SectionPanel title="Editar datos del legajo" description={canManage ? 'La reasignación actualiza contactos, oportunidades y tickets abiertos.' : 'Actualizá la información fiscal y de contacto del legajo.'}><div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4"><Field label="Nombre"><input className="ctrl-input" value={draft.name ?? ''} onChange={(event) => update('name', event.target.value)} /></Field><Field label="Razón social"><input className="ctrl-input" value={draft.legalName ?? ''} onChange={(event) => update('legalName', event.target.value)} /></Field><Field label="Nombre comercial"><input className="ctrl-input" value={draft.tradeName ?? ''} onChange={(event) => update('tradeName', event.target.value)} /></Field><div className="grid grid-cols-[1fr_72px] gap-2"><Field label="RUC"><input className="ctrl-input" value={draft.ruc ?? ''} onChange={(event) => update('ruc', event.target.value)} /></Field><Field label="DV"><input className="ctrl-input" value={draft.dv ?? ''} onChange={(event) => update('dv', event.target.value)} /></Field></div><Field label="Correo"><input className="ctrl-input" value={draft.email ?? ''} onChange={(event) => update('email', event.target.value)} /></Field><Field label="Teléfono"><input className="ctrl-input" value={draft.phone ?? ''} onChange={(event) => update('phone', event.target.value)} /></Field><Field label="Actividad"><input className="ctrl-input" value={draft.activity ?? ''} onChange={(event) => update('activity', event.target.value)} /></Field>{canManage ? <Field label="Responsable"><select className="ctrl-input" value={draft.ownerId ?? ''} onChange={(event) => update('ownerId', event.target.value || null)}><option value="">Sin asignar</option>{members.map((member) => <option key={member.user.id} value={member.user.id}>{fullName(member.user)}</option>)}</select></Field> : null}<Field label="Dirección"><input className="ctrl-input" value={draft.address ?? ''} onChange={(event) => update('address', event.target.value)} /></Field><Field label="Ciudad"><input className="ctrl-input" value={draft.city ?? ''} onChange={(event) => update('city', event.target.value)} /></Field><Field label="Departamento"><input className="ctrl-input" value={draft.department ?? ''} onChange={(event) => update('department', event.target.value)} /></Field><Field label="Obligaciones"><input className="ctrl-input" value={(draft.taxObligations ?? []).join(', ')} onChange={(event) => update('taxObligations', event.target.value.split(',').map((value) => value.trim()).filter(Boolean))} placeholder="IVA, IRE, IRP…" /></Field></div><div className="flex flex-col gap-3 border-t border-[var(--line-soft)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">{error ? <p className="text-xs font-semibold text-[var(--danger)]">{getErrorMessage(error, 'No pudimos guardar los cambios.')}</p> : <span />}<button type="button" className="btn-primary" disabled={!draft.name?.trim() || saving} onClick={save}><Save size={15} />{saving ? 'Guardando…' : 'Guardar cambios'}</button></div></SectionPanel>
}

function FiscalTab({ client }: { client: Client }) {
  const data = [
    ['Tipo de persona', client.personType === 'LEGAL_ENTITY' ? 'Jurídica' : 'Física'],
    ['RUC / DV', client.ruc ? `${client.ruc}${client.dv ? `-${client.dv}` : ''}` : '—'],
    ['Razón social', client.legalName || '—'],
    ['Nombre comercial', client.tradeName || '—'],
    ['Actividad económica', client.activity || '—'],
    ['Correo', client.email || '—'],
    ['Teléfono', client.phone || '—'],
    ['Ubicación', [client.address, client.city, client.department].filter(Boolean).join(', ') || '—'],
  ]
  return <div className="grid gap-6 lg:grid-cols-[1.45fr_.75fr]"><SectionPanel title="Datos fiscales"><dl className="grid sm:grid-cols-2">{data.map(([label, value]) => <div key={label} className="border-b border-[var(--line-soft)] px-5 py-4 odd:sm:border-r"><dt className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">{label}</dt><dd className="mt-1.5 text-sm font-semibold text-[var(--ink-primary)]">{value}</dd></div>)}</dl></SectionPanel><SectionPanel title="Obligaciones tributarias" description="Configuración operativa; sin conexión a Marangatu."><div className="flex flex-wrap gap-2 p-5">{client.taxObligations.length ? client.taxObligations.map((obligation) => <StatusPill key={obligation} tone="brand">{obligation}</StatusPill>) : <p className="text-sm text-[var(--ink-tertiary)]">Sin obligaciones registradas.</p>}</div></SectionPanel></div>
}

function ContactsTab({ contacts, canWrite, create, creating, error }: { contacts: Contact[]; canWrite: boolean; create: (value: { firstName: string; lastName?: string; email?: string; phone?: string }) => void; creating: boolean; error: unknown }) {
  const [show, setShow] = useState(false)
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '' })
  return <SectionPanel title="Contactos asociados" description="Personas y números vinculados al legajo." action={canWrite ? <button type="button" className="btn-secondary" onClick={() => setShow((value) => !value)}><Plus size={14} /> Agregar contacto</button> : undefined}>{show && canWrite ? <div className="grid gap-3 border-b border-[var(--line-soft)] p-5 sm:grid-cols-4"><Field label="Nombre"><input className="ctrl-input" value={form.firstName} onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))} /></Field><Field label="Apellido"><input className="ctrl-input" value={form.lastName} onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))} /></Field><Field label="Teléfono"><input className="ctrl-input" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></Field><Field label="Correo"><input className="ctrl-input" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></Field><div className="sm:col-span-4 flex items-center justify-between">{error ? <p className="text-xs text-[var(--danger)]">{getErrorMessage(error)}</p> : <span />}<button type="button" className="btn-primary" disabled={!form.firstName.trim() || creating} onClick={() => create({ ...form, lastName: form.lastName || undefined, email: form.email || undefined, phone: form.phone || undefined })}>{creating ? 'Guardando…' : 'Guardar contacto'}</button></div></div> : null}{contacts.length ? <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Nombre</th><th>Teléfono</th><th>Correo</th><th>Estado</th></tr></thead><tbody>{contacts.map((contact) => <tr key={contact.id}><td><Link href={`/contacts/${contact.id}`} className="font-bold text-[var(--ink-primary)] hover:text-[var(--brand-blue)]">{contact.firstName} {contact.lastName}</Link></td><td>{contact.phone || '—'}</td><td>{contact.email || '—'}</td><td><StatusPill tone={contact.status === 'ACTIVE' || contact.status === 'CUSTOMER' ? 'success' : 'neutral'}>{contact.status}</StatusPill></td></tr>)}</tbody></table></div> : <EmptyState title="Sin contactos asociados" description="Vinculá personas y teléfonos para identificar correctamente los tickets de WhatsApp." />}</SectionPanel>
}

function AccountTab({ accounts, payments, receivables, loading }: { accounts: AccountSummary[]; payments: ClientSummary['recentPayments']; receivables: Receivable[]; loading: boolean }) {
  return <div className="space-y-6"><div className="grid gap-px overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--line)] sm:grid-cols-3">{accounts.length ? accounts.map((account) => <div key={account.currency} className="bg-[var(--paper)] p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Saldo {account.currency}</p><p className="mt-2 font-mono text-lg font-bold tabular-nums text-[var(--ink-primary)]">{formatMoney(account.balance, account.currency)}</p><p className="mt-1 text-xs text-[var(--ink-tertiary)]">Facturado {formatMoney(account.billed, account.currency)} · pagado {formatMoney(account.paid, account.currency)}</p></div>) : <p className="col-span-3 bg-[var(--paper)] p-5 text-sm text-[var(--ink-tertiary)]">Cuenta sin movimientos.</p>}</div><SectionPanel title="Movimientos pendientes" description="Importes separados por moneda, sin conversión automática.">{loading ? <LoadingState /> : receivables.length ? <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Concepto</th><th>Período</th><th>Vencimiento</th><th>Estado</th><th className="text-right">Saldo</th></tr></thead><tbody>{receivables.map((item) => <tr key={item.id}><td className="font-semibold text-[var(--ink-primary)]">{item.description}</td><td>{item.periodKey || '—'}</td><td>{formatDate(item.dueDate)}</td><td><StatusPill tone={item.status === 'PAID' ? 'success' : item.status === 'OVERDUE' ? 'danger' : 'warning'}>{item.status}</StatusPill></td><td className="text-right font-mono font-bold tabular-nums text-[var(--ink-primary)]">{formatMoney(item.outstanding, item.currency)}</td></tr>)}</tbody></table></div> : <EmptyState title="Cuenta sin cargos" description="Los honorarios y cargos de este cliente aparecerán acá." />}</SectionPanel>{payments.length ? <SectionPanel title="Pagos recientes"><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Fecha</th><th>Medio</th><th>Referencia</th><th className="text-right">Importe</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id}><td>{formatDate(payment.paidAt)}</td><td>{payment.method || '—'}</td><td>{payment.reference || '—'}</td><td className="text-right font-mono font-bold text-[var(--success)]">{formatMoney(payment.amount, payment.currency)}</td></tr>)}</tbody></table></div></SectionPanel> : null}</div>
}

function StaffTab({ client, members, canManage, onEdit, saveAssignments, saving, error }: { client: Client; members: Member[]; canManage: boolean; onEdit: () => void; saveAssignments: (assignments: AssignmentInput[]) => void; saving: boolean; error: unknown }) {
  const [newUserId, setNewUserId] = useState('')
  const [newArea, setNewArea] = useState('GENERAL')
  const assignments = client.assignments.filter((assignment) => assignment.userId !== client.ownerId)
  const inputs = assignments.map(({ userId, area }) => ({ userId, area }))
  const assignedUserIds = new Set(assignments.map((assignment) => assignment.userId))
  const availableMembers = members.filter((member) => member.user.id !== client.ownerId && !assignedUserIds.has(member.user.id))

  const addAssignment = () => {
    if (!newUserId) return
    saveAssignments([...inputs, { userId: newUserId, area: normalizeArea(newArea) }])
    setNewUserId('')
    setNewArea('GENERAL')
  }

  return <div className="grid gap-6 lg:grid-cols-2"><SectionPanel title="Responsable principal" action={canManage ? <button type="button" className="btn-secondary" onClick={onEdit}><Pencil size={14} /> Reasignar</button> : undefined}><div className="p-5"><p className="text-sm font-bold text-[var(--ink-primary)]">{fullName(client.owner)}</p><p className="mt-1 text-xs text-[var(--ink-tertiary)]">{client.owner?.email || 'Este legajo queda visible en la cola libre.'}</p></div></SectionPanel><SectionPanel title="Colaboradores por área" description="Acceso adicional al legajo, separado del responsable principal.">{canManage ? <div className="grid gap-3 border-b border-[var(--line-soft)] p-4 sm:grid-cols-[1fr_1fr_auto]"><Field label="Integrante"><select className="ctrl-input" value={newUserId} disabled={saving} onChange={(event) => setNewUserId(event.target.value)}><option value="">Seleccionar…</option>{availableMembers.map((member) => <option key={member.user.id} value={member.user.id}>{fullName(member.user)}</option>)}</select></Field><Field label="Área"><input list="client-collaboration-areas" className="ctrl-input" value={newArea} disabled={saving} maxLength={80} onChange={(event) => setNewArea(event.target.value)} /></Field><button type="button" className="btn-primary self-end" disabled={!newUserId || !newArea.trim() || saving} onClick={addAssignment}><Plus size={14} /> Agregar</button><datalist id="client-collaboration-areas">{COLLABORATION_AREAS.map((area) => <option key={area} value={area} />)}</datalist></div> : null}<div className="divide-y divide-[var(--line-soft)]">{assignments.length ? assignments.map((assignment) => <AssignmentEditor key={assignment.id} assignment={assignment} editable={canManage} saving={saving} onSave={(area) => saveAssignments(inputs.map((item) => item.userId === assignment.userId && item.area === assignment.area ? { ...item, area } : item))} onRemove={() => saveAssignments(inputs.filter((item) => !(item.userId === assignment.userId && item.area === assignment.area)))} />) : <p className="p-5 text-sm text-[var(--ink-tertiary)]">Sin colaboradores adicionales{canManage ? `. Hay ${availableMembers.length} integrantes disponibles.` : '.'}</p>}</div>{error ? <p className="border-t border-[var(--danger-line)] bg-[var(--danger-paper)] px-4 py-3 text-xs font-semibold text-[var(--danger)]">{getErrorMessage(error, 'No pudimos actualizar los colaboradores.')}</p> : null}</SectionPanel></div>
}

function AssignmentEditor({ assignment, editable, saving, onSave, onRemove }: { assignment: Client['assignments'][number]; editable: boolean; saving: boolean; onSave: (area: string) => void; onRemove: () => void }) {
  const [area, setArea] = useState(assignment.area)
  const normalizedArea = normalizeArea(area)
  return <div className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(150px,190px)_auto]"><div className="min-w-0 self-center"><p className="truncate text-sm font-bold text-[var(--ink-primary)]">{fullName(assignment.user)}</p><p className="mt-1 truncate text-xs text-[var(--ink-tertiary)]">{assignment.user.email}</p></div>{editable ? <input list="client-collaboration-areas" className="ctrl-input" value={area} disabled={saving} maxLength={80} aria-label={`Área de ${fullName(assignment.user)}`} onChange={(event) => setArea(event.target.value)} /> : <div className="self-center sm:text-right"><StatusPill tone="brand">{assignment.area}</StatusPill></div>}{editable ? <div className="flex gap-2 sm:justify-end"><button type="button" className="btn-secondary px-3" disabled={saving || !area.trim() || normalizedArea === assignment.area} onClick={() => onSave(normalizedArea)} aria-label={`Guardar área de ${fullName(assignment.user)}`}><Save size={14} /></button><button type="button" className="btn-secondary px-3 text-[var(--danger)]" disabled={saving} onClick={onRemove} aria-label={`Quitar a ${fullName(assignment.user)}`}><X size={14} /></button></div> : null}</div>
}

function ChecklistTab({ checklists, canWrite, toggle, pending }: { checklists: ClientChecklist[]; canWrite: boolean; toggle: (checklistId: string, itemId: string, completed: boolean) => void; pending: boolean }) {
  return checklists.length ? <div className="grid gap-5 lg:grid-cols-2">{checklists.map((checklist) => { const completedCount = checklist.items.filter((item) => item.isCompleted).length; const progress = checklist.items.length ? Math.round((completedCount / checklist.items.length) * 100) : 0; return <SectionPanel key={checklist.id} title={checklist.template.name} description={`${checklist.periodKey} · vence ${formatDate(checklist.dueDate)}`} action={<StatusPill tone={checklist.status === 'COMPLETED' ? 'success' : checklist.status === 'OVERDUE' ? 'danger' : 'warning'}>{progress}%</StatusPill>}><div className="divide-y divide-[var(--line-soft)]">{checklist.items.map((item) => <button type="button" disabled={!canWrite || pending} key={item.id} onClick={() => toggle(checklist.id, item.id, item.isCompleted)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-[var(--paper-soft)] disabled:cursor-default disabled:opacity-70">{item.isCompleted ? <span className="grid h-5 w-5 place-items-center rounded border border-[var(--success-line)] bg-[var(--success-paper)] text-[var(--success)]"><Check size={13} /></span> : <Circle size={20} className="text-[var(--ink-muted)]" />}<span className={clsx('text-sm font-semibold', item.isCompleted ? 'text-[var(--ink-tertiary)] line-through' : 'text-[var(--ink-primary)]')}>{item.title}</span>{item.isRequired ? <span className="ml-auto text-[9px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Obligatorio</span> : null}</button>)}</div></SectionPanel>})}</div> : <EmptyState title="Sin checklists activos" description="Las obligaciones periódicas asignadas a este cliente aparecerán acá." />
}

function TicketsTab({ tickets }: { tickets: ClientSummary['tickets'] }) {
  return <SectionPanel title="Historial de tickets" description="Conversaciones de WhatsApp y seguimiento de atención.">{tickets.length ? <div className="divide-y divide-[var(--line-soft)]">{tickets.map((ticket) => <Link href={`/tickets?ticket=${ticket.id}`} key={ticket.id} className="flex flex-col gap-2 px-5 py-4 hover:bg-[var(--paper-soft)] sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-[var(--ink-primary)]">{ticket.subject || 'Consulta por WhatsApp'}</p><p className="mt-1 text-xs text-[var(--ink-tertiary)]">Ticket #{ticket.number}</p></div><StatusPill tone={ticket.status === 'CLOSED' || ticket.status === 'RESOLVED' ? 'success' : ticket.assignedToUserId ? 'brand' : 'warning'}>{ticket.status}</StatusPill></Link>)}</div> : <EmptyState title="Sin tickets" description="Todavía no hay conversaciones asociadas a este cliente." />}</SectionPanel>
}

function DocumentsTab({ clientId, documents, canWrite, loading, upload, uploading }: { clientId: string; documents: ClientDocument[]; canWrite: boolean; loading: boolean; upload: (file: File) => void; uploading: boolean }) {
  async function download(document: ClientDocument) {
    const response = await clientsApi.downloadDocument(clientId, document.id)
    const url = URL.createObjectURL(response.data)
    const anchor = window.document.createElement('a')
    anchor.href = url
    anchor.download = document.name
    anchor.click()
    URL.revokeObjectURL(url)
  }
  return <SectionPanel title="Documentos protegidos" description="Los archivos requieren sesión activa para descargarse." action={canWrite ? <label className="btn-secondary cursor-pointer"><Upload size={14} />{uploading ? 'Subiendo…' : 'Subir archivo'}<input type="file" className="sr-only" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) upload(file) }} /></label> : undefined}>{loading ? <LoadingState /> : documents.length ? <div className="divide-y divide-[var(--line-soft)]">{documents.map((document) => <button type="button" key={document.id} onClick={() => download(document)} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-[var(--paper-soft)]"><FileText size={16} className="text-[var(--brand-blue)]" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-[var(--ink-primary)]">{document.name}</p><p className="mt-1 text-xs text-[var(--ink-tertiary)]">{document.category || 'Documento'} · {formatDate(document.createdAt)}</p></div><Download size={15} className="text-[var(--ink-muted)]" /></button>)}</div> : <EmptyState title="Sin documentos" description="Todavía no se adjuntaron archivos a este legajo." />}</SectionPanel>
}

function DocumentsAndNotesTab({ clientId, documents, notes, canWrite, loading, upload, uploading, note, setNote, addNote, addingNote, noteError }: { clientId: string; documents: ClientDocument[]; notes: ClientNote[]; canWrite: boolean; loading: boolean; upload: (file: File) => void; uploading: boolean; note: string; setNote: (value: string) => void; addNote: () => void; addingNote: boolean; noteError: unknown }) {
  return <div className="grid gap-6 xl:grid-cols-2"><DocumentsTab clientId={clientId} documents={documents} canWrite={canWrite} loading={loading} upload={upload} uploading={uploading} /><SectionPanel title="Notas internas" description="Contexto privado para el equipo del estudio.">{canWrite ? <div className="border-b border-[var(--line-soft)] p-5"><textarea value={note} onChange={(event) => setNote(event.target.value)} className="ctrl-input min-h-24 resize-y" placeholder="Agregar una nota al legajo…" /><div className="mt-3 flex items-center justify-between">{noteError ? <p className="text-xs text-[var(--danger)]">{getErrorMessage(noteError)}</p> : <span />}<button type="button" className="btn-primary" disabled={!note.trim() || addingNote} onClick={addNote}><Plus size={14} />{addingNote ? 'Guardando…' : 'Guardar nota'}</button></div></div> : null}<div className="divide-y divide-[var(--line-soft)]">{notes.length ? notes.map((item) => <article key={item.id} className="px-5 py-4"><p className="whitespace-pre-wrap text-sm leading-6 text-[var(--ink-secondary)]">{item.content}</p><p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">{fullName(item.author)} · {formatDate(item.createdAt)}</p></article>) : <p className="p-5 text-sm text-[var(--ink-tertiary)]">Sin notas internas.</p>}</div></SectionPanel></div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-[11px] font-bold text-[var(--ink-secondary)]">{label}</span>{children}</label> }
