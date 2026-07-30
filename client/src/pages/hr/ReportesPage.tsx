import { useEffect, useState } from 'react'
import type { jsPDF as JsPDF } from 'jspdf'
import {
  Users, Wallet, Banknote, CalendarCheck, TreePalm, UserPlus, FileDown, FileText,
} from 'lucide-react'
import { employeesApi, payrollApi, attendanceApi, vacationsApi, applicationsApi, vacanciesApi } from '../../lib/api'
import { loadJsPdf, PAGE, drawReportHeader, layoutColumns, drawReportTable, drawGeneratedFooter, loadCompanyHeaderData, drawCompanyHeader, type CompanyHeaderData } from '../../lib/pdfReport'
import { DateRangePicker } from '../../components/DateRangePicker'
import { useToast } from '../../context/ToastContext'

interface Employee {
  id: string
  code: string
  firstName: string
  lastName: string
  departmentName: string
  positionName: string
  salary: number
  currencyCode?: string
  currencySymbol?: string
  contractTypeName?: string
  hireDate: string
  isActive: boolean
}

interface PayrollPeriod {
  id: string
  name: string
  startDate: string
  endDate: string
  payDate: string
  status: string
  baseCurrencyCode: string
  baseCurrencySymbol?: string
  employeeCount: number
  totalGross: number
  totalDeductions: number
  totalNet: number
  totalEmployerCost: number
}

interface PayrollDetail {
  employeeCode: string
  employeeName: string
  departmentName?: string
  grossPay: number
  totalDeductions: number
  netPay: number
  currencyCode: string
  currencySymbol?: string
}

interface AttendanceSummary {
  employeeCode: string
  employeeName: string
  departmentName: string
  presentDays: number
  lateDays: number
  absentDays: number
  justifiedDays: number
}

interface VacationBalance {
  employeeName: string
  departmentName: string
  accruedDays: number
  usedDays: number
  pendingDays: number
  availableDays: number
}

interface VacationRequest {
  employeeName: string
  departmentName: string
  startDate: string
  endDate: string
  requestedDays: number
}

interface Application {
  vacancyTitle: string
  candidateFirstName: string
  candidateLastName: string
  stage: string
  appliedDate: string
}

