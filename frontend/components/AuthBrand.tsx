import Image from 'next/image'

export function AuthBrand({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="mb-8 text-center">
    <Image src="/brand/logo-cd.webp" alt="Consultoría Digital" width={64} height={64} className="mx-auto mb-4 h-16 w-16 object-contain" priority />
    <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-[var(--accent-text)]">Consultoría Digital</p>
    <h1 className="font-display text-3xl font-black tracking-tight text-[var(--ink-primary)]">{title}</h1>
    <p className="mt-2 text-sm font-semibold text-[var(--ink-secondary)]">{subtitle}</p>
  </div>
}

export function DevelopedBy() {
  return <div className="mt-6 flex items-center justify-center gap-2 text-[10px] font-bold text-[var(--ink-tertiary)]"><Image src="/brand/logo-cd.webp" alt="" width={20} height={20} className="h-5 w-5 object-contain" />Desarrollado por Consultoría Digital</div>
}
