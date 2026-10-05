import Link from 'next/link'
import { LEGAL_INFO } from './legal-info'

// Paginas publicas (sin sesion): Meta las revisa al pasar la app a produccion.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-800 dark:bg-slate-950 dark:text-slate-200 sm:py-16">
      <article className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-10">
        {children}

        <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-6 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <span>Última actualización: {LEGAL_INFO.lastUpdated}</span>
          <nav className="flex flex-wrap gap-4">
            <Link href="/privacidad" className="hover:text-slate-900 hover:underline dark:hover:text-white">Política de privacidad</Link>
            <Link href="/condiciones" className="hover:text-slate-900 hover:underline dark:hover:text-white">Condiciones del servicio</Link>
            <Link href="/eliminacion-de-datos" className="hover:text-slate-900 hover:underline dark:hover:text-white">Eliminación de datos</Link>
          </nav>
        </footer>
      </article>
    </div>
  )
}
