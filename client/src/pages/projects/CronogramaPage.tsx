import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw, GanttChartSquare, ZoomIn, ZoomOut, CalendarClock, ChevronDown, Plus, Save, FileText, ListChecks, Paperclip } from 'lucide-react'
import { tasksApi, projectsApi, employeeDirectoryApi, resourcesApi, taskDependenciesApi } from '../../lib/api'
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
  startDate?: string
  dueDate?: string
  status: string
  priority: string
  progressPercent: number
  isActive: boolean
}

interface ProjectRef { id: string; code: string; name: string; startDate: string; endDate?: string }

interface TaskForm {
  name: string
  description: string
  assignedToId: string
  startDate: string
  dueDate: string
  status: string
  priority: string
  progressPercent: string
}

type ModalState =
  | { mode: 'edit'; task: Task }
  | { mode: 'create'; projectId: string; projectLabel: string }
  | null

const STATUS_LABEL: Record<string, string> = { Pending: 'Pendiente', InProgress: 'En progreso', Blocked: 'Bloqueada', Completed: 'Completada' }
/** Color sólido del tramo ya completado (progressPercent) de la barra. */
const BAR_COLOR: Record<string, string> = {
  Pending:    'bg-slate-400 dark:bg-slate-500',
  InProgress: 'bg-amber-500',
  Blocked:    'bg-red-500',
  Completed:  'bg-emerald-500',
}
/** Color tenue de "pista" (tramo pendiente) de la barra, para que el progreso resalte. */
const BAR_TRACK_COLOR: Record<string, string> = {
  Pending:    'bg-slate-200 dark:bg-slate-600/40',
  InProgress: 'bg-amber-200 dark:bg-amber-500/20',
  Blocked:    'bg-red-200 dark:bg-red-500/20',
  Completed:  'bg-emerald-200 dark:bg-emerald-500/20',
}

const STATUS_OPTIONS: SearchSelectOption[] = [
  { value: 'Pending',    label: 'Pendiente'   },
  { value: 'InProgress', label: 'En progreso' },
  { value: 'Blocked',    label: 'Bloqueada'   },
  { value: 'Completed',  label: 'Completada'  },
]
const PRIORITY_OPTIONS: SearchSelectOption[] = [
  { value: 'Low',    label: 'Baja'  },
  { value: 'Medium', label: 'Media' },
  { value: 'High',   label: 'Alta'  },
]

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DIAS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá']

function parseISODate(v: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  if (!m) return new Date(v)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}
function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000)
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
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

const LABEL_COL_W = 240

