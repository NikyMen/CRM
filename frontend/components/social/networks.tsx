import type { CSSProperties } from 'react'
import { WhatsAppLogo } from '@/components/WhatsAppLogo'

/** Redes de la bandeja de Mensajes. `whatsapp` agrupa el número comercial y el de Tickets. */
export type NetworkKey = 'whatsapp' | 'instagram' | 'facebook'

export const NETWORKS: Record<NetworkKey, { label: string; color: string; soft: string }> = {
  whatsapp: { label: 'WhatsApp', color: '#128c4b', soft: '#e3f6ea' },
  instagram: { label: 'Instagram', color: '#c13584', soft: '#fbe9f3' },
  facebook: { label: 'Facebook', color: '#1877f2', soft: '#e7f0fe' },
}

type LogoProps = { size?: number; className?: string; style?: CSSProperties }

export function InstagramLogo({ size = 18, className, style }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.3" cy="6.7" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function FacebookLogo({ size = 18, className, style }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden>
      <path d="M13.5 21v-7.6h2.6l.4-3h-3V8.5c0-.9.3-1.5 1.6-1.5h1.5V4.3c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.300-3.700 3.800v2.400H8.200v3h2.500V21h2.800Z" />
    </svg>
  )
}

export function NetworkLogo({ network, ...props }: LogoProps & { network: NetworkKey }) {
  if (network === 'instagram') return <InstagramLogo {...props} />
  if (network === 'facebook') return <FacebookLogo {...props} />
  return <WhatsAppLogo size={props.size} className={props.className} style={props.style} />
}
