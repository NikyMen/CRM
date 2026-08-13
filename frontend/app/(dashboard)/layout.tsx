'use client'

import { useEffect, useState, type ComponentType } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import { useQuery } from '@tanstack/react-query'
import { KanbanSquare, LayoutDashboard, LogOut, Menu, MessagesSquare, Package, Settings, Users, X } from 'lucide-react'
import type { LucideProps } from 'lucide-react'
import clsx from 'clsx'
import { authApi } from '@/lib/api'
import { auth } from '@/lib/auth'
import type { Role } from '@/types'
import { WhatsAppLogo } from '@/components/WhatsAppLogo'
import { WhatsAppLiveSync } from '@/components/WhatsAppLiveSync'
import { UserAvatar } from '@/components/UserAvatar'
import { FadeContent } from '@/components/react-bits/FadeContent'

const LightRays = dynamic(() => import('@/components/react-bits/LightRays').then((module) => module.LightRays), { ssr: false })

type NavItem = { href: string; label: string; icon: ComponentType<LucideProps>; roles?: Role[]; module?: 'stock' }

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/whatsapp', label: 'WhatsApp', icon: WhatsAppLogo, roles: ['owner', 'admin', 'member'] },
  { href: '/messenger-instagram', label: 'Messenger / Instagram', icon: MessagesSquare, roles: ['owner', 'admin', 'member'] },
  { href: '/leads', label: 'Leads', icon: KanbanSquare, roles: ['owner', 'admin', 'member'] },
  { href: '/stock', label: 'Stock', icon: Package, roles: ['owner', 'admin', 'member'], module: 'stock' },
  { href: '/contacts', label: 'Contactos', icon: Users },
  { href: '/settings', label: 'Configuración', icon: Settings },
]

function Brand() {
  return <div className="relative z-10 flex items-center gap-3"><Image src="/brand/logo-cd.webp" alt="Consultoría Digital" width={40} height={40} className="h-10 w-10 object-contain" /><div><p className="font-display text-sm font-black text-white">Consultoría Digital</p><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#c5ed1b]">CRM operativo</p></div></div>
}

function Navigation({ items, pathname, onNavigate }: { items: NavItem[]; pathname: string; onNavigate?: () => void }) {
  return <nav className="relative z-10 flex-1 space-y-1 overflow-y-auto px-3 py-5">{items.map((item) => { const Icon = item.icon; const active = pathname === item.href || pathname.startsWith(`${item.href}/`); return <Link key={item.href} href={item.href} onClick={onNavigate} className={clsx('group flex min-h-11 items-center gap-3 rounded-xl border px-3 text-sm font-extrabold transition', active ? 'border-[#c5ed1b]/40 bg-[#c5ed1b] text-[#0c1015]' : 'border-transparent text-white/65 hover:border-white/10 hover:bg-white/[0.06] hover:text-white')}><Icon size={18} strokeWidth={active ? 2.7 : 2} /><span className="truncate">{item.label}</span>{item.href === '/whatsapp' && <span className="ml-auto h-2 w-2 rounded-full bg-[#c5ed1b] shadow-[0_0_12px_#c5ed1b]" />}</Link> })}</nav>
}

function Sidebar({ items, pathname, user, onLogout, onClose }: { items: NavItem[]; pathname: string; user: ReturnType<typeof auth.get>; onLogout: () => void; onClose?: () => void }) {
  return <div className="relative flex h-full flex-col overflow-hidden bg-[#0c1015]">
    <LightRays />
    <div className="relative z-10 flex items-center justify-between border-b border-white/10 px-5 py-5"><Brand />{onClose && <button onClick={onClose} className="text-white/70 md:hidden" aria-label="Cerrar menú"><X size={20} /></button>}</div>
    <Navigation items={items} pathname={pathname} onNavigate={onClose} />
    <div className="relative z-10 border-t border-white/10 p-4">
      <div className="mb-3 flex items-center gap-3"><UserAvatar avatar={user?.avatar} firstName={user?.firstName} lastName={user?.lastName} email={user?.email} size="sm" /><div className="min-w-0"><p className="truncate text-xs font-black text-white">{user?.firstName} {user?.lastName}</p><p className="truncate text-[10px] font-bold uppercase tracking-wider text-white/45">{user?.role}</p></div></div>
      <button onClick={onLogout} className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-xs font-black text-white/65 hover:bg-white/5 hover:text-white"><LogOut size={15} /> Cerrar sesión</button>
      <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-4"><Image src="/brand/logo-cd.webp" alt="" width={22} height={22} className="h-5 w-5 object-contain" /><p className="text-[9px] font-bold leading-tight text-white/40">Desarrollado por<br/><span className="text-white/65">Consultoría Digital</span></p></div>
    </div>
  </div>
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<ReturnType<typeof auth.get>>(null)
  const [checking, setChecking] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const settings = useQuery({ queryKey: ['workspace-settings'], queryFn: () => authApi.getWorkspaceSettings().then((response) => response.data), enabled: !!user })

  useEffect(() => { if (!auth.isLoggedIn()) router.push('/login'); else setUser(auth.get()); setChecking(false) }, [router])
  useEffect(() => { const refresh = () => setUser(auth.get()); window.addEventListener('crm_user_updated', refresh); window.addEventListener('storage', refresh); return () => { window.removeEventListener('crm_user_updated', refresh); window.removeEventListener('storage', refresh) } }, [])
  useEffect(() => setMobileOpen(false), [pathname])

  const visibleItems = navItems.filter((item) => (!item.roles || item.roles.includes((user?.role ?? 'viewer') as Role)) && (item.module !== 'stock' || settings.data?.stockVisible !== false))
  const logout = () => { auth.clear(); router.push('/login') }

  return <div className="min-h-[100dvh] bg-[var(--background)] text-[var(--foreground)] md:flex md:h-screen md:overflow-hidden">
    {user && ['owner', 'admin', 'member'].includes(user.role) && <WhatsAppLiveSync />}
    <aside className="hidden w-[248px] shrink-0 md:block"><Sidebar items={visibleItems} pathname={pathname} user={user} onLogout={logout} /></aside>
    <button type="button" aria-label="Cerrar menú" className={clsx('fixed inset-0 z-40 bg-black/55 backdrop-blur-sm md:hidden', mobileOpen ? 'block' : 'hidden')} onClick={() => setMobileOpen(false)} />
    <aside className={clsx('fixed inset-y-0 left-0 z-50 w-[min(88vw,280px)] transition-transform md:hidden', mobileOpen ? 'translate-x-0' : '-translate-x-full')}><Sidebar items={visibleItems} pathname={pathname} user={user} onLogout={logout} onClose={() => setMobileOpen(false)} /></aside>
    <main className="min-w-0 flex-1 overflow-x-hidden md:overflow-y-auto">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[var(--panel-border)] bg-[var(--sidebar-background)]/90 px-4 backdrop-blur-xl md:hidden"><button onClick={() => setMobileOpen(true)} className="rounded-xl border border-[var(--panel-border)] p-2.5" aria-label="Abrir menú"><Menu size={20} /></button><Image src="/brand/logo-cd.webp" alt="Consultoría Digital" width={38} height={38} className="h-9 w-9 object-contain" /><span className="live-badge">En vivo</span></header>
      {checking ? <div className="grid min-h-[70vh] place-items-center"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#c5ed1b] border-t-transparent" /></div> : <FadeContent className="min-h-full">{children}</FadeContent>}
    </main>
  </div>
}
