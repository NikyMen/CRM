'use client'

import { useMutation } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { collectionsApi } from '@/lib/api'
import { getErrorMessage } from '@/lib/format'

export function PaymentSummaryButton({ clientId }: { clientId: string }) {
  const download = useMutation({
    mutationFn: () => collectionsApi.paymentSummaryPdf(clientId),
    onSuccess: ({ data }) => {
      const url = URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = url
      link.download = 'resumen-pagos.pdf'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
  })
  return <div><button type="button" className="btn-secondary" disabled={download.isPending} onClick={() => download.mutate()}><Download size={15} />{download.isPending ? 'Generando…' : 'Resumen de pagos PDF'}</button>{download.isError ? <p role="alert" className="mt-2 text-xs text-[var(--danger)]">{getErrorMessage(download.error, 'No se pudo descargar el resumen.')}</p> : null}</div>
}
