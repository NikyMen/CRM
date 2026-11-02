'use client'

import { useEffect, useRef, useState, type ComponentType } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import clsx from 'clsx'
import type { LucideProps } from 'lucide-react'
import { BadgeDollarSign, Scale, Boxes, BriefcaseBusiness, Building2, ChevronDown, ClipboardCheck, ChevronLeft, ChevronRight, Home, Lock, LogOut, Menu, MessageCircleMore, Receipt, Settings, Ticket, UsersRound, X } from 'lucide-react'
import type { Role } from '@/types'
import { auth } from '@/lib/auth'
import { WhatsAppLiveSync } from '@/components/WhatsAppLiveSync'
import { ConfirmDeleteProvider } from '@/components/romez/ConfirmDelete'
import { UserAvatar } from '@/components/UserAvatar'
import { useWorkspaceModules } from '@/lib/useWorkspaceModules'
import { isPathEnabled, moduleForPath, type ModuleKey } from '@/lib/modules'
import { TopbarSlot } from '@/components/romez/Topbar'
import { PaymentPromiseBell, usePromiseCounts } from '@/components/romez/PaymentPromiseBell'
import { brand } from '@/lib/brand'
import { useBranding } from '@/lib/useBranding'
import { BrandImage } from '@/components/BrandImage'

type NavItem = { href: string; label: string; icon: ComponentType<LucideProps>; roles?: Role[]; exact?: boolean; aliases?: string[]; module?: ModuleKey }

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Inicio', icon: Home, exact: true, module: 'home' },
  { href: '/clients', label: 'Clientes', icon: Building2, module: 'clients' },
  { href: '/sales', label: 'Ventas', icon: Receipt, module: 'sales' },
  { href: '/daily-reports', label: 'Planilla diaria', icon: ClipboardCheck, roles: ['owner', 'admin', 'member'], module: 'daily-reports' },
  { href: '/commercial', label: 'Gestión comercial', icon: BriefcaseBusiness, roles: ['owner', 'admin', 'member'], aliases: ['/leads', '/deals'], module: 'commercial' },
  { href: '/balances', label: 'Saldos', icon: Scale, module: 'collections' },
  { href: '/collections', label: 'Cobranzas', icon: BadgeDollarSign, module: 'collections' },
  { href: '/tickets', label: 'Tickets', icon: Ticket, module: 'tickets', aliases: ['/customer-service'] },
  { href: '/internal-chat', label: 'Chat interno', icon: MessageCircleMore, module: 'internal-chat' },
  { href: '/stock', label: 'Stock', icon: Boxes, roles: ['owner', 'admin', 'member'], module: 'stock' },
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
  const branding = useBranding()
  return (
    <div className="flex min-w-0 items-center gap-3">
      {branding.ready ? <BrandImage src={branding.logoOnDark} alt={brand.legalName} size={60} className="h-14 w-14 shrink-0 object-contain" priority /> : <div className="h-14 w-14 shrink-0" />}
      <div className={clsx('min-w-0 transition-opacity duration-200', collapsed && 'hidden')}>
        <p className="truncate font-display text-sm font-extrabold tracking-tight text-white">{branding.name}</p>
        <p className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-[0.16em] text-white/52">{branding.tagline}</p>
      </div>
    </div>
  )
}

