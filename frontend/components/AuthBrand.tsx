import Image from 'next/image'

export function AuthBrand({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="mb-8 text-center">
    <Image src="/brand/romez-light.jpg" alt="ROMEZ Servicios Contables" width={148} height={148} className="mx-auto mb-5 h-32 w-32 object-contain sm:h-36 sm:w-36" priority />
    <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--brand-blue)]">Gestión ROMEZ</p>
    <h1 className="font-display text-3xl font-black tracking-tight text-[var(--ink-primary)]">{title}</h1>
    <p className="mt-2 text-sm font-semibold text-[var(--ink-secondary)]">{subtitle}</p>
  </div>
}

export function DevelopedBy() {
  return <div className="mt-6 flex flex-col items-center justify-center gap-1"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-tertiary)]">Desarrollado por</span><Image src="/brand/logo-cd.webp" alt="Consultoría Digital" width={234} height={54} className="h-[54px] w-auto object-contain" /></div>
}
