import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Users, FileClock, TreePalm, Stethoscope, Briefcase, Building2 } from 'lucide-react'
import { employeesApi, employeeContractsApi, vacationsApi, leavesApi, vacanciesApi } from '../../lib/api'

interface Employee {
  id: string
  departmentName: string
  isActive: boolean
}

interface EmployeeContract {
  id: string
  employeeName: string
  contractTypeName: string
  endDate?: string
  expiresInDays?: number
}

interface VacationRequest {
  id: string
  employeeName: string
  departmentName: string
  startDate: string
  endDate: string
  requestedDays: number
}

interface EmployeeLeave {
  id: string
  employeeName: string
  leaveTypeName: string
  startDate: string
  endDate: string
}

interface Vacancy {
  id: string
  title: string
  departmentName: string
  openingsCount: number
  applicationCount: number
}

function fmtDate(d?: string): string {
  return d ? new Date(d).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
}

interface StatTileProps {
  label: string
  value: string | number
  icon: React.ElementType
  tone: 'neutral' | 'critical' | 'good'
}

function StatTile({ label, value, icon: Icon, tone }: StatTileProps) {
  const toneClasses = {
    neutral: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
    critical: 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400',
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
  const [employees, setEmployees]           = useState<Employee[]>([])
  const [expiringContracts, setExpiringContracts] = useState<EmployeeContract[]>([])
  const [pendingVacations, setPendingVacations]   = useState<VacationRequest[]>([])
  const [activeLeaves, setActiveLeaves]      = useState<EmployeeLeave[]>([])
  const [openVacancies, setOpenVacancies]    = useState<Vacancy[]>([])
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true)
    try {
      const [empRes, contractRes, vacationRes, leaveRes, vacancyRes] = await Promise.all([
        employeesApi.list(),
        employeeContractsApi.list(undefined, 'Active', 30),
        vacationsApi.listRequests('Pending'),
        leavesApi.list('Active'),
        vacanciesApi.list('Open'),
      ])
      if (empRes.ok) setEmployees(await empRes.json())
      if (contractRes.ok) setExpiringContracts(await contractRes.json())
      if (vacationRes.ok) setPendingVacations(await vacationRes.json())
      if (leaveRes.ok) setActiveLeaves(await leaveRes.json())
      if (vacancyRes.ok) setOpenVacancies(await vacancyRes.json())
    } finally {
      silent ? setRefreshing(false) : setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const activeEmployees = useMemo(() => employees.filter(e => e.isActive), [employees])

  // Empleados activos por departamento, de mayor a menor.
  const byDepartment = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of activeEmployees) {
      counts.set(e.departmentName, (counts.get(e.departmentName) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }, [activeEmployees])

  const maxDepartment = Math.max(1, ...byDepartment.map(d => d.count))

  const sortedExpiringContracts = useMemo(() =>
    [...expiringContracts].sort((a, b) => (a.expiresInDays ?? 0) - (b.expiresInDays ?? 0)),
  [expiringContracts])

  return (
    <div className="p-6 space-y-4">

      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Resumen</h1>
          <p className="text-sm text-slate-500 mt-0.5">Vista general de personal, contratos y ausencias</p>
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
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-4 h-[68px] animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            <StatTile label="Empleados activos" value={activeEmployees.length} icon={Users} tone="neutral" />
            <StatTile label="Contratos por vencer (30d)" value={expiringContracts.length} icon={FileClock} tone={expiringContracts.length > 0 ? 'critical' : 'good'} />
            <StatTile label="Vacaciones pendientes" value={pendingVacations.length} icon={TreePalm} tone={pendingVacations.length > 0 ? 'critical' : 'good'} />
            <StatTile label="Ausencias activas" value={activeLeaves.length} icon={Stethoscope} tone="neutral" />
            <StatTile label="Vacantes abiertas" value={openVacancies.length} icon={Briefcase} tone="neutral" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Empleados por departamento */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-5">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-slate-400" />
                Empleados por departamento
              </h2>
              {byDepartment.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">No hay empleados activos.</p>
              ) : (
                <div className="space-y-3">
                  {byDepartment.map(d => (
                    <div key={d.name}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm text-slate-600 dark:text-slate-300 truncate">{d.name}</span>
                        <span className="text-xs text-slate-400 shrink-0">{d.count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                        <div className="h-full bg-indigo-600 rounded-full transition-all" style={{ width: `${(d.count / maxDepartment) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Vacaciones pendientes de aprobación */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-5">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-1.5">
                <TreePalm className="w-4 h-4 text-slate-400" />
                Vacaciones pendientes de aprobación
              </h2>
              {pendingVacations.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">No hay solicitudes pendientes.</p>
              ) : (
                <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                  {pendingVacations.map(v => (
                    <div key={v.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-600 dark:text-slate-300 truncate">{v.employeeName}</p>
                        <p className="text-xs text-slate-400 truncate">{fmtDate(v.startDate)} – {fmtDate(v.endDate)}</p>
                      </div>
                      <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                        {v.requestedDays} día{v.requestedDays === 1 ? '' : 's'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Contratos próximos a vencer */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 px-5 pt-5 pb-4 flex items-center gap-1.5">
              <FileClock className="w-4 h-4 text-red-500" />
              Contratos próximos a vencer
            </h2>
            {sortedExpiringContracts.length === 0 ? (
              <p className="text-sm text-slate-400 pb-6 text-center">No hay contratos por vencer en los próximos 30 días. 🎉</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="border-t border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40">
                      <th className="text-left px-5 py-2.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Empleado</th>
                      <th className="text-left px-5 py-2.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Tipo de contrato</th>
                      <th className="text-left px-5 py-2.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Vencimiento</th>
                      <th className="text-right px-5 py-2.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Días restantes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedExpiringContracts.slice(0, 10).map(c => (
                      <tr key={c.id} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                        <td className="px-5 py-2.5 text-slate-700 dark:text-slate-200">{c.employeeName}</td>
                        <td className="px-5 py-2.5 text-slate-500 dark:text-slate-400">{c.contractTypeName}</td>
                        <td className="px-5 py-2.5 text-slate-500 dark:text-slate-400">{fmtDate(c.endDate)}</td>
                        <td className="px-5 py-2.5 text-right">
                          <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${
                            (c.expiresInDays ?? 0) <= 7
                              ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400'
                              : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          }`}>
                            {c.expiresInDays ?? 0}d
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
