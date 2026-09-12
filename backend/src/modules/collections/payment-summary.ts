import { Prisma } from '@prisma/client'

type PaymentRow = { paidAt: Date; amount: Prisma.Decimal; currency: string; method: string | null; reference: string | null; voidedAt: Date | null }
type ChargeRow = { amount: Prisma.Decimal; paidAmount: Prisma.Decimal; currency: string }
const date = (value: Date) => new Intl.DateTimeFormat('es-PY', { timeZone: 'America/Asuncion' }).format(value)
const money = (value: Prisma.Decimal, currency: string) => `${currency} ${value.toFixed(currency === 'PYG' ? 0 : 2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`

// Informe de texto A4, fuentes PDF estándar y WinAnsi (incluye acentos españoles).
// No interpreta HTML ni permite que los datos agreguen operadores al documento.
export function renderPaymentSummary(client: { name: string; ruc: string | null; dv: string | null }, payments: PaymentRow[], charges: ChargeRow[], now = new Date()) {
  const blocks: string[][] = [[`Cliente: ${client.name}`, `RUC: ${client.ruc || 'Sin RUC'}${client.dv ? `-${client.dv}` : ''}`, `Emitido: ${date(now)} - Historial completo`, '', 'RESUMEN POR MONEDA']]
  const currencies = [...new Set([...payments.map((p) => p.currency), ...charges.map((c) => c.currency)])].sort()
  for (const currency of currencies) {
    const billed = charges.filter((c) => c.currency === currency).reduce((sum, c) => sum.plus(c.amount), new Prisma.Decimal(0))
    const applied = charges.filter((c) => c.currency === currency).reduce((sum, c) => sum.plus(c.paidAmount), new Prisma.Decimal(0))
    const received = payments.filter((p) => p.currency === currency && !p.voidedAt).reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0))
    blocks.push([currency, `  Cargos: ${money(billed, currency)}`, `  Pagos recibidos: ${money(received, currency)} | Aplicados: ${money(applied, currency)}`, `  Saldo pendiente: ${money(billed.minus(applied), currency)} | A favor: ${money(received.minus(applied), currency)}`, ''])
  }
  blocks.push(['DETALLE DE PAGOS', 'Fecha | Estado | Importe', ''])
  if (!payments.length) blocks.push(['No hay pagos registrados.'])
  for (const payment of payments) {
    blocks.push([`${date(payment.paidAt)} | ${payment.voidedAt ? 'Anulado' : 'Recibido'} | ${money(payment.amount, payment.currency)}`, `Medio: ${payment.method || '-'} | Referencia: ${payment.reference || '-'}`, ''])
  }
  blocks.push(['Los pagos anulados no integran los totales.', 'Resumen informativo de cuenta corriente. No es comprobante fiscal.'])
  const wrap = (line: string) => {
    const text = line.normalize('NFC').replace(/[\r\n\t]/g, ' ').replace(/[^\x20-\x7e\xa0-\xff]/g, '?')
    return text.match(/.{1,86}(?:\s|$)|.{1,86}/g)?.map((part) => part.trimEnd()) ?? ['']
  }
  const pages: string[][] = [[]]
  for (const block of blocks) {
    const wrapped = block.flatMap(wrap)
    if (pages.at(-1)!.length + wrapped.length > 46) pages.push([])
    for (const line of wrapped) {
      if (pages.at(-1)!.length === 46) pages.push([])
      pages.at(-1)!.push(line)
    }
  }
  const escape = (text: string) => text.replace(/([\\()])/g, '\\$1')
  const objects: string[] = ['', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>']
  const kids: number[] = []
  pages.forEach((page, index) => {
    const pageId = objects.length + 1
    kids.push(pageId)
    const content = `BT /F1 16 Tf 40 797 Td (${escape('Gestión ROMEZ - Resumen de pagos')}) Tj ET\nBT /F1 10 Tf 15 TL 40 760 Td\n${page.map((line, i) => `${i ? 'T* ' : ''}(${escape(line)}) Tj`).join('\n')}\nET\nBT /F1 9 Tf 40 35 Td (Página ${index + 1} de ${pages.length}) Tj ET`
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId + 1} 0 R >>`, `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`)
  })
  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[1] = `<< /Type /Pages /Kids [${kids.map((id) => `${id} 0 R`).join(' ')}] /Count ${kids.length} >>`
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf, 'latin1')); pdf += `${i + 1} 0 obj\n${object}\nendobj\n` })
  const xref = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}
