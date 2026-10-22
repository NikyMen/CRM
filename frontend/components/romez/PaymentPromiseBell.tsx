'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Bell, CalendarClock } from 'lucide-react'
import clsx from 'clsx'
import { collectionsApi } from '@/lib/api'
import type { PaymentPromise, PaymentPromiseBoard, PaymentPromiseCounts } from '@/types'
import { formatMoney, getErrorMessage } from '@/lib/format'
import { relativePromiseDay } from '@/lib/payment-promises'

/** Evento para que Cobranzas cambie a la bandeja de promesas si ya está abierta. */
export const OPEN_PROMISES_EVENT = 'romez:open-promises'
const PROMISES_HREF = '/collections?view=promises'
const MAX_ITEMS = 8

/** Promesas propias para hoy y vencidas: alimenta la campanita y el número del menú. */
export function usePromiseCounts(enabled: boolean) {
  const query = useQuery<PaymentPromiseCounts>({
    queryKey: ['payment-promise-counts'],
    queryFn: () => collectionsApi.promiseCounts().then((response) => response.data),
    enabled,
    refetchInterval: 60_000,
  })
  const counts = query.data
  return { counts, due: (counts?.today ?? 0) + (counts?.overdue ?? 0) }
}

export function PaymentPromiseBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const { counts, due } = usePromiseCounts(true)
  const listQuery = useQuery<PaymentPromiseBoard>({
    queryKey: ['payment-promises', { scope: 'mine', companyId: undefined }],
    queryFn: () => collectionsApi.listPromises({ scope: 'mine' }).then((response) => response.data),
    enabled: open,
  })

  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey) }
  }, [open])

  const board = listQuery.data
  const items: PaymentPromise[] = board ? [...board.overdue, ...board.today] : []
  const goToPromises = () => { setOpen(false); window.dispatchEvent(new Event(OPEN_PROMISES_EVENT)) }
  const label = due ? `Recordatorios de pago: ${due} para hoy o vencidos` : 'Recordatorios de pago'

  return <div ref={ref} className="relative">
    <button type="button" onClick={() => setOpen((current) => !current)} aria-haspopup="dialog" aria-expanded={open} aria-label={label} title={label} className="relative grid h-10 w-10 place-items-center rounded-lg border border-transparent text-[var(--ink-secondary)] hover:border-[var(--line)] hover:bg-[var(--paper-soft)]">
      <Bell size={19} />
      {due ? <span className="absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full border-2 border-[var(--paper)] bg-[var(--danger)] px-1 text-[10px] font-extrabold leading-4 text-white">{due > 99 ? '99+' : due}</span> : null}
    </button>
    {open ? <div role="dialog" aria-label="Recordatorios de pago" className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,360px)] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--paper)] shadow-lg">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <p className="text-sm font-extrabold text-[var(--ink-primary)]">Recordatorios de pago</p>
        <p className="text-xs text-[var(--ink-tertiary)]">{counts ? `${counts.today} para hoy · ${counts.overdue} vencidos · ${counts.upcoming} próximos` : 'Promesas de pago asignadas a vos.'}</p>
      </div>
      <div className="max-h-[360px] overflow-y-auto">
        {listQuery.isLoading ? <p className="px-4 py-6 text-center text-xs text-[var(--ink-tertiary)]">Cargando…</p>
          : listQuery.isError ? <p className="px-4 py-6 text-center text-xs font-semibold text-[var(--danger)]">{getErrorMessage(listQuery.error, 'No pudimos cargar los recordatorios.')}</p>
          : items.length ? <ul className="divide-y divide-[var(--line-soft)]">{items.slice(0, MAX_ITEMS).map((promise) => {
            const overdue = promise.promisedDate < board!.date
            return <li key={promise.id}><Link href={PROMISES_HREF} onClick={goToPromises} className="flex items-start gap-3 px-4 py-3 hover:bg-[var(--paper-soft)]">
              <CalendarClock size={16} className={clsx('mt-0.5 shrink-0', overdue ? 'text-[var(--danger)]' : 'text-[var(--brand-blue)]')} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-[var(--ink-primary)]">{promise.company?.name ?? 'Cliente'}</span>
                <span className="block text-xs text-[var(--ink-tertiary)]"><span className={clsx('font-bold', overdue ? 'text-[var(--danger)]' : 'text-[var(--brand-blue)]')}>{relativePromiseDay(promise.promisedDate, board!.date)}</span>{promise.amount ? ` · ${formatMoney(promise.amount, promise.currency)}` : ''}{promise.note ? ` · ${promise.note}` : ''}</span>
              </span>
            </Link></li>
          })}</ul>
          : <p className="px-4 py-6 text-center text-xs text-[var(--ink-tertiary)]">No tenés pagos para hoy ni vencidos.</p>}
      </div>
      <Link href={PROMISES_HREF} onClick={goToPromises} className="block border-t border-[var(--line)] bg-[var(--paper-soft)] px-4 py-2.5 text-center text-xs font-bold text-[var(--brand-blue)] hover:underline">{items.length > MAX_ITEMS ? `Ver las ${items.length} en Cobranzas` : 'Ver todas las promesas'}</Link>
    </div> : null}
  </div>
}
