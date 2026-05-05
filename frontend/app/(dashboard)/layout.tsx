'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import {
  Users, KanbanSquare, Webhook, MessagesSquare,
  Key, LogOut, LayoutDashboard, Layers, Package, Menu, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import clsx from 'clsx'

import type { Role } from '@/types'

type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  roles?: Role[]
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/chats', label: 'Chats', icon: MessagesSquare, roles: ['owner', 'admin', 'member'] as Role[] },
  { href: '/leads', label: 'Leads', icon: KanbanSquare },
  { href: '/stock', label: 'Stock', icon: Package, roles: ['owner', 'admin', 'member'] as Role[] },
  { href: '/pipelines', label: 'Pipelines', icon: Layers, roles: ['owner', 'admin'] as Role[] },
  { href: '/contacts', label: 'Contactos', icon: Users },
  { href: '/webhooks', label: 'Webhooks', icon: Webhook, roles: ['owner', 'admin'] as Role[] },
  { href: '/api-keys', label: 'API Keys', icon: Key, roles: ['owner', 'admin'] as Role[] },
  { href: '/team', label: 'Equipo', icon: Users, roles: ['owner', 'admin'] as Role[] },
]

function WorkspaceHeader({
  user,
  onClose,
}: {
  user: ReturnType<typeof auth.get>
  onClose?: () => void
}) {
  return (
    <div
      className="flex items-center justify-between p-4 sm:p-6"
      style={{ borderBottom: '1px solid var(--panel-border)' }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 text-lg font-bold text-white shadow-sm shadow-primary-700/30">
          {user?.workspaceName ? user.workspaceName[0].toUpperCase() : 'C'}
        </div>
        <div className="flex min-w-0 flex-col justify-center">
          <h1 className="truncate text-sm font-bold leading-tight tracking-tight text-slate-900">
            {user?.workspaceName ?? 'CRM Studio'}
          </h1>
          <span className="mt-0.5 truncate text-xs font-medium text-slate-500">
            {user?.email}
          </span>
          <span
            className={clsx(
              'mt-2 w-fit',
              user?.role === 'owner' ? 'badge-owner' :
              user?.role === 'admin' ? 'badge-admin' :
              user?.role === 'member' ? 'badge-member' : 'badge-viewer'
            )}
          >
            {user?.role || 'Viewer'}
          </span>
        </div>
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="ml-3 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700/80 dark:hover:text-slate-50 md:hidden"
          aria-label="Cerrar menu"
        >
          <X size={20} />
        </button>
      )}
    </div>
  )
}

function NavLinks({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[]
  pathname: string
  onNavigate?: () => void
}) {
  return (
    <nav className="flex-1 space-y-1.5 overflow-y-auto px-3 py-4 sm:px-4 sm:py-5">
      {items.map((item) => {
        const Icon = item.icon
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`)

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={clsx(
              'group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300',
              active
                ? 'bg-primary-50 text-primary-700 shadow-sm shadow-primary-500/10 dark:bg-slate-600/95 dark:text-slate-50 dark:shadow-slate-950/25'
                : 'text-slate-600 hover:bg-slate-50 hover:text-primary-600 dark:text-slate-300 dark:hover:bg-slate-700/80 dark:hover:text-slate-50'
            )}
          >
            <div
              className={clsx(
                'rounded-md p-1 transition-colors',
                active
                  ? 'bg-primary-100 text-primary-700 dark:bg-slate-500 dark:text-slate-50'
                  : 'bg-transparent text-slate-400 group-hover:bg-primary-50 group-hover:text-primary-500 dark:text-slate-400 dark:group-hover:bg-slate-700/80 dark:group-hover:text-slate-50'
              )}
            >
              <Icon size={18} strokeWidth={active ? 2.5 : 2} />
            </div>
            <span className="truncate">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

function LogoutButton({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="mt-auto p-3 sm:p-4">
      <button
        onClick={onLogout}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition-all active:scale-[0.98] hover:bg-red-50 hover:text-red-600 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:bg-red-950/40 dark:hover:text-red-200"
        style={{ border: '1px solid var(--button-border)' }}
      >
        <LogOut size={16} />
        <span className="truncate">Cerrar sesion</span>
      </button>
    </div>
  )
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<ReturnType<typeof auth.get>>(null)
  const [checking, setChecking] = useState(true)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    if (!auth.isLoggedIn()) {
      router.push('/login')
    } else {
      setUser(auth.get())
    }
    setChecking(false)
  }, [router])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [pathname])

  function handleLogout() {
    auth.clear()
    router.push('/login')
  }

  const visibleNavItems = navItems.filter(
    (item) => !item.roles || item.roles.includes((user?.role ?? 'viewer') as Role)
  )

  return (
    <div className="min-h-[100dvh] bg-transparent text-slate-800 animate-fade-in md:flex md:h-screen md:overflow-hidden">
      <aside
        className="z-10 isolate hidden w-[280px] shrink-0 flex-col border-r shadow-[var(--shadow-office)] md:flex"
        style={{
          background: 'var(--sidebar-background)',
          borderColor: 'var(--panel-border)',
        }}
      >
        <WorkspaceHeader user={user} />
        <NavLinks items={visibleNavItems} pathname={pathname} />
        <LogoutButton onLogout={handleLogout} />
      </aside>

      <button
        type="button"
        aria-label="Cerrar menu"
        tabIndex={mobileNavOpen ? 0 : -1}
        className={clsx(
          'fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm transition-opacity md:hidden',
          mobileNavOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={() => setMobileNavOpen(false)}
      />

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 isolate flex w-[min(86vw,280px)] flex-col border-r shadow-[var(--shadow-office)] transition-transform duration-300 md:hidden',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{
          background: 'var(--sidebar-background)',
          borderColor: 'var(--panel-border)',
        }}
        aria-hidden={!mobileNavOpen}
        inert={!mobileNavOpen}
      >
        <WorkspaceHeader user={user} onClose={() => setMobileNavOpen(false)} />
        <NavLinks items={visibleNavItems} pathname={pathname} onNavigate={() => setMobileNavOpen(false)} />
        <LogoutButton onLogout={handleLogout} />
      </aside>

      <main className="relative flex min-h-[100dvh] flex-1 flex-col overflow-x-hidden bg-[var(--background)] md:min-h-0 md:overflow-auto">
        <header
          className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b px-4 backdrop-blur-xl md:hidden"
          style={{
            background: 'var(--sidebar-background)',
            borderColor: 'var(--panel-border)',
          }}
        >
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-700 transition hover:bg-slate-50 hover:text-primary-600 dark:text-slate-200 dark:hover:bg-slate-700/80 dark:hover:text-slate-50"
            aria-label="Abrir menu"
            aria-expanded={mobileNavOpen}
          >
            <Menu size={21} />
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight text-slate-900">
              {user?.workspaceName ?? 'CRM Studio'}
            </p>
            <p className="truncate text-xs font-medium text-slate-500">
              {user?.email}
            </p>
          </div>
        </header>

        {checking && (
          <div
            className="absolute inset-0 z-[100] flex items-center justify-center animate-fade-in backdrop-blur-sm"
            style={{ background: 'var(--overlay)' }}
          >
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-primary-100 border-t-primary-600 shadow-lg" />
          </div>
        )}
        <div className="flex-1 animate-slide-up md:h-full" style={{ animationDelay: '50ms' }}>
          {children}
        </div>
      </main>
    </div>
  )
}
