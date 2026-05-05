'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted && resolvedTheme === 'dark'

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={`fixed top-4 right-4 z-[120] flex items-center gap-3 rounded-full px-3 py-2 text-sm font-semibold backdrop-blur-xl transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 ${
        isDark
          ? 'border border-slate-600/80 bg-slate-900/88 text-slate-100 shadow-lg shadow-slate-950/35 hover:border-slate-500 hover:bg-slate-800/92 hover:text-sky-100'
          : 'border border-slate-300/80 bg-white/88 text-slate-700 shadow-lg shadow-sky-900/10 hover:border-sky-300 hover:bg-sky-50/92 hover:text-primary-700'
      }`}
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      aria-pressed={isDark}
    >
      <span
        className={`relative flex h-7 w-12 items-center rounded-full p-1 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isDark
            ? 'border border-slate-600 bg-slate-800'
            : 'border border-slate-300 bg-sky-100'
        }`}
        aria-hidden="true"
      >
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full shadow-md transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            isDark
              ? 'translate-x-5 bg-slate-200 text-slate-800 shadow-slate-950/20'
              : 'translate-x-0 bg-white text-amber-500 shadow-sky-900/10'
          }`}
        >
          {isDark ? <Moon size={12} /> : <Sun size={12} />}
        </span>
      </span>
      <span className="hidden sm:inline transition-colors duration-500">
        {isDark ? 'Modo oscuro' : 'Modo claro'}
      </span>
    </button>
  )
}
