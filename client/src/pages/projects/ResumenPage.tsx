import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, FolderKanban, ListTodo, AlertTriangle, CheckCircle2, TrendingUp, Users } from 'lucide-react'
import { projectsApi, tasksApi } from '../../lib/api'

interface Project {
  id: string
  code: string
  name: string
  isActive: boolean
}

interface Task {
  id: string
  projectId: string
  projectName: string
  projectCode: string
  name: string
  assignedToName?: string
  dueDate?: string
  status: string
  progressPercent: number
  isActive: boolean
}

function fmtDate(d?: string): string {
  return d ? new Date(d).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
}

function daysOverdue(dueDate: string): number {
  const due = new Date(dueDate)
  const today = new Date()
  due.setHours(0, 0, 0, 0); today.setHours(0, 0, 0, 0)
  return Math.round((today.getTime() - due.getTime()) / 86400000)
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
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks]       = useState<Task[]>([])
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true)
    try {
      const [projRes, taskRes] = await Promise.all([
        projectsApi.list({ active: true }),
        tasksApi.list({ active: true }),
      ])
      if (projRes.ok) setProjects(await projRes.json())
      if (taskRes.ok) setTasks(await taskRes.json())
    } finally {
      silent ? setRefreshing(false) : setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const overdueTasks = useMemo(() =>
    tasks
      .filter(t => t.dueDate && t.status !== 'Completed' && daysOverdue(t.dueDate!) > 0)
      .sort((a, b) => daysOverdue(b.dueDate!) - daysOverdue(a.dueDate!)),
  [tasks])

  const completedCount = tasks.filter(t => t.status === 'Completed').length
  const avgProgress = tasks.length ? Math.round(tasks.reduce((sum, t) => sum + t.progressPercent, 0) / tasks.length) : 0

  // Avance por proyecto: % de tareas completadas sobre el total, solo proyectos con al menos una tarea.
  const projectProgress = useMemo(() => {
    return projects
      .map(p => {
        const projTasks = tasks.filter(t => t.projectId === p.id)
        const done = projTasks.filter(t => t.status === 'Completed').length
        return { id: p.id, code: p.code, name: p.name, total: projTasks.length, done, percent: projTasks.length ? Math.round((done / projTasks.length) * 100) : 0 }
      })
      .filter(p => p.total > 0)
      .sort((a, b) => a.percent - b.percent)
  }, [projects, tasks])

  // Carga por persona: cantidad de tareas activas (no completadas) asignadas.
  const workload = useMemo(() => {
    const byPerson = new Map<string, number>()
    for (const t of tasks) {
      if (t.status === 'Completed' || !t.assignedToName) continue
      byPerson.set(t.assignedToName, (byPerson.get(t.assignedToName) ?? 0) + 1)
    }
    return Array.from(byPerson.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  }, [tasks])

  const maxWorkload = Math.max(1, ...workload.map(w => w.count))

  return (
    <div className="p-6 space-y-4">

      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Resumen</h1>
          <p className="text-sm text-slate-500 mt-0.5">Vista general de proyectos y tareas activas</p>
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
            <StatTile label="Proyectos activos" value={projects.length} icon={FolderKanban} tone="neutral" />
            <StatTile label="Tareas activas" value={tasks.length} icon={ListTodo} tone="neutral" />
            <StatTile label="Tareas vencidas" value={overdueTasks.length} icon={AlertTriangle} tone={overdueTasks.length > 0 ? 'critical' : 'good'} />
            <StatTile label="Completadas" value={completedCount} icon={CheckCircle2} tone="good" />
            <StatTile label="Progreso promedio" value={`${avgProgress}%`} icon={TrendingUp} tone="neutral" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Avance por proyecto */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-5">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4">Avance por proyecto</h2>
              {projectProgress.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">Sin proyectos con tareas registradas.</p>
              ) : (
                <div className="space-y-3">
                  {projectProgress.map(p => (
                    <div key={p.id}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm text-slate-600 dark:text-slate-300 truncate" title={`${p.code} — ${p.name}`}>{p.code} — {p.name}</span>
                        <span className="text-xs text-slate-400 shrink-0">{p.done}/{p.total} · {p.percent}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                        <div className="h-full bg-indigo-600 rounded-full transition-all" style={{ width: `${p.percent}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Carga por persona */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-5">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-slate-400" />
                Carga por persona
              </h2>
              {workload.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">No hay tareas asignadas.</p>
              ) : (
                <div className="space-y-3">
                  {workload.map(w => (
                    <div key={w.name}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm text-slate-600 dark:text-slate-300 truncate">{w.name}</span>
                        <span className="text-xs text-slate-400 shrink-0">{w.count} tarea{w.count === 1 ? '' : 's'}</span>
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

          {/* Tareas vencidas */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 px-5 pt-5 pb-4 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Tareas vencidas
            </h2>
            {overdueTasks.length === 0 ? (
              <p className="text-sm text-slate-400 pb-6 text-center">No hay tareas vencidas. 🎉</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="border-t border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40">
                      <th className="text-left px-5 py-2.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Tarea</th>
                      <th className="text-left px-5 py-2.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Proyecto</th>
                      <th className="text-left px-5 py-2.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Responsable</th>
                      <th className="text-left px-5 py-2.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Vencimiento</th>
                      <th className="text-right px-5 py-2.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Días vencida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overdueTasks.slice(0, 10).map(t => (
                      <tr key={t.id} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                        <td className="px-5 py-2.5 text-slate-700 dark:text-slate-200">{t.name}</td>
                        <td className="px-5 py-2.5 text-slate-500 dark:text-slate-400">{t.projectCode} — {t.projectName}</td>
                        <td className="px-5 py-2.5 text-slate-500 dark:text-slate-400">{t.assignedToName ?? 'Sin asignar'}</td>
                        <td className="px-5 py-2.5 text-slate-500 dark:text-slate-400">{fmtDate(t.dueDate)}</td>
                        <td className="px-5 py-2.5 text-right">
                          <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400">
                            {daysOverdue(t.dueDate!)}d
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