export function CronogramaPage() {
  const toast = useToast()

  const canCreate = usePermission('projects.tasks.create')
  const canUpdate = usePermission('projects.tasks.update')

  const [tasks, setTasks]           = useState<Task[]>([])
  const [projectList, setProjectList] = useState<ProjectRef[]>([])
  const [employees, setEmployees]   = useState<SearchSelectOption[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [projectFilter, setProjectFilter] = useState('')
  const [zoom, setZoom]             = useState<'week' | 'month'>('week')
  const [collapsed, setCollapsed]   = useState<Record<string, boolean>>({})
  const dayWidth = zoom === 'week' ? 36 : 12

  const projectOptions = useMemo(() => projectList.map(p => ({ value: p.id, label: `${p.code} — ${p.name}` })), [projectList])

  // Vista optimista de fechas mientras se arrastra una barra; se limpia al recargar.
  const [preview, setPreview] = useState<Record<string, { start: Date; due: Date }>>({})
  const dragRef = useRef<{ taskId: string; mode: 'move' | 'resize'; startX: number; origStart: Date; origDue: Date; lastStart: Date; lastDue: Date; minStart: Date; projMax: Date | null; moved: boolean } | null>(null)

  // Dependencias entre tareas (finish-to-start) de los proyectos visibles, para
  // pintar los conectores del Gantt y para bloquear el arrastre antes del fin
  // de la predecesora.
  const [dependencies, setDependencies] = useState<{ id: string; taskId: string; dependsOnTaskId: string }[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const barRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [connectorLines, setConnectorLines] = useState<{ key: string; x1: number; y1: number; x2: number; y2: number }[]>([])
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 })

  // Arrastre del fondo/encabezado para desplazar la línea de tiempo (las tareas no se mueven).
  const scrollRef = useRef<HTMLDivElement>(null)
  const panRef = useRef<{ startX: number; startScrollLeft: number } | null>(null)
  const didInitialScroll = useRef(false)

  // Arrastre sobre la fila fantasma de un proyecto para crear una tarea nueva.
  const [createPreview, setCreatePreview] = useState<{ projectId: string; from: number; to: number } | null>(null)
  const createDragRef = useRef<{ projectId: string; rectLeft: number; startIdx: number; from: number; to: number; minIdx: number; maxIdx: number } | null>(null)

  // Modal de crear/editar tarea desde el Gantt.
  const [modalState, setModalState] = useState<ModalState>(null)
  const [form, setForm]             = useState<TaskForm>({ name: '', description: '', assignedToId: '', startDate: '', dueDate: '', status: 'Pending', priority: 'Medium', progressPercent: '0' })
  const [formTab, setFormTab]       = useState<'detalles' | 'checklist' | 'adjuntos'>('detalles')
  const [formError, setFormError]   = useState<string | null>(null)
  const [saving, setSaving]         = useState(false)
  const { mounted: modalMounted, closing: modalClosing } = useModalTransition(!!modalState)

  const load = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true)
    try {
      const res = await tasksApi.list({ projectId: projectFilter || undefined, active: true })
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

  useEffect(() => { load() }, [projectFilter])
  useEffect(() => { loadOptions() }, [])

  useEffect(() => {
    const ids = projectFilter ? [projectFilter] : projectList.map(p => p.id)
    if (ids.length === 0) { setDependencies([]); return }
    let cancelled = false
    Promise.all(ids.map(id => taskDependenciesApi.listByProject(id))).then(async resList => {
      if (cancelled) return
      if (resList.some(r => !r.ok)) toast.error('No se pudieron cargar todas las dependencias entre tareas.')
      const chunks = await Promise.all(resList.map(r => (r.ok ? r.json() : [])))
      setDependencies(chunks.flat())
    })
    return () => { cancelled = true }
  }, [projectFilter, projectList])

  const scheduled = useMemo(() => tasks.filter(t => t.startDate && t.dueDate), [tasks])

  const groups = useMemo(() => {
    const list = projectFilter ? projectList.filter(p => p.id === projectFilter) : projectList
    return list
      .map(p => ({
        projectId: p.id, projectName: p.name, projectCode: p.code,
        tasks: scheduled.filter(t => t.projectId === p.id).sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? '')),
      }))
      .sort((a, b) => a.projectName.localeCompare(b.projectName))
  }, [projectList, projectFilter, scheduled])

  // El rango visible siempre cubre las fechas de inicio/fin de los proyectos mostrados
  // (no solo las de sus tareas), para que el Gantt no se "encoja" al primer rango con tareas.
  const { rangeStart, days } = useMemo(() => {
    const today = new Date()
    const starts: Date[] = []
    const ends: Date[] = []
    for (const g of groups) {
      const proj = projectList.find(p => p.id === g.projectId)
      if (proj) {
        starts.push(parseISODate(proj.startDate))
        ends.push(proj.endDate ? parseISODate(proj.endDate) : addDays(parseISODate(proj.startDate), 30))
      }
      for (const t of g.tasks) {
        starts.push(parseISODate(t.startDate!))
        ends.push(parseISODate(t.dueDate!))
      }
    }
    if (starts.length === 0) {
      return { rangeStart: addDays(today, -7), days: Array.from({ length: 30 }, (_, i) => addDays(addDays(today, -7), i)) }
    }
    let min = starts[0], max = ends[0]
    for (const d of starts) if (d < min) min = d
    for (const d of ends) if (d > max) max = d
    const start = addDays(min < today ? min : today, -3)
    const end = addDays(max > today ? max : today, 7)
    const total = Math.max(1, diffDays(end, start))
    return { rangeStart: start, days: Array.from({ length: total }, (_, i) => addDays(start, i)) }
  }, [groups, projectList])

  const timelineW = days.length * dayWidth
  const today = new Date()
  const todayOffset = diffDays(today, rangeStart)

  const dayIndexFromClientX = (clientX: number, rectLeft: number) => {
    const idx = Math.floor((clientX - rectLeft) / dayWidth)
    return Math.max(0, Math.min(days.length - 1, idx))
  }

  /** Índices [min,max] dentro de `days` que caen en el rango de fechas del proyecto. */
  const projectIndexBounds = (projectId: string) => {
    const proj = projectList.find(p => p.id === projectId)
    const minIdx = Math.max(0, proj ? diffDays(parseISODate(proj.startDate), rangeStart) : 0)
    const maxIdx = proj?.endDate ? Math.min(days.length - 1, diffDays(parseISODate(proj.endDate), rangeStart)) : days.length - 1
    return { minIdx, maxIdx: Math.max(minIdx, maxIdx) }
  }

  const monthSpans = useMemo(() => {
    const spans: { label: string; count: number }[] = []
    for (const d of days) {
      const label = `${MESES[d.getMonth()]} ${d.getFullYear()}`
      if (spans.length > 0 && spans[spans.length - 1].label === label) spans[spans.length - 1].count++
      else spans.push({ label, count: 1 })
    }
    return spans
  }, [days])

  const effectiveDates = (t: Task) => preview[t.id] ?? { start: parseISODate(t.startDate!), due: parseISODate(t.dueDate!) }

  const scrollToToday = () => {
    const el = scrollRef.current
    if (!el) return
    const target = LABEL_COL_W + todayOffset * dayWidth - (el.clientWidth - LABEL_COL_W) / 2
    el.scrollLeft = Math.max(0, target)
  }

  useEffect(() => {
    if (didInitialScroll.current || loading || days.length === 0) return
    didInitialScroll.current = true
    requestAnimationFrame(scrollToToday)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, days.length])

  // Recalcula los conectores de dependencia leyendo la posición real de las barras en
  // el DOM (vía refs), así no hay que reproducir a mano la aritmética de filas/colapsos.
  // useLayoutEffect (no useEffect+rAF): necesitamos medir el DOM ya actualizado antes
  // de que el navegador pinte, para no quedarnos con coordenadas de un render anterior.
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container || dependencies.length === 0) {
      setConnectorLines(prev => (prev.length === 0 ? prev : []))
      return
    }
    setSvgSize(prev => (prev.width === container.scrollWidth && prev.height === container.scrollHeight
      ? prev
      : { width: container.scrollWidth, height: container.scrollHeight }))
    const rect = container.getBoundingClientRect()
    const lines: { key: string; x1: number; y1: number; x2: number; y2: number }[] = []
    for (const dep of dependencies) {
      const fromEl = barRefs.current[dep.dependsOnTaskId]
      const toEl = barRefs.current[dep.taskId]
      if (!fromEl || !toEl) continue
      const fromRect = fromEl.getBoundingClientRect()
      const toRect = toEl.getBoundingClientRect()
      lines.push({
        key: dep.id,
        x1: fromRect.right - rect.left,
        y1: fromRect.top - rect.top + fromRect.height / 2,
        x2: toRect.left - rect.left,
        y2: toRect.top - rect.top + toRect.height / 2,
      })
    }
    // Evita re-render si el resultado es igual al anterior (protege contra loops si algún
    // valor de las dependencias del efecto cambiara de referencia sin cambiar de contenido).
    setConnectorLines(prev => {
      const same = prev.length === lines.length && prev.every((p, i) =>
        p.key === lines[i].key && p.x1 === lines[i].x1 && p.y1 === lines[i].y1 && p.x2 === lines[i].x2 && p.y2 === lines[i].y2)
      return same ? prev : lines
    })
  }, [dependencies, groups, collapsed, zoom, dayWidth, preview, days.length])

  // ── Pan: arrastrar el fondo / encabezado desplaza la línea de tiempo ────────

  const startPan = (e: React.PointerEvent) => {
    if (e.button > 0) return
    panRef.current = { startX: e.clientX, startScrollLeft: scrollRef.current?.scrollLeft ?? 0 }
    window.addEventListener('pointermove', onPanMove)
    window.addEventListener('pointerup', onPanEnd)
  }
  const onPanMove = (e: PointerEvent) => {
    const pan = panRef.current
    if (!pan || !scrollRef.current) return
    scrollRef.current.scrollLeft = pan.startScrollLeft - (e.clientX - pan.startX)
  }
  const onPanEnd = () => {
    panRef.current = null
    window.removeEventListener('pointermove', onPanMove)
    window.removeEventListener('pointerup', onPanEnd)
  }

  // ── Arrastrar una barra: reprograma la tarea. Clic sin arrastre: la edita ───

  const persistDates = async (t: Task, start: Date, due: Date) => {
    const payload = {
      projectId: t.projectId, name: t.name, description: t.description, assignedToId: t.assignedToId,
      startDate: toISODate(start), dueDate: toISODate(due), status: t.status, priority: t.priority, progressPercent: t.progressPercent,
    }
    const res = await tasksApi.update(t.id, payload)
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'No se pudo mover la tarea.' }))
      toast.error(err.message)
    }
    await load(true)
    setPreview(p => { const n = { ...p }; delete n[t.id]; return n })
  }

  const startDrag = (e: React.PointerEvent, t: Task, mode: 'move' | 'resize') => {
    e.preventDefault()
    e.stopPropagation()
    const { start, due } = effectiveDates(t)
    const proj = projectList.find(p => p.id === t.projectId)
    const projMin = proj ? parseISODate(proj.startDate) : start
    const projMax = proj?.endDate ? parseISODate(proj.endDate) : null

    // No puede iniciar antes de que termine (+1 día) su predecesora más tardía.
    let depMin: Date | null = null
    for (const dep of dependencies) {
      if (dep.taskId !== t.id) continue
      const pred = tasks.find(x => x.id === dep.dependsOnTaskId)
      if (!pred?.dueDate) continue
      const earliest = addDays(parseISODate(pred.dueDate), 1)
      if (!depMin || earliest > depMin) depMin = earliest
    }
    const minStart = depMin && depMin > projMin ? depMin : projMin

    dragRef.current = { taskId: t.id, mode, startX: e.clientX, origStart: start, origDue: due, lastStart: start, lastDue: due, minStart, projMax, moved: false }
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragEnd)
  }

  const onDragMove = (e: PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    if (Math.abs(e.clientX - drag.startX) > 3) drag.moved = true
    const deltaDays = Math.round((e.clientX - drag.startX) / dayWidth)
    if (drag.mode === 'move') {
      const duration = diffDays(drag.origDue, drag.origStart)
      let newStart = addDays(drag.origStart, deltaDays)
      if (newStart < drag.minStart) newStart = drag.minStart
      if (drag.projMax) {
        const maxStart = addDays(drag.projMax, -duration)
        if (newStart > maxStart) newStart = maxStart
      }
      const newDue = addDays(newStart, duration)
      drag.lastStart = newStart; drag.lastDue = newDue
      setPreview(p => ({ ...p, [drag.taskId]: { start: newStart, due: newDue } }))
    } else {
      let newDue = addDays(drag.origDue, deltaDays)
      if (newDue < drag.origStart) newDue = drag.origStart
      if (drag.projMax && newDue > drag.projMax) newDue = drag.projMax
      drag.lastStart = drag.origStart; drag.lastDue = newDue
      setPreview(p => ({ ...p, [drag.taskId]: { start: drag.origStart, due: newDue } }))
    }
  }

  const onDragEnd = () => {
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragEnd)
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    const t = tasks.find(x => x.id === drag.taskId)
    // Clic sin arrastre real de por medio (venga del cuerpo de la barra o del asa de
    // redimensionar): abre el detalle, sin importar si el cálculo de fechas cambió algo
    // (p. ej. por el ajuste al rango del proyecto).
    if (!drag.moved) {
      setPreview(p => { const n = { ...p }; delete n[drag.taskId]; return n })
      if (t) openEditModal(t)
      return
    }
    if (!t) { setPreview(p => { const n = { ...p }; delete n[drag.taskId]; return n }); return }
    const changed = toISODate(drag.lastStart) !== t.startDate || toISODate(drag.lastDue) !== t.dueDate
    if (!changed || !canUpdate) {
      setPreview(p => { const n = { ...p }; delete n[drag.taskId]; return n })
      return
    }
    persistDates(t, drag.lastStart, drag.lastDue)
  }

  // ── Arrastrar sobre la fila fantasma de un proyecto: crea una tarea ─────────

  const startCreateDrag = (e: React.PointerEvent<HTMLDivElement>, projectId: string) => {
    if (e.button > 0) return
    e.preventDefault()
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    const { minIdx, maxIdx } = projectIndexBounds(projectId)
    const idx = Math.max(minIdx, Math.min(maxIdx, dayIndexFromClientX(e.clientX, rect.left)))
    createDragRef.current = { projectId, rectLeft: rect.left, startIdx: idx, from: idx, to: idx, minIdx, maxIdx }
    setCreatePreview({ projectId, from: idx, to: idx })
    window.addEventListener('pointermove', onCreateMove)
    window.addEventListener('pointerup', onCreateEnd)
  }
  const onCreateMove = (e: PointerEvent) => {
    const d = createDragRef.current
    if (!d) return
    const idx = Math.max(d.minIdx, Math.min(d.maxIdx, dayIndexFromClientX(e.clientX, d.rectLeft)))
    d.from = Math.min(d.startIdx, idx); d.to = Math.max(d.startIdx, idx)
    setCreatePreview({ projectId: d.projectId, from: d.from, to: d.to })
  }
  const onCreateEnd = () => {
    window.removeEventListener('pointermove', onCreateMove)
    window.removeEventListener('pointerup', onCreateEnd)
    const d = createDragRef.current
    createDragRef.current = null
    setCreatePreview(null)
    if (!d) return
    openCreateModal(d.projectId, d.from, d.to)
  }

  const toggleCollapse = (projectId: string) => setCollapsed(c => ({ ...c, [projectId]: !c[projectId] }))

  // ── Modal de crear/editar tarea ──────────────────────────────────────────────

  const openEditModal = (t: Task) => {
    setModalState({ mode: 'edit', task: t })
    setForm({
      name: t.name, description: t.description ?? '', assignedToId: t.assignedToId ?? '',
      startDate: t.startDate!.slice(0, 10), dueDate: t.dueDate!.slice(0, 10),
      status: t.status, priority: t.priority, progressPercent: String(t.progressPercent),
    })
    setFormError(null); setFormTab('detalles')
  }

  const openCreateModal = (projectId: string, fromIdx: number, toIdx: number) => {
    const p = projectList.find(x => x.id === projectId)
    if (!p) return
    const startDate = toISODate(addDays(rangeStart, fromIdx))
    const dueDate = toISODate(addDays(rangeStart, toIdx))
    setModalState({ mode: 'create', projectId, projectLabel: `${p.code} — ${p.name}` })
    setForm({ name: '', description: '', assignedToId: '', startDate, dueDate, status: 'Pending', priority: 'Medium', progressPercent: '0' })
    setFormError(null); setFormTab('detalles')
  }

  const closeModal = () => { setModalState(null); setFormError(null) }

  const modalProjectId = modalState ? (modalState.mode === 'edit' ? modalState.task.projectId : modalState.projectId) : null
  const modalProject = modalProjectId ? projectList.find(p => p.id === modalProjectId) : undefined

  // Solo los miembros asignados al proyecto (pm.Resources) pueden elegirse como responsables.
  const [projectMembers, setProjectMembers] = useState<SearchSelectOption[]>([])
  useEffect(() => {
    if (!modalProjectId) { setProjectMembers([]); return }
    let cancelled = false
    resourcesApi.list({ projectId: modalProjectId, active: true }).then(async res => {
      if (!res.ok || cancelled) return
      const data: { employeeId: string }[] = await res.json()
      const ids = new Set(data.map(r => r.employeeId))
      setProjectMembers(employees.filter(e => ids.has(e.value)))
    })
    return () => { cancelled = true }
  }, [modalProjectId, employees])

  // Si la tarea ya tenía un responsable que ya no es miembro del proyecto, se conserva en la lista
  // para no perder el dato existente al editar.
  const assigneeOptions = form.assignedToId && !projectMembers.some(m => m.value === form.assignedToId)
    ? [...projectMembers, ...employees.filter(e => e.value === form.assignedToId)]
    : projectMembers

  const handleModalSave = async () => {
    if (!modalState) return
    if (!form.name.trim()) { setFormTab('detalles'); setFormError('El nombre es requerido.'); return }
    if (form.startDate && form.dueDate && form.dueDate < form.startDate) { setFormTab('detalles'); setFormError('La fecha límite no puede ser anterior a la fecha de inicio.'); return }
    setSaving(true); setFormError(null)
    try {
      const projectId = modalState.mode === 'edit' ? modalState.task.projectId : modalState.projectId
      const payload = {
        projectId,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        assignedToId: form.assignedToId || undefined,
        startDate: form.startDate || undefined,
        dueDate: form.dueDate || undefined,
        status: form.status,
        priority: form.priority,
        progressPercent: Number(form.progressPercent) || 0,
      }
      const res = modalState.mode === 'edit'
        ? await tasksApi.update(modalState.task.id, payload)
        : await tasksApi.create(payload)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar.' }))
        setFormTab('detalles'); setFormError(err.message); toast.error(err.message); return
      }
      toast.success(modalState.mode === 'edit' ? 'Tarea actualizada correctamente.' : 'Tarea creada correctamente.')
      closeModal(); await load()
    } finally { setSaving(false) }
  }

  return (
    <div className="p-6 space-y-4 flex flex-col h-[calc(100vh-6.5rem)]">

      {/* Encabezado */}
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Cronograma</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : `${scheduled.length} tarea(s) con fechas definidas`}
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
          <button
            onClick={scrollToToday}
            title="Ir a hoy"
            className="h-9 shrink-0 flex items-center gap-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <CalendarClock className="w-4 h-4" />
            Hoy
          </button>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 p-1 shrink-0">
            <button onClick={() => setZoom('week')} title="Zoom semana"
              className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${zoom === 'week' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
              <ZoomIn className="w-4 h-4" />
            </button>
            <button onClick={() => setZoom('month')} title="Zoom mes"
              className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${zoom === 'month' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
              <ZoomOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filtro de proyecto */}
      <div className="shrink-0 sm:w-64">
        <SearchSelect options={projectOptions} value={projectFilter} onChange={setProjectFilter} placeholder="Todos los proyectos" searchPlaceholder="Buscar proyecto…" />
      </div>

      {/* Gantt */}
      <div className="flex-1 min-h-0 flex flex-col bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {loading ? (
          <div className="p-16 text-center">
            <div className="w-6 h-6 border-2 border-slate-200 dark:border-slate-700 border-t-indigo-600 rounded-full animate-spin mx-auto" />
          </div>
        ) : groups.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <GanttChartSquare className="w-9 h-9 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No hay proyectos para mostrar en el cronograma.</p>
          </div>
        ) : (
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto select-none">
            <div ref={containerRef} className="relative" style={{ width: LABEL_COL_W + timelineW }}>

              {/* Conectores de dependencia entre tareas */}
              <svg style={{ position: 'absolute', top: 0, left: 0, width: svgSize.width, height: svgSize.height, pointerEvents: 'none' }} className="z-[5]">
                <defs>
                  <marker id="dep-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M0,0 L8,4 L0,8 Z" fill="rgb(99 102 241)" />
                  </marker>
                </defs>
                {connectorLines.map(l => {
                  const midX = l.x1 + Math.max(12, (l.x2 - l.x1) / 2)
                  return (
                    <path key={l.key}
                      d={`M ${l.x1} ${l.y1} L ${midX} ${l.y1} L ${midX} ${l.y2} L ${l.x2} ${l.y2}`}
                      fill="none" stroke="rgb(99 102 241)" strokeWidth="1.5" opacity="0.6" markerEnd="url(#dep-arrow)" />
                  )
                })}
              </svg>

              {/* Encabezado de meses */}
              <div className="flex border-b border-slate-100 dark:border-slate-700 sticky top-0 z-20 bg-white dark:bg-slate-800">
                <div style={{ width: LABEL_COL_W }} className="sticky left-0 z-20 bg-white dark:bg-slate-800 shrink-0 px-4 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider border-r border-slate-100 dark:border-slate-700">
                  Tarea
                </div>
                <div className="flex cursor-grab active:cursor-grabbing" onPointerDown={startPan}>
                  {monthSpans.map((m, i) => (
                    <div key={i} style={{ width: m.count * dayWidth }} className="shrink-0 px-2 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 border-r border-slate-100 dark:border-slate-700 truncate">
                      {m.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Encabezado de días (solo zoom semana) */}
              {zoom === 'week' && (
                <div className="flex border-b border-slate-100 dark:border-slate-700">
                  <div style={{ width: LABEL_COL_W }} className="sticky left-0 z-20 bg-white dark:bg-slate-800 shrink-0 border-r border-slate-100 dark:border-slate-700" />
                  <div className="flex cursor-grab active:cursor-grabbing" onPointerDown={startPan}>
                    {days.map((d, i) => (
                      <div key={i} style={{ width: dayWidth }}
                        className={`shrink-0 py-1 text-center text-[10px] leading-tight ${sameDay(d, today) ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-400'} ${d.getDay() === 0 || d.getDay() === 6 ? 'bg-slate-50 dark:bg-slate-900/30' : ''}`}>
                        <div>{DIAS[d.getDay()]}</div>
                        <div>{d.getDate()}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Filas por proyecto */}
              {groups.map(g => {
                const isCollapsed = !!collapsed[g.projectId]
                return (
                  <div key={g.projectId}>
                    <div className="flex bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
                      <div style={{ width: LABEL_COL_W }} className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-900/40 shrink-0 px-2 py-1.5 flex items-center gap-1 border-r border-slate-100 dark:border-slate-700 min-w-0">
                        <button onClick={() => toggleCollapse(g.projectId)} className="w-5 h-5 shrink-0 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors">
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                        </button>
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide truncate" title={`${g.projectCode} — ${g.projectName}`}>
                          {g.projectCode} — {g.projectName}
                        </span>
                      </div>
                      <div style={{ width: timelineW }} className="shrink-0 cursor-grab active:cursor-grabbing" onPointerDown={startPan} />
                    </div>

                    {!isCollapsed && g.tasks.map(t => {
                      const { start, due } = effectiveDates(t)
                      const offset = diffDays(start, rangeStart)
                      const duration = Math.max(1, diffDays(due, start) + 1)
                      return (
                        <div key={t.id} className="flex border-b border-slate-50 dark:border-slate-700/40 hover:bg-slate-50/50 dark:hover:bg-slate-700/10">
                          <div style={{ width: LABEL_COL_W }} className="sticky left-0 z-10 bg-white dark:bg-slate-800 shrink-0 px-4 py-2 border-r border-slate-100 dark:border-slate-700 min-w-0">
                            <p className="text-sm text-slate-700 dark:text-slate-200 truncate" title={t.name}>{t.name}</p>
                            <p className="text-[11px] text-slate-400 truncate">{t.assignedToName ?? 'Sin asignar'} · {STATUS_LABEL[t.status]}</p>
                          </div>
                          <div
                            className="relative shrink-0 cursor-grab active:cursor-grabbing"
                            onPointerDown={startPan}
                            style={{
                              width: timelineW,
                              height: 44,
                              backgroundImage: `repeating-linear-gradient(to right, rgba(148,163,184,0.18) 0, rgba(148,163,184,0.18) 1px, transparent 1px, transparent ${dayWidth}px)`,
                            }}
                          >
                            {todayOffset >= 0 && todayOffset < days.length && (
                              <div className="absolute top-0 bottom-0 w-px bg-indigo-400 pointer-events-none" style={{ left: todayOffset * dayWidth }} />
                            )}
                            <div
                              ref={el => { barRefs.current[t.id] = el }}
                              onPointerDown={e => startDrag(e, t, 'move')}
                              title={`${t.name}: ${toISODate(start)} → ${toISODate(due)} (${t.progressPercent}%) — clic para editar, arrastrar para mover`}
                              className={`absolute top-1.5 h-6 rounded-md ${BAR_TRACK_COLOR[t.status] ?? 'bg-slate-200'} cursor-grab active:cursor-grabbing shadow-sm overflow-hidden select-none`}
                              style={{ left: offset * dayWidth, width: Math.max(dayWidth, duration * dayWidth) - 2 }}
                            >
                              <div className={`h-full ${BAR_COLOR[t.status] ?? 'bg-slate-400'}`} style={{ width: `${t.progressPercent}%` }} />
                              {Math.max(dayWidth, duration * dayWidth) - 2 >= 30 && (
                                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-slate-800 dark:text-slate-100 pointer-events-none [text-shadow:0_1px_1px_rgba(255,255,255,0.6)] dark:[text-shadow:0_1px_1px_rgba(0,0,0,0.6)]">
                                  {t.progressPercent}%
                                </span>
                              )}
                              {canUpdate && (
                                <div
                                  onPointerDown={e => startDrag(e, t, 'resize')}
                                  className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40"
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}

                    {/* Fila fantasma: botón o arrastre sobre el timeline crean una tarea nueva en este proyecto */}
                    {!isCollapsed && canCreate && (
                      <div className="flex border-b border-dashed border-slate-200 dark:border-slate-700">
                        <button
                          type="button"
                          onClick={() => {
                            const { minIdx, maxIdx } = projectIndexBounds(g.projectId)
                            const from = Math.max(minIdx, Math.min(maxIdx, todayOffset))
                            const to = Math.max(minIdx, Math.min(maxIdx, todayOffset + 3))
                            openCreateModal(g.projectId, from, to)
                          }}
                          style={{ width: LABEL_COL_W }}
                          className="sticky left-0 z-10 bg-white dark:bg-slate-800 shrink-0 px-4 py-1.5 border-r border-slate-100 dark:border-slate-700 flex items-center gap-1.5 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50/60 dark:hover:bg-indigo-500/10 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span className="text-xs font-medium">Nueva tarea</span>
                        </button>
                        <div
                          onPointerDown={e => startCreateDrag(e, g.projectId)}
                          title="Arrastra para elegir las fechas, o usa el botón Nueva tarea"
                          className="relative shrink-0 cursor-crosshair hover:bg-indigo-50/40 dark:hover:bg-indigo-500/5"
                          style={{ width: timelineW, height: 26 }}
                        >
                          {createPreview && createPreview.projectId === g.projectId && (
                            <div
                              className="absolute top-1 bottom-1 rounded bg-indigo-400/50 border border-indigo-500 pointer-events-none"
                              style={{ left: createPreview.from * dayWidth, width: (createPreview.to - createPreview.from + 1) * dayWidth - 2 }}
                            />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modal crear / editar tarea */}
      {modalMounted && modalState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${modalClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden ${modalClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <div className="px-6 pt-6 shrink-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">
                {modalState.mode === 'edit' ? 'Editar Tarea' : 'Nueva Tarea'}
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                {modalState.mode === 'edit'
                  ? `${modalState.task.projectCode} — ${modalState.task.projectName}`
                  : modalState.projectLabel}
              </p>
              {modalState.mode === 'edit' && (
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
              {(modalState.mode === 'create' || formTab === 'detalles') && (
                <div className="space-y-4">
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
                    <SearchSelect options={assigneeOptions} value={form.assignedToId} onChange={v => setForm(f => ({ ...f, assignedToId: v }))} placeholder="Selecciona un miembro del proyecto…" searchPlaceholder="Buscar empleado…" emptyLabel="Este proyecto no tiene miembros asignados." showAvatar />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Fecha inicio</label>
                      <DatePicker value={form.startDate} onChange={v => setForm(f => ({ ...f, startDate: v }))} minDate={modalProject?.startDate} maxDate={minISO(modalProject?.endDate, form.dueDate)} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Fecha límite</label>
                      <DatePicker value={form.dueDate} onChange={v => setForm(f => ({ ...f, dueDate: v }))} minDate={maxISO(modalProject?.startDate, form.startDate)} maxDate={modalProject?.endDate} />
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

              {modalState.mode === 'edit' && formTab === 'checklist' && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Checklist</h3>
                    <TaskChecklist taskId={modalState.task.id} />
                  </div>
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Dependencias</h3>
                    <TaskDependencies taskId={modalState.task.id} projectId={modalState.task.projectId} />
                  </div>
                </div>
              )}
              {modalState.mode === 'edit' && formTab === 'adjuntos' && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Adjuntos</h3>
                    <TaskAttachments taskId={modalState.task.id} />
                  </div>
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Comentarios</h3>
                    <TaskComments taskId={modalState.task.id} />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button onClick={closeModal} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              {(modalState.mode === 'edit' ? canUpdate : canCreate) && (
                <button onClick={handleModalSave} disabled={saving}
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
    </div>
  )
}
