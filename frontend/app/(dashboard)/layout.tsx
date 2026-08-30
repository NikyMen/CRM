'use client'

import { useEffect, useState, type ComponentType } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import clsx from 'clsx'
import type { LucideProps } from 'lucide-react'
import { BadgeDollarSign, BriefcaseBusiness, Building2, Headphones, Home, LogOut, Menu, Settings, Ticket, UsersRound, X } from 'lucide-react'
import type { Role } from '@/types'
import { auth } from '@/lib/auth'
import { WhatsAppLiveSync } from '@/components/WhatsAppLiveSync'
import { UserAvatar } from '@/components/UserAvatar'
import { ThemeToggle } from '@/components/theme-toggle'

type NavItem = { href: string; label: string; icon: ComponentType<LucideProps>; roles?: Role[]; exact?: boolean; aliases?: string[] }

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Inicio', icon: Home, exact: true },
  { href: '/clients', label: 'Clientes', icon: Building2 },
  { href: '/commercial', label: 'Gestión comercial', icon: BriefcaseBusiness, roles: ['owner', 'admin', 'member'], aliases: ['/leads', '/deals'] },
  { href: '/collections', label: 'Cobranzas', icon: BadgeDollarSign },
  { href: '/customer-service', label: 'Atención al cliente', icon: Headphones },
  { href: '/tickets', label: 'Tickets', icon: Ticket },
  { href: '/team', label: 'Equipo', icon: UsersRound, roles: ['owner', 'admin'] },
  { href: '/settings', label: 'Configuración', icon: Settings, roles: ['owner', 'admin'] },
]

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <Image src="/brand/romez-navy.jpg" alt="ROMEZ Servicios Contables" width={60} height={60} className="h-14 w-14 shrink-0 object-contain" priority />
      <div className="min-w-0">
        <p className="font-display text-sm font-extrabold tracking-tight text-white">Gestión ROMEZ</p>
        <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-white/52">Servicios contables</p>
      </div>
    </div>
  )
}

function Navigation({ items, pathname, onNavigate }: { items: NavItem[]; pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Navegación principal">
      {items.map((item) => {
        const Icon = item.icon
        const paths = [item.href, ...(item.aliases ?? [])]
        const active = item.exact ? pathname === item.href : paths.some((path) => pathname === path || pathname.startsWith(`${path}/`))
        return (
          <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? 'page' : undefined} className={clsx('group flex min-h-11 items-center gap-3 rounded-lg border px-3 text-[13px] font-bold', active ? 'border-white/18 bg-white text-[var(--brand-navy)]' : 'border-transparent text-white/66 hover:border-white/10 hover:bg-white/[0.055] hover:text-white')}>
            <Icon size={17} strokeWidth={active ? 2.5 : 2} />
            <span className="truncate">{item.label}</span>
            {item.href === '/tickets' ? <span className={clsx('ml-auto h-1.5 w-1.5 rounded-full', active ? 'bg-[var(--brand-blue)]' : 'bg-[#82a4e2]')} aria-hidden="true" /> : null}
          </Link>
        )
      })}
    </nav>
  )
}

function Sidebar({ items, pathname, user, onLogout, onClose }: { items: NavItem[]; pathname: string; user: ReturnType<typeof auth.get>; onLogout: () => void; onClose?: () => void }) {
  return (
    <div className="flex h-full flex-col border-r border-white/10 bg-[var(--sidebar-background)]">
      <div className="flex min-h-[82px] items-center justify-between border-b border-white/10 px-4"><Brand />{onClose ? <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/70 hover:bg-white/8 hover:text-white md:hidden" aria-label="Cerrar menú"><X size={19} /></button> : null}</div>
      <div className="px-5 pt-5"><p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/36">Mesa de trabajo</p></div>
      <Navigation items={items} pathname={pathname} onNavigate={onClose} />
      <div className="border-t border-white/10 p-4">
        <div className="mb-3 flex items-center gap-3">
          <UserAvatar avatar={user?.avatar} firstName={user?.firstName} lastName={user?.lastName} email={user?.email} size="sm" />
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-white">{user?.firstName} {user?.lastName}</p><p className="truncate text-[9px] font-bold uppercase tracking-wider text-white/42">{user?.role}</p></div>
          <ThemeToggle />
        </div>
        <button type="button" onClick={onLogout} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/10 text-xs font-bold text-white/62 hover:bg-white/[0.055] hover:text-white"><LogOut size={15} /> Cerrar sesión</button>
        <p className="mt-4 border-t border-white/10 pt-4 text-center text-[8px] font-bold uppercase tracking-[0.1em] text-white/34">Desarrollado por <span className="text-white/62">Consultoría Digital</span></p>
      </div>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<ReturnType<typeof auth.get>>(null)
  const [checking, setChecking] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (!auth.isLoggedIn()) router.replace('/login')
    else setUser(auth.get())
    setChecking(false)
  }, [router])

  useEffect(() => {
    const refresh = () => setUser(auth.get())
    window.addEventListener('crm_user_updated', refresh)
    window.addEventListener('storage', refresh)
    return () => { window.removeEventListener('crm_user_updated', refresh); window.removeEventListener('storage', refresh) }
  }, [])

  useEffect(() => setMobileOpen(false), [pathname])

  const role = (user?.role ?? 'viewer') as Role
  const visibleItems = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role))
  const logout = () => { auth.clear(); router.replace('/login') }

  return (
    <div className="min-h-[100dvh] bg-[var(--background)] text-[var(--foreground)] md:flex md:h-screen md:overflow-hidden">
      {user && ['owner', 'admin', 'member'].includes(user.role) ? <WhatsAppLiveSync /> : null}
      <aside className="hidden w-[256px] shrink-0 md:block"><Sidebar items={visibleItems} pathname={pathname} user={user} onLogout={logout} /></aside>
      <button type="button" aria-label="Cerrar menú" className={clsx('fixed inset-0 z-40 bg-[#04132b]/55 md:hidden', mobileOpen ? 'block' : 'hidden')} onClick={() => setMobileOpen(false)} />
      <aside className={clsx('fixed inset-y-0 left-0 z-50 w-[min(88vw,286px)] transition-transform md:hidden', mobileOpen ? 'translate-x-0' : '-translate-x-full')}><Sidebar items={visibleItems} pathname={pathname} user={user} onLogout={logout} onClose={() => setMobileOpen(false)} /></aside>
      <main className="min-w-0 flex-1 overflow-x-hidden md:overflow-y-auto">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[var(--line)] bg-[var(--paper)] px-4 md:hidden">
          <button type="button" onClick={() => setMobileOpen(true)} className="rounded-lg border border-[var(--line)] p-2.5 text-[var(--ink-primary)]" aria-label="Abrir menú"><Menu size={19} /></button>
          <div className="flex items-center gap-2"><Image src="/brand/romez-navy.jpg" alt="Gestión ROMEZ" width={38} height={38} className="h-9 w-9 object-contain" /><div><p className="text-xs font-extrabold text-[var(--brand-navy)] dark:text-[var(--brand-blue)]">Gestión ROMEZ</p><p className="text-[7px] font-bold uppercase tracking-wide text-[var(--ink-tertiary)]">Desarrollado por Consultoría Digital</p></div></div>
          <ThemeToggle />
        </header>
        {checking ? <div className="grid min-h-[70vh] place-items-center"><div className="h-7 w-7 animate-spin rounded-full border-[3px] border-[var(--brand-blue)] border-t-transparent" /></div> : children}
      </main>
    </div>
  )
}
