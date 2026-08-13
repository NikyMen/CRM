'use client'

import { useRef } from 'react'

export function SpotlightCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={ref}
      className={`rb-spotlight-card ${className}`}
      onPointerMove={(event) => {
        const rect = ref.current?.getBoundingClientRect()
        if (!rect || !ref.current) return
        ref.current.style.setProperty('--spot-x', `${event.clientX - rect.left}px`)
        ref.current.style.setProperty('--spot-y', `${event.clientY - rect.top}px`)
      }}
    >{children}</div>
  )
}