interface Vacancy {
  title: string
  departmentName: string
  openingsCount: number
  applicationCount: number
  hiredCount: number
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

const APPLICATION_STAGE_LABEL: Record<string, string> = {
  Applied: 'Postulado', Screening: 'Preselección', Interview: 'Entrevista', Offer: 'Oferta', Hired: 'Contratado', Rejected: 'Rechazado',
}
const PAYROLL_STATUS_LABEL: Record<string, string> = {
  Open: 'Abierto', Calculated: 'Calculado', Approved: 'Aprobado', Paid: 'Pagado',
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

function fmtDate(d?: string): string {
  return d ? new Date(d).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
}

function fmtMoney(n: number, symbol?: string, code?: string): string {
  const amount = n.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return symbol ? `${symbol} ${amount}` : `${amount} ${code ?? ''}`.trim()
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

  const loadEmployees = async (): Promise<Employee[]> => {
    const res = await employeesApi.list()
    return res.ok ? await res.json() : []
  }

  // ── 1. Resumen general de empleados ───────────────────────────────────────
  const buildResumenGeneral = async (f: string, t: string): Promise<BuiltReport> => {
    const all = await loadEmployees()
    const employees = all.filter(e => inRange(e.hireDate, f, t))
    const activeCount = employees.filter(e => e.isActive).length
    const byDept = Object.entries(
      employees.reduce<Record<string, number>>((acc, e) => { acc[e.departmentName] = (acc[e.departmentName] ?? 0) + 1; return acc }, {}),
    ).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
    const byPosition = Object.entries(
      employees.reduce<Record<string, number>>((acc, e) => { acc[e.positionName] = (acc[e.positionName] ?? 0) + 1; return acc }, {}),
    ).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)

    const { marginX, rightX, pageBottom } = PAGE.portrait
    const { pdf, startY } = await buildDoc('portrait')
    let y = drawReportHeader(pdf, 'Resumen general de empleados', `${rangeLabel(f, t)} · empleados según su fecha de ingreso`, rightX, startY)

    pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(11); pdf.setTextColor(79, 70, 229)
    pdf.text(`Total: ${employees.length} · Activos: ${activeCount} · Inactivos: ${employees.length - activeCount}`, marginX, y)
    y += 24

    const section = (title: string, rows: { label: string; count: number }[]) => {
      pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(11); pdf.setTextColor(15, 23, 42)
      pdf.text(title, marginX, y)
      y += 12
      const columns = layoutColumns(marginX, rightX, [
        { label: '', weight: 3 },
        { label: 'Cantidad', weight: 1, align: 'right' },
      ])
      y = drawReportTable(pdf, { columns, rows: rows.map(r => [r.label, String(r.count)]), startY: y, marginX, rightX, pageBottom })
      y += 26
    }

    section('Por departamento', byDept)
    section('Por cargo', byPosition)

    drawGeneratedFooter(pdf, y, marginX)
    return { pdf, filename: `Resumen_general_empleados_${Date.now()}.pdf` }
  }

  // ── 2. Planilla activa con salarios ────────────────────────────────────────
  const buildPlanillaActiva = async (): Promise<BuiltReport> => {
    const all = await loadEmployees()
    const active = all.filter(e => e.isActive)

    const { marginX, rightX, pageBottom } = PAGE.landscape
    const { pdf, startY } = await buildDoc('landscape')
    let y = drawReportHeader(pdf, 'Planilla activa con salarios', `${active.length} empleado(s) activo(s) al momento de generar el reporte`, rightX, startY)

    const columns = layoutColumns(marginX, rightX, [
      { label: 'Código', weight: 8 },
      { label: 'Nombre', weight: 20 },
      { label: 'Departamento', weight: 16 },
      { label: 'Cargo', weight: 16 },
      { label: 'Contrato', weight: 12 },
      { label: 'Ingreso', weight: 10 },
      { label: 'Salario', weight: 14, align: 'right' },
    ])
    const rows = active
      .sort((a, b) => a.code.localeCompare(b.code))
      .map(e => [
        e.code, `${e.firstName} ${e.lastName}`, e.departmentName, e.positionName,
        e.contractTypeName ?? '—', fmtDate(e.hireDate), fmtMoney(e.salary, e.currencySymbol, e.currencyCode),
      ])

    y = drawReportTable(pdf, { columns, rows, startY: y, marginX, rightX, pageBottom })
    drawGeneratedFooter(pdf, y, marginX)
    return { pdf, filename: `Planilla_activa_${Date.now()}.pdf` }
  }

  // ── 3. Nómina por período ──────────────────────────────────────────────────
  const buildNominaPeriodo = async (): Promise<BuiltReport> => {
    const periodsRes = await payrollApi.periods()
    const periods: PayrollPeriod[] = periodsRes.ok ? await periodsRes.json() : []
    const period = [...periods].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0]

    const { marginX, rightX, pageBottom } = PAGE.portrait
    const { pdf, startY } = await buildDoc('portrait')

    if (!period) {
      let y = drawReportHeader(pdf, 'Nómina por período', 'Sin períodos de nómina registrados', rightX, startY)
      drawGeneratedFooter(pdf, y, marginX)
      return { pdf, filename: `Nomina_periodo_${Date.now()}.pdf` }
    }

    const detailsRes = await payrollApi.details(period.id)
    const details: PayrollDetail[] = detailsRes.ok ? await detailsRes.json() : []

    let y = drawReportHeader(
      pdf, 'Nómina por período',
      `${period.name} · ${fmtDate(period.startDate)} – ${fmtDate(period.endDate)} · ${PAYROLL_STATUS_LABEL[period.status] ?? period.status}`,
      rightX, startY,
    )

    pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(11); pdf.setTextColor(79, 70, 229)
    pdf.text(`Empleados: ${period.employeeCount} · Bruto: ${fmtMoney(period.totalGross, period.baseCurrencySymbol, period.baseCurrencyCode)} · Neto: ${fmtMoney(period.totalNet, period.baseCurrencySymbol, period.baseCurrencyCode)}`, marginX, y)
    y += 24

    const columns = layoutColumns(marginX, rightX, [
      { label: 'Código', weight: 8 },
      { label: 'Empleado', weight: 20 },
      { label: 'Departamento', weight: 16 },
      { label: 'Bruto', weight: 12, align: 'right' },
      { label: 'Deducciones', weight: 12, align: 'right' },
      { label: 'Neto', weight: 12, align: 'right' },
    ])
    const rows = [...details].sort((a, b) => a.employeeCode.localeCompare(b.employeeCode)).map(d => [
      d.employeeCode, d.employeeName, d.departmentName ?? '—',
      fmtMoney(d.grossPay, d.currencySymbol, d.currencyCode),
      fmtMoney(d.totalDeductions, d.currencySymbol, d.currencyCode),
      fmtMoney(d.netPay, d.currencySymbol, d.currencyCode),
    ])

    y = drawReportTable(pdf, { columns, rows, startY: y, marginX, rightX, pageBottom })
    drawGeneratedFooter(pdf, y, marginX)
    return { pdf, filename: `Nomina_periodo_${Date.now()}.pdf` }
  }

