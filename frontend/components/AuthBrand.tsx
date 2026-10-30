'use client'

import Image from 'next/image'
import { brand } from '@/lib/brand'
import { useBranding } from '@/lib/useBranding'
import { BrandImage } from '@/components/BrandImage'

export function AuthBrand({ title, subtitle }: { title: string; subtitle: string }) {
  const branding = useBranding()
  return <div className="mb-8 text-center">
    {branding.ready ? <BrandImage src={branding.logo} alt={brand.legalName} size={148} className="mx-auto mb-5 h-32 w-32 object-contain sm:h-36 sm:w-36" priority /> : <div className="mx-auto mb-5 h-32 w-32 sm:h-36 sm:w-36" />}
    <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--brand-blue)]">{branding.name}</p>
    <h1 className="font-display text-3xl font-black tracking-tight text-[var(--ink-primary)]">{title}</h1>
    <p className="mt-2 text-sm font-semibold text-[var(--ink-secondary)]">{subtitle}</p>
  </div>
}

export function DevelopedBy({ prominent = false }: { prominent?: boolean }) {
  return <div className="mt-6 flex flex-col items-center justify-center gap-1"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-tertiary)]">Desarrollado por</span>{prominent ? <Image src="/brand/consultoria-digital.png" alt="Consultoría Digital" width={865} height={235} className="mt-2 h-auto w-full max-w-[240px] object-contain" /> : <Image src="/brand/logo-cd.webp" alt="Consultoría Digital" width={234} height={54} className="h-[54px] w-auto object-contain" />}</div>
}