function Navigation({ items, pathname, onNavigate, collapsed = false, badges }: { items: NavItem[]; pathname: string; onNavigate?: () => void; collapsed?: boolean; badges?: Record<string, number> }) {
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Navegación principal">
      {items.map((item) => {
        const Icon = item.icon
        const paths = [item.href, ...(item.aliases ?? [])]
        const active = item.exact ? pathname === item.href : paths.some((path) => pathname === path || pathname.startsWith(`${path}/`))
        const badge = badges?.[item.href] ?? 0
        return (
          <Link key={item.href} href={item.href} onClick={onNavigate} title={collapsed ? item.label : undefined} aria-current={active ? 'page' : undefined} className={clsx('group relative flex min-h-11 items-center rounded-lg border text-[13px] font-bold', collapsed ? 'justify-center px-0' : 'gap-3 px-3', active ? 'border-white/18 bg-white text-[var(--brand-navy)]' : 'border-transparent text-white/66 hover:border-white/10 hover:bg-white/[0.055] hover:text-white')}>
            <Icon size={17} strokeWidth={active ? 2.5 : 2} />
            {!collapsed ? <span className="truncate">{item.label}</span> : null}
            {badge ? <span className={clsx('grid min-w-[18px] place-items-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-extrabold leading-4 text-white', collapsed ? 'absolute right-1.5 top-1.5' : 'ml-auto')} aria-label={`${badge} promesas de pago para hoy o vencidas`}>{badge > 99 ? '99+' : badge}</span> : null}
            {item.href === '/tickets' ? <span className={clsx('absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-[var(--sidebar-background)]', active ? 'bg-[var(--brand-blue)]' : 'bg-[#82a4e2]')} aria-label="Tickets con notificaciones" /> : null}
          </Link>
        )
      })}
    </nav>
  )
}

