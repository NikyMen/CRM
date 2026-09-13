'use client'

import { useEffect, useState, type ComponentType } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import clsx from 'clsx'
import type { LucideProps } from 'lucide-react'
import { BadgeDollarSign, Boxes, BriefcaseBusiness, Building2, ChevronLeft, ChevronRight, Headphones, Home, Lock, LogOut, Menu, MessageCircleMore, Receipt, Settings, Ticket, UsersRound, X } from 'lucide-react'
import type { Role } from '@/types'
import { auth } from '@/lib/auth'
import { WhatsAppLiveSync } from '@/components/WhatsAppLiveSync'
import { UserAvatar } from '@/components/UserAvatar'
import { useWorkspaceModules } from '@/lib/useWorkspaceModules'
import { isPathEnabled, moduleForPath, type ModuleKey } from '@/lib/modules'

type NavItem = { href: string; label: string; icon: ComponentType<LucideProps>; roles?: Role[]; exact?: boolean; aliases?: string[]; module?: ModuleKey }

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Inicio', icon: Home, exact: true, module: 'home' },
  { href: '/clients', label: 'Clientes', icon: Building2, module: 'clients' },
  { href: '/sales', label: 'Ventas', icon: Receipt, module: 'sales' },
  { href: '/commercial', label: 'Gestión comercial', icon: BriefcaseBusiness, roles: ['owner', 'admin', 'member'], aliases: ['/leads', '/deals'], module: 'commercial' },
  { href: '/collections', label: 'Cobranzas', icon: BadgeDollarSign, module: 'collections' },
  { href: '/customer-service', label: 'Atención al cliente', icon: Headphones, module: 'customer-service' },
  { href: '/tickets', label: 'Tickets', icon: Ticket, module: 'tickets' },
  { href: '/internal-chat', label: 'Chat interno', icon: MessageCircleMore, module: 'internal-chat' },
  { href: '/stock', label: 'Stock', icon: Boxes, roles: ['owner', 'admin', 'member'], module: 'stock' },
  { href: '/team', label: 'Equipo', icon: UsersRound, roles: ['owner', 'admin'], module: 'team' },
  { href: '/settings', label: 'Configuración', icon: Settings, roles: ['owner', 'admin'] },
]

function DisabledModuleNotice({ canManage }: { canManage: boolean }) {
  return (
    <div className="grid min-h-[70vh] place-items-center px-6">
      <div className="max-w-md text-center">
        <Lock className="mx-auto mb-4 text-[var(--ink-tertiary)]" size={28} />
        <p className="text-lg font-extrabold text-[var(--ink-primary)]">Módulo desactivado</p>
        <p className="mt-2 text-sm text-[var(--ink-tertiary)]">
          Este módulo está apagado para tu espacio de trabajo.
          {canManage ? ' Podés volver a activarlo desde Configuración.' : ' Pedile a un administrador que lo active.'}
        </p>
        {canManage ? (
          <Link href="/settings?tab=modules" className="mt-5 inline-flex min-h-10 items-center justify-center rounded-lg bg-[var(--brand-navy)] px-4 text-sm font-bold text-white">
            Ir a Configuración
          </Link>
        ) : null}
      </div>
    </div>
  )
}

function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Image src="/brand/romez-navy.jpg" alt="ROMEZ Servicios Contables" width={60} height={60} className="h-14 w-14 shrink-0 object-contain" priority />
      <div className={clsx('min-w-0 transition-opacity duration-200', collapsed && 'hidden')}>
        <p className="font-display text-sm font-extrabold tracking-tight text-white">Gestión ROMEZ</p>
        <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-white/52">Servicios contables</p>
      </div>
    </div>
  )
}

function Navigation({ items, pathname, onNavigate, collapsed = false }: { items: NavItem[]; pathname: string; onNavigate?: () => void; collapsed?: boolean }) {
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Navegación principal">
      {items.map((item) => {
        const Icon = item.icon
        const paths = [item.href, ...(item.aliases ?? [])]
        const active = item.exact ? pathname === item.href : paths.some((path) => pathname === path || pathname.startsWith(`${path}/`))
        return (
          <Link key={item.href} href={item.href} onClick={onNavigate} title={collapsed ? item.label : undefined} aria-current={active ? 'page' : undefined} className={clsx('group relative flex min-h-11 items-center rounded-lg border text-[13px] font-bold', collapsed ? 'justify-center px-0' : 'gap-3 px-3', active ? 'border-white/18 bg-white text-[var(--brand-navy)]' : 'border-transparent text-white/66 hover:border-white/10 hover:bg-white/[0.055] hover:text-white')}>
            <Icon size={17} strokeWidth={active ? 2.5 : 2} />
            {!collapsed ? <span className="truncate">{item.label}</span> : null}
            {item.href === '/tickets' ? <span className={clsx('absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-[var(--sidebar-background)]', active ? 'bg-[var(--brand-blue)]' : 'bg-[#82a4e2]')} aria-label="Tickets con notificaciones" /> : null}
          </Link>
        )
      })}
    </nav>
  )
}

