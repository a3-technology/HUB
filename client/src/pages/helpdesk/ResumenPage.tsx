import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, LifeBuoy, UserX, Timer, Tag, Users, ShieldAlert, ShieldCheck } from 'lucide-react'
import { ticketsApi } from '../../lib/api'
import { SlaBadge } from '../../components/SlaBadge'
import { getSlaInfo, type SlaAwareTicket } from '../../lib/sla'

interface Ticket extends SlaAwareTicket {
  id: string
  code: string
  subject: string
  requesterName: string
  assignedToId?: string
  assignedToName?: string
  categoryName: string
  priorityName: string
  priorityColor: string
  status: string
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function daysOpen(createdAt: string): number {
  const created = new Date(createdAt)
  const today = new Date()
  created.setHours(0, 0, 0, 0); today.setHours(0, 0, 0, 0)
  return Math.round((today.getTime() - created.getTime()) / 86400000)
}

function fmtDuration(hours: number): string {
  if (hours <= 0) return '—'
  if (hours < 48) return `${Math.round(hours)}h`
  return `${Math.round(hours / 24)}d`
}

interface StatTileProps {
  label: string
  value: string | number
  icon: React.ElementType
  tone: 'neutral' | 'critical' | 'warning' | 'good'
}

function StatTile({ label, value, icon: Icon, tone }: StatTileProps) {
  const toneClasses = {
    neutral: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
    critical: 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400',
    warning: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400',
    good: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  }[tone]

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${toneClasses}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{label}</p>
      </div>
    </div>
  )
}