function Sidebar({ items, pathname, onClose, collapsed = false, onToggle, badges }: { items: NavItem[]; pathname: string; onClose?: () => void; collapsed?: boolean; onToggle?: () => void; badges?: Record<string, number> }) {
  return (
    <div className="flex h-full flex-col border-r border-white/10 bg-[var(--sidebar-background)]">
      <div className={clsx('relative flex min-h-[82px] items-center border-b border-white/10', collapsed ? 'justify-center px-2' : 'justify-between px-4')}><Brand collapsed={collapsed} />{onClose ? <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/70 hover:bg-white/8 hover:text-white md:hidden" aria-label="Cerrar menú"><X size={19} /></button> : null}{onToggle ? <button type="button" onClick={onToggle} className="absolute -right-[18px] z-10 hidden h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-[var(--sidebar-background)] text-white/85 shadow-md hover:bg-[var(--brand-navy)] hover:text-white md:flex" aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'} title={collapsed ? 'Expandir menú' : 'Colapsar menú'}>{collapsed ? <ChevronRight size={19} /> : <ChevronLeft size={19} />}</button> : null}</div>

      <Navigation items={items} pathname={pathname} onNavigate={onClose} collapsed={collapsed} badges={badges} />
      {!collapsed ? <div className="flex flex-col items-center justify-center gap-1 border-t border-white/10 p-4"><span className="text-[9px] font-bold uppercase tracking-[0.1em] text-white/48">Desarrollado por</span><Image src="/brand/logo-cd.webp" alt="Consultoría Digital" width={600} height={400} className="h-12 w-full max-w-[208px] object-cover" /></div> : null}
    </div>
  )
}

function UserMenu({ user, onLogout, showTeam = false }: { user: ReturnType<typeof auth.get>; onLogout: () => void; showTeam?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey) }
  }, [open])

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ')

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((current) => !current)} aria-haspopup="menu" aria-expanded={open} className="flex items-center gap-2.5 rounded-lg border border-transparent py-1 pl-1 pr-2 hover:border-[var(--line)] hover:bg-[var(--background)]">
        <UserAvatar avatar={user?.avatar} firstName={user?.firstName} lastName={user?.lastName} email={user?.email} size="sm" />
        <div className="hidden min-w-0 text-left sm:block"><p className="max-w-[220px] truncate text-xs font-bold text-[var(--ink-primary)]">{fullName || user?.email}</p><p className="truncate text-[9px] font-bold uppercase tracking-wider text-[var(--ink-tertiary)]">{user?.role}</p></div>
        <ChevronDown size={15} className={clsx('text-[var(--ink-tertiary)] transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--paper)] py-1 shadow-lg">
          <div className="border-b border-[var(--line)] px-4 py-3 sm:hidden"><p className="truncate text-xs font-bold text-[var(--ink-primary)]">{fullName || user?.email}</p><p className="truncate text-[9px] font-bold uppercase tracking-wider text-[var(--ink-tertiary)]">{user?.role}</p></div>
          {showTeam ? <Link href="/team" role="menuitem" onClick={() => setOpen(false)} className="flex min-h-10 items-center gap-2.5 px-4 text-sm font-semibold text-[var(--ink-primary)] hover:bg-[var(--background)]"><UsersRound size={15} /> Equipo</Link> : null}
          <Link href="/settings" role="menuitem" onClick={() => setOpen(false)} className="flex min-h-10 items-center gap-2.5 px-4 text-sm font-semibold text-[var(--ink-primary)] hover:bg-[var(--background)]"><Settings size={15} /> Configuración</Link>
          <button type="button" role="menuitem" onClick={onLogout} className="flex min-h-10 w-full items-center gap-2.5 px-4 text-sm font-semibold text-red-600 hover:bg-[var(--background)]"><LogOut size={15} /> Cerrar sesión</button>
        </div>
      ) : null}
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
  // Recordatorios de promesas de pago: sólo para quien puede tenerlas asignadas.
  const promisesEnabled = Boolean(user) && role !== 'viewer' && modulesReady && Boolean(modules.collections)
  const { due: duePromises } = usePromiseCounts(promisesEnabled)
  const navBadges = promisesEnabled && duePromises ? { '/collections': duePromises } : undefined
  // Equipo vive en el menú del usuario, no en el lateral.
  const showTeam = (role === 'owner' || role === 'admin') && modulesReady && Boolean(modules.team)
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
    <ConfirmDeleteProvider>
    <div className="min-h-[100dvh] bg-[var(--background)] text-[var(--foreground)] md:flex md:h-screen md:overflow-hidden">
      {user && ['owner', 'admin', 'member'].includes(user.role) ? <WhatsAppLiveSync /> : null}
      <aside className={clsx('relative z-40 hidden shrink-0 transition-[width] duration-200 md:block', sidebarCollapsed ? 'w-[76px]' : 'w-[256px]')}><Sidebar items={visibleItems} pathname={pathname} collapsed={sidebarCollapsed} onToggle={toggleSidebar} badges={navBadges} /></aside>
      <button type="button" aria-label="Cerrar menú" className={clsx('fixed inset-0 z-40 bg-[#04132b]/55 md:hidden', mobileOpen ? 'block' : 'hidden')} onClick={() => setMobileOpen(false)} />
      <aside className={clsx('fixed inset-y-0 left-0 z-50 w-[min(88vw,286px)] transition-transform md:hidden', mobileOpen ? 'translate-x-0' : '-translate-x-full')}><Sidebar items={visibleItems} pathname={pathname} onClose={() => setMobileOpen(false)} badges={navBadges} /></aside>
      <main className="min-w-0 flex-1 overflow-x-hidden md:flex md:flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--paper)] px-4 md:px-6">
          <div className="flex items-center gap-3 md:hidden">
            <button type="button" onClick={() => setMobileOpen(true)} className="rounded-lg border border-[var(--line)] p-2.5 text-[var(--ink-primary)]" aria-label="Abrir menú"><Menu size={19} /></button>
          </div>
          <TopbarSlot />
          <div className="flex shrink-0 items-center gap-2">{promisesEnabled ? <PaymentPromiseBell /> : null}<UserMenu user={user} onLogout={logout} showTeam={showTeam} /></div>
        </header>
        <div className="min-w-0 md:flex-1 md:overflow-y-auto">
          {checking || !modulesReady ? <div className="grid min-h-[70vh] place-items-center"><div className="h-7 w-7 animate-spin rounded-full border-[3px] border-[var(--brand-blue)] border-t-transparent" /></div> : blockedModule ? <DisabledModuleNotice canManage={role === 'owner' || role === 'admin'} /> : children}
        </div>
      </main>
    </div>
    </ConfirmDeleteProvider>
  )
}
