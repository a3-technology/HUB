import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Pencil, ToggleLeft, ToggleRight, RefreshCw, ListTodo, Save, Trash2, List, Kanban, User, CalendarDays, AlertTriangle, FileText, ListChecks, Paperclip } from 'lucide-react'
import { tasksApi, projectsApi, employeeDirectoryApi, resourcesApi } from '../../lib/api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Pagination, usePagination, type PageSize } from '../../components/Pagination'
import { SearchSelect, type SearchSelectOption } from '../../components/SearchSelect'
import { DatePicker } from '../../components/DatePicker'
import { TabsScroller } from '../../components/TabsScroller'
import { TaskDependencies } from '../../components/TaskDependencies'
import { TaskComments } from '../../components/TaskComments'
import { TaskAttachments } from '../../components/TaskAttachments'
import { TaskChecklist } from '../../components/TaskChecklist'
import { useToast } from '../../context/ToastContext'
import { useModalTransition } from '../../hooks/useModalTransition'
import { usePermission } from '../../hooks/usePermission'

interface Task {
  id: string
  projectId: string
  projectName: string
  projectCode: string
  name: string
  description?: string
  assignedToId?: string
  assignedToName?: string
  assignedToPhotoUrl?: string
  startDate?: string
  dueDate?: string
  status: string
  priority: string
  progressPercent: number
  isActive: boolean
  createdAt: string
}

interface ProjectRef {
  id: string
  code: string
  name: string
  startDate: string
  endDate?: string
}

interface TaskForm {
  projectId: string
  name: string
  description: string
  assignedToId: string
  startDate: string
  dueDate: string
  status: string
  priority: string
  progressPercent: string
}

const EMPTY_FORM: TaskForm = { projectId: '', name: '', description: '', assignedToId: '', startDate: '', dueDate: '', status: 'Pending', priority: 'Medium', progressPercent: '0' }

const VIEW_MODE_KEY = 'projects_tareas_view_mode'
function loadViewMode(): 'list' | 'kanban' {
  return localStorage.getItem(VIEW_MODE_KEY) === 'kanban' ? 'kanban' : 'list'
}

const STATUS_OPTIONS: SearchSelectOption[] = [
  { value: 'Pending',    label: 'Pendiente'    },
  { value: 'InProgress', label: 'En progreso'  },
  { value: 'Blocked',    label: 'Bloqueada'    },
  { value: 'Completed',  label: 'Completada'   },
]

/** Orden de columnas del Kanban: Bloqueada al final, para no interrumpir el flujo Pendiente → Completada. */
const KANBAN_COLUMNS: SearchSelectOption[] = [
  STATUS_OPTIONS[0], STATUS_OPTIONS[1], STATUS_OPTIONS[3], STATUS_OPTIONS[2],
]

const PRIORITY_OPTIONS: SearchSelectOption[] = [
  { value: 'Low',    label: 'Baja'  },
  { value: 'Medium', label: 'Media' },
  { value: 'High',   label: 'Alta'  },
]

const STATUS_STYLES: Record<string, string> = {
  Pending:    'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600',
  InProgress: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-500/20',
  Blocked:    'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-100 dark:border-red-500/20',
  Completed:  'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20',
}

/** Fondo de cada columna del Kanban, un tono muy tenue del color de su estado. */
const STATUS_COLUMN_BG: Record<string, string> = {
  Pending:    'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700',
  InProgress: 'bg-amber-50/60 dark:bg-amber-500/[0.06] border-amber-100 dark:border-amber-500/20',
  Blocked:    'bg-red-50/60 dark:bg-red-500/[0.06] border-red-100 dark:border-red-500/20',
  Completed:  'bg-emerald-50/60 dark:bg-emerald-500/[0.06] border-emerald-100 dark:border-emerald-500/20',
}

const PRIORITY_STYLES: Record<string, string> = {
  Low:    'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400',
  Medium: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  High:   'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400',
}

function optionLabel(options: SearchSelectOption[], value: string) {
  return options.find(o => o.value === value)?.label ?? value
}

/** Iniciales del responsable a partir de su nombre completo (p. ej. "Lester Díaz" → "LD"). */
function initials(name?: string) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
}

