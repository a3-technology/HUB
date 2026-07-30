import { useEffect, useState } from 'react'
import type { jsPDF as JsPDF } from 'jspdf'
import {
  FolderKanban, TrendingUp, AlertTriangle, Users, ListChecks, UserCog, FileDown, FileText,
} from 'lucide-react'
import { projectsApi, tasksApi, resourcesApi } from '../../lib/api'
import { loadJsPdf, PAGE, drawReportHeader, layoutColumns, drawReportTable, drawGeneratedFooter, loadCompanyHeaderData, drawCompanyHeader, type CompanyHeaderData } from '../../lib/pdfReport'
import { DateRangePicker } from '../../components/DateRangePicker'
import { useToast } from '../../context/ToastContext'

interface Project {
  id: string
  code: string
  name: string
  managerName?: string
  startDate: string
  endDate?: string
  status: string
  budget?: number
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
  priority: string
  progressPercent: number
  isActive: boolean
  createdAt: string
}

interface Resource {
  id: string
  projectName: string
  projectCode: string
  employeeName: string
  employeeCode: string
  isActive: boolean
  createdAt: string
}

interface BuiltReport {
  pdf: JsPDF
  filename: string
}

interface ReportDef {
  key: string
  title: string
  description: string
  icon: React.ElementType
  usesDateRange: boolean
  build: (from: string, to: string) => Promise<BuiltReport>
}

/** true si dateIso cae dentro de [from, to] (extremos vacíos = sin límite en ese lado). */
function inRange(dateIso: string, from: string, to: string): boolean {
  const d = new Date(dateIso).getTime()
  if (from && d < new Date(from).getTime()) return false
  if (to && d > new Date(`${to}T23:59:59`).getTime()) return false
  return true
}

function rangeLabel(from: string, to: string): string {
  if (!from && !to) return 'Todo el historial'
  const fmt = (d: string) => new Date(d).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  if (from && to) return `Del ${fmt(from)} al ${fmt(to)}`
  if (from) return `Desde el ${fmt(from)}`
  return `Hasta el ${fmt(to)}`
}

const PROJECT_STATUS_LABEL: Record<string, string> = {
  Planned: 'Planificado', InProgress: 'En progreso', OnHold: 'En pausa', Completed: 'Completado', Cancelled: 'Cancelado',
}
const TASK_STATUS_LABEL: Record<string, string> = {
  Pending: 'Pendiente', InProgress: 'En progreso', Blocked: 'Bloqueada', Completed: 'Completada',
}
const TASK_PRIORITY_LABEL: Record<string, string> = {
  Low: 'Baja', Medium: 'Media', High: 'Alta',
}

function fmtDate(d?: string): string {
  return d ? new Date(d).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
}

