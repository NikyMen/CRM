'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArchiveRestore } from 'lucide-react'
import { collectionsApi } from '@/lib/api'
import type { CollectionTrashItem } from '@/types'
import { formatDate, formatMoney, fullName, getErrorMessage } from '@/lib/format'
import { EmptyState, ErrorState, LoadingState, SectionPanel, StatusPill } from '@/components/romez/OperationalUI'
import { invalidateCollections } from '@/components/romez/PaymentDialog'

const TRASH_LABELS: Record<CollectionTrashItem['type'], string> = { RECEIVABLE: 'Cuenta por cobrar', PAYMENT: 'Pago', PLAN: 'Plan mensual' }
const DELETED_AT: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Asuncion' }

/**
 * Papelera de cobranzas: lo eliminado con quién y cuándo, y la opción de restaurar.
 * `types` limita qué se muestra (Saldos sólo ve conceptos; Cobranzas ve todo).
 */
export function CollectionsTrash({ types, description, emptyDescription }: { types?: CollectionTrashItem['type'][]; description: string; emptyDescription: string }) {
  const queryClient = useQueryClient()
  const query = useQuery<{ items: CollectionTrashItem[] }>({ queryKey: ['collections-trash'], queryFn: () => collectionsApi.trash().then((response) => response.data) })
  const restore = useMutation({
    mutationFn: (item: CollectionTrashItem) => item.type === 'RECEIVABLE' ? collectionsApi.restoreReceivable(item.id) : item.type === 'PAYMENT' ? collectionsApi.setPaymentStatus(item.id, 'RECEIVED') : collectionsApi.restoreRecurring(item.id),
    onSuccess: () => invalidateCollections(queryClient),
  })
  if (query.isLoading) return <LoadingState label="Cargando papelera…" />
  if (query.isError) return <ErrorState message={getErrorMessage(query.error)} retry={() => query.refetch()} />
  const items = (query.data?.items ?? []).filter((item) => !types || types.includes(item.type))
  const showType = !types || types.length > 1
  return <SectionPanel title="Papelera" description={description}>
    {restore.error ? <p role="alert" className="border-b border-[var(--line-soft)] px-4 py-3 text-xs font-semibold text-[var(--danger)]">{getErrorMessage(restore.error, 'No pudimos restaurar el registro.')}</p> : null}
    {items.length ? <div className="overflow-x-auto"><table className="data-table"><thead><tr>{showType ? <th>Tipo</th> : null}<th>Cliente</th><th>{showType ? 'Detalle' : 'Concepto'}</th><th className="text-right">Importe</th><th>Eliminado por</th><th>Fecha y hora</th><th /></tr></thead><tbody>{items.map((item) => <tr key={`${item.type}-${item.id}`}>
      {showType ? <td><StatusPill tone={item.type === 'PAYMENT' ? 'success' : item.type === 'PLAN' ? 'brand' : 'warning'}>{TRASH_LABELS[item.type]}</StatusPill></td> : null}
      <td>{item.company?.name ?? '—'}{item.company?.isArchived ? <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--danger)]">Cliente eliminado</p> : null}</td>
      <td className="max-w-56"><p className="truncate">{item.description}</p></td>
      <td className="text-right font-mono tabular-nums">{formatMoney(item.amount, item.currency)}</td>
      <td className="font-semibold text-[var(--ink-primary)]">{item.deletedBy ? fullName(item.deletedBy) : <span className="font-normal text-[var(--ink-muted)]">Sin registro</span>}</td>
      <td className="whitespace-nowrap">{formatDate(item.deletedAt, DELETED_AT)} h</td>
      <td className="text-right"><button type="button" className="btn-secondary whitespace-nowrap" disabled={restore.isPending} onClick={() => restore.mutate(item)}><ArchiveRestore size={14} /> Restaurar</button></td>
    </tr>)}</tbody></table></div> : <EmptyState title="La papelera está vacía" description={emptyDescription} />}
  </SectionPanel>
}
