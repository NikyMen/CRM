'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Check, Copy, Eye } from 'lucide-react'
import { BASE_URL } from '@/lib/api'
import { assistantApi } from '@/lib/assistant'
import { getErrorMessage } from '@/lib/format'
import { ErrorState, LoadingState } from '@/components/romez/OperationalUI'
import { Panel } from './ui'

export function AssistantConnection() {
  const [copied, setCopied] = useState(false)
  const [show, setShow] = useState(false)
  const configUrl = `${BASE_URL.replace(/\/+$/, '')}/inbound/assistant/config`
  const preview = useQuery({ queryKey: ['assistant', 'flow-config'], queryFn: () => assistantApi.flowConfig().then((response) => response.data), enabled: show })

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(configUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="space-y-6">
      <Panel title="Cómo toma n8n esta configuración" description="El flujo de WhatsApp consulta esta dirección en cada mensaje. Si el CRM no responde, usa los valores que trae cargados.">
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-[var(--ink-secondary)]">Dirección de lectura</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input readOnly className="ctrl-input font-mono !text-[13px]" value={configUrl} onFocus={(event) => event.currentTarget.select()} aria-label="Dirección de lectura de la configuración" />
              <button type="button" className="btn-secondary shrink-0" onClick={copy}>{copied ? <><Check size={15} /> Copiada</> : <><Copy size={15} /> Copiar</>}</button>
            </div>
          </div>
          <ol className="list-decimal space-y-2 pl-5 text-sm font-medium text-[var(--ink-secondary)]">
            <li>Creá una API key en <Link href="/api-keys" className="font-bold text-[var(--brand-blue)] underline">Integraciones → API Keys</Link> (o usá una existente).</li>
            <li>En n8n, creá la credencial <b>Header Auth</b> llamada <code>ROMEZ CRM X-API-Key</code> con el nombre de encabezado <code>X-API-Key</code> y la key como valor.</li>
            <li>En el nodo <b>Config</b> del flujo poné <code>crmConfigActivo = true</code> y revisá que <code>crmUrl</code> sea <code>{BASE_URL}</code>.</li>
            <li>Guardá y publicá el workflow. Desde ese momento, lo que cambies acá rige desde el mensaje siguiente.</li>
          </ol>
        </div>
      </Panel>

      <Panel
        title="Lo que lee n8n ahora"
        description="Vista previa exacta de la respuesta, con los precios ya puestos en cada texto."
        action={<button type="button" className="btn-secondary" onClick={() => (show ? preview.refetch() : setShow(true))}><Eye size={15} /> {show ? 'Actualizar' : 'Ver'}</button>}
      >
        {!show ? <p className="text-sm text-[var(--ink-tertiary)]">Tocá «Ver» para generarla.</p> : null}
        {preview.isLoading ? <LoadingState label="Armando la configuración…" /> : null}
        {preview.isError ? <ErrorState message={getErrorMessage(preview.error, 'No pudimos armar la configuración. Revisá que los servicios con {{precio}} tengan precio cargado.')} retry={() => preview.refetch()} /> : null}
        {preview.data ? (
          <div className="space-y-4">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
              {Object.entries(preview.data.config).map(([key, value]) => (
                <div key={key} className="flex items-baseline justify-between gap-3 border-b border-[var(--line-soft)] py-1.5">
                  <dt className="font-mono text-xs font-bold text-[var(--ink-tertiary)]">{key}</dt>
                  <dd className="truncate text-right font-semibold text-[var(--ink-primary)]">{String(value) === '' ? '—' : String(value)}</dd>
                </div>
              ))}
            </dl>
            <p className="text-sm font-semibold text-[var(--ink-secondary)]">{Object.keys(preview.data.bloques).length} servicios activos: {Object.keys(preview.data.bloques).join(', ') || 'ninguno'}</p>
            <details className="rounded-lg border border-[var(--line)] bg-[var(--paper-soft)] p-3">
              <summary className="cursor-pointer text-sm font-bold text-[var(--ink-primary)]">Ver el JSON completo</summary>
              <pre className="mt-3 max-h-[420px] overflow-auto rounded-lg bg-[#0b1426] p-4 text-xs leading-relaxed text-[#d8e2f7]">{JSON.stringify(preview.data, null, 2)}</pre>
            </details>
          </div>
        ) : null}
      </Panel>
    </div>
  )
}