/** Avatar del responsable de la tarea: muestra su foto si existe; si no, sus iniciales. */
function AssigneeAvatar({ name, photoUrl }: { name?: string; photoUrl?: string }) {
  return photoUrl ? (
    <img
      src={photoUrl}
      alt={name}
      className="w-5 h-5 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700"
    />
  ) : (
    <div className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[9px] font-bold shrink-0">
      {initials(name)}
    </div>
  )
}

/** Fecha ISO más tardía/temprana entre las dadas, ignorando las vacías; usadas para combinar límites de fecha. */
function maxISO(...dates: (string | undefined)[]): string | undefined {
  const valid = dates.filter((d): d is string => !!d)
  return valid.length ? valid.reduce((a, b) => (a > b ? a : b)) : undefined
}
function minISO(...dates: (string | undefined)[]): string | undefined {
  const valid = dates.filter((d): d is string => !!d)
  return valid.length ? valid.reduce((a, b) => (a < b ? a : b)) : undefined
}

export function TareasPage() {
  const toast = useToast()

  const canCreate = usePermission('projects.tasks.create')
  const canUpdate = usePermission('projects.tasks.update')
  const canToggle = usePermission('projects.tasks.toggle')
  const canDelete = usePermission('projects.tasks.delete')

  const [tasks, setTasks]         = useState<Task[]>([])
  const [projectList, setProjectList] = useState<ProjectRef[]>([])
  const [employees, setEmployees] = useState<SearchSelectOption[]>([])
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch]       = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [page, setPage]           = useState(1)
  const [pageSize, setPageSize]   = useState<PageSize>(10)
  const [viewMode, setViewModeState] = useState<'list' | 'kanban'>(loadViewMode)
  const setViewMode = (mode: 'list' | 'kanban') => { setViewModeState(mode); localStorage.setItem(VIEW_MODE_KEY, mode) }
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [mineOnly, setMineOnly]     = useState(false)
  const [overdueOnly, setOverdueOnly] = useState(false)

  const [modalOpen, setModalOpen]       = useState(false)
  const [editing, setEditing]           = useState<Task | null>(null)
  const [form, setForm]                 = useState<TaskForm>(EMPTY_FORM)
  const [formTab, setFormTab]           = useState<'detalles' | 'checklist' | 'adjuntos'>('detalles')
  const [formError, setFormError]       = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)
  const [toggleTarget, setToggleTarget] = useState<Task | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null)
  const { mounted: modalMounted, closing: modalClosing } = useModalTransition(modalOpen)

  const load = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true)
    try {
      const res = await tasksApi.list({ mine: mineOnly })
      if (res.ok) setTasks(await res.json())
    } finally {
      silent ? setRefreshing(false) : setLoading(false)
    }
  }

  const loadOptions = async () => {
    const [projRes, empRes] = await Promise.all([projectsApi.list(), employeeDirectoryApi.list()])
    if (projRes.ok) setProjectList(await projRes.json())
    if (empRes.ok) {
      const data = await empRes.json()
      setEmployees(data.map((e: { id: string; firstName: string; lastName: string; photoUrl?: string }) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, photoUrl: e.photoUrl })))
    }
  }

  useEffect(() => { load() }, [mineOnly])
  useEffect(() => { loadOptions() }, [])

  const projectOptions = useMemo(() => projectList.map(p => ({ value: p.id, label: `${p.code} — ${p.name}` })), [projectList])
  const selectedProject = projectList.find(p => p.id === form.projectId)

  // Solo los miembros asignados al proyecto (pm.Resources) pueden elegirse como responsables.
  const [projectMembers, setProjectMembers] = useState<SearchSelectOption[]>([])
  useEffect(() => {
    if (!form.projectId) { setProjectMembers([]); return }
    let cancelled = false
    resourcesApi.list({ projectId: form.projectId, active: true }).then(async res => {
      if (!res.ok || cancelled) return
      const data: { employeeId: string }[] = await res.json()
      const ids = new Set(data.map(r => r.employeeId))
      setProjectMembers(employees.filter(e => ids.has(e.value)))
    })
    return () => { cancelled = true }
  }, [form.projectId, employees])

  // Si la tarea ya tenía un responsable que ya no es miembro del proyecto, se conserva en la lista
  // para no perder el dato existente al editar.
  const assigneeOptions = form.assignedToId && !projectMembers.some(m => m.value === form.assignedToId)
    ? [...projectMembers, ...employees.filter(e => e.value === form.assignedToId)]
    : projectMembers

  const handleSearch = (value: string) => { setSearch(value); setPage(1) }

  const todayISO = new Date().toISOString().slice(0, 10)
  const isOverdue = (t: Task) => !!t.dueDate && t.dueDate.slice(0, 10) < todayISO && t.status !== 'Completed'

  const filtered = tasks
    .filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    .filter(t => !projectFilter || t.projectId === projectFilter)
    .filter(t => !overdueOnly || isOverdue(t))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const paginated = usePagination(filtered, page, pageSize)
  const overdueCount = tasks.filter(isOverdue).length

  const toFormDate = (d?: string) => d ? d.slice(0, 10) : ''

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY_FORM, projectId: projectFilter }); setFormError(null); setFormTab('detalles'); setModalOpen(true) }
  const openEdit   = (t: Task) => {
    setEditing(t)
    setForm({
      projectId: t.projectId, name: t.name, description: t.description ?? '', assignedToId: t.assignedToId ?? '',
      startDate: toFormDate(t.startDate), dueDate: toFormDate(t.dueDate), status: t.status, priority: t.priority,
      progressPercent: String(t.progressPercent),
    })
    setFormError(null); setFormTab('detalles'); setModalOpen(true)
  }
  const closeModal = () => { setModalOpen(false); setEditing(null); setFormError(null) }

  const handleSave = async () => {
    if (!form.projectId) { setFormTab('detalles'); setFormError('El proyecto es requerido.'); return }
    if (!form.name.trim()) { setFormTab('detalles'); setFormError('El nombre es requerido.'); return }
    if (form.startDate && form.dueDate && form.dueDate < form.startDate) { setFormTab('detalles'); setFormError('La fecha límite no puede ser anterior a la fecha de inicio.'); return }
    setSaving(true); setFormError(null)
    try {
      const payload = {
        projectId: form.projectId,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        assignedToId: form.assignedToId || undefined,
        startDate: form.startDate || undefined,
        dueDate: form.dueDate || undefined,
        status: form.status,
        priority: form.priority,
        progressPercent: Number(form.progressPercent) || 0,
      }
      const res = editing
        ? await tasksApi.update(editing.id, payload)
        : await tasksApi.create(payload)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar.' }))
        setFormTab('detalles'); setFormError(err.message); toast.error(err.message); return
      }
      toast.success(editing ? 'Tarea actualizada correctamente.' : 'Tarea creada correctamente.')
      closeModal(); await load()
    } finally { setSaving(false) }
  }

  const handleToggle = async () => {
    if (!toggleTarget) return
    const wasActive = toggleTarget.isActive
    try {
      const res = await tasksApi.toggle(toggleTarget.id)
      if (res.ok) { toast.success(wasActive ? 'Tarea desactivada.' : 'Tarea activada.'); await load() }
      else toast.error('No se pudo cambiar el estado de la tarea.')
    } finally { setToggleTarget(null) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await tasksApi.remove(deleteTarget.id)
      if (res.ok) { toast.success('Tarea eliminada correctamente.'); await load() }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar la tarea.' }))
        toast.error(err.message)
      }
    } finally { setDeleteTarget(null) }
  }

  const globalIndex = (i: number) =>
    pageSize === 'all' ? i + 1 : (page - 1) * (pageSize as number) + i + 1

  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

  /** Suelta una tarjeta en una columna del Kanban: cambia el estado, con reversión si falla. */
  const handleDrop = async (status: string) => {
    const taskId = draggedId
    setDraggedId(null)
    if (!taskId || !canUpdate) return
    const task = tasks.find(t => t.id === taskId)
    if (!task || task.status === status) return
    const prevStatus = task.status
    setTasks(ts => ts.map(t => (t.id === taskId ? { ...t, status } : t)))
    const payload = {
      projectId: task.projectId, name: task.name, description: task.description, assignedToId: task.assignedToId,
      startDate: task.startDate, dueDate: task.dueDate, status, priority: task.priority, progressPercent: task.progressPercent,
    }
    const res = await tasksApi.update(taskId, payload)
    if (!res.ok) {
      setTasks(ts => ts.map(t => (t.id === taskId ? { ...t, status: prevStatus } : t)))
      const err = await res.json().catch(() => ({ message: 'No se pudo mover la tarea.' }))
      toast.error(err.message)
    }
  }

  return (
    <div className="p-6 space-y-4">

      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Tareas</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : `${tasks.length} tarea(s) registrada(s)`}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            title="Actualizar"
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 p-1 shrink-0">
            <button
              onClick={() => setViewMode('list')}
              title="Vista de lista"
              className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
                viewMode === 'list' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              title="Vista Kanban"
              className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
                viewMode === 'kanban' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <Kanban className="w-4 h-4" />
            </button>
          </div>
          {canCreate && (
            <button
              onClick={openCreate}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nueva Tarea
            </button>
          )}
        </div>
      </div>

      {/* Búsqueda + filtro de proyecto */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1 min-w-0 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por nombre de tarea…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
          />
        </div>
        <div className="sm:w-64 shrink-0">
          <SearchSelect options={projectOptions} value={projectFilter} onChange={v => { setProjectFilter(v); setPage(1) }} placeholder="Todos los proyectos" searchPlaceholder="Buscar proyecto…" />
        </div>
        <button
          onClick={() => { setMineOnly(v => !v); setPage(1) }}
          title="Mostrar solo mis tareas"
          className={`h-9 shrink-0 flex items-center gap-1.5 px-3 rounded-lg border text-sm font-medium transition-colors ${
            mineOnly
              ? 'bg-indigo-600 border-indigo-600 text-white'
              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <User className="w-4 h-4" />
          Mis tareas
        </button>
        <button
          onClick={() => { setOverdueOnly(v => !v); setPage(1) }}
          title="Mostrar solo tareas vencidas"
          className={`h-9 shrink-0 flex items-center gap-1.5 px-3 rounded-lg border text-sm font-medium transition-colors ${
            overdueOnly
              ? 'bg-red-600 border-red-600 text-white'
              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Vencidas{overdueCount > 0 ? ` (${overdueCount})` : ''}
        </button>
      </div>

      {/* Tabla */}
      {viewMode === 'list' && (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider w-12">#</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Tarea</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Proyecto</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Responsable</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Fechas</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Prioridad</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider w-32">Progreso</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Estado</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50 dark:border-slate-700/40">
                    {[8, 40, 32, 32, 28, 16, 24, 16, 20].map((w, j) => (
                      <td key={j} className="px-5 py-2">
                        <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" style={{ width: `${w * 4}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-16 text-center">
                    <ListTodo className="w-9 h-9 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">
                      {search || projectFilter ? 'Sin resultados para el filtro aplicado.' : 'No hay tareas registradas.'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginated.map((t, i) => (
                  <tr
                    key={t.id}
                    className="border-b border-slate-50 dark:border-slate-700/40 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition-colors"
                  >
                    <td className="px-5 py-2 text-xs text-slate-400 dark:text-slate-500 font-medium text-center align-middle">
                      {globalIndex(i)}
                    </td>
                    <td className="px-5 py-2 text-left align-middle">
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{t.name}</p>
                    </td>
                    <td className="px-5 py-2 text-slate-600 dark:text-slate-300 text-left align-middle">
                      {t.projectCode} — {t.projectName}
                    </td>
                    <td className="px-5 py-2 text-slate-600 dark:text-slate-300 text-left align-middle">
                      {t.assignedToName ?? <span className="text-slate-300 dark:text-slate-600">Sin asignar</span>}
                    </td>
                    <td className={`px-5 py-2 text-left align-middle text-xs ${isOverdue(t) ? 'text-red-500 dark:text-red-400 font-medium' : 'text-slate-500 dark:text-slate-400'}`}>
                      {fmtDate(t.startDate)} — {fmtDate(t.dueDate)}
                      {isOverdue(t) && <AlertTriangle className="w-3 h-3 inline-block ml-1 -mt-0.5" />}
                    </td>
                    <td className="px-5 py-2 text-center align-middle">
                      <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${PRIORITY_STYLES[t.priority] ?? ''}`}>
                        {optionLabel(PRIORITY_OPTIONS, t.priority)}
                      </span>
                    </td>
                    <td className="px-5 py-2 align-middle">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                          <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${t.progressPercent}%` }} />
                        </div>
                        <span className="text-xs text-slate-400 w-8 text-right shrink-0">{t.progressPercent}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-2 text-center align-middle">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_STYLES[t.status] ?? ''}`}>
                        {optionLabel(STATUS_OPTIONS, t.status)}
                      </span>
                    </td>
                    <td className="px-5 py-2 align-middle">
                      <div className="flex items-center justify-center gap-0.5">
                        {canUpdate && (
                          <button
                            onClick={() => openEdit(t)}
                            title="Editar"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canToggle && (
                          <button
                            onClick={() => setToggleTarget(t)}
                            title={t.isActive ? 'Desactivar' : 'Activar'}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                              t.isActive
                                ? 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
                                : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                            }`}
                          >
                            {t.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setDeleteTarget(t)}
                            title="Eliminar"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length > 0 && (
          <Pagination total={filtered.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
        )}
      </div>
      )}

      {/* Kanban */}
      {viewMode === 'kanban' && (
        loading ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-16 text-center">
            <div className="w-6 h-6 border-2 border-slate-200 dark:border-slate-700 border-t-indigo-600 rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
            {KANBAN_COLUMNS.map(col => {
              const colTasks = filtered.filter(t => t.status === col.value)
              return (
                <div
                  key={col.value}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => handleDrop(col.value)}
                  className={`rounded-xl border flex flex-col ${STATUS_COLUMN_BG[col.value] ?? 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700'}`}
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700 shrink-0">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{col.label}</span>
                    <span className="text-xs font-medium text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-2 py-0.5">{colTasks.length}</span>
                  </div>
                  <div className="p-2.5 space-y-2.5 min-h-[80px]">
                    {colTasks.length === 0 ? (
                      <p className="text-xs text-slate-300 dark:text-slate-600 text-center py-6">Sin tareas</p>
                    ) : colTasks.map(t => (
                      <div
                        key={t.id}
                        draggable={canUpdate}
                        onDragStart={() => setDraggedId(t.id)}
                        onDragEnd={() => setDraggedId(null)}
                        onClick={() => openEdit(t)}
                        className={`group bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow transition-shadow relative ${draggedId === t.id ? 'opacity-40' : ''}`}
                      >
                        {canDelete && (
                          <button
                            onClick={e => { e.stopPropagation(); setDeleteTarget(t) }}
                            onMouseDown={e => e.stopPropagation()}
                            draggable={false}
                            title="Eliminar tarea"
                            className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-md text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <div className="flex items-start justify-between gap-2 mb-1.5 pr-6">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 line-clamp-2">{t.name}</p>
                          <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${PRIORITY_STYLES[t.priority] ?? ''}`}>
                            {optionLabel(PRIORITY_OPTIONS, t.priority)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate mb-2">{t.projectCode} — {t.projectName}</p>
                        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                          <span className="flex items-center gap-1.5 min-w-0 truncate">
                            {t.assignedToName
                              ? <AssigneeAvatar name={t.assignedToName} photoUrl={t.assignedToPhotoUrl} />
                              : <User className="w-3 h-3 shrink-0" />}
                            {t.assignedToName ?? 'Sin asignar'}
                          </span>
                          {t.dueDate && (
                            <span className={`flex items-center gap-1 shrink-0 ${isOverdue(t) ? 'text-red-500 dark:text-red-400 font-medium' : ''}`}>
                              {isOverdue(t) ? <AlertTriangle className="w-3 h-3" /> : <CalendarDays className="w-3 h-3" />}
                              {fmtDate(t.dueDate)}
                            </span>
                          )}
                        </div>
                        {t.progressPercent > 0 && (
                          <div className="flex items-center gap-2 mt-2">
                            <div className="flex-1 h-1 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                              <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${t.progressPercent}%` }} />
                            </div>
                            <span className="text-[11px] text-slate-400 shrink-0">{t.progressPercent}%</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* Modal crear / editar */}
      {modalMounted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${modalClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden ${modalClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <div className="px-6 pt-6 shrink-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
                {editing ? 'Editar Tarea' : 'Nueva Tarea'}
              </h2>
              {editing && (
                <TabsScroller tone="modal">
                  {([
                    { key: 'detalles',     label: 'Detalles',              icon: FileText },
                    { key: 'checklist',    label: 'Checklist y Dependencias', icon: ListChecks },
                    { key: 'adjuntos',     label: 'Adjuntos y Comentarios', icon: Paperclip },
                  ] as const).map(t => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setFormTab(t.key)}
                      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                        formTab === t.key
                          ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                          : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                      }`}
                    >
                      <t.icon className="w-4 h-4" />
                      {t.label}
                    </button>
                  ))}
                </TabsScroller>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
              {(!editing || formTab === 'detalles') && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Proyecto <span className="text-red-500">*</span></label>
                    <SearchSelect options={projectOptions} value={form.projectId} onChange={v => setForm(f => ({ ...f, projectId: v, assignedToId: v === f.projectId ? f.assignedToId : '' }))} placeholder="Selecciona un proyecto…" searchPlaceholder="Buscar proyecto…" />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2 space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre <span className="text-red-500">*</span></label>
                      <input type="text" maxLength={200} placeholder="Ej: Levantamiento de requerimientos" value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Estado</label>
                      <SearchSelect options={STATUS_OPTIONS} value={form.status} onChange={v => setForm(f => ({ ...f, status: v }))} placeholder="Selecciona…" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Descripción</label>
                    <textarea rows={3} maxLength={1000} placeholder="Detalle de la tarea…" value={form.description}
                      onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Responsable</label>
                    <SearchSelect options={assigneeOptions} value={form.assignedToId} onChange={v => setForm(f => ({ ...f, assignedToId: v }))} placeholder={form.projectId ? 'Selecciona un miembro del proyecto…' : 'Primero selecciona un proyecto…'} searchPlaceholder="Buscar empleado…" emptyLabel="Este proyecto no tiene miembros asignados." showAvatar />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Fecha inicio</label>
                      <DatePicker value={form.startDate} onChange={v => setForm(f => ({ ...f, startDate: v }))} minDate={selectedProject?.startDate} maxDate={minISO(selectedProject?.endDate, form.dueDate)} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Fecha límite</label>
                      <DatePicker value={form.dueDate} onChange={v => setForm(f => ({ ...f, dueDate: v }))} minDate={maxISO(selectedProject?.startDate, form.startDate)} maxDate={selectedProject?.endDate} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Prioridad</label>
                      <SearchSelect options={PRIORITY_OPTIONS} value={form.priority} onChange={v => setForm(f => ({ ...f, priority: v }))} placeholder="Selecciona…" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Progreso ({form.progressPercent}%)</label>
                    <input type="range" min={0} max={100} step={5} value={form.progressPercent}
                      onChange={e => setForm(f => ({ ...f, progressPercent: e.target.value }))}
                      className="w-full accent-indigo-600" />
                  </div>

                  {formError && (
                    <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                      {formError}
                    </div>
                  )}
                </div>
              )}

              {editing && formTab === 'checklist' && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Checklist</h3>
                    <TaskChecklist taskId={editing.id} />
                  </div>
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Dependencias</h3>
                    <TaskDependencies taskId={editing.id} projectId={editing.projectId} />
                  </div>
                </div>
              )}
              {editing && formTab === 'adjuntos' && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Adjuntos</h3>
                    <TaskAttachments taskId={editing.id} />
                  </div>
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Comentarios</h3>
                    <TaskComments taskId={editing.id} />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button onClick={closeModal} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              {(editing ? canUpdate : canCreate) && (
                <button onClick={handleSave} disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                  {saving
                    ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    : <Save className="w-3.5 h-3.5" />}
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!toggleTarget}
        title={toggleTarget?.isActive ? '¿Desactivar tarea?' : '¿Activar tarea?'}
        message={
          toggleTarget?.isActive
            ? `La tarea "${toggleTarget.name}" será desactivada.`
            : `La tarea "${toggleTarget?.name}" volverá a estar disponible.`
        }
        confirmLabel={toggleTarget?.isActive ? 'Sí, desactivar' : 'Sí, activar'}
        cancelLabel="Cancelar"
        onConfirm={handleToggle}
        onCancel={() => setToggleTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar tarea?"
        message={`La tarea "${deleteTarget?.name}" se eliminará permanentemente. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
