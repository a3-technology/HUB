import { useEffect, useState } from 'react'
import type { jsPDF as JsPDF } from 'jspdf'
import {
  LifeBuoy, ListTodo, ShieldAlert, ShieldCheck, Timer, Users, FileDown, FileText,
} from 'lucide-react'
import { ticketsApi, helpdeskReportsApi } from '../../lib/api'
import { getSlaInfo, fmtDurationMs, type SlaAwareTicket } from '../../lib/sla'
import { loadJsPdf, PAGE, drawReportHeader, layoutColumns, drawReportTable, drawGeneratedFooter, loadCompanyHeaderData, drawCompanyHeader, type CompanyHeaderData } from '../../lib/pdfReport'
import { DateRangePicker } from '../../components/DateRangePicker'
import { useToast } from '../../context/ToastContext'

interface Ticket extends SlaAwareTicket {
  id: string
  code: string
  subject: string
  requesterName: string
  assignedToName?: string
  categoryName: string
  priorityName: string
  status: string
}

interface BuiltReport {
  pdf: JsPDF
  filename: string
}

/** "to" se envía con hora de fin de día para incluir todo el día seleccionado. */
function toEndOfDay(to: string): string | undefined {
  return to ? `${to}T23:59:59` : undefined
}

function rangeLabel(from: string, to: string): string {
  if (!from && !to) return 'Todo el historial'
  const fmt = (d: string) => new Date(d).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  if (from && to) return `Del ${fmt(from)} al ${fmt(to)}`
  if (from) return `Desde el ${fmt(from)}`
  return `Hasta el ${fmt(to)}`
}

interface ReportDef {
  key: string
  title: string
  description: string
  icon: React.ElementType
  usesDateRange: boolean
  build: (from: string, to: string) => Promise<BuiltReport>
}

