import { useEffect, useState } from 'react'
import { X, Link2, AlertTriangle } from 'lucide-react'
import { taskDependenciesApi, tasksApi } from '../lib/api'
import { SearchSelect, type SearchSelectOption } from './SearchSelect'
import { useToast } from '../context/ToastContext'
import { usePermission } from '../hooks/usePermission'

interface Dependency {
  id: string
  taskId: string
  dependsOnTaskId: string
  dependsOnTaskName: string
  dependsOnStartDate?: string
  dependsOnDueDate?: string
  dependsOnStatus?: string
}

interface TaskDependenciesProps {
  taskId: string
  projectId: string
}

const STATUS_LABEL: Record<string, string> = { Pending: 'Pendiente', InProgress: 'En progreso', Blocked: 'Bloqueada', Completed: 'Completada' }

/**
 * Lista y gestiona los predecesores (dependencias finish-to-start) de una
 * tarea existente. Cada alta/baja se persiste de inmediato contra el
 * backend, a diferencia del formulario padre que se guarda con "Guardar".
 */
export function TaskDependencies({ taskId, projectId }: TaskDependenciesProps) {
  const toast = useToast()
  const canCreate = usePermission('projects.tasks.dependency-create')
  const canDelete = usePermission('projects.tasks.dependency-delete')
  const [dependencies, setDependencies] = useState<Dependency[]>([])
  const [candidates, setCandidates]     = useState<SearchSelectOption[]>([])
  const [loading, setLoading]           = useState(true)
  const [adding, setAdding]             = useState(false)
  const [selected, setSelected]         = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [depRes, taskRes] = await Promise.all([
        taskDependenciesApi.listByTask(taskId),
        tasksApi.list({ projectId, active: true }),
      ])
      const deps: Dependency[] = depRes.ok ? await depRes.json() : []
      setDependencies(deps)
      if (taskRes.ok) {
        const allTasks: { id: string; name: string }[] = await taskRes.json()
        const excluded = new Set([taskId, ...deps.map(d => d.dependsOnTaskId)])
        setCandidates(allTasks.filter(t => !excluded.has(t.id)).map(t => ({ value: t.id, label: t.name })))
      }
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [taskId, projectId])

  const handleAdd = async (dependsOnTaskId: string) => {
    if (!dependsOnTaskId) return
    setAdding(true)
    try {
      const res = await taskDependenciesApi.create(taskId, dependsOnTaskId)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'No se pudo agregar la dependencia.' }))
        toast.error(err.message); return
      }
      setSelected('')
      await load()
    } finally { setAdding(false) }
  }

  const handleRemove = async (dep: Dependency) => {
    const res = await taskDependenciesApi.remove(dep.id)
    if (res.ok) await load()
    else toast.error('No se pudo eliminar la dependencia.')
  }

  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit' }) : '—'

  return (
    <div className="space-y-2.5">
      {loading ? (
        <div className="h-8 bg-slate-100 dark:bg-slate-700 rounded-lg animate-pulse" />
      ) : dependencies.length === 0 ? (
        <p className="text-xs text-slate-400">Esta tarea no depende de ninguna otra.</p>
      ) : (
        <div className="space-y-1.5">
          {dependencies.map(dep => (
            <div key={dep.id} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-lg px-3 py-2">
              <Link2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{dep.dependsOnTaskName}</p>
                <p className="text-[11px] text-slate-400">
                  {fmtDate(dep.dependsOnStartDate)} → {fmtDate(dep.dependsOnDueDate)} · {STATUS_LABEL[dep.dependsOnStatus ?? ''] ?? dep.dependsOnStatus}
                </p>
              </div>
              {canDelete && (
                <button onClick={() => handleRemove(dep)} title="Quitar dependencia"
                  className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!canCreate ? null : candidates.length > 0 ? (
        <SearchSelect
          options={candidates}
          value={selected}
          onChange={v => { setSelected(v); handleAdd(v) }}
          placeholder={adding ? 'Agregando…' : 'Agregar tarea predecesora…'}
          searchPlaceholder="Buscar tarea…"
          clearable={false}
        />
      ) : !loading && (
        <p className="text-xs text-slate-300 dark:text-slate-600 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />
          No hay más tareas en este proyecto para elegir como predecesoras.
        </p>
      )}
    </div>
  )
}