function fmtMoney(n?: number): string {
  return n === undefined || n === null ? '—' : n.toLocaleString('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 })
}

function daysOverdue(dueDate: string): number {
  const due = new Date(dueDate)
  const today = new Date()
  due.setHours(0, 0, 0, 0); today.setHours(0, 0, 0, 0)
  return Math.round((today.getTime() - due.getTime()) / 86400000)
}

export function ReportesPage() {
  const toast = useToast()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [currentDoc, setCurrentDoc] = useState<BuiltReport | null>(null)

  // Libera la URL del blob anterior cada vez que se reemplaza (y al desmontar).
  useEffect(() => {
    return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl) }
  }, [pdfUrl])

  const [companyHeader, setCompanyHeader] = useState<CompanyHeaderData | null>(null)
  // Se carga una sola vez (no por cada reporte generado) — nunca lanza, si falla el PDF sale sin encabezado de empresa.
  useEffect(() => { loadCompanyHeaderData().then(setCompanyHeader) }, [])

  const buildDoc = async (orientation: 'portrait' | 'landscape') => {
    const jsPDF = await loadJsPdf()
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation })
    const { marginX, rightX } = PAGE[orientation]
    const startY = drawCompanyHeader(pdf, companyHeader, marginX, rightX) || 40
    return { pdf, startY }
  }

  const loadProjects = async (): Promise<Project[]> => {
    const res = await projectsApi.list()
    return res.ok ? await res.json() : []
  }
  const loadTasks = async (): Promise<Task[]> => {
    const res = await tasksApi.list()
    return res.ok ? await res.json() : []
  }
  const loadResources = async (): Promise<Resource[]> => {
    const res = await resourcesApi.list()
    return res.ok ? await res.json() : []
  }

  // ── 1. Resumen general de proyectos ───────────────────────────────────────
  const buildResumenGeneral = async (f: string, t: string): Promise<BuiltReport> => {
    const all = await loadProjects()
    const projects = all.filter(p => inRange(p.startDate, f, t))
    const byStatus = Object.entries(
      projects.reduce<Record<string, number>>((acc, p) => {
        acc[p.status] = (acc[p.status] ?? 0) + 1
        return acc
      }, {}),
    ).map(([status, count]) => ({ label: PROJECT_STATUS_LABEL[status] ?? status, count }))
    const activeCount = projects.filter(p => p.isActive).length
    const totalBudget = projects.reduce((s, p) => s + (p.budget ?? 0), 0)

    const { marginX, rightX, pageBottom } = PAGE.portrait
    const { pdf, startY } = await buildDoc('portrait')
    let y = drawReportHeader(pdf, 'Resumen general de proyectos', `${rangeLabel(f, t)} · proyectos según su fecha de inicio`, rightX, startY)

    pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(11); pdf.setTextColor(79, 70, 229)
    pdf.text(`Total: ${projects.length} · Activos: ${activeCount} · Presupuesto total: ${fmtMoney(totalBudget)}`, marginX, y)
    y += 24

    pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(11); pdf.setTextColor(15, 23, 42)
    pdf.text('Por estado', marginX, y)
    y += 12
    const columns = layoutColumns(marginX, rightX, [
      { label: '', weight: 3 },
      { label: 'Cantidad', weight: 1, align: 'right' },
    ])
    y = drawReportTable(pdf, {
      columns, rows: byStatus.map(r => [r.label, String(r.count)]),
      startY: y, marginX, rightX, pageBottom,
    })

    drawGeneratedFooter(pdf, y, marginX)
    return { pdf, filename: `Resumen_general_proyectos_${Date.now()}.pdf` }
  }

  // ── 2. Proyectos y su avance ───────────────────────────────────────────────
  const buildProyectosAvance = async (f: string, t: string): Promise<BuiltReport> => {
    const [allProjects, tasks] = await Promise.all([loadProjects(), loadTasks()])
    const projects = allProjects.filter(p => inRange(p.startDate, f, t))

    const { marginX, rightX, pageBottom } = PAGE.landscape
    const { pdf, startY } = await buildDoc('landscape')
    let y = drawReportHeader(pdf, 'Proyectos y su avance', `${rangeLabel(f, t)} · proyectos según su fecha de inicio`, rightX, startY)

    const columns = layoutColumns(marginX, rightX, [
      { label: 'Código', weight: 8 },
      { label: 'Nombre', weight: 20 },
      { label: 'Gerente', weight: 16 },
      { label: 'Estado', weight: 12 },
      { label: 'Inicio', weight: 10 },
      { label: 'Fin', weight: 10 },
      { label: 'Tareas', weight: 8, align: 'right' },
      { label: '% Avance', weight: 10, align: 'right' },
    ])
    const rows = projects
      .sort((a, b) => a.code.localeCompare(b.code))
      .map(p => {
        const projTasks = tasks.filter(t => t.projectId === p.id)
        const done = projTasks.filter(t => t.status === 'Completed').length
        const percent = projTasks.length ? Math.round((done / projTasks.length) * 100) : 0
        return [
          p.code, p.name, p.managerName ?? 'Sin asignar', PROJECT_STATUS_LABEL[p.status] ?? p.status,
          fmtDate(p.startDate), fmtDate(p.endDate), String(projTasks.length), `${percent}%`,
        ]
      })

    y = drawReportTable(pdf, { columns, rows, startY: y, marginX, rightX, pageBottom })
    drawGeneratedFooter(pdf, y, marginX)
    return { pdf, filename: `Proyectos_avance_${Date.now()}.pdf` }
  }

  // ── 3. Tareas vencidas ─────────────────────────────────────────────────────
  const buildTareasVencidas = async (): Promise<BuiltReport> => {
    const tasks = await loadTasks()
    const overdue = tasks
      .filter(t => t.dueDate && t.status !== 'Completed' && daysOverdue(t.dueDate) > 0)
      .sort((a, b) => daysOverdue(b.dueDate!) - daysOverdue(a.dueDate!))

    const { marginX, rightX, pageBottom } = PAGE.landscape
    const { pdf, startY } = await buildDoc('landscape')
    let y = drawReportHeader(pdf, 'Tareas vencidas', `${overdue.length} tarea(s) vencida(s) al momento de generar el reporte`, rightX, startY)

    const columns = layoutColumns(marginX, rightX, [
      { label: 'Tarea', weight: 22 },
      { label: 'Proyecto', weight: 18 },
      { label: 'Responsable', weight: 16 },
      { label: 'Prioridad', weight: 10 },
      { label: 'Vencimiento', weight: 12 },
      { label: 'Días vencida', weight: 10, align: 'right' },
    ])
    const rows = overdue.map(t => [
      t.name, `${t.projectCode} — ${t.projectName}`, t.assignedToName ?? 'Sin asignar',
      TASK_PRIORITY_LABEL[t.priority] ?? t.priority, fmtDate(t.dueDate), String(daysOverdue(t.dueDate!)),
    ])

    y = drawReportTable(pdf, { columns, rows, startY: y, marginX, rightX, pageBottom })
    drawGeneratedFooter(pdf, y, marginX)
    return { pdf, filename: `Tareas_vencidas_${Date.now()}.pdf` }
  }

  // ── 4. Carga de trabajo por persona ───────────────────────────────────────
  const buildCargaPorPersona = async (): Promise<BuiltReport> => {
    const tasks = await loadTasks()
    const byPerson = new Map<string, { active: number; completed: number }>()
    for (const t of tasks) {
      if (!t.assignedToName) continue
      const entry = byPerson.get(t.assignedToName) ?? { active: 0, completed: 0 }
      if (t.status === 'Completed') entry.completed += 1
      else entry.active += 1
      byPerson.set(t.assignedToName, entry)
    }
    const rows = Array.from(byPerson.entries())
      .map(([name, c]) => ({ name, ...c, total: c.active + c.completed }))
      .sort((a, b) => b.active - a.active)

    const { marginX, rightX, pageBottom } = PAGE.portrait
    const { pdf, startY } = await buildDoc('portrait')
    let y = drawReportHeader(pdf, 'Carga de trabajo por persona', `${rows.length} persona(s) con tareas asignadas`, rightX, startY)

    const columns = layoutColumns(marginX, rightX, [
      { label: 'Persona', weight: 3 },
      { label: 'Tareas activas', weight: 2, align: 'right' },
      { label: 'Completadas', weight: 2, align: 'right' },
      { label: 'Total', weight: 2, align: 'right' },
    ])
    const tableRows = rows.map(r => [r.name, String(r.active), String(r.completed), String(r.total)])

    y = drawReportTable(pdf, { columns, rows: tableRows, startY: y, marginX, rightX, pageBottom })
    drawGeneratedFooter(pdf, y, marginX)
    return { pdf, filename: `Carga_por_persona_${Date.now()}.pdf` }
  }

  // ── 5. Tareas por prioridad y estado ───────────────────────────────────────
  const buildTareasPrioridadEstado = async (f: string, t: string): Promise<BuiltReport> => {
    const all = await loadTasks()
    const tasks = all.filter(task => inRange(task.createdAt, f, t))
    const byStatus = Object.entries(
      tasks.reduce<Record<string, number>>((acc, task) => { acc[task.status] = (acc[task.status] ?? 0) + 1; return acc }, {}),
    ).map(([status, count]) => ({ label: TASK_STATUS_LABEL[status] ?? status, count }))
    const byPriority = Object.entries(
      tasks.reduce<Record<string, number>>((acc, task) => { acc[task.priority] = (acc[task.priority] ?? 0) + 1; return acc }, {}),
    ).map(([priority, count]) => ({ label: TASK_PRIORITY_LABEL[priority] ?? priority, count }))

    const { marginX, rightX, pageBottom } = PAGE.portrait
    const { pdf, startY } = await buildDoc('portrait')
    let y = drawReportHeader(pdf, 'Tareas por prioridad y estado', `${rangeLabel(f, t)} · tareas según su fecha de creación`, rightX, startY)

    pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(11); pdf.setTextColor(79, 70, 229)
    pdf.text(`Total de tareas: ${tasks.length}`, marginX, y)
    y += 24

    const section = (title: string, rows: { label: string; count: number }[]) => {
      pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(11); pdf.setTextColor(15, 23, 42)
      pdf.text(title, marginX, y)
      y += 12
      const columns = layoutColumns(marginX, rightX, [
        { label: '', weight: 3 },
        { label: 'Cantidad', weight: 1, align: 'right' },
      ])
      y = drawReportTable(pdf, {
        columns, rows: rows.map(r => [r.label, String(r.count)]),
        startY: y, marginX, rightX, pageBottom,
      })
      y += 26
    }

    section('Por estado', byStatus)
    section('Por prioridad', byPriority)

    drawGeneratedFooter(pdf, y, marginX)
    return { pdf, filename: `Tareas_prioridad_estado_${Date.now()}.pdf` }
  }

  // ── 6. Asignación de recursos por proyecto ────────────────────────────────
  const buildAsignacionRecursos = async (f: string, t: string): Promise<BuiltReport> => {
    const resources = await loadResources()
    const active = resources.filter(r => r.isActive && inRange(r.createdAt, f, t))

    const { marginX, rightX, pageBottom } = PAGE.portrait
    const { pdf, startY } = await buildDoc('portrait')
    let y = drawReportHeader(pdf, 'Asignación de recursos por proyecto', `${rangeLabel(f, t)} · ${active.length} asignación(es) activa(s) según su fecha de alta`, rightX, startY)

    const columns = layoutColumns(marginX, rightX, [
      { label: 'Proyecto', weight: 3 },
      { label: 'Empleado', weight: 2 },
      { label: 'Código', weight: 1 },
      { label: 'Desde', weight: 1.5 },
    ])
    const rows = active
      .sort((a, b) => `${a.projectCode}${a.employeeName}`.localeCompare(`${b.projectCode}${b.employeeName}`))
      .map(r => [`${r.projectCode} — ${r.projectName}`, r.employeeName, r.employeeCode, fmtDate(r.createdAt)])

    y = drawReportTable(pdf, { columns, rows, startY: y, marginX, rightX, pageBottom })
    drawGeneratedFooter(pdf, y, marginX)
    return { pdf, filename: `Asignacion_recursos_${Date.now()}.pdf` }
  }

  const REPORTS: ReportDef[] = [
    { key: 'resumen',   title: 'Resumen general de proyectos',      description: 'Totales por estado y presupuesto acumulado.',              icon: FolderKanban,  usesDateRange: true,  build: buildResumenGeneral },
    { key: 'avance',    title: 'Proyectos y su avance',              description: 'Listado completo con % de avance por proyecto.',            icon: TrendingUp,    usesDateRange: true,  build: buildProyectosAvance },
    { key: 'vencidas',  title: 'Tareas vencidas',                    description: 'Todas las tareas activas que ya pasaron su vencimiento.',   icon: AlertTriangle, usesDateRange: false, build: buildTareasVencidas },
    { key: 'carga',     title: 'Carga de trabajo por persona',       description: 'Tareas activas y completadas, por responsable.',            icon: Users,         usesDateRange: false, build: buildCargaPorPersona },
    { key: 'prioridad', title: 'Tareas por prioridad y estado',      description: 'Totales agrupados por prioridad y por estado.',             icon: ListChecks,    usesDateRange: true,  build: buildTareasPrioridadEstado },
    { key: 'recursos',  title: 'Asignación de recursos por proyecto', description: 'Quién está asignado a cada proyecto.',                     icon: UserCog,       usesDateRange: true,  build: buildAsignacionRecursos },
  ]

  const selectedReport = REPORTS.find(r => r.key === selectedKey) ?? null

  const handleSelect = async (report: ReportDef) => {
    setLoadingKey(report.key)
    setSelectedKey(report.key)
    try {
      const built = await report.build(from, to)
      setCurrentDoc(built)
      setPdfUrl(URL.createObjectURL(built.pdf.output('blob')))
    } catch {
      toast.error('No se pudo generar el reporte.')
    } finally {
      setLoadingKey(null)
    }
  }

  const handleDownload = () => {
    if (!currentDoc) return
    currentDoc.pdf.save(currentDoc.filename)
  }

  return (
    <div className="p-6 space-y-4">

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Reportes</h1>
          <p className="text-sm text-slate-500 mt-0.5">Elegí un reporte para previsualizarlo, y descargalo si te sirve</p>
        </div>
        <div className="sm:w-64 shrink-0">
          <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />
        </div>
      </div>
      <p className="text-xs text-slate-400 -mt-2">
        El rango de fechas aplica a los reportes que lo usan (todos menos "Tareas vencidas" y "Carga de trabajo por persona", que siempre reflejan el estado actual). Si cambiás el rango, volvé a hacer clic en el reporte para regenerarlo.
      </p>

      <div className="flex flex-col lg:flex-row gap-4">

        {/* Opciones, a un extremo */}
        <div className="lg:w-80 shrink-0 flex flex-col gap-2">
          {REPORTS.map(r => {
            const Icon = r.icon
            const isSelected = selectedKey === r.key
            const isLoading = loadingKey === r.key
            return (
              <button
                key={r.key}
                onClick={() => handleSelect(r)}
                disabled={isLoading}
                className={`text-left flex items-start gap-3 rounded-xl border p-4 transition-colors disabled:opacity-60 ${
                  isSelected
                    ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/30'
                    : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-500/30'
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  isSelected ? 'bg-indigo-600 text-white' : 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                }`}>
                  {isLoading
                    ? <div className="w-3.5 h-3.5 border-2 border-current/40 border-t-current rounded-full animate-spin" />
                    : <Icon className="w-4.5 h-4.5" />}
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{r.title}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{r.description}</p>
                </div>
              </button>
            )
          })}
        </div>

        {/* Visor de PDF, al otro extremo */}
        <div className="flex-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col min-h-[70vh]">
          {pdfUrl && selectedReport ? (
            <>
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{selectedReport.title}</span>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg transition-colors shrink-0"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  Descargar
                </button>
              </div>
              <iframe src={pdfUrl} title={selectedReport.title} className="flex-1 w-full" />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400 p-6 text-center">
              <FileText className="w-10 h-10 text-slate-200 dark:text-slate-700" />
              <p className="text-sm">Elegí un reporte de la izquierda para generarlo y verlo acá.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
