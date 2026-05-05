'use client'

import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '@/lib/api'
import { ThemeToggle } from '@/components/theme-toggle'
import type { DashboardData } from '@/types'
import Link from 'next/link'
import {
  Users, KanbanSquare, DollarSign, Activity,
  Loader2, PhoneCall, Send, Calendar,
  CheckSquare, MessageSquare, Clock, ArrowRight, Layers,
} from 'lucide-react'
import clsx from 'clsx'

const STATUS_COLORS: Record<string, string> = {
  LEAD:      'bg-blue-500/10 text-blue-400',
  QUALIFIED: 'bg-purple-500/10 text-purple-400',
  ACTIVE:    'bg-green-500/10 text-green-400',
  CUSTOMER:  'bg-emerald-500/10 text-emerald-400',
  CHURNED:   'bg-red-500/10 text-red-400',
}

const ACTIVITY_ICONS: Record<string, any> = {
  CALL:    PhoneCall,
  EMAIL:   Send,
  MEETING: Calendar,
  TASK:    CheckSquare,
  NOTE:    MessageSquare,
  OTHER:   Clock,
}

function MetricCard({
  title, value, subtitle, icon: Icon, color,
}: {
  title:    string
  value:    string | number
  subtitle?: string
  icon:     any
  color:    string
}) {
  return (
    <div className="interactive-card p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-slate-500 font-bold text-sm tracking-tight">{title}</p>
        <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center border', color)}>
          <Icon size={18} strokeWidth={2.5}/>
        </div>
      </div>
      <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{value}</p>
      {subtitle && <p className="text-slate-400 font-medium text-xs mt-1.5">{subtitle}</p>}
    </div>
  )
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn:  () => dashboardApi.get().then((r) => r.data),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-primary-500" size={40} />
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      <ThemeToggle />
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Dashboard General</h1>
        <p className="text-slate-500 font-medium mt-1">Resumen de la actividad en tu CRM y rendimiento de ventas</p>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          title="Contactos"
          value={data.contacts.total}
          subtitle="Registrados en el CRM"
          icon={Users}
          color="bg-blue-50 text-blue-600 border-blue-100"
        />
        <MetricCard
          title="Leads abiertos"
          value={data.deals.total}
          subtitle="En pipelines activos"
          icon={KanbanSquare}
          color="bg-purple-50 text-purple-600 border-purple-100"
        />
        <MetricCard
          title="Valor en pipeline"
          value={`$${data.deals.pipelineValue.toLocaleString()}`}
          subtitle="Volumen total proyectado"
          icon={DollarSign}
          color="bg-emerald-50 text-emerald-600 border-emerald-100"
        />
        <MetricCard
          title="Actividades"
          value={data.recentActivities.length}
          subtitle="Últimas gestiones"
          icon={Activity}
          color="bg-orange-50 text-orange-600 border-orange-100"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Leads por etapa */}
        <div className="lg:col-span-2 interactive-card p-6">
          <h3 className="text-slate-900 font-bold mb-5 flex items-center gap-2 text-lg">
            <KanbanSquare size={20} className="text-primary-500" /> Rendimiento de Embudos (Leads por etapa)
          </h3>
          {data.deals.byStage.length === 0 ? (
            <div className="text-center py-10 bg-slate-50 border border-slate-200 border-dashed rounded-xl">
               <Layers size={36} className="text-slate-300 mx-auto mb-3" strokeWidth={1.5} />
               <p className="text-slate-500 font-medium">No hay leads todavía</p>
            </div>
          ) : (
            <div className="space-y-4">
              {data.deals.byStage.map((stage) => {
                const maxCount = Math.max(...data.deals.byStage.map((s) => s.count))
                const pct = maxCount > 0 ? (stage.count / maxCount) * 100 : 0
                return (
                  <div key={stage.stageId}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-3 h-3 rounded-full shadow-inner border border-black/5"
                          style={{ backgroundColor: stage.color }}
                        />
                        <span className="text-sm font-bold text-slate-800">{stage.stageName}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                          ${stage.value.toLocaleString()}
                        </span>
                        <span className="text-xs font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-md text-right min-w-[32px]">
                          {stage.count}
                        </span>
                      </div>
                    </div>
                    <div className="h-2 bg-slate-100 border border-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${pct}%`, backgroundColor: stage.color }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Contactos por estado */}
        <div className="interactive-card p-6 flex flex-col">
          <h3 className="text-slate-900 font-bold mb-5 flex items-center gap-2 text-lg">
             <Users size={20} className="text-primary-500" /> Estado de leads
          </h3>
          {data.contacts.byStatus.length === 0 ? (
            <div className="text-center py-10 bg-slate-50 border border-slate-200 border-dashed rounded-xl flex-1 flex flex-col justify-center">
                <Users size={36} className="text-slate-300 mx-auto mb-3" strokeWidth={1.5} />
                <p className="text-slate-500 font-medium pb-2">Sin contactos</p>
            </div>
          ) : (
            <div className="space-y-3 flex-1 overflow-y-auto pr-2">
              {data.contacts.byStatus.map((s) => (
                <div key={s.status} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50/50">
                  <span className={clsx(
                    'text-xs px-2.5 py-1 rounded-md font-bold uppercase tracking-wider',
                    STATUS_COLORS[s.status] ?? 'bg-slate-100 text-slate-600 border border-slate-200'
                  )}>
                    {s.status}
                  </span>
                  <span className="text-base text-slate-900 font-extrabold">{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Actividad reciente */}
        <div className="interactive-card p-6">
          <h3 className="text-slate-900 font-bold mb-5 flex items-center gap-2 text-lg">
             <Activity size={20} className="text-primary-500" /> Registro de actividades
          </h3>
          {data.recentActivities.length === 0 ? (
             <div className="text-center py-10 bg-slate-50 border border-slate-200 border-dashed rounded-xl">
                 <Clock size={36} className="text-slate-300 mx-auto mb-3" strokeWidth={1.5} />
                 <p className="text-slate-500 font-medium">Sin movimientos recientes</p>
             </div>
          ) : (
            <div className="space-y-4">
              {data.recentActivities.map((activity) => {
                const Icon = ACTIVITY_ICONS[activity.type] ?? Clock
                return (
                  <div key={activity.id} className="flex items-start gap-4 p-3 hover:bg-slate-50 rounded-xl transition-colors border border-transparent hover:border-slate-100">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                      <Icon size={16} className="text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-900 font-bold text-sm tracking-tight truncate">{activity.title}</p>
                      {activity.contactName && (
                        <p className="text-slate-500 font-medium text-xs mt-0.5">{activity.contactName}</p>
                      )}
                    </div>
                    <p className="text-slate-400 font-medium text-xs shrink-0 whitespace-nowrap bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                      {new Date(activity.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Contactos recientes */}
        <div className="interactive-card p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-slate-900 font-bold flex items-center gap-2 text-lg">
              <Users size={20} className="text-primary-500" /> Contactos recientes
            </h3>
            <Link
              href="/contacts"
              className="text-xs font-bold text-primary-600 hover:text-primary-700 hover:bg-primary-50 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-transparent hover:border-primary-100 transition-colors"
            >
              Ver agenda completa <ArrowRight size={14} />
            </Link>
          </div>
          {data.contacts.recent.length === 0 ? (
            <div className="text-center py-10 bg-slate-50 border border-slate-200 border-dashed rounded-xl">
                <Users size={36} className="text-slate-300 mx-auto mb-3" strokeWidth={1.5} />
                <p className="text-slate-500 font-medium">Todavía no has agregado contactos</p>
            </div>
          ) : (
             <div className="space-y-3">
              {data.contacts.recent.map((contact) => (
                <Link
                  key={contact.id}
                  href={`/contacts/${contact.id}`}
                  className="flex items-center gap-4 hover:bg-slate-50 rounded-xl p-3 transition-colors border border-slate-100 bg-white"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-slate-100 to-slate-200 border border-slate-300/50 flex items-center justify-center text-slate-600 font-bold text-sm shrink-0 shadow-sm">
                    {contact.firstName[0]}{contact.lastName?.[0] ?? ''}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-900 font-bold text-sm truncate tracking-tight">
                      {contact.firstName} {contact.lastName}
                    </p>
                    <p className="text-slate-500 font-medium text-xs mt-0.5 flex items-center gap-1.5">
                       <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span> {contact.status}
                    </p>
                  </div>
                  <div className="text-right flex flex-col items-end">
                      <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-400 mb-1">Score</span>
                      <span className={clsx(
                        'text-xs font-extrabold px-2 py-0.5 rounded-md border',
                        contact.score >= 70 ? 'bg-green-50 text-green-600 border-green-200' :
                        contact.score >= 40 ? 'bg-yellow-50 text-yellow-600 border-yellow-200' : 'bg-slate-100 text-slate-500 border-slate-200'
                      )}>
                        {contact.score}
                      </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