  // ── 4. Resumen de asistencia mensual ───────────────────────────────────────
  const buildAsistenciaMensual = async (f: string): Promise<BuiltReport> => {
    const ref = f ? new Date(f) : new Date()
    const year = ref.getFullYear()
    const month = ref.getMonth() + 1

    const res = await attendanceApi.summary(year, month)
    const rows: AttendanceSummary[] = res.ok ? await res.json() : []

    const { marginX, rightX, pageBottom } = PAGE.landscape
    const { pdf, startY } = await buildDoc('landscape')
    const monthLabel = ref.toLocaleDateString('es-CR', { month: 'long', year: 'numeric' })
    let y = drawReportHeader(pdf, 'Resumen de asistencia mensual', `${monthLabel} · ${rows.length} empleado(s)`, rightX, startY)

    const columns = layoutColumns(marginX, rightX, [
      { label: 'Código', weight: 8 },
      { label: 'Empleado', weight: 20 },
      { label: 'Departamento', weight: 16 },
      { label: 'Presentes', weight: 10, align: 'right' },
      { label: 'Tardanzas', weight: 10, align: 'right' },
      { label: 'Ausencias', weight: 10, align: 'right' },
      { label: 'Justificados', weight: 10, align: 'right' },
    ])
    const tableRows = [...rows].sort((a, b) => a.employeeCode.localeCompare(b.employeeCode)).map(r => [
      r.employeeCode, r.employeeName, r.departmentName,
      String(r.presentDays), String(r.lateDays), String(r.absentDays), String(r.justifiedDays),
    ])

    y = drawReportTable(pdf, { columns, rows: tableRows, startY: y, marginX, rightX, pageBottom })
    drawGeneratedFooter(pdf, y, marginX)
    return { pdf, filename: `Asistencia_mensual_${Date.now()}.pdf` }
  }

  // ── 5. Vacaciones — saldos y solicitudes pendientes ────────────────────────
  const buildVacaciones = async (f: string, t: string): Promise<BuiltReport> => {
    const [balancesRes, requestsRes] = await Promise.all([
      vacationsApi.listBalances(),
      vacationsApi.listRequests('Pending'),
    ])
    const balances: VacationBalance[] = balancesRes.ok ? await balancesRes.json() : []
    const allRequests: VacationRequest[] = requestsRes.ok ? await requestsRes.json() : []
    const requests = allRequests.filter(r => inRange(r.startDate, f, t))

    const { marginX, rightX, pageBottom } = PAGE.portrait
    const { pdf, startY } = await buildDoc('portrait')
    let y = drawReportHeader(pdf, 'Vacaciones — saldos y solicitudes pendientes', `Saldos actuales · Solicitudes pendientes: ${rangeLabel(f, t)}`, rightX, startY)

    pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(11); pdf.setTextColor(15, 23, 42)
    pdf.text('Saldos por empleado', marginX, y)
    y += 12
    const balanceColumns = layoutColumns(marginX, rightX, [
      { label: 'Empleado', weight: 3 },
      { label: 'Departamento', weight: 2 },
      { label: 'Acumulados', weight: 1.5, align: 'right' },
      { label: 'Usados', weight: 1.5, align: 'right' },
      { label: 'Disponibles', weight: 1.5, align: 'right' },
    ])
    y = drawReportTable(pdf, {
      columns: balanceColumns,
      rows: balances.map(b => [b.employeeName, b.departmentName, String(b.accruedDays), String(b.usedDays), String(b.availableDays)]),
      startY: y, marginX, rightX, pageBottom,
    })
    y += 26

    pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(11); pdf.setTextColor(15, 23, 42)
    pdf.text('Solicitudes pendientes de aprobación', marginX, y)
    y += 12
    const requestColumns = layoutColumns(marginX, rightX, [
      { label: 'Empleado', weight: 3 },
      { label: 'Departamento', weight: 2 },
      { label: 'Desde', weight: 1.5 },
      { label: 'Hasta', weight: 1.5 },
      { label: 'Días', weight: 1, align: 'right' },
    ])
    y = drawReportTable(pdf, {
      columns: requestColumns,
      rows: requests.map(r => [r.employeeName, r.departmentName, fmtDate(r.startDate), fmtDate(r.endDate), String(r.requestedDays)]),
      startY: y, marginX, rightX, pageBottom,
    })

    drawGeneratedFooter(pdf, y, marginX)
    return { pdf, filename: `Vacaciones_saldos_pendientes_${Date.now()}.pdf` }
  }