function Sidebar({ items, pathname, user, onLogout, onClose, collapsed = false, onToggle }: { items: NavItem[]; pathname: string; user: ReturnType<typeof auth.get>; onLogout: () => void; onClose?: () => void; collapsed?: boolean; onToggle?: () => void }) {
  return (
    <div className="flex h-full flex-col border-r border-white/10 bg-[var(--sidebar-background)]">
      <div className={clsx('relative flex min-h-[82px] items-center border-b border-white/10', collapsed ? 'justify-center px-2' : 'justify-between px-4')}><Brand collapsed={collapsed} />{onClose ? <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/70 hover:bg-white/8 hover:text-white md:hidden" aria-label="Cerrar menú"><X size={19} /></button> : null}{onToggle ? <button type="button" onClick={onToggle} className="absolute -right-3.5 z-10 hidden h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-[var(--sidebar-background)] text-white/75 shadow-sm hover:bg-[var(--brand-navy)] hover:text-white md:flex" aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}>{collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}</button> : null}</div>

      <Navigation items={items} pathname={pathname} onNavigate={onClose} collapsed={collapsed} />
      <div className="border-t border-white/10 p-4">
        <div className="mb-3 flex items-center gap-3">
          <UserAvatar avatar={user?.avatar} firstName={user?.firstName} lastName={user?.lastName} email={user?.email} size="sm" />
          {!collapsed ? <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-white">{user?.firstName} {user?.lastName}</p><p className="truncate text-[9px] font-bold uppercase tracking-wider text-white/42">{user?.role}</p></div> : null}
        </div>
        <button type="button" onClick={onLogout} title={collapsed ? 'Cerrar sesión' : undefined} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/10 text-xs font-bold text-white/62 hover:bg-white/[0.055] hover:text-white"><LogOut size={15} />{!collapsed ? ' Cerrar sesión' : null}</button>
        {!collapsed ? <div className="mt-4 flex flex-col items-center justify-center gap-1 border-t border-white/10 pt-4"><span className="text-[9px] font-bold uppercase tracking-[0.1em] text-white/48">Desarrollado por</span><Image src="/brand/logo-cd.webp" alt="Consultoría Digital" width={600} height={400} className="h-12 w-full max-w-[208px] object-cover" /></div> : null}
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    setSidebarCollapsed(window.localStorage.getItem('romez-sidebar-collapsed') === 'true')
  }, [])

  const toggleSidebar = () => setSidebarCollapsed((current) => {
    const next = !current
    window.localStorage.setItem('romez-sidebar-collapsed', String(next))
    return next
  })

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
  const { modules, ready: modulesReady } = useWorkspaceModules(Boolean(user))
  const visibleItems = NAV_ITEMS.filter((item) => (!item.roles || item.roles.includes(role)) && (!item.module || (modulesReady && modules[item.module])))
  const logout = () => { auth.clear(); router.replace('/login') }
  const blockedModule = modulesReady && moduleForPath(pathname) && !isPathEnabled(pathname, modules)

  // Inicio es el destino por defecto del login y de la raíz del sitio. Si el
  // workspace lo apagó mandamos a la primera sección que sí esté prendida, así
  // nadie aterriza en el cartel de módulo desactivado.
  const homeFallback = pathname === '/dashboard' ? visibleItems[0]?.href : undefined
  useEffect(() => {
    if (blockedModule && homeFallback) router.replace(homeFallback)
  }, [blockedModule, homeFallback, router])

  return (
    <div className="min-h-[100dvh] bg-[var(--background)] text-[var(--foreground)] md:flex md:h-screen md:overflow-hidden">
      {user && ['owner', 'admin', 'member'].includes(user.role) ? <WhatsAppLiveSync /> : null}
      <aside className={clsx('hidden shrink-0 transition-[width] duration-200 md:block', sidebarCollapsed ? 'w-[76px]' : 'w-[256px]')}><Sidebar items={visibleItems} pathname={pathname} user={user} onLogout={logout} collapsed={sidebarCollapsed} onToggle={toggleSidebar} /></aside>
      <button type="button" aria-label="Cerrar menú" className={clsx('fixed inset-0 z-40 bg-[#04132b]/55 md:hidden', mobileOpen ? 'block' : 'hidden')} onClick={() => setMobileOpen(false)} />
      <aside className={clsx('fixed inset-y-0 left-0 z-50 w-[min(88vw,286px)] transition-transform md:hidden', mobileOpen ? 'translate-x-0' : '-translate-x-full')}><Sidebar items={visibleItems} pathname={pathname} user={user} onLogout={logout} onClose={() => setMobileOpen(false)} /></aside>
      <main className="min-w-0 flex-1 overflow-x-hidden md:overflow-y-auto">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[var(--line)] bg-[var(--paper)] px-4 md:hidden">
          <button type="button" onClick={() => setMobileOpen(true)} className="rounded-lg border border-[var(--line)] p-2.5 text-[var(--ink-primary)]" aria-label="Abrir menú"><Menu size={19} /></button>
          <div className="flex items-center gap-2"><Image src="/brand/romez-navy.jpg" alt="Gestión ROMEZ" width={38} height={38} className="h-9 w-9 object-contain" /><div><p className="text-xs font-extrabold text-[var(--brand-navy)] dark:text-[var(--brand-blue)]">Gestión ROMEZ</p><p className="text-[7px] font-bold uppercase tracking-wide text-[var(--ink-tertiary)]">Desarrollado por Consultoría Digital</p></div></div>
        </header>
        {checking || !modulesReady ? <div className="grid min-h-[70vh] place-items-center"><div className="h-7 w-7 animate-spin rounded-full border-[3px] border-[var(--brand-blue)] border-t-transparent" /></div> : blockedModule ? <DisabledModuleNotice canManage={role === 'owner' || role === 'admin'} /> : children}
      </main>
    </div>
  )
}
