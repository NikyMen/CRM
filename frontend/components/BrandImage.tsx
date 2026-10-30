/* eslint-disable @next/next/no-img-element */
import Image from 'next/image'

/**
 * Logo de la marca: los de `public/` pasan por next/image; los subidos desde
 * Configuración vienen de la API y van con <img> (next/image no carga orígenes
 * externos sin configurarlos).
 */
export function BrandImage({ src, alt, size, className, priority }: { src: string; alt: string; size: number; className?: string; priority?: boolean }) {
  if (src.startsWith('/')) return <Image src={src} alt={alt} width={size} height={size} className={className} priority={priority} />
  return <img src={src} alt={alt} width={size} height={size} className={className} />
}