  // ── 6. Reclutamiento por etapa ─────────────────────────────────────────────
  const buildReclutamiento = async (f: string, t: string): Promise<BuiltReport> => {
    const [applicationsRes, vacanciesRes] = await Promise.all([
      applicationsApi.list(),
      vacanciesApi.list('Open'),
    ])
    const allApplications: Application[] = applicationsRes.ok ? await applicationsRes.json() : []
    const applications = allApplications.filter(a => inRange(a.appliedDate, f, t))
    const vacancies: Vacancy[] = vacanciesRes.ok ? await vacanciesRes.json() : []

    const byStage = Object.entries(
      applications.reduce<Record<string, number>>((acc, a) => { acc[a.stage] = (acc[a.stage] ?? 0) + 1; return acc }, {}),
    ).map(([stage, count]) => ({ label: APPLICATION_STAGE_LABEL[stage] ?? stage, count }))

    const { marginX, rightX, pageBottom } = PAGE.portrait
    const { pdf, startY } = await buildDoc('portrait')
    let y = drawReportHeader(pdf, 'Reclutamiento por etapa', `${rangeLabel(f, t)} · postulaciones según su fecha de aplicación`, rightX, startY)

    pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(11); pdf.setTextColor(15, 23, 42)
    pdf.text('Postulaciones por etapa', marginX, y)
    y += 12
    const stageColumns = layoutColumns(marginX, rightX, [
      { label: '', weight: 3 },
      { label: 'Cantidad', weight: 1, align: 'right' },
    ])
    y = drawReportTable(pdf, { columns: stageColumns, rows: byStage.map(r => [r.label, String(r.count)]), startY: y, marginX, rightX, pageBottom })
    y += 26

    pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(11); pdf.setTextColor(15, 23, 42)
    pdf.text('Vacantes abiertas', marginX, y)
    y += 12
    const vacancyColumns = layoutColumns(marginX, rightX, [
      { label: 'Vacante', weight: 3 },
      { label: 'Departamento', weight: 2 },
      { label: 'Plazas', weight: 1, align: 'right' },
      { label: 'Postulaciones', weight: 1.3, align: 'right' },
      { label: 'Contratados', weight: 1.3, align: 'right' },
    ])
    y = drawReportTable(pdf, {
      columns: vacancyColumns,
      rows: vacancies.map(v => [v.title, v.departmentName, String(v.openingsCount), String(v.applicationCount), String(v.hiredCount)]),
      startY: y, marginX, rightX, pageBottom,
    })

    drawGeneratedFooter(pdf, y, marginX)
    return { pdf, filename: `Reclutamiento_etapa_${Date.now()}.pdf` }
  }

  const REPORTS: ReportDef[] = [
    { key: 'resumen',     title: 'Resumen general de empleados',            description: 'Totales por departamento y por cargo.',                      icon: Users,         usesDateRange: true,  build: buildResumenGeneral },
    { key: 'planilla',    title: 'Planilla activa con salarios',            description: 'Listado completo de empleados activos y su salario.',        icon: Wallet,        usesDateRange: false, build: buildPlanillaActiva },
    { key: 'nomina',      title: 'Nómina por período',                      description: 'Totales y detalle por empleado del período más reciente.',   icon: Banknote,      usesDateRange: false, build: buildNominaPeriodo },
    { key: 'asistencia',  title: 'Resumen de asistencia mensual',           description: 'Presentes, tardanzas, ausencias y justificados por empleado.', icon: CalendarCheck, usesDateRange: true,  build: buildAsistenciaMensual },
    { key: 'vacaciones',  title: 'Vacaciones — saldos y solicitudes',       description: 'Saldos actuales y solicitudes pendientes de aprobación.',    icon: TreePalm,      usesDateRange: true,  build: buildVacaciones },
    { key: 'reclutamiento', title: 'Reclutamiento por etapa',               description: 'Postulaciones por etapa y vacantes abiertas.',                icon: UserPlus,      usesDateRange: true,  build: buildReclutamiento },
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
        El rango de fechas aplica a los reportes que lo usan ("Resumen de asistencia mensual" solo toma el mes de la fecha "Desde"). "Planilla activa" y "Nómina por período" siempre reflejan el estado actual. Si cambiás el rango, volvé a hacer clic en el reporte para regenerarlo.
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
