'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import {
  Users, KanbanSquare, Webhook, MessageSquare, Inbox, MessagesSquare,
  Key, LogOut, LayoutDashboard, Layers,
} from 'lucide-react'
import clsx from 'clsx'

import type { Role } from '@/types'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/contacts', label: 'Contactos', icon: Users },
  { href: '/leads', label: 'Leads', icon: KanbanSquare },
  { href: '/pipelines', label: 'Pipelines', icon: Layers, roles: ['owner', 'admin'] as Role[] },
  { href: '/chats', label: 'Chats', icon: MessagesSquare, roles: ['owner', 'admin', 'member'] as Role[] },
  { href: '/inbox', label: 'Inbox', icon: Inbox, roles: ['owner', 'admin', 'member'] as Role[] },
  { href: '/channels', label: 'Canales', icon: MessageSquare, roles: ['owner', 'admin'] as Role[] },
  { href: '/webhooks', label: 'Webhooks', icon: Webhook, roles: ['owner', 'admin'] as Role[] },
  { href: '/api-keys', label: 'API Keys', icon: Key, roles: ['owner', 'admin'] as Role[] },
  { href: '/team', label: 'Equipo', icon: Users, roles: ['owner', 'admin'] as Role[] },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<ReturnType<typeof auth.get>>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!auth.isLoggedIn()) {
      router.push('/login')
    } else {
      setUser(auth.get())
    }
    setChecking(false)
  }, [router])

  function handleLogout() {
    auth.clear()
    router.push('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-transparent text-slate-800 animate-fade-in">
      <aside
        className="z-10 isolate flex w-[280px] shrink-0 flex-col border-r shadow-[var(--shadow-office)]"
        style={{
          background: 'var(--sidebar-background)',
          borderColor: 'var(--panel-border)',
        }}
      >
        <div
          className="flex items-center justify-between p-6"
          style={{ borderBottom: '1px solid var(--panel-border)' }}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 text-lg font-bold text-white shadow-sm shadow-primary-700/30">
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
        </div>

        <nav className="flex-1 space-y-1.5 overflow-y-auto px-4 py-5">
          {navItems
            .filter((item) => !item.roles || item.roles.includes((user?.role ?? 'viewer') as Role))
            .map((item) => {
              const Icon = item.icon
              const active = pathname.startsWith(item.href)

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300',
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
                  {item.label}
                </Link>
              )
            })}
        </nav>

        <div className="mt-auto p-4">
          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition-all active:scale-[0.98] hover:bg-red-50 hover:text-red-600 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:bg-red-950/40 dark:hover:text-red-200"
            style={{ border: '1px solid var(--button-border)' }}
          >
            <LogOut size={16} />
            Cerrar sesion
          </button>
        </div>
      </aside>

      <main className="relative flex flex-1 flex-col overflow-auto bg-[var(--background)]">
        {checking && (
          <div
            className="absolute inset-0 z-[100] flex items-center justify-center animate-fade-in backdrop-blur-sm"
            style={{ background: 'var(--overlay)' }}
          >
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-primary-100 border-t-primary-600 shadow-lg" />
          </div>
        )}
        <div className="h-full flex-1 animate-slide-up" style={{ animationDelay: '50ms' }}>
          {children}
        </div>
      </main>
    </div>
  )
}