export function ResumenPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true)
    try {
      const res = await ticketsApi.list()
      if (res.ok) setTickets(await res.json())
    } finally {
      silent ? setRefreshing(false) : setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openTickets = useMemo(() => tickets.filter(t => !t.statusIsFinal), [tickets])

  // Sin responsable y todavía activos — el hueco operativo real: nada los asigna
  // automáticamente, dependen de que alguien los "tome" a mano.
  const unassignedTickets = useMemo(() =>
    openTickets
      .filter(t => !t.assignedToId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  [openTickets])

  // Tiempo promedio de resolución sobre todos los tickets que ya tienen fecha
  // de resolución (histórico completo, no solo el mes en curso).
  const avgResolutionHours = useMemo(() => {
    const resolved = tickets.filter(t => t.resolvedAt)
    if (resolved.length === 0) return 0
    const totalHours = resolved.reduce((sum, t) =>
      sum + (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()) / 3_600_000, 0)
    return totalHours / resolved.length
  }, [tickets])

  // SLA: solo tiene sentido sobre tickets cuya prioridad tiene un objetivo
  // configurado (resolutionDueAt != null) — el resto queda fuera de estos cálculos.
  const slaOpen = useMemo(() =>
    openTickets
      .map(t => ({ ticket: t, info: getSlaInfo(t) }))
      .filter((x): x is { ticket: Ticket; info: NonNullable<ReturnType<typeof getSlaInfo>> } => x.info !== null),
  [openTickets])

  const slaWarningTickets = useMemo(() => slaOpen.filter(x => x.info.tone === 'warning'), [slaOpen])
  const slaBreachedTickets = useMemo(() =>
    slaOpen.filter(x => x.info.tone === 'breach').sort((a, b) => a.ticket.resolutionDueAt!.localeCompare(b.ticket.resolutionDueAt!)),
  [slaOpen])

  // Cumplimiento histórico: de los tickets YA resueltos que tenían objetivo de
  // SLA, cuántos se resolvieron dentro del plazo.
  const slaCompliance = useMemo(() => {
    const withTarget = tickets.filter(t => t.resolvedAt && t.resolutionDueAt)
    if (withTarget.length === 0) return null
    const met = withTarget.filter(t => new Date(t.resolvedAt!).getTime() <= new Date(t.resolutionDueAt!).getTime()).length
    return Math.round((met / withTarget.length) * 100)
  }, [tickets])

  // Tickets en riesgo o vencidos, para actuar ya — incumplidos primero (más
  // atrasado primero), luego los que están por vencer.
  const slaRiskTickets = useMemo(() =>
    [...slaBreachedTickets, ...slaWarningTickets].slice(0, 10),
  [slaBreachedTickets, slaWarningTickets])

  // 4º card: cumplimiento histórico de SLA si hay tickets resueltos con
  // objetivo para calcularlo; si todavía no hay ninguno, cae a mostrar el
  // conteo de incumplidos activos (siempre calculable).
  const slaCard = slaCompliance !== null
    ? { label: 'Cumplimiento de SLA', value: `${slaCompliance}%`, icon: ShieldCheck,
        tone: (slaCompliance >= 90 ? 'good' : slaCompliance >= 70 ? 'warning' : 'critical') as StatTileProps['tone'] }
    : { label: 'SLA incumplido', value: slaBreachedTickets.length, icon: ShieldAlert,
        tone: (slaBreachedTickets.length > 0 ? 'critical' : 'good') as StatTileProps['tone'] }

  // Tickets abiertos por categoría — dónde se concentra la demanda.
  const byCategory = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of openTickets) counts.set(t.categoryName, (counts.get(t.categoryName) ?? 0) + 1)
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }, [openTickets])

  const maxCategory = Math.max(1, ...byCategory.map(c => c.count))

  // Carga por agente: tickets abiertos actualmente a su cargo.
  const workload = useMemo(() => {
    const byAgent = new Map<string, number>()
    for (const t of openTickets) {
      if (!t.assignedToName) continue
      byAgent.set(t.assignedToName, (byAgent.get(t.assignedToName) ?? 0) + 1)
    }
    return Array.from(byAgent.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  }, [openTickets])

  const maxWorkload = Math.max(1, ...workload.map(w => w.count))

  return (
    <div className="p-6 space-y-4">

      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Resumen</h1>
          <p className="text-sm text-slate-500 mt-0.5">Vista general de tickets de soporte</p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          title="Actualizar"
          className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-4 h-[68px] animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatTile label="Tickets abiertos" value={openTickets.length} icon={LifeBuoy} tone="neutral" />
            <StatTile label="Sin asignar" value={unassignedTickets.length} icon={UserX} tone={unassignedTickets.length > 0 ? 'critical' : 'good'} />
            <StatTile label="Tiempo prom. resolución" value={fmtDuration(avgResolutionHours)} icon={Timer} tone="neutral" />
            <StatTile label={slaCard.label} value={slaCard.value} icon={slaCard.icon} tone={slaCard.tone} />
          </div>

          {/* Tickets en riesgo o vencidos de SLA */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 px-5 pt-5 pb-4 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-red-500" />
              Tickets en riesgo o vencidos de SLA
            </h2>
            {slaRiskTickets.length === 0 ? (
              <p className="text-sm text-slate-400 pb-6 text-center">Ningún ticket abierto está en riesgo de incumplir su SLA. 🎉</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="border-t border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40">
                      <th className="text-left px-5 py-2.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Código</th>
                      <th className="text-left px-5 py-2.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Asunto</th>
                      <th className="text-left px-5 py-2.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Responsable</th>
                      <th className="text-center px-5 py-2.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Prioridad</th>
                      <th className="text-right px-5 py-2.5 text-xs font-bold text-slate-400 uppercase tracking-wider">SLA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slaRiskTickets.map(({ ticket: t }) => (
                      <tr key={t.id} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                        <td className="px-5 py-2.5 text-slate-500 dark:text-slate-400 font-mono text-xs">{t.code}</td>
                        <td className="px-5 py-2.5 text-slate-700 dark:text-slate-200">{t.subject}</td>
                        <td className="px-5 py-2.5 text-slate-500 dark:text-slate-400">{t.assignedToName ?? <span className="text-slate-300 dark:text-slate-600">Sin asignar</span>}</td>
                        <td className="px-5 py-2.5 text-center">
                          <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border" style={{ backgroundColor: `${t.priorityColor}1A`, borderColor: `${t.priorityColor}33`, color: t.priorityColor }}>
                            {t.priorityName}
                          </span>
                        </td>
                        <td className="px-5 py-2.5 text-right"><SlaBadge ticket={t} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Tickets abiertos por categoría */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-5">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-slate-400" />
                Abiertos por categoría
              </h2>
              {byCategory.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">No hay tickets abiertos.</p>
              ) : (
                <div className="space-y-3">
                  {byCategory.map(c => (
                    <div key={c.name}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm text-slate-600 dark:text-slate-300 truncate">{c.name}</span>
                        <span className="text-xs text-slate-400 shrink-0">{c.count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                        <div className="h-full bg-indigo-600 rounded-full transition-all" style={{ width: `${(c.count / maxCategory) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Carga por agente */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-5">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-slate-400" />
                Carga por agente
              </h2>
              {workload.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">No hay tickets asignados.</p>
              ) : (
                <div className="space-y-3">
                  {workload.map(w => (
                    <div key={w.name}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm text-slate-600 dark:text-slate-300 truncate">{w.name}</span>
                        <span className="text-xs text-slate-400 shrink-0">{w.count} ticket{w.count === 1 ? '' : 's'}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                        <div className="h-full bg-indigo-600 rounded-full transition-all" style={{ width: `${(w.count / maxWorkload) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tickets sin asignar */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 px-5 pt-5 pb-4 flex items-center gap-1.5">
              <UserX className="w-4 h-4 text-red-500" />
              Tickets sin asignar
            </h2>
            {unassignedTickets.length === 0 ? (
              <p className="text-sm text-slate-400 pb-6 text-center">No hay tickets sin asignar. 🎉</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="border-t border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40">
                      <th className="text-left px-5 py-2.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Código</th>
                      <th className="text-left px-5 py-2.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Asunto</th>
                      <th className="text-left px-5 py-2.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Solicitante</th>
                      <th className="text-left px-5 py-2.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Creado</th>
                      <th className="text-right px-5 py-2.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Días abierto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unassignedTickets.slice(0, 10).map(t => (
                      <tr key={t.id} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                        <td className="px-5 py-2.5 text-slate-500 dark:text-slate-400 font-mono text-xs">{t.code}</td>
                        <td className="px-5 py-2.5 text-slate-700 dark:text-slate-200">{t.subject}</td>
                        <td className="px-5 py-2.5 text-slate-500 dark:text-slate-400">{t.requesterName}</td>
                        <td className="px-5 py-2.5 text-slate-500 dark:text-slate-400">{fmtDate(t.createdAt)}</td>
                        <td className="px-5 py-2.5 text-right">
                          <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${
                            daysOpen(t.createdAt) >= 2
                              ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400'
                              : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          }`}>
                            {daysOpen(t.createdAt)}d
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
