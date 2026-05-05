'use client'

import Link from 'next/link'
import { MessageSquareText, QrCode, ShieldAlert } from 'lucide-react'

export default function ChannelsPage() {
  return (
    <div className="mx-auto flex min-h-full max-w-5xl items-center justify-center p-6">
      <section className="interactive-card w-full overflow-hidden">
        <div className="grid gap-6 bg-[linear-gradient(135deg,_rgba(236,253,245,0.92),_rgba(255,255,255,0.98))] p-6 dark:bg-[linear-gradient(135deg,_rgba(15,23,42,0.96),_rgba(30,41,59,0.94))] md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-emerald-700 dark:border-emerald-400/30 dark:bg-slate-900/40 dark:text-emerald-200">
              <QrCode size={14} />
              Solo QR
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50">
              WhatsApp se conecta desde Chats
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-600 dark:text-slate-300">
              Quitamos el alta manual, tokens, PIN y popup de Meta de esta pantalla. El unico camino habilitado para vincular WhatsApp es escanear un QR.
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-white/80 p-4 text-emerald-700 shadow-sm dark:border-emerald-400/30 dark:bg-slate-900/45 dark:text-emerald-200">
            <ShieldAlert size={34} />
          </div>
        </div>

        <div className="grid gap-4 p-6 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-900/45">
            <QrCode className="text-emerald-600 dark:text-emerald-300" size={24} />
            <h2 className="mt-4 text-lg font-black text-slate-900 dark:text-slate-50">Vinculacion por QR</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-600 dark:text-slate-300">
              Genera el QR en Chats y escanealo desde WhatsApp, en Dispositivos vinculados.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-900/45">
            <MessageSquareText className="text-sky-600 dark:text-sky-300" size={24} />
            <h2 className="mt-4 text-lg font-black text-slate-900 dark:text-slate-50">Operacion en Chats</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-600 dark:text-slate-300">
              Una vez conectado, ahi mismo ves conversaciones, mensajes y envio desde el CRM.
            </p>
          </div>
        </div>

        <div className="border-t border-slate-200 p-6 dark:border-slate-700">
          <Link href="/chats" className="btn-primary inline-flex items-center gap-2">
            <QrCode size={17} />
            Ir a Chats y generar QR
          </Link>
        </div>
      </section>
    </div>
  )
}
