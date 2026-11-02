'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, ImagePlus, Loader2, RotateCcw, Save } from 'lucide-react'
import clsx from 'clsx'
import { brandingApi, type BrandingAssetKind, type BrandingSnapshot } from '@/lib/api'
import { brand } from '@/lib/brand'
import { BRANDING_KEY, useBranding } from '@/lib/useBranding'
import { BrandImage } from '@/components/BrandImage'
import { getErrorMessage } from '@/lib/format'

const ASSETS: { kind: BrandingAssetKind; label: string; help: string; accept: string; maxKb: number; dark?: boolean }[] = [
  { kind: 'logo', label: 'Logo principal', help: 'Login (panel oscuro) y recuperación de acceso. Cuadrado, PNG, JPG o WebP.', accept: 'image/png,image/jpeg,image/webp', maxKb: 512 },
  { kind: 'logo-dark', label: 'Logo del menú lateral', help: 'Va sobre fondo oscuro: menú lateral, login en el celular e ícono de Apple.', accept: 'image/png,image/jpeg,image/webp', maxKb: 512, dark: true },
  { kind: 'favicon', label: 'Favicon', help: 'Ícono de la pestaña del navegador. Cuadrado, PNG o ICO.', accept: 'image/png,image/x-icon,image/vnd.microsoft.icon,.ico', maxKb: 256 },
]

const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = () => reject(new Error('No pudimos leer la imagen.'))
  reader.readAsDataURL(file)
})

export function BrandingSettingsPanel() {
  const queryClient = useQueryClient()
  const branding = useBranding()
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyKind, setBusyKind] = useState<BrandingAssetKind | null>(null)
  const inputs = useRef<Partial<Record<BrandingAssetKind, HTMLInputElement | null>>>({})
  const custom = branding.custom

  useEffect(() => {
    setName(custom?.name ?? '')
    setTagline(custom?.tagline ?? '')
  }, [custom?.name, custom?.tagline])

  const store = (data: BrandingSnapshot) => queryClient.setQueryData(BRANDING_KEY, data)

  const saveText = useMutation({
    mutationFn: () => brandingApi.update({ name: name.trim() || null, tagline: tagline.trim() || null }).then((response) => response.data),
    onMutate: () => { setError(null); setSaved(false) },
    onSuccess: (data) => { store(data); setSaved(true) },
    onError: (mutationError) => setError(getErrorMessage(mutationError, 'No pudimos guardar los textos.')),
  })

  const asset = useMutation({
    mutationFn: async (input: { kind: BrandingAssetKind; file?: File }) => {
      if (!input.file) return (await brandingApi.removeAsset(input.kind)).data
      return (await brandingApi.uploadAsset(input.kind, await readAsDataUrl(input.file))).data
    },
    onMutate: (input) => { setBusyKind(input.kind); setError(null) },
    onSuccess: store,
    onError: (mutationError) => setError(getErrorMessage(mutationError, 'No pudimos guardar la imagen.')),
    onSettled: () => setBusyKind(null),
  })

  const pick = (kind: BrandingAssetKind, maxKb: number, file?: File) => {
    if (!file) return
    if (file.size > maxKb * 1024) { setError(`La imagen supera ${maxKb} KB.`); return }
    asset.mutate({ kind, file })
  }

  const current: Record<BrandingAssetKind, string> = { logo: branding.logo, 'logo-dark': branding.logoOnDark, favicon: branding.favicon }
  const isCustom: Record<BrandingAssetKind, boolean> = { logo: Boolean(custom?.logo), 'logo-dark': Boolean(custom?.logoDark), favicon: Boolean(custom?.favicon) }

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 md:px-6">
      <div>
        <p className="section-label">Espacio de trabajo</p>
        <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--ink-primary)]">Marca</h2>
        <p className="mt-1 text-sm text-[var(--ink-tertiary)]">
          Nombre, subtítulo, logos y favicon que ve todo el equipo. Lo que dejes vacío usa el valor predeterminado de la instalación.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          <AlertTriangle size={16} className="mr-2 inline" />{error}
        </div>
      ) : null}

      <section className="paper-panel space-y-4 p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold text-[var(--ink-secondary)]">Título</span>
            <input className="ctrl-input w-full" value={name} maxLength={80} placeholder={brand.name} onChange={(event) => { setName(event.target.value); setSaved(false) }} />
            <span className="mt-1 block text-[11px] text-[var(--ink-tertiary)]">Menú lateral, login y pestaña del navegador.</span>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold text-[var(--ink-secondary)]">Subtítulo</span>
            <input className="ctrl-input w-full" value={tagline} maxLength={80} placeholder={brand.tagline} onChange={(event) => { setTagline(event.target.value); setSaved(false) }} />
            <span className="mt-1 block text-[11px] text-[var(--ink-tertiary)]">Debajo del título en el menú lateral.</span>
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" className="btn-primary !min-h-10" disabled={saveText.isPending} onClick={() => saveText.mutate()}>
            {saveText.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar textos
          </button>
          {saved ? <span className="flex items-center gap-1 text-xs font-bold text-emerald-700"><Check size={14} /> Guardado</span> : null}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {ASSETS.map((item) => {
          const busy = busyKind === item.kind
          return (
            <div key={item.kind} className="paper-panel flex flex-col gap-3 p-5">
              <div>
                <p className="text-sm font-extrabold text-[var(--ink-primary)]">{item.label}</p>
                <p className="mt-0.5 text-xs text-[var(--ink-tertiary)]">{item.help} Hasta {item.maxKb} KB.</p>
              </div>
              <div className={clsx('grid h-36 place-items-center rounded-xl border border-[var(--line)]', item.dark ? 'bg-[var(--sidebar-background)]' : 'bg-[var(--paper-soft)]')}>
                {branding.ready ? <BrandImage src={current[item.kind]} alt={item.label} size={112} className={clsx('object-contain', item.kind === 'favicon' ? 'h-12 w-12' : 'h-28 w-28')} /> : <Loader2 size={18} className="animate-spin text-[var(--ink-tertiary)]" />}
              </div>
              <p className="text-[11px] font-bold text-[var(--ink-tertiary)]">{isCustom[item.kind] ? 'Imagen cargada desde Configuración' : 'Usando la imagen predeterminada'}</p>
              <input ref={(element) => { inputs.current[item.kind] = element }} type="file" accept={item.accept} className="hidden" onChange={(event) => { pick(item.kind, item.maxKb, event.target.files?.[0]); event.target.value = '' }} />
              <div className="mt-auto flex flex-wrap gap-2">
                <button type="button" className="btn-primary !min-h-10" disabled={asset.isPending} onClick={() => inputs.current[item.kind]?.click()}>
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />} Subir imagen
                </button>
                {isCustom[item.kind] ? (
                  <button type="button" className="btn-secondary !min-h-10" disabled={asset.isPending} onClick={() => asset.mutate({ kind: item.kind })}>
                    <RotateCcw size={15} /> Predeterminada
                  </button>
                ) : null}
              </div>
            </div>
          )
        })}
      </section>
    </div>
  )
}