export function ReportesPage() {
  const toast = useToast()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [currentDoc, setCurrentDoc] = useState<BuiltReport | null>(null)
  const [companyHeader, setCompanyHeader] = useState<CompanyHeaderData | null>(null)

  // Libera la URL del blob anterior cada vez que se reemplaza (y al desmontar).
  useEffect(() => {
    return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl) }
  }, [pdfUrl])

  // Se carga una sola vez (no por cada reporte generado) — nunca lanza, si falla el PDF sale sin encabezado de empresa.
  useEffect(() => { loadCompanyHeaderData().then(setCompanyHeader) }, [])

  const buildDoc = async (orientation: 'portrait' | 'landscape') => {
    const jsPDF = await loadJsPdf()
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation })
    const { marginX, rightX } = PAGE[orientation]
    const startY = drawCompanyHeader(pdf, companyHeader, marginX, rightX) || 40
    return { pdf, startY }
  }

  // ── 1. Resumen general de tickets ─────────────────────────────────────────
  const buildResumenGeneral = async (f: string, t: string): Promise<BuiltReport> => {
    const toParam = toEndOfDay(t)
    const [statusRes, categoryRes, priorityRes] = await Promise.all([
      helpdeskReportsApi.volume('Status', f || undefined, toParam),
      helpdeskReportsApi.volume('Category', f || undefined, toParam),
      helpdeskReportsApi.volume('Priority', f || undefined, toParam),
    ])
    const byStatus: { label: string; count: number }[] = statusRes.ok ? await statusRes.json() : []
    const byCategory: { label: string; count: number }[] = categoryRes.ok ? await categoryRes.json() : []
    const byPriority: { label: string; count: number }[] = priorityRes.ok ? await priorityRes.json() : []
    const total = byStatus.reduce((s, r) => s + r.count, 0)

    const { marginX, rightX, pageBottom } = PAGE.portrait
    const { pdf, startY } = await buildDoc('portrait')
    let y = drawReportHeader(pdf, 'Resumen general de tickets', rangeLabel(f, t), rightX, startY)

    pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(11); pdf.setTextColor(79, 70, 229)
    pdf.text(`Total de tickets: ${total}`, marginX, y)
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
    section('Por categoría', byCategory)
    section('Por prioridad', byPriority)

    drawGeneratedFooter(pdf, y, marginX)
    return { pdf, filename: `Resumen_general_tickets_${Date.now()}.pdf` }
  }

  // ── 2. Tickets abiertos y pendientes ──────────────────────────────────────
  const buildAbiertosPendientes = async (): Promise<BuiltReport> => {
    const res = await ticketsApi.list()
    const tickets: Ticket[] = res.ok ? await res.json() : []
    const open = tickets.filter(t => !t.statusIsFinal)

    const { marginX, rightX, pageBottom } = PAGE.landscape
    const { pdf, startY } = await buildDoc('landscape')
    let y = drawReportHeader(pdf, 'Tickets abiertos y pendientes', `${open.length} ticket(s) al momento de generar el reporte`, rightX, startY)

    const columns = layoutColumns(marginX, rightX, [
      { label: 'Código', weight: 8 },
      { label: 'Asunto', weight: 22 },
      { label: 'Solicitante', weight: 16 },
      { label: 'Responsable', weight: 16 },
      { label: 'Categoría', weight: 14 },
      { label: 'Prioridad', weight: 12 },
      { label: 'Estado', weight: 12 },
    ])
    const rows = open
      .sort((a, b) => a.code.localeCompare(b.code))
      .map(t => [t.code, t.subject, t.requesterName, t.assignedToName ?? 'Sin asignar', t.categoryName, t.priorityName, t.status])

    y = drawReportTable(pdf, { columns, rows, startY: y, marginX, rightX, pageBottom })
    drawGeneratedFooter(pdf, y, marginX)
    return { pdf, filename: `Tickets_abiertos_pendientes_${Date.now()}.pdf` }
  }

  // ── 3. Tickets vencidos o próximos a vencer ───────────────────────────────
  const buildVencidosProximos = async (): Promise<BuiltReport> => {
    const res = await ticketsApi.list()
    const tickets: Ticket[] = res.ok ? await res.json() : []
    const withRisk = tickets
      .filter(t => !t.statusIsFinal)
      .map(t => ({ ticket: t, info: getSlaInfo(t) }))
      .filter((x): x is { ticket: Ticket; info: NonNullable<ReturnType<typeof getSlaInfo>> } =>
        x.info !== null && (x.info.tone === 'warning' || x.info.tone === 'breach'))
      .sort((a, b) => (a.info.tone === b.info.tone ? 0 : a.info.tone === 'breach' ? -1 : 1))

    const { marginX, rightX, pageBottom } = PAGE.landscape
    const { pdf, startY } = await buildDoc('landscape')
    let y = drawReportHeader(pdf, 'Tickets vencidos o próximos a vencer', `${withRisk.length} ticket(s) en riesgo al momento de generar el reporte`, rightX, startY)

    const columns = layoutColumns(marginX, rightX, [
      { label: 'Código', weight: 8 },
      { label: 'Asunto', weight: 26 },
      { label: 'Responsable', weight: 18 },
      { label: 'Prioridad', weight: 14 },
      { label: 'Estado', weight: 14 },
      { label: 'SLA', weight: 20 },
    ])
    const rows = withRisk.map(({ ticket: t, info }) =>
      [t.code, t.subject, t.assignedToName ?? 'Sin asignar', t.priorityName, t.status, info.label])

    y = drawReportTable(pdf, { columns, rows, startY: y, marginX, rightX, pageBottom })
    drawGeneratedFooter(pdf, y, marginX)
    return { pdf, filename: `Tickets_vencidos_proximos_${Date.now()}.pdf` }
  }

  // ── 4. Cumplimiento de SLA ─────────────────────────────────────────────────
  const buildCumplimientoSla = async (f: string, t: string): Promise<BuiltReport> => {
    const res = await helpdeskReportsApi.slaCompliance(f || undefined, toEndOfDay(t))
    const rows: { priorityName: string; withinTarget: number; breached: number; pending: number }[] = res.ok ? await res.json() : []

    const { marginX, rightX, pageBottom } = PAGE.portrait
    const { pdf, startY } = await buildDoc('portrait')
    let y = drawReportHeader(pdf, 'Cumplimiento de SLA', rangeLabel(f, t), rightX, startY)

    const totalWithin = rows.reduce((s, r) => s + r.withinTarget, 0)
    const totalBreached = rows.reduce((s, r) => s + r.breached, 0)
    const globalPercent = totalWithin + totalBreached === 0 ? null : Math.round((totalWithin / (totalWithin + totalBreached)) * 100)

    pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(11); pdf.setTextColor(79, 70, 229)
    pdf.text(`Cumplimiento global: ${globalPercent === null ? 'Sin datos suficientes' : `${globalPercent}%`}`, marginX, y)
    y += 24

    const columns = layoutColumns(marginX, rightX, [
      { label: 'Prioridad', weight: 3 },
      { label: 'Dentro de objetivo', weight: 2, align: 'right' },
      { label: 'Incumplido', weight: 2, align: 'right' },
      { label: 'Pendiente', weight: 2, align: 'right' },
      { label: '% Cumplimiento', weight: 2, align: 'right' },
    ])
    const tableRows = rows.map(r => {
      const denom = r.withinTarget + r.breached
      const pct = denom === 0 ? '—' : `${Math.round((r.withinTarget / denom) * 100)}%`
      return [r.priorityName, String(r.withinTarget), String(r.breached), String(r.pending), pct]
    })

    y = drawReportTable(pdf, { columns, rows: tableRows, startY: y, marginX, rightX, pageBottom })
    drawGeneratedFooter(pdf, y, marginX)
    return { pdf, filename: `Cumplimiento_SLA_${Date.now()}.pdf` }
  }

  // ── 5. Tiempo promedio de resolución ──────────────────────────────────────
  const buildTiempoPromedio = async (f: string, t: string): Promise<BuiltReport> => {
    const res = await helpdeskReportsApi.responseTimes(f || undefined, toEndOfDay(t))
    const data: { avgFirstResponseMinutes?: number; avgResolutionMinutes?: number; ticketsWithFirstResponse: number; ticketsResolved: number } =
      res.ok ? await res.json() : { ticketsWithFirstResponse: 0, ticketsResolved: 0 }

    const { marginX, rightX } = PAGE.portrait
    const { pdf, startY } = await buildDoc('portrait')
    let y = drawReportHeader(pdf, 'Tiempo promedio de resolución', rangeLabel(f, t), rightX, startY)

    const field = (label: string, value: string, sampleSize: number) => {
      pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(8); pdf.setTextColor(148, 163, 184)
      pdf.text(label.toUpperCase(), marginX, y)
      y += 20
      pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(20); pdf.setTextColor(15, 23, 42)
      pdf.text(value, marginX, y)
      y += 14
      pdf.setFont('NotoSans', 'normal'); pdf.setFontSize(9); pdf.setTextColor(100, 116, 139)
      pdf.text(`Calculado sobre ${sampleSize} ticket(s)`, marginX, y)
      y += 34
    }

    field(
      'Tiempo promedio de primera respuesta',
      data.avgFirstResponseMinutes !== undefined && data.avgFirstResponseMinutes !== null ? fmtDurationMs(data.avgFirstResponseMinutes * 60_000) : 'Sin datos',
      data.ticketsWithFirstResponse,
    )
    field(
      'Tiempo promedio de resolución',
      data.avgResolutionMinutes !== undefined && data.avgResolutionMinutes !== null ? fmtDurationMs(data.avgResolutionMinutes * 60_000) : 'Sin datos',
      data.ticketsResolved,
    )

    drawGeneratedFooter(pdf, y, marginX)
    return { pdf, filename: `Tiempo_promedio_resolucion_${Date.now()}.pdf` }
  }

  // ── 6. Carga actual por agente ────────────────────────────────────────────
  const buildCargaPorAgente = async (f: string, t: string): Promise<BuiltReport> => {
    const res = await helpdeskReportsApi.agentLoad(f || undefined, toEndOfDay(t))
    const rows: { agentName: string; openAssigned: number; resolvedInRange: number }[] = res.ok ? await res.json() : []

    const { marginX, rightX, pageBottom } = PAGE.portrait
    const { pdf, startY } = await buildDoc('portrait')
    let y = drawReportHeader(pdf, 'Carga actual por agente', rangeLabel(f, t), rightX, startY)

    const columns = layoutColumns(marginX, rightX, [
      { label: 'Agente', weight: 3 },
      { label: 'Tickets en curso', weight: 2, align: 'right' },
      { label: 'Resueltos en el rango', weight: 2, align: 'right' },
    ])
    const tableRows = rows.map(r => [r.agentName, String(r.openAssigned), String(r.resolvedInRange)])

    y = drawReportTable(pdf, { columns, rows: tableRows, startY: y, marginX, rightX, pageBottom })
    drawGeneratedFooter(pdf, y, marginX)
    return { pdf, filename: `Carga_por_agente_${Date.now()}.pdf` }
  }

  const REPORTS: ReportDef[] = [
    { key: 'resumen',  title: 'Resumen general de tickets',           description: 'Totales por estado, categoría y prioridad.',              icon: LifeBuoy,    usesDateRange: true,  build: buildResumenGeneral },
    { key: 'abiertos', title: 'Tickets abiertos y pendientes',        description: 'Listado completo de tickets que siguen activos.',         icon: ListTodo,    usesDateRange: false, build: buildAbiertosPendientes },
    { key: 'vencidos', title: 'Tickets vencidos o próximos a vencer', description: 'Tickets que ya incumplieron su SLA o están por hacerlo.', icon: ShieldAlert, usesDateRange: false, build: buildVencidosProximos },
    { key: 'sla',      title: 'Cumplimiento de SLA',                  description: 'Dentro de objetivo, incumplido y pendiente, por prioridad.', icon: ShieldCheck, usesDateRange: true,  build: buildCumplimientoSla },
    { key: 'tiempos',  title: 'Tiempo promedio de resolución',        description: 'Primera respuesta y resolución, en promedio.',            icon: Timer,       usesDateRange: true,  build: buildTiempoPromedio },
    { key: 'carga',    title: 'Carga actual por agente',              description: 'Tickets en curso y resueltos, por agente.',               icon: Users,       usesDateRange: true,  build: buildCargaPorAgente },
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
        El rango de fechas aplica a los reportes que lo usan (todos menos "Tickets abiertos y pendientes" y "Tickets vencidos o próximos a vencer", que siempre reflejan el estado actual). Si cambiás el rango, volvé a hacer clic en el reporte para regenerarlo.
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
