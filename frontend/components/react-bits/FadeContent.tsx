'use client'

export function FadeContent({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rb-fade-content ${className}`}>{children}</div>
}
