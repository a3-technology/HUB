import { useEffect, useState } from 'react'
import {
  Plus, Search, Pencil, ToggleLeft, ToggleRight, RefreshCw, Save, Trash2, Eye,
  Wallet, SlidersHorizontal, Calculator, CheckCircle2, Banknote, Undo2,
  ClipboardList, Layers, X, ChevronRight, FileSpreadsheet, Printer, Coins,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import {
  payrollApi, employeesApi, currenciesApi,
  type PayrollConceptPayload, type PayrollBracketPayload,
  type PayrollPeriodPayload, type PayrollNoveltyPayload,
  type PayrollExchangeRatePayload, type PayrollExchangeRatesPayload,
} from '../../lib/api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { SearchSelect } from '../../components/SearchSelect'
import { DatePicker } from '../../components/DatePicker'
import { useToast } from '../../context/ToastContext'
import { useModalTransition } from '../../hooks/useModalTransition'
import { usePermission } from '../../hooks/usePermission'
import { loadCompanyHeaderData, drawCompanyHeader } from '../../lib/pdfReport'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Concept {
  id: string
  code: string
  name: string
  conceptType: string
  calcType: string
  baseType?: string
  defaultAmount?: number
  percentage?: number
  baseCapAmount?: number
  annualizationFactor?: number
  affectsTaxable: boolean
  appliesToAll: boolean
  calcOrder: number
  isActive: boolean
  bracketCount: number
  assignedCount: number
}

interface Bracket {
  id?: string
  lowerLimit: number
  upperLimit?: number | null
  fixedQuota: number
  ratePercent: number
}

interface Period {
  id: string
  name: string
  payFrequency: string
  startDate: string
  endDate: string
  payDate: string
  status: string
  notes?: string
  /** Moneda en la que se consolidan los totales del período. */
  baseCurrencyId: string
  baseCurrencyCode: string
  baseCurrencySymbol?: string
  employeeCount: number
  noveltyCount: number
  /** Totales consolidados en la moneda base (monto de cada empleado × su tasa de cambio). */
  totalGross: number
  totalDeductions: number
  totalNet: number
  totalEmployerCost: number
  /** true si algún empleado del período se paga en una moneda distinta a la base. */
  hasMultipleCurrencies: boolean
}

interface Novelty {
  id: string
  employeeId: string
  employeeCode: string
  employeeName: string
  conceptId: string
  conceptCode: string
  conceptName: string
  conceptType: string
  amount: number
  notes?: string
}

interface Detail {
  id: string
  employeeId: string
  employeeCode: string
  employeeName: string
  departmentName?: string
  /** Salario, bruto, deducciones, neto y costo patronal en la moneda propia del empleado (currencyCode). */
  baseSalary: number
  grossPay: number
  totalDeductions: number
  netPay: number
  employerCost: number
  currencyId: string
  currencyCode: string
  currencySymbol?: string
  /** Tasa de cambio hacia la moneda base del período aplicada al calcular (1 si ya está en la moneda base). */
  exchangeRate: number
  /** Fecha en que se consultó esa tasa de cambio (undefined si el empleado ya cobra en la moneda base). */
  exchangeRateDate?: string
}

interface DetailLine {
  id: string
  conceptCode: string
  conceptName: string
  conceptType: string
  baseUsed?: number
  rateUsed?: number
  amount: number
}

interface EmployeeLite {
  id: string
  code: string
  firstName: string
  lastName: string
  isActive: boolean
  currencyId?: string
  currencyCode?: string
  currencySymbol?: string
}

interface CurrencyLite {
  id: string
  code: string
  name: string
  symbol?: string
  isActive: boolean
}

/** Fila del formulario de tasas de cambio: una moneda distinta a la base y su tasa hacia ella. */
interface ExchangeRateForm {
  currencyId: string
  currencyCode: string
  currencySymbol?: string
  rate: string
}

// ── Constantes y helpers de presentación ──────────────────────────────────────

const CONCEPT_TYPES = [
  { value: 'Earning',              label: 'Ingreso' },
  { value: 'Deduction',            label: 'Deducción' },
  { value: 'EmployerContribution', label: 'Aporte patronal' },
]
const CALC_TYPES = [
  { value: 'Fixed',    label: 'Monto fijo' },
  { value: 'Percent',  label: 'Porcentaje de una base' },
  { value: 'Brackets', label: 'Escala progresiva (tramos)' },
]
const BASE_TYPES = [
  { value: 'BaseSalary', label: 'Salario del período' },
  { value: 'Gross',      label: 'Bruto del período' },
  { value: 'Taxable',    label: 'Base imponible' },
]
const FREQUENCIES = [
  { value: 'Monthly',  label: 'Mensual' },
  { value: 'Biweekly', label: 'Quincenal' },
  { value: 'Weekly',   label: 'Semanal' },
]

const conceptTypeLabel = (t: string) => CONCEPT_TYPES.find(x => x.value === t)?.label ?? t
const calcTypeLabel    = (t: string) => CALC_TYPES.find(x => x.value === t)?.label ?? t
const baseTypeLabel    = (t?: string) => BASE_TYPES.find(x => x.value === t)?.label ?? '—'
const freqLabel        = (t: string) => FREQUENCIES.find(x => x.value === t)?.label ?? t

const conceptTypeBadge = (t: string) =>
  t === 'Earning'   ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
  : t === 'Deduction' ? 'bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400'
  : 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400'

const statusInfo = (s: string) => ({
  Open:       { label: 'Abierto',   badge: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300' },
  Calculated: { label: 'Calculado', badge: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
  Approved:   { label: 'Aprobado',  badge: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400' },
  Paid:       { label: 'Pagado',    badge: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
}[s] ?? { label: s, badge: 'bg-slate-100 text-slate-500' })

const money = (n: number) =>
  n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Monto con el símbolo de su moneda por delante, p. ej. "US$ 1,000.00". */
const cmoney = (n: number, symbol?: string) => `${symbol ? `${symbol} ` : ''}${money(n)}`

const fdate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${m[3]}/${m[2]}/${m[1]}`
}

/** Fecha de hoy en formato ISO 'aaaa-mm-dd', para precargar la fecha de la tasa de cambio. */
const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const labelCls  = 'block text-sm font-medium text-slate-700 dark:text-slate-300'
const inputCls  = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition'
/** Campo numérico compacto (tasas de cambio): sin w-full de inputCls, que le ganaba a cualquier ancho fijo agregado. */
const rateInputCls = 'w-28 px-2 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm text-right placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition'
const thCls     = 'px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider'
const actionCls = 'w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors'
const deleteCls = 'w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors'

interface PeriodForm {
  name: string; payFrequency: string; startDate: string; endDate: string; payDate: string; notes: string
  baseCurrencyId: string
  /** Tasa de cambio de cada moneda distinta a la base que paguen empleados activos. */
  exchangeRates: ExchangeRateForm[]
  /** Fecha en que se consultaron esas tasas de cambio (ISO 'aaaa-mm-dd'). */
  rateDate: string
}
interface ConceptForm {
  code: string; name: string; conceptType: string; calcType: string; baseType: string
  defaultAmount: string; percentage: string; baseCapAmount: string; annualizationFactor: string
  affectsTaxable: boolean; appliesToAll: boolean; calcOrder: string
}
interface NoveltyForm { employeeId: string; conceptId: string; amount: string; notes: string }

const EMPTY_PERIOD: PeriodForm = {
  name: '', payFrequency: 'Monthly', startDate: '', endDate: '', payDate: '', notes: '',
  baseCurrencyId: '', exchangeRates: [], rateDate: '',
}
const EMPTY_CONCEPT: ConceptForm = {
  code: '', name: '', conceptType: 'Earning', calcType: 'Fixed', baseType: '',
  defaultAmount: '', percentage: '', baseCapAmount: '', annualizationFactor: '',
  affectsTaxable: false, appliesToAll: false, calcOrder: '100',
}
const EMPTY_NOVELTY: NoveltyForm = { employeeId: '', conceptId: '', amount: '', notes: '' }

/**
 * Nómina — motor parametrizable por conceptos.
 * Pestaña Períodos: ciclo Abierto → Calculado → Aprobado → Pagado, con
 * novedades por período y resultados con desglose por concepto (recibo).
 * Pestaña Conceptos: catálogo que define el cálculo (fijo, % con tope o
 * escala progresiva) — la nómina de cualquier país se modela solo con datos.
 */
export function NominaPage() {
  const toast = useToast()

  const canConceptCreate  = usePermission('hr.payroll.concept-create')
  const canConceptUpdate  = usePermission('hr.payroll.concept-update')
  const canConceptToggle  = usePermission('hr.payroll.concept-toggle')
  const canConceptDelete  = usePermission('hr.payroll.concept-delete')
  const canBracketsReplace = usePermission('hr.payroll.concept-brackets-replace')
  const canPeriodCreate   = usePermission('hr.payroll.period-create')
  const canRatesReplace   = usePermission('hr.payroll.period-exchange-rates-replace')
  const canCalculate      = usePermission('hr.payroll.period-calculate')
  const canApprove        = usePermission('hr.payroll.period-approve')
  const canPay             = usePermission('hr.payroll.period-pay')
  const canReopen         = usePermission('hr.payroll.period-reopen')
  const canPeriodDelete   = usePermission('hr.payroll.period-delete')
  const canNoveltyCreate  = usePermission('hr.payroll.novelty-create')
  const canNoveltyDelete  = usePermission('hr.payroll.novelty-delete')

  const [tab, setTab] = useState<'periodos' | 'conceptos'>('periodos')

  const [periods, setPeriods]     = useState<Period[]>([])
  const [concepts, setConcepts]   = useState<Concept[]>([])
  const [employees, setEmployees] = useState<EmployeeLite[]>([])
  const [currencies, setCurrencies] = useState<CurrencyLite[]>([])
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch]       = useState('')

  const load = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true)
    try {
      const [pRes, cRes, eRes, curRes] = await Promise.all([
        payrollApi.periods(), payrollApi.concepts(), employeesApi.list(), currenciesApi.list(),
      ])
      if (pRes.ok) setPeriods(await pRes.json())
      if (cRes.ok) setConcepts(await cRes.json())
      if (eRes.ok) setEmployees(((await eRes.json()) as EmployeeLite[]).filter(e => e.isActive))
      if (curRes.ok) setCurrencies(((await curRes.json()) as CurrencyLite[]).filter(c => c.isActive))
    } finally {
      silent ? setRefreshing(false) : setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // ── Monedas: helpers compartidos por crear período y editar tasas ───────────

  const currencyOptions = currencies.map(c => ({ value: c.id, label: `${c.code} - ${c.name}` }))

  /** Monedas distintas usadas por los empleados activos (para saber qué tasas pedir). */
  const foreignCurrencyIds = () =>
    Array.from(new Set(employees.map(e => e.currencyId).filter((id): id is string => !!id)))

  /** Moneda más usada entre los empleados activos, para preseleccionar la moneda base. */
  const mostCommonEmployeeCurrency = (): string | undefined => {
    const counts = new Map<string, number>()
    employees.forEach(e => { if (e.currencyId) counts.set(e.currencyId, (counts.get(e.currencyId) ?? 0) + 1) })
    let best: string | undefined, bestCount = 0
    counts.forEach((n, id) => { if (n > bestCount) { best = id; bestCount = n } })
    return best
  }

  /** Recalcula las filas de tasa de cambio para una moneda base: una por cada
   *  moneda distinta en uso (empleados activos + lo que ya estuviera guardado),
   *  conservando el valor tecleado si la fila ya existía. */
  const syncExchangeRates = (baseCurrencyId: string, existing: ExchangeRateForm[]): ExchangeRateForm[] => {
    const ids = new Set<string>([...foreignCurrencyIds(), ...existing.map(r => r.currencyId)])
    ids.delete(baseCurrencyId)
    return Array.from(ids)
      .map(id => {
        const emp  = employees.find(e => e.currencyId === id)
        const cur  = currencies.find(c => c.id === id)
        const prev = existing.find(r => r.currencyId === id)
        return {
          currencyId: id,
          currencyCode: emp?.currencyCode ?? cur?.code ?? prev?.currencyCode ?? '',
          currencySymbol: emp?.currencySymbol ?? cur?.symbol ?? prev?.currencySymbol,
          rate: prev?.rate ?? '',
        }
      })
      .sort((a, b) => a.currencyCode.localeCompare(b.currencyCode))
  }

  // ── Períodos: crear ─────────────────────────────────────────────────────────

  const [periodModalOpen, setPeriodModalOpen] = useState(false)
  const [periodForm, setPeriodForm]   = useState<PeriodForm>(EMPTY_PERIOD)
  const [periodError, setPeriodError] = useState<string | null>(null)
  const [periodSaving, setPeriodSaving] = useState(false)
  const { mounted: periodMounted, closing: periodClosing } = useModalTransition(periodModalOpen)

  const openCreatePeriod = () => {
    const baseCurrencyId = mostCommonEmployeeCurrency() ?? currencies[0]?.id ?? ''
    setPeriodForm({ ...EMPTY_PERIOD, baseCurrencyId, exchangeRates: syncExchangeRates(baseCurrencyId, []), rateDate: todayISO() })
    setPeriodError(null)
    setPeriodModalOpen(true)
  }

  const handleSavePeriod = async () => {
    if (!periodForm.name.trim() || !periodForm.startDate || !periodForm.endDate || !periodForm.payDate || !periodForm.baseCurrencyId) {
      setPeriodError('Completa el nombre, la moneda base y las tres fechas del período.')
      return
    }
    if (periodForm.endDate < periodForm.startDate) {
      setPeriodError('La fecha "Hasta" no puede ser anterior a la fecha "Desde".')
      return
    }
    const badRate = periodForm.exchangeRates.find(r => !r.rate.trim() || Number.isNaN(Number(r.rate)) || Number(r.rate) <= 0)
    if (badRate) {
      setPeriodError(`Ingresa una tasa de cambio válida para ${badRate.currencyCode || 'la moneda pendiente'}.`)
      return
    }
    if (periodForm.exchangeRates.length > 0 && !periodForm.rateDate) {
      setPeriodError('Indica la fecha de la tasa de cambio.')
      return
    }
    setPeriodSaving(true)
    setPeriodError(null)
    try {
      const exchangeRates: PayrollExchangeRatePayload[] = periodForm.exchangeRates.map(r => ({ currencyId: r.currencyId, rate: Number(r.rate) }))
      const payload: PayrollPeriodPayload = {
        name: periodForm.name.trim(),
        payFrequency: periodForm.payFrequency,
        startDate: periodForm.startDate,
        endDate: periodForm.endDate,
        payDate: periodForm.payDate,
        baseCurrencyId: periodForm.baseCurrencyId,
        exchangeRates,
        rateDate: periodForm.exchangeRates.length > 0 ? periodForm.rateDate : undefined,
        notes: periodForm.notes.trim() || undefined,
      }
      const res = await payrollApi.createPeriod(payload)
      const body = await res.json().catch(() => null)
      if (res.ok) {
        toast.success(body?.message ?? 'Período creado correctamente.')
        setPeriodModalOpen(false)
        await load(true)
      } else {
        setPeriodError(body?.message ?? 'Error al crear el período.')
      }
    } finally {
      setPeriodSaving(false)
    }
  }

  // ── Períodos: acciones del ciclo de vida ────────────────────────────────────

  const [actioningId, setActioningId] = useState<string | null>(null)
  const [payTarget, setPayTarget]         = useState<Period | null>(null)
  const [reopenTarget, setReopenTarget]   = useState<Period | null>(null)
  const [deletePeriodTarget, setDeletePeriodTarget] = useState<Period | null>(null)

  const runPeriodAction = async (id: string, action: () => Promise<Response>, fallback: string) => {
    setActioningId(id)
    try {
      const res = await action()
      const body = await res.json().catch(() => null)
      if (res.ok) { toast.success(body?.message ?? 'Operación realizada.'); await load(true) }
      else toast.error(body?.message ?? fallback)
    } finally {
      setActioningId(null)
    }
  }

  const handleCalculate = (p: Period) => runPeriodAction(p.id, () => payrollApi.calculate(p.id), 'Error al calcular la nómina.')
  const handleApprove   = (p: Period) => runPeriodAction(p.id, () => payrollApi.approve(p.id), 'Error al aprobar el período.')
  const handlePay       = async () => { if (payTarget) { const t = payTarget; setPayTarget(null); await runPeriodAction(t.id, () => payrollApi.pay(t.id), 'Error al marcar como pagado.') } }
  const handleReopen    = async () => { if (reopenTarget) { const t = reopenTarget; setReopenTarget(null); await runPeriodAction(t.id, () => payrollApi.reopen(t.id), 'Error al reabrir el período.') } }
  const handleDeletePeriod = async () => {
    if (!deletePeriodTarget) return
    const t = deletePeriodTarget
    setDeletePeriodTarget(null)
    await runPeriodAction(t.id, () => payrollApi.removePeriod(t.id), 'Error al eliminar el período.')
  }

  // ── Períodos: tasas de cambio (editables mientras no esté aprobado) ─────────

  const [fxPeriod, setFxPeriod]           = useState<Period | null>(null)
  const [fxBaseCurrencyId, setFxBaseCurrencyId] = useState('')
  const [fxRates, setFxRates]             = useState<ExchangeRateForm[]>([])
  const [fxRateDate, setFxRateDate]       = useState('')
  const [fxError, setFxError]             = useState<string | null>(null)
  const [fxSaving, setFxSaving]           = useState(false)
  const { mounted: fxMounted, closing: fxClosing } = useModalTransition(!!fxPeriod)

  const openExchangeRates = async (p: Period) => {
    setFxError(null)
    setFxPeriod(p)
    setFxBaseCurrencyId(p.baseCurrencyId)
    setFxRates(syncExchangeRates(p.baseCurrencyId, []))
    setFxRateDate(todayISO())
    const res = await payrollApi.exchangeRates(p.id)
    if (res.ok) {
      const saved = (await res.json()) as { currencyId: string; currencyCode: string; currencySymbol?: string; rate: number; rateDate?: string }[]
      setFxRates(syncExchangeRates(p.baseCurrencyId, saved.map(s => ({
        currencyId: s.currencyId, currencyCode: s.currencyCode, currencySymbol: s.currencySymbol, rate: String(s.rate),
      }))))
      if (saved[0]?.rateDate) setFxRateDate(saved[0].rateDate.slice(0, 10))
    }
  }

  const handleSaveExchangeRates = async () => {
    if (!fxPeriod) return
    const badRate = fxRates.find(r => !r.rate.trim() || Number.isNaN(Number(r.rate)) || Number(r.rate) <= 0)
    if (badRate) {
      setFxError(`Ingresa una tasa de cambio válida para ${badRate.currencyCode || 'la moneda pendiente'}.`)
      return
    }
    if (fxRates.length > 0 && !fxRateDate) {
      setFxError('Indica la fecha de la tasa de cambio.')
      return
    }
    setFxSaving(true)
    setFxError(null)
    try {
      const exchangeRates: PayrollExchangeRatePayload[] = fxRates.map(r => ({ currencyId: r.currencyId, rate: Number(r.rate) }))
      const payload: PayrollExchangeRatesPayload = { baseCurrencyId: fxBaseCurrencyId, exchangeRates, rateDate: fxRates.length > 0 ? fxRateDate : undefined }
      const res = await payrollApi.replaceExchangeRates(fxPeriod.id, payload)
      const body = await res.json().catch(() => null)
      if (res.ok) {
        toast.success(body?.message ?? 'Tasas de cambio actualizadas.')
        setFxPeriod(null)
        await load(true)
      } else {
        setFxError(body?.message ?? 'Error al actualizar las tasas de cambio.')
      }
    } finally {
      setFxSaving(false)
    }
  }

  // ── Novedades ───────────────────────────────────────────────────────────────

  const [noveltyPeriod, setNoveltyPeriod] = useState<Period | null>(null)
  const [novelties, setNovelties]         = useState<Novelty[]>([])
  const [noveltyForm, setNoveltyForm]     = useState<NoveltyForm>(EMPTY_NOVELTY)
  const [noveltySaving, setNoveltySaving] = useState(false)
  const { mounted: noveltyMounted, closing: noveltyClosing } = useModalTransition(!!noveltyPeriod)

  const openNovelties = async (p: Period) => {
    setNoveltyForm(EMPTY_NOVELTY)
    setNoveltyPeriod(p)
    const res = await payrollApi.novelties(p.id)
    if (res.ok) setNovelties(await res.json())
  }

  const handleAddNovelty = async () => {
    if (!noveltyPeriod) return
    const amount = Number(noveltyForm.amount)
    if (!noveltyForm.employeeId || !noveltyForm.conceptId || !noveltyForm.amount.trim() || Number.isNaN(amount) || amount <= 0) {
      toast.error('Selecciona empleado, concepto y un monto mayor que cero.')
      return
    }
    setNoveltySaving(true)
    try {
      const payload: PayrollNoveltyPayload = {
        employeeId: noveltyForm.employeeId,
        conceptId: noveltyForm.conceptId,
        amount,
        notes: noveltyForm.notes.trim() || undefined,
      }
      const res = await payrollApi.addNovelty(noveltyPeriod.id, payload)
      const body = await res.json().catch(() => null)
      if (res.ok) {
        toast.success(body?.message ?? 'Novedad registrada.')
        setNoveltyForm(EMPTY_NOVELTY)
        const list = await payrollApi.novelties(noveltyPeriod.id)
        if (list.ok) setNovelties(await list.json())
        await load(true)
      } else {
        toast.error(body?.message ?? 'Error al registrar la novedad.')
      }
    } finally {
      setNoveltySaving(false)
    }
  }

  const handleDeleteNovelty = async (n: Novelty) => {
    const res = await payrollApi.removeNovelty(n.id)
    const body = await res.json().catch(() => null)
    if (res.ok) {
      toast.success(body?.message ?? 'Novedad eliminada.')
      setNovelties(prev => prev.filter(x => x.id !== n.id))
      await load(true)
    } else {
      toast.error(body?.message ?? 'Error al eliminar la novedad.')
    }
  }

  // ── Resultados ──────────────────────────────────────────────────────────────

  const [resultsPeriod, setResultsPeriod] = useState<Period | null>(null)
  const [details, setDetails]             = useState<Detail[]>([])
  const [selectedDetail, setSelectedDetail] = useState<Detail | null>(null)
  const [detailLines, setDetailLines]     = useState<DetailLine[]>([])
  const [linesLoading, setLinesLoading]   = useState(false)
  const { mounted: resultsMounted, closing: resultsClosing } = useModalTransition(!!resultsPeriod)

  const openResults = async (p: Period) => {
    setDetails([])
    setSelectedDetail(null)
    setDetailLines([])
    setResultsPeriod(p)
    const res = await payrollApi.details(p.id)
    if (res.ok) setDetails(await res.json())
  }

  // Alterna el desglose del empleado: si ya está desplegado lo contrae; si no,
  // lo selecciona y carga sus líneas.
  const openDetailLines = async (d: Detail) => {
    if (selectedDetail?.id === d.id) {
      setSelectedDetail(null)
      setDetailLines([])
      return
    }
    setSelectedDetail(d)
    setLinesLoading(true)
    try {
      const res = await payrollApi.detailLines(d.id)
      if (res.ok) setDetailLines(await res.json())
    } finally {
      setLinesLoading(false)
    }
  }

  // ── Exportación e impresión de los resultados del período ───────────────────

  const [exporting, setExporting] = useState(false)
  const [printing, setPrinting]   = useState(false)

  /** Nombre de archivo a partir del nombre del período (sin tildes ni símbolos). */
  const resultsFileName = () =>
    `nomina_${(resultsPeriod?.name ?? 'periodo').toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`

  /** Trae el desglose por concepto de todos los empleados del período. */
  const fetchAllLines = () =>
    Promise.all(details.map(async d => {
      const res = await payrollApi.detailLines(d.id)
      return { detail: d, lines: (res.ok ? await res.json() : []) as DetailLine[] }
    }))

  /** Exporta a Excel: hoja "Resumen" (planilla por empleado con totales) y hoja
   *  "Desglose" con todas las líneas de concepto de cada empleado. */
  const exportResultsExcel = async () => {
    if (!resultsPeriod || details.length === 0 || exporting) return
    setExporting(true)
    try {
      // Cada monto va en dos columnas separadas — moneda propia del empleado y
      // moneda base del período — en vez de una sola columna mezclada, para
      // que no haya ambigüedad ni se sumen montos de monedas distintas por
      // error. Los totales solo se calculan sobre las columnas en moneda
      // base (las únicas que sí pueden sumarse cuando hay más de una
      // moneda); "A pagar" es el monto real a entregarle a cada quien, en su
      // propia moneda, y no tiene un total válido si hay monedas distintas.
      // Los montos quedan como números reales (sumables, igual que antes),
      // pero con el signo de su moneda aplicado como formato de celda de
      // Excel — no como texto — para que se vean igual que en el PDF sin
      // perder la posibilidad de sumarlos o graficarlos.
      const baseSign = resultsPeriod.baseCurrencySymbol || resultsPeriod.baseCurrencyCode
      const curFmt    = (sign: string) => `"${sign}" #,##0.00`
      const curFmtRed = (sign: string) => `[Red]"${sign}" #,##0.00`
      const setZ = (ws: XLSX.WorkSheet, r: number, c: number, z: string) => {
        const cell = ws[XLSX.utils.encode_cell({ r, c })]
        if (cell) cell.z = z
      }

      const resumenHeaders = [
        'Código', 'Empleado', 'Departamento', 'Moneda', 'Tasa de cambio', 'Fecha tasa',
        'Bruto (moneda propia)', `Bruto (${baseSign})`,
        'Deducciones (moneda propia)', `Deducciones (${baseSign})`,
        'Costo patronal (moneda propia)', `Costo patronal (${baseSign})`,
        'Neto (moneda propia)', `Neto (${baseSign})`,
        'A pagar (moneda propia)',
      ]
      const resumenRows: (string | number | null)[][] = details.map(d => [
        d.employeeCode, d.employeeName, d.departmentName ?? '', d.currencySymbol || d.currencyCode, d.exchangeRate, d.exchangeRateDate ? fdate(d.exchangeRateDate) : '',
        d.grossPay, d.grossPay * d.exchangeRate,
        d.totalDeductions, d.totalDeductions * d.exchangeRate,
        d.employerCost, d.employerCost * d.exchangeRate,
        d.netPay, d.netPay * d.exchangeRate,
        d.netPay,
      ])
      resumenRows.push([
        '', `Totales (${baseSign})`, '', '', '', '',
        '', resultsPeriod.totalGross,
        '', resultsPeriod.totalDeductions,
        '', resultsPeriod.totalEmployerCost,
        '', resultsPeriod.totalNet,
        resultsPeriod.hasMultipleCurrencies ? '' : resultsPeriod.totalNet,
      ])

      const desgloseHeaders = ['Código', 'Empleado', 'Moneda', 'Concepto', 'Tipo', 'Base', 'Tasa %', 'Monto']
      const desgloseRows: (string | number | null)[][] = []
      const desgloseMeta: { sign: string; isDeduction: boolean }[] = []
      for (const { detail, lines } of await fetchAllLines())
        for (const l of lines) {
          const sign = detail.currencySymbol || detail.currencyCode
          desgloseRows.push([detail.employeeCode, detail.employeeName, sign, l.conceptName,
            conceptTypeLabel(l.conceptType), l.baseUsed ?? null, l.rateUsed ?? null, l.amount])
          desgloseMeta.push({ sign, isDeduction: l.conceptType === 'Deduction' })
        }

      // Anchos de columna ajustados al contenido, igual que en Empleados.
      const fit = (headers: string[], rows: (string | number | null)[][]) =>
        headers.map((h, i) => ({ wch: Math.max(h.length, ...rows.map(r => String(r[i] ?? '').length)) + 2 }))

      const wb = XLSX.utils.book_new()
      const wsResumen = XLSX.utils.aoa_to_sheet([resumenHeaders, ...resumenRows])
      wsResumen['!cols'] = fit(resumenHeaders, resumenRows)
      details.forEach((d, i) => {
        const r = i + 1
        const sign = d.currencySymbol || d.currencyCode
        setZ(wsResumen, r, 4, '0.000000')
        setZ(wsResumen, r, 6, curFmt(sign));    setZ(wsResumen, r, 7, curFmt(baseSign))
        setZ(wsResumen, r, 8, curFmtRed(sign)); setZ(wsResumen, r, 9, curFmtRed(baseSign))
        setZ(wsResumen, r, 10, curFmt(sign));   setZ(wsResumen, r, 11, curFmt(baseSign))
        setZ(wsResumen, r, 12, curFmt(sign));   setZ(wsResumen, r, 13, curFmt(baseSign))
        setZ(wsResumen, r, 14, curFmt(sign))
      })
      const totalsRow = details.length + 1
      setZ(wsResumen, totalsRow, 7, curFmt(baseSign))
      setZ(wsResumen, totalsRow, 9, curFmtRed(baseSign))
      setZ(wsResumen, totalsRow, 11, curFmt(baseSign))
      setZ(wsResumen, totalsRow, 13, curFmt(baseSign))
      if (!resultsPeriod.hasMultipleCurrencies) setZ(wsResumen, totalsRow, 14, curFmt(baseSign))
      XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen')

      const wsDesglose = XLSX.utils.aoa_to_sheet([desgloseHeaders, ...desgloseRows])
      wsDesglose['!cols'] = fit(desgloseHeaders, desgloseRows)
      desgloseMeta.forEach((m, i) => {
        const r = i + 1
        setZ(wsDesglose, r, 5, m.isDeduction ? curFmtRed(m.sign) : curFmt(m.sign))
        setZ(wsDesglose, r, 7, m.isDeduction ? curFmtRed(m.sign) : curFmt(m.sign))
      })
      XLSX.utils.book_append_sheet(wb, wsDesglose, 'Desglose')
      XLSX.writeFile(wb, `${resultsFileName()}.xlsx`)
    } finally { setExporting(false) }
  }

  /** Construye el PDF de la nómina (jsPDF, importado bajo demanda): planilla
   *  resumen del período seguida del recibo por concepto de cada empleado.
   *  Hoja horizontal para dar espacio a todas las columnas (moneda, montos y
   *  el desglose de conceptos) sin que el texto se encime. */
  const buildResultsPdf = async () => {
    if (!resultsPeriod) return null
    const p = resultsPeriod
    const allLines = await fetchAllLines()
    const { jsPDF } = await import('jspdf')
    // Las fuentes base de jsPDF (Helvetica, Times, Courier) solo cubren
    // Latin-1 y no traen el signo ₡; se registra Noto Sans (que sí lo
    // incluye) antes de crear el documento. El módulo se engancha al jsPDF
    // ya importado vía window.jspdf, tal como espera su envoltorio UMD.
    ;(window as unknown as { jspdf: { jsPDF: typeof jsPDF } }).jspdf = { jsPDF }
    await import('../../lib/fonts/NotoSans-jsPDF.js')
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' })

    const marginX = 40, rightX = 802, pageBottom = 545
    const company = await loadCompanyHeaderData()
    let y = drawCompanyHeader(pdf, company, marginX, rightX) || 40
    const salto = (necesario: number) => {
      if (y + necesario > pageBottom) { pdf.addPage(); y = 40 }
    }

    // Tasa aplicada de cada moneda distinta a la base, tomada de los propios
    // resultados (la tasa con la que se calculó cada empleado), no de la
    // configuración actual del período (que pudo cambiar desde entonces).
    const fxRatesUsed = () => {
      const seen = new Map<string, { rate: number; date?: string }>()
      details.forEach(d => { if (d.currencyId !== p.baseCurrencyId && !seen.has(d.currencyCode)) seen.set(d.currencyCode, { rate: d.exchangeRate, date: d.exchangeRateDate }) })
      return Array.from(seen.entries())
    }

    // Encabezado del documento
    pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(16); pdf.setTextColor(15, 23, 42)
    pdf.text(`Nómina — ${p.name}`, marginX, y)
    pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(10); pdf.setTextColor(79, 70, 229)
    pdf.text(statusInfo(p.status).label, rightX, y, { align: 'right' })
    pdf.setFont('NotoSans', 'normal'); pdf.setTextColor(100, 116, 139)
    const rates = fxRatesUsed()
    const rateText = rates.length > 0
      ? ` · Tasa de cambio: ${rates.map(([code, r]) => `1 ${code} = ${money(r.rate)} ${p.baseCurrencyCode}${r.date ? ` (al ${fdate(r.date)})` : ''}`).join(', ')}`
      : ''
    pdf.text(`${freqLabel(p.payFrequency)} · ${fdate(p.startDate)} al ${fdate(p.endDate)} · Pago: ${fdate(p.payDate)}${rateText}`, marginX, y + 16)
    y += 30
    pdf.setDrawColor(79, 70, 229); pdf.setLineWidth(1.5)
    pdf.line(marginX, y, rightX, y)
    pdf.setLineWidth(0.75)
    y += 22

    // Planilla resumen: una fila por empleado con los montos consolidados en
    // la moneda base del período (para que los totales sumen). Cuando el
    // empleado cobra en otra moneda, debajo de cada monto se añade una línea
    // gris con el valor en su propia moneda; "A pagar" muestra siempre el
    // monto real a entregarle, en su propia moneda, que es el dato que
    // importa para tesorería.
    const nameW = 200
    const numAreaStart = 260
    const baseSign = p.baseCurrencySymbol || p.baseCurrencyCode
    const numLabels = [
      `SALARIO BRUTO (${baseSign})`, `DEDUCCIONES (${baseSign})`,
      `COSTO PAT. (${baseSign})`, `NETO (${baseSign})`, 'A PAGAR',
    ]
    const numStep = (rightX - numAreaStart) / numLabels.length
    const numCols = numLabels.map((_, i) => numAreaStart + numStep * (i + 1))
    const cabecera = () => {
      pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(7); pdf.setTextColor(148, 163, 184)
      pdf.text('EMPLEADO', marginX, y)
      numLabels.forEach((h, i) => pdf.text(h, numCols[i], y, { align: 'right' }))
      y += 6
      pdf.setDrawColor(226, 232, 240); pdf.line(marginX, y, rightX, y)
    }
    cabecera()
    for (const d of allLines.map(x => x.detail)) {
      const isFx = d.currencyId !== p.baseCurrencyId
      salto(30)
      y += 14
      pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(8); pdf.setTextColor(15, 23, 42)
      pdf.text(pdf.splitTextToSize(d.employeeName, nameW)[0], marginX, y)
      pdf.setFont('NotoSans', 'normal'); pdf.setFontSize(8); pdf.setTextColor(15, 23, 42)
      pdf.text(cmoney(d.grossPay * d.exchangeRate, p.baseCurrencySymbol), numCols[0], y, { align: 'right' })
      pdf.setTextColor(239, 68, 68)
      pdf.text(`-${cmoney(d.totalDeductions * d.exchangeRate, p.baseCurrencySymbol)}`, numCols[1], y, { align: 'right' })
      pdf.setTextColor(15, 23, 42)
      pdf.text(cmoney(d.employerCost * d.exchangeRate, p.baseCurrencySymbol), numCols[2], y, { align: 'right' })
      pdf.text(cmoney(d.netPay * d.exchangeRate, p.baseCurrencySymbol), numCols[3], y, { align: 'right' })
      pdf.setFont('NotoSans', 'bold'); pdf.setTextColor(79, 70, 229)
      pdf.text(cmoney(d.netPay, d.currencySymbol), numCols[4], y, { align: 'right' })

      // Segunda línea: código de empleado + moneda propia y, si cobra en una
      // moneda distinta a la base, el monto nativo bajo cada columna.
      y += 9
      pdf.setFont('NotoSans', 'normal'); pdf.setFontSize(6.5); pdf.setTextColor(148, 163, 184)
      pdf.text(`${d.employeeCode} · ${d.currencySymbol || d.currencyCode}`, marginX, y)
      if (isFx) {
        pdf.text(cmoney(d.grossPay, d.currencySymbol), numCols[0], y, { align: 'right' })
        pdf.text(`-${cmoney(d.totalDeductions, d.currencySymbol)}`, numCols[1], y, { align: 'right' })
        pdf.text('—', numCols[2], y, { align: 'right' })
        pdf.text(cmoney(d.netPay, d.currencySymbol), numCols[3], y, { align: 'right' })
      }
      y += 8
      pdf.setDrawColor(241, 245, 249); pdf.line(marginX, y, rightX, y)
    }
    salto(20)
    y += 14
    pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(8); pdf.setTextColor(15, 23, 42)
    pdf.text('Totales', marginX, y)
    pdf.text(cmoney(p.totalGross, p.baseCurrencySymbol), numCols[0], y, { align: 'right' })
    pdf.setTextColor(239, 68, 68)
    pdf.text(`-${cmoney(p.totalDeductions, p.baseCurrencySymbol)}`, numCols[1], y, { align: 'right' })
    pdf.setTextColor(15, 23, 42)
    pdf.text(cmoney(p.totalEmployerCost, p.baseCurrencySymbol), numCols[2], y, { align: 'right' })
    pdf.text(cmoney(p.totalNet, p.baseCurrencySymbol), numCols[3], y, { align: 'right' })
    pdf.setFont('NotoSans', 'bold'); pdf.setTextColor(79, 70, 229)
    // "A pagar" no tiene un total válido si hay empleados en más de una
    // moneda: sumar montos en monedas distintas no significa nada.
    pdf.text(p.hasMultipleCurrencies ? '—' : cmoney(p.totalNet, p.baseCurrencySymbol), numCols[4], y, { align: 'right' })
    y += 10

    // Recibo por empleado: concepto, base, tasa y monto en columnas fijas (en
    // la moneda propia del empleado), para que nada se encime. Si el empleado
    // se paga en una moneda distinta a la base, entre TASA y MONTO se agrega
    // una columna con el monto en su propia moneda; la columna MONTO pasa a
    // mostrar el equivalente convertido a la moneda base.
    // Las líneas se seccionan por tipo de concepto (Ingresos, Deducciones,
    // Aportes patronales) en vez de mezclarse en una sola lista, con un
    // subtotal por sección; los aportes patronales se marcan como que no
    // afectan el neto para que no se confundan con una deducción al empleado.
    const rBase = 560, rTasa = 620
    const rMontoNative = 710 // solo cuando la moneda del empleado no es la base
    const rMontoSingle = rightX
    const reciboHeader = (isFx: boolean, currencyCode: string) => {
      pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(7); pdf.setTextColor(148, 163, 184)
      pdf.text('CONCEPTO', marginX, y)
      pdf.text('BASE', rBase, y, { align: 'right' })
      pdf.text('TASA', rTasa, y, { align: 'right' })
      if (isFx) {
        pdf.text(`MONTO (${currencyCode})`, rMontoNative, y, { align: 'right' })
        pdf.text('MONTO', rMontoSingle, y, { align: 'right' })
      } else {
        pdf.text('MONTO', rMontoSingle, y, { align: 'right' })
      }
      y += 6
      pdf.setDrawColor(226, 232, 240); pdf.line(marginX, y, rightX, y)
    }
    // Cada sección lleva una sombra tenue (mismo tono que su etiqueta en la
    // pantalla: verde para ingresos, rojo para deducciones, celeste para
    // aportes patronales) para que el bloque se lea de un vistazo.
    const RECIBO_SECTIONS: { type: string; label: string; fill: [number, number, number] }[] = [
      { type: 'Earning', label: 'Ingresos', fill: [236, 253, 245] },
      { type: 'Deduction', label: 'Deducciones', fill: [254, 242, 242] },
      { type: 'EmployerContribution', label: 'Aportes patronales (no afectan el neto)', fill: [240, 249, 255] },
    ]
    for (const { detail, lines } of allLines) {
      const isFx = detail.currencyId !== p.baseCurrencyId
      salto(78)
      y += 26
      pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(10); pdf.setTextColor(79, 70, 229)
      pdf.text(`${detail.employeeCode} · ${detail.employeeName}${isFx ? ` (${detail.currencyCode})` : ''}`, marginX, y)
      y += 10
      reciboHeader(isFx, detail.currencyCode)
      for (const section of RECIBO_SECTIONS) {
        const sectionLines = lines.filter(l => l.conceptType === section.type)
        if (sectionLines.length === 0) continue
        salto(18)
        y += 14
        // Franja anclada a la línea base de este texto (no al punto donde
        // quedó el cursor tras el elemento anterior), para no invadir el
        // renglón previo ni tapar descendentes como la "g" de "ingresos".
        pdf.setFillColor(...section.fill); pdf.rect(marginX - 4, y - 9, rightX - marginX + 8, 12, 'F')
        pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(7.5); pdf.setTextColor(100, 116, 139)
        pdf.text(section.label, marginX, y)
        for (const l of sectionLines) {
          salto(20)
          y += 14
          pdf.setFont('NotoSans', 'normal'); pdf.setFontSize(8); pdf.setTextColor(15, 23, 42)
          pdf.text(pdf.splitTextToSize(l.conceptName, rBase - marginX - 30)[0], marginX, y)
          if (l.baseUsed != null) pdf.text(money(l.baseUsed), rBase, y, { align: 'right' })
          if (l.rateUsed != null) pdf.text(`${l.rateUsed}%`, rTasa, y, { align: 'right' })
          const sign = l.conceptType === 'Deduction' ? '-' : ''
          if (isFx) {
            pdf.text(`${sign}${money(l.amount)}`, rMontoNative, y, { align: 'right' })
            pdf.text(`${sign}${money(l.amount * detail.exchangeRate)}`, rMontoSingle, y, { align: 'right' })
          } else {
            pdf.text(`${sign}${money(l.amount)}`, rMontoSingle, y, { align: 'right' })
          }
        }
        salto(16)
        y += 13
        const subtotal = sectionLines.reduce((s, l) => s + l.amount, 0)
        const sign = section.type === 'Deduction' ? '-' : ''
        pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(7.5); pdf.setTextColor(71, 85, 105)
        pdf.text(`Total ${section.label.toLowerCase().replace(' (no afectan el neto)', '')}`, marginX, y)
        if (isFx) {
          pdf.text(`${sign}${money(subtotal)}`, rMontoNative, y, { align: 'right' })
          pdf.text(`${sign}${money(subtotal * detail.exchangeRate)}`, rMontoSingle, y, { align: 'right' })
        } else {
          pdf.text(`${sign}${money(subtotal)}`, rMontoSingle, y, { align: 'right' })
        }
      }
      salto(20)
      y += 15
      pdf.setDrawColor(226, 232, 240); pdf.line(marginX, y - 10, rightX, y - 10)
      pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(9); pdf.setTextColor(15, 23, 42)
      pdf.text('Neto a pagar', marginX, y)
      if (isFx) {
        pdf.text(money(detail.netPay), rMontoNative, y, { align: 'right' })
        pdf.text(money(detail.netPay * detail.exchangeRate), rMontoSingle, y, { align: 'right' })
      } else {
        pdf.text(money(detail.netPay), rMontoSingle, y, { align: 'right' })
      }
    }

    salto(34)
    pdf.setFont('NotoSans', 'normal'); pdf.setFontSize(8); pdf.setTextColor(148, 163, 184)
    pdf.text(`Generada el ${new Date().toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' })}`, marginX, y + 24)
    return pdf
  }

  /** Imprime el PDF de la nómina: se carga en un iframe oculto y su visor abre
   *  el diálogo de impresión (autoPrint), igual que la ficha de empleado. */
  const printResults = async () => {
    if (!resultsPeriod || details.length === 0 || printing) return
    setPrinting(true)
    try {
      const pdf = await buildResultsPdf()
      if (!pdf) return
      pdf.autoPrint()
      const url = URL.createObjectURL(pdf.output('blob'))
      const iframe = document.createElement('iframe')
      iframe.style.position = 'fixed'
      iframe.style.width = '0'
      iframe.style.height = '0'
      iframe.style.border = '0'
      iframe.src = url
      // No hay evento fiable de "diálogo cerrado" con PDFs: se limpia con margen.
      setTimeout(() => { iframe.remove(); URL.revokeObjectURL(url) }, 60_000)
      document.body.appendChild(iframe)
    } finally { setPrinting(false) }
  }

  // ── Conceptos: CRUD ─────────────────────────────────────────────────────────

  const [conceptModalOpen, setConceptModalOpen] = useState(false)
  const [editingConcept, setEditingConcept] = useState<Concept | null>(null)
  const [conceptForm, setConceptForm]   = useState<ConceptForm>(EMPTY_CONCEPT)
  const [conceptError, setConceptError] = useState<string | null>(null)
  const [conceptSaving, setConceptSaving] = useState(false)
  const [deleteConceptTarget, setDeleteConceptTarget] = useState<Concept | null>(null)
  const { mounted: conceptMounted, closing: conceptClosing } = useModalTransition(conceptModalOpen)

  const openCreateConcept = () => {
    setEditingConcept(null)
    setConceptForm(EMPTY_CONCEPT)
    setConceptError(null)
    setConceptModalOpen(true)
  }

  const openEditConcept = (c: Concept) => {
    setEditingConcept(c)
    setConceptForm({
      code: c.code, name: c.name, conceptType: c.conceptType, calcType: c.calcType,
      baseType: c.baseType ?? '',
      defaultAmount: c.defaultAmount != null ? String(c.defaultAmount) : '',
      percentage: c.percentage != null ? String(c.percentage) : '',
      baseCapAmount: c.baseCapAmount != null ? String(c.baseCapAmount) : '',
      annualizationFactor: c.annualizationFactor != null ? String(c.annualizationFactor) : '',
      affectsTaxable: c.affectsTaxable, appliesToAll: c.appliesToAll,
      calcOrder: String(c.calcOrder),
    })
    setConceptError(null)
    setConceptModalOpen(true)
  }

  const handleSaveConcept = async () => {
    if (!conceptForm.code.trim() || !conceptForm.name.trim()) {
      setConceptError('El código y el nombre son requeridos.')
      return
    }
    if (conceptForm.calcType === 'Percent' && (!conceptForm.percentage.trim() || Number(conceptForm.percentage) <= 0)) {
      setConceptError('Un concepto porcentual requiere el porcentaje mayor que cero.')
      return
    }
    if (conceptForm.calcType !== 'Fixed' && !conceptForm.baseType) {
      setConceptError('Indica la base de cálculo.')
      return
    }
    setConceptSaving(true)
    setConceptError(null)
    try {
      const payload: PayrollConceptPayload = {
        code: conceptForm.code.trim().toUpperCase(),
        name: conceptForm.name.trim(),
        conceptType: conceptForm.conceptType,
        calcType: conceptForm.calcType,
        baseType: conceptForm.calcType === 'Fixed' ? null : conceptForm.baseType,
        defaultAmount: conceptForm.calcType === 'Fixed' && conceptForm.defaultAmount.trim() !== '' ? Number(conceptForm.defaultAmount) : null,
        percentage: conceptForm.calcType === 'Percent' ? Number(conceptForm.percentage) : null,
        baseCapAmount: conceptForm.calcType === 'Percent' && conceptForm.baseCapAmount.trim() !== '' ? Number(conceptForm.baseCapAmount) : null,
        annualizationFactor: conceptForm.calcType === 'Brackets' ? Number(conceptForm.annualizationFactor || '1') : null,
        affectsTaxable: conceptForm.conceptType === 'Deduction' ? conceptForm.affectsTaxable : false,
        appliesToAll: conceptForm.appliesToAll,
        calcOrder: Number(conceptForm.calcOrder || '100'),
      }
      const res = editingConcept
        ? await payrollApi.updateConcept(editingConcept.id, payload)
        : await payrollApi.createConcept(payload)
      const body = await res.json().catch(() => null)
      if (res.ok) {
        toast.success(body?.message ?? 'Concepto guardado correctamente.')
        setConceptModalOpen(false)
        await load(true)
      } else {
        setConceptError(body?.message ?? 'Error al guardar el concepto.')
      }
    } finally {
      setConceptSaving(false)
    }
  }

  const handleToggleConcept = async (c: Concept) => {
    const res = await payrollApi.toggleConcept(c.id)
    const body = await res.json().catch(() => null)
    if (res.ok) { toast.success(body?.message ?? 'Estado actualizado.'); await load(true) }
    else toast.error(body?.message ?? 'Error al cambiar el estado.')
  }

  const handleDeleteConcept = async () => {
    if (!deleteConceptTarget) return
    try {
      const res = await payrollApi.removeConcept(deleteConceptTarget.id)
      const body = await res.json().catch(() => null)
      if (res.ok) { toast.success(body?.message ?? 'Concepto eliminado.'); await load(true) }
      else toast.error(body?.message ?? 'Error al eliminar el concepto.')
    } finally {
      setDeleteConceptTarget(null)
    }
  }

  // ── Tramos (escala progresiva) ──────────────────────────────────────────────

  const [bracketsConcept, setBracketsConcept] = useState<Concept | null>(null)
  const [bracketRows, setBracketRows]   = useState<Bracket[]>([])
  const [bracketsSaving, setBracketsSaving] = useState(false)
  const { mounted: bracketsMounted, closing: bracketsClosing } = useModalTransition(!!bracketsConcept)

  const openBrackets = async (c: Concept) => {
    setBracketRows([])
    setBracketsConcept(c)
    const res = await payrollApi.brackets(c.id)
    if (res.ok) {
      const rows: Bracket[] = await res.json()
      setBracketRows(rows.length > 0 ? rows : [{ lowerLimit: 0, upperLimit: null, fixedQuota: 0, ratePercent: 0 }])
    }
  }

  const updateBracketRow = (i: number, field: keyof Bracket, value: string) => {
    setBracketRows(rows => rows.map((r, idx) => {
      if (idx !== i) return r
      const num = value.trim() === '' ? null : Number(value)
      return { ...r, [field]: field === 'upperLimit' ? num : (num ?? 0) }
    }))
  }

  const handleSaveBrackets = async () => {
    if (!bracketsConcept) return
    for (const r of bracketRows) {
      if (Number.isNaN(r.lowerLimit) || (r.upperLimit != null && Number.isNaN(r.upperLimit))) {
        toast.error('Revisa los límites de los tramos: hay valores no numéricos.')
        return
      }
    }
    setBracketsSaving(true)
    try {
      const payload: PayrollBracketPayload[] = bracketRows.map(r => ({
        lowerLimit: r.lowerLimit,
        upperLimit: r.upperLimit ?? null,
        fixedQuota: r.fixedQuota,
        ratePercent: r.ratePercent,
      }))
      const res = await payrollApi.replaceBrackets(bracketsConcept.id, payload)
      const body = await res.json().catch(() => null)
      if (res.ok) {
        toast.success(body?.message ?? 'Tramos actualizados.')
        setBracketsConcept(null)
        await load(true)
      } else {
        toast.error(body?.message ?? 'Error al guardar los tramos.')
      }
    } finally {
      setBracketsSaving(false)
    }
  }

  // ── Derivados ───────────────────────────────────────────────────────────────

  const q = search.trim().toLowerCase()
  const filteredPeriods  = periods.filter(p => !q || p.name.toLowerCase().includes(q))
  const filteredConcepts = concepts.filter(c => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))

  const activeConceptOptions = concepts
    .filter(c => c.isActive && !c.appliesToAll)
    .map(c => ({ value: c.id, label: `${c.name} (${conceptTypeLabel(c.conceptType)})` }))

  const employeeOptions = employees.map(e => ({ value: e.id, label: `${e.code} - ${e.firstName} ${e.lastName}` }))

  const summaryParams = (c: Concept) => {
    if (c.calcType === 'Fixed')    return c.defaultAmount != null ? money(c.defaultAmount) : 'Monto por novedad/asignación'
    if (c.calcType === 'Percent')  return `${c.percentage}% de ${baseTypeLabel(c.baseType)}${c.baseCapAmount != null ? ` (tope ${money(c.baseCapAmount)})` : ''}`
    return `${c.bracketCount} tramo(s) sobre ${baseTypeLabel(c.baseType)}${(c.annualizationFactor ?? 1) !== 1 ? ` ×${c.annualizationFactor}` : ''}`
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-4">

      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Nómina</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Motor parametrizable por conceptos: configura ingresos, deducciones y aportes según las reglas de tu país.
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
          {tab === 'periodos' ? (
            canPeriodCreate && (
              <button onClick={openCreatePeriod}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                <Plus className="w-4 h-4" />
                Nuevo Período
              </button>
            )
          ) : (
            canConceptCreate && (
              <button onClick={openCreateConcept}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                <Plus className="w-4 h-4" />
                Nuevo Concepto
              </button>
            )
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700">
        {([
          { key: 'periodos',  label: 'Períodos',  icon: Wallet,            count: periods.length },
          { key: 'conceptos', label: 'Conceptos', icon: SlidersHorizontal, count: concepts.length },
        ] as const).map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setSearch('') }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}>
            <t.icon className="w-4 h-4" />
            {t.label}
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
              tab === t.key
                ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400'
                : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
            }`}>
              {loading ? '…' : t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Búsqueda */}
      <div className="relative flex-1 min-w-0 sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder={tab === 'periodos' ? 'Buscar período…' : 'Buscar por código o nombre…'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
        />
      </div>

      {/* ── Tabla de PERÍODOS ── */}
      {tab === 'periodos' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
                  <th className={`${thCls} text-left`}>Período</th>
                  <th className={`${thCls} text-center hidden md:table-cell`}>Frecuencia</th>
                  <th className={`${thCls} text-center hidden lg:table-cell`}>Pago</th>
                  <th className={`${thCls} text-center`}>Empleados</th>
                  <th className={`${thCls} text-right hidden sm:table-cell`}>Bruto</th>
                  <th className={`${thCls} text-right`}>Neto</th>
                  <th className={`${thCls} text-center`}>Estado</th>
                  <th className={`${thCls} text-center`}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-slate-50 dark:border-slate-700/40">
                      {[44, 20, 20, 14, 24, 24, 18, 32].map((w, j) => (
                        <td key={j} className="px-5 py-3"><div className="h-4 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" style={{ width: `${w * 4}px` }} /></td>
                      ))}
                    </tr>
                  ))
                ) : filteredPeriods.length === 0 ? (
                  <tr><td colSpan={8} className="px-5 py-12 text-center text-slate-400">
                    {q ? 'Sin resultados para la búsqueda.' : 'No hay períodos de nómina. Crea el primero con "Nuevo Período".'}
                  </td></tr>
                ) : (
                  filteredPeriods.map(p => (
                    <tr key={p.id} className="border-b border-slate-50 dark:border-slate-700/40 hover:bg-slate-50/60 dark:hover:bg-slate-700/20 transition-colors">
                      <td className="px-5 py-2.5 align-middle">
                        <p className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          {p.name}
                          {p.hasMultipleCurrencies && (
                            <span title="Empleados pagados en más de una moneda" className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400">
                              {p.baseCurrencyCode}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">{fdate(p.startDate)} — {fdate(p.endDate)}</p>
                      </td>
                      <td className="px-5 py-2.5 text-center align-middle hidden md:table-cell text-slate-500 dark:text-slate-400">{freqLabel(p.payFrequency)}</td>
                      <td className="px-5 py-2.5 text-center align-middle hidden lg:table-cell text-slate-500 dark:text-slate-400">{fdate(p.payDate)}</td>
                      <td className="px-5 py-2.5 text-center align-middle text-slate-700 dark:text-slate-300">{p.employeeCount}</td>
                      <td className="px-5 py-2.5 text-right align-middle hidden sm:table-cell text-slate-700 dark:text-slate-300">{p.employeeCount > 0 ? cmoney(p.totalGross, p.baseCurrencySymbol) : '—'}</td>
                      <td className="px-5 py-2.5 text-right align-middle font-semibold text-slate-800 dark:text-slate-200">{p.employeeCount > 0 ? cmoney(p.totalNet, p.baseCurrencySymbol) : '—'}</td>
                      <td className="px-5 py-2.5 text-center align-middle">
                        <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${statusInfo(p.status).badge}`}>
                          {statusInfo(p.status).label}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 align-middle">
                        <div className="flex items-center justify-center gap-0.5">
                          {(p.status === 'Open' || p.status === 'Calculated') && canCalculate && (
                            <button onClick={() => handleCalculate(p)} disabled={actioningId === p.id}
                              title={p.status === 'Open' ? 'Calcular nómina' : 'Recalcular nómina'} className={actionCls}>
                              {actioningId === p.id
                                ? <div className="w-3.5 h-3.5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                                : <Calculator className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          {(p.status === 'Open' || p.status === 'Calculated') && (
                            <button onClick={() => openNovelties(p)} title={`Novedades (${p.noveltyCount})`} className={actionCls}>
                              <ClipboardList className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {(p.status === 'Open' || p.status === 'Calculated') && canRatesReplace && (
                            <button onClick={() => openExchangeRates(p)} title="Moneda y tasas de cambio" className={actionCls}>
                              <Coins className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {p.employeeCount > 0 && (
                            <button onClick={() => openResults(p)} title="Ver resultados" className={actionCls}>
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {p.status === 'Calculated' && canApprove && (
                            <button onClick={() => handleApprove(p)} title="Aprobar" className={actionCls}>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {p.status === 'Approved' && canPay && (
                            <button onClick={() => setPayTarget(p)} title="Marcar como pagado" className={actionCls}>
                              <Banknote className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {(p.status === 'Calculated' || p.status === 'Approved') && canReopen && (
                            <button onClick={() => setReopenTarget(p)} title="Reabrir para recalcular" className={actionCls}>
                              <Undo2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {(p.status === 'Open' || p.status === 'Calculated') && canPeriodDelete && (
                            <button onClick={() => setDeletePeriodTarget(p)} title="Eliminar" className={deleteCls}>
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
        </div>
      )}

      {/* ── Tabla de CONCEPTOS ── */}
      {tab === 'conceptos' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
                  <th className={`${thCls} text-left`}>Concepto</th>
                  <th className={`${thCls} text-center`}>Tipo</th>
                  <th className={`${thCls} text-left hidden md:table-cell`}>Cálculo</th>
                  <th className={`${thCls} text-center hidden lg:table-cell`}>Automático</th>
                  <th className={`${thCls} text-center`}>Estado</th>
                  <th className={`${thCls} text-center`}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-slate-50 dark:border-slate-700/40">
                      {[48, 22, 52, 14, 16, 28].map((w, j) => (
                        <td key={j} className="px-5 py-3"><div className="h-4 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" style={{ width: `${w * 4}px` }} /></td>
                      ))}
                    </tr>
                  ))
                ) : filteredConcepts.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                    {q ? 'Sin resultados para la búsqueda.' : 'No hay conceptos configurados.'}
                  </td></tr>
                ) : (
                  filteredConcepts.map(c => (
                    <tr key={c.id} className="border-b border-slate-50 dark:border-slate-700/40 hover:bg-slate-50/60 dark:hover:bg-slate-700/20 transition-colors">
                      <td className="px-5 py-2.5 align-middle">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">{c.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5 font-mono">{c.code}</p>
                      </td>
                      <td className="px-5 py-2.5 text-center align-middle">
                        <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${conceptTypeBadge(c.conceptType)}`}>
                          {conceptTypeLabel(c.conceptType)}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 align-middle hidden md:table-cell">
                        <p className="text-slate-700 dark:text-slate-300">{calcTypeLabel(c.calcType)}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{summaryParams(c)}</p>
                      </td>
                      <td className="px-5 py-2.5 text-center align-middle hidden lg:table-cell text-slate-500 dark:text-slate-400">
                        {c.appliesToAll ? 'Sí' : c.assignedCount > 0 ? `${c.assignedCount} asignado(s)` : 'Por novedad'}
                      </td>
                      <td className="px-5 py-2.5 text-center align-middle">
                        <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${
                          c.isActive
                            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                        }`}>
                          {c.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 align-middle">
                        <div className="flex items-center justify-center gap-0.5">
                          {canConceptUpdate && (
                            <button onClick={() => openEditConcept(c)} title="Editar" className={actionCls}>
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {c.calcType === 'Brackets' && canBracketsReplace && (
                            <button onClick={() => openBrackets(c)} title="Editar tramos de la escala" className={actionCls}>
                              <Layers className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canConceptToggle && (
                            <button onClick={() => handleToggleConcept(c)} title={c.isActive ? 'Desactivar' : 'Activar'} className={actionCls}>
                              {c.isActive ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          {canConceptDelete && (
                            <button onClick={() => setDeleteConceptTarget(c)} title="Eliminar" className={deleteCls}>
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
        </div>
      )}

      {/* Modal nuevo período */}
      {periodMounted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${periodClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden ${periodClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            {/* Encabezado fijo */}
            <div className="px-6 pt-6 shrink-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-5">Nuevo Período de Nómina</h2>
            </div>
            {/* Cuerpo con scroll propio */}
            <div className="flex-1 overflow-y-auto px-6 pb-5 space-y-4 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
              <div className="space-y-1.5">
                <label className={labelCls}>Nombre <span className="text-red-500">*</span></label>
                <input type="text" maxLength={120} placeholder="Ej: Julio 2026" value={periodForm.name}
                  onChange={e => setPeriodForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={labelCls}>Frecuencia <span className="text-red-500">*</span></label>
                  <SearchSelect options={FREQUENCIES} value={periodForm.payFrequency}
                    onChange={v => setPeriodForm(f => ({ ...f, payFrequency: v || 'Monthly' }))}
                    placeholder="Selecciona…" searchPlaceholder="Buscar…" clearable={false} />
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Moneda base <span className="text-red-500">*</span></label>
                  <SearchSelect options={currencyOptions} value={periodForm.baseCurrencyId}
                    onChange={v => setPeriodForm(f => ({ ...f, baseCurrencyId: v || '', exchangeRates: syncExchangeRates(v || '', f.exchangeRates) }))}
                    placeholder="Selecciona…" searchPlaceholder="Buscar…" clearable={false} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className={labelCls}>Desde <span className="text-red-500">*</span></label>
                  <DatePicker value={periodForm.startDate} onChange={d => setPeriodForm(f => ({ ...f, startDate: d }))} maxDate={periodForm.endDate || undefined} />
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Hasta <span className="text-red-500">*</span></label>
                  <DatePicker value={periodForm.endDate} onChange={d => setPeriodForm(f => ({ ...f, endDate: d }))} minDate={periodForm.startDate || undefined} />
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Fecha de pago <span className="text-red-500">*</span></label>
                  <DatePicker value={periodForm.payDate} onChange={d => setPeriodForm(f => ({ ...f, payDate: d }))} />
                </div>
              </div>
              {periodForm.exchangeRates.length > 0 && (
                <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-700 p-3.5">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="block text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">Tasa de cambio *</span>
                      <div className="space-y-2">
                      {periodForm.exchangeRates.map(r => (
                        <div key={r.currencyId} className="flex items-center gap-2">
                          <span className="text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">1 {r.currencyCode} =</span>
                          <input type="number" min={0} step="0.000001" placeholder="0.00" value={r.rate}
                            onChange={e => setPeriodForm(f => ({
                              ...f,
                              exchangeRates: f.exchangeRates.map(x => x.currencyId === r.currencyId ? { ...x, rate: e.target.value } : x),
                            }))}
                            className={rateInputCls} />
                          <span className="text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {currencies.find(c => c.id === periodForm.baseCurrencyId)?.code ?? ''}
                          </span>
                        </div>
                      ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="block text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">Fecha de la tasa *</span>
                      <DatePicker value={periodForm.rateDate} onChange={d => setPeriodForm(f => ({ ...f, rateDate: d }))} />
                    </div>
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <label className={labelCls}>Notas</label>
                <textarea rows={2} maxLength={500} placeholder="Observaciones del período…" value={periodForm.notes}
                  onChange={e => setPeriodForm(f => ({ ...f, notes: e.target.value }))} className={`${inputCls} resize-none`} />
              </div>
              {periodError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {periodError}
                </div>
              )}
            </div>
            {/* Pie fijo: acciones */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button onClick={() => setPeriodModalOpen(false)} disabled={periodSaving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleSavePeriod} disabled={periodSaving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {periodSaving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Save className="w-3.5 h-3.5" />}
                {periodSaving ? 'Guardando…' : 'Crear Período'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal moneda y tasas de cambio del período */}
      {fxMounted && fxPeriod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${fxClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden ${fxClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            {/* Encabezado fijo */}
            <div className="px-6 pt-6 shrink-0">
              <div className="flex items-start justify-between gap-3 mb-1">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Moneda — {fxPeriod.name}</h2>
                <button onClick={() => setFxPeriod(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-slate-500 mb-4">
                {fxPeriod.status === 'Calculated'
                  ? 'El período está calculado; si cambias algo aquí se reabrirá para que lo recalcules.'
                  : 'Moneda en la que se consolidan los totales del período y la tasa de cada moneda distinta que usen los empleados.'}
              </p>
            </div>
            {/* Cuerpo con scroll propio */}
            <div className="flex-1 overflow-y-auto px-6 pb-5 space-y-4 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
              <div className="space-y-1.5">
                <label className={labelCls}>Moneda base <span className="text-red-500">*</span></label>
                <SearchSelect options={currencyOptions} value={fxBaseCurrencyId}
                  onChange={v => { const nv = v || ''; setFxBaseCurrencyId(nv); setFxRates(prev => syncExchangeRates(nv, prev)) }}
                  placeholder="Selecciona…" searchPlaceholder="Buscar…" clearable={false} />
              </div>
              {fxRates.length > 0 ? (
                <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-700 p-3.5">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="block text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">Tasa de cambio *</span>
                      <div className="space-y-2">
                        {fxRates.map(r => (
                          <div key={r.currencyId} className="flex items-center gap-2">
                            <span className="text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">1 {r.currencyCode} =</span>
                            <input type="number" min={0} step="0.000001" placeholder="0.00" value={r.rate}
                              onChange={e => setFxRates(prev => prev.map(x => x.currencyId === r.currencyId ? { ...x, rate: e.target.value } : x))}
                              className={rateInputCls} />
                            <span className="text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
                              {currencies.find(c => c.id === fxBaseCurrencyId)?.code ?? ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="block text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">Fecha de la tasa *</span>
                      <DatePicker value={fxRateDate} onChange={setFxRateDate} />
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-4 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
                  Todos los empleados activos se pagan en esta moneda; no hace falta ninguna tasa.
                </p>
              )}
              {fxError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {fxError}
                </div>
              )}
            </div>
            {/* Pie fijo: acciones */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button onClick={() => setFxPeriod(null)} disabled={fxSaving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveExchangeRates} disabled={fxSaving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {fxSaving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Save className="w-3.5 h-3.5" />}
                {fxSaving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal novedades del período */}
      {noveltyMounted && noveltyPeriod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${noveltyClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden ${noveltyClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            {/* Encabezado fijo */}
            <div className="px-6 pt-6 shrink-0">
              <div className="flex items-start justify-between gap-3 mb-1">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Novedades — {noveltyPeriod.name}</h2>
                <button onClick={() => setNoveltyPeriod(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-slate-500 mb-5">Montos puntuales del período: horas extra, comisiones, bonos o descuentos. Recalcula la nómina para reflejarlos.</p>
            </div>
            {/* Cuerpo con scroll propio */}
            <div className="flex-1 overflow-y-auto px-6 pb-5 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
            {/* Alta de novedad */}
            {canNoveltyCreate && (
            <div className="space-y-3 pb-5 mb-5 border-b border-slate-100 dark:border-slate-800">
              <div className="space-y-1.5">
                <label className={labelCls}>Empleado</label>
                <SearchSelect options={employeeOptions} value={noveltyForm.employeeId}
                  onChange={v => setNoveltyForm(f => ({ ...f, employeeId: v }))}
                  placeholder="Selecciona empleado…" searchPlaceholder="Buscar empleado…" />
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <label className={labelCls}>Concepto</label>
                  <SearchSelect options={activeConceptOptions} value={noveltyForm.conceptId}
                    onChange={v => setNoveltyForm(f => ({ ...f, conceptId: v }))}
                    placeholder="Selecciona concepto…" searchPlaceholder="Buscar concepto…" />
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Monto</label>
                  <input type="number" min={0} step="0.01" placeholder="0.00" value={noveltyForm.amount}
                    onChange={e => setNoveltyForm(f => ({ ...f, amount: e.target.value }))} className={`${inputCls} w-32`} />
                </div>
                <button onClick={handleAddNovelty} disabled={noveltySaving}
                  className="h-[42px] px-3.5 flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors">
                  {noveltySaving
                    ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    : <Plus className="w-3.5 h-3.5" />}
                  Agregar
                </button>
              </div>
            </div>
            )}

            {/* Lista de novedades */}
            {novelties.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
                Sin novedades en este período.
              </p>
            ) : (
              <div className="border border-slate-100 dark:border-slate-700/60 rounded-lg overflow-hidden">
                {novelties.map(n => (
                  <div key={n.id} className="flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0 border-slate-50 dark:border-slate-700/40">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 dark:text-slate-200 truncate">
                        <span className="font-medium">{n.employeeCode}</span> · {n.employeeName}
                      </p>
                      <p className="text-xs text-slate-400 truncate">{n.conceptName}{n.notes ? ` — ${n.notes}` : ''}</p>
                    </div>
                    <span className={`text-sm font-semibold ${n.conceptType === 'Deduction' ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {n.conceptType === 'Deduction' ? '−' : '+'}{money(n.amount)}
                    </span>
                    {canNoveltyDelete && (
                      <button onClick={() => handleDeleteNovelty(n)} title="Eliminar novedad" className={deleteCls}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>
        </div>
      )}

      {/* Modal resultados del período */}
      {resultsMounted && resultsPeriod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${resultsClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden ${resultsClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            {/* Encabezado fijo */}
            <div className="px-6 pt-6 shrink-0">
              <div className="flex items-start justify-between gap-3 mb-1">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Resultados — {resultsPeriod.name}</h2>
                <div className="flex items-center gap-1.5">
                  <button onClick={exportResultsExcel} disabled={exporting || details.length === 0} title="Exportar a Excel (.xlsx)"
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 disabled:opacity-50 disabled:pointer-events-none transition-colors">
                    {exporting
                      ? <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
                      : <FileSpreadsheet className="w-4 h-4" />}
                  </button>
                  <button onClick={printResults} disabled={printing || details.length === 0} title="Imprimir nómina"
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 disabled:opacity-50 disabled:pointer-events-none transition-colors">
                    {printing
                      ? <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
                      : <Printer className="w-4 h-4" />}
                  </button>
                  <button onClick={() => setResultsPeriod(null)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <p className="text-sm text-slate-500 mb-4">
                {details.length} empleado(s) · Bruto {cmoney(resultsPeriod.totalGross, resultsPeriod.baseCurrencySymbol)} · Neto {cmoney(resultsPeriod.totalNet, resultsPeriod.baseCurrencySymbol)} · Costo patronal {cmoney(resultsPeriod.totalEmployerCost, resultsPeriod.baseCurrencySymbol)}
                {resultsPeriod.hasMultipleCurrencies && ' · convertido a ' + resultsPeriod.baseCurrencyCode}
              </p>
            </div>
            {/* Cuerpo con scroll propio */}
            <div className="flex-1 overflow-y-auto px-6 pb-6 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
            <div className="border border-slate-100 dark:border-slate-700/60 rounded-lg overflow-hidden mb-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
                      <th className={`${thCls} text-left`}>Empleado</th>
                      <th className={`${thCls} text-right`}>Salario</th>
                      <th className={`${thCls} text-right`}>Bruto</th>
                      <th className={`${thCls} text-right`}>Deducciones</th>
                      <th className={`${thCls} text-right`}>Neto</th>
                      <th className={`${thCls} text-right hidden sm:table-cell`}>Costo patronal</th>
                      <th className={`${thCls} text-center`}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.map(d => (
                      <tr key={d.id}
                        className={`border-b last:border-b-0 border-slate-50 dark:border-slate-700/40 cursor-pointer transition-colors ${
                          selectedDetail?.id === d.id ? 'bg-indigo-50/60 dark:bg-indigo-500/10' : 'hover:bg-slate-50/60 dark:hover:bg-slate-700/20'
                        }`}
                        onClick={() => openDetailLines(d)}>
                        <td className="px-5 py-2.5 align-middle">
                          <p className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            {d.employeeName}
                            {d.currencyId !== resultsPeriod.baseCurrencyId && (
                              <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400">
                                {d.currencyCode}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">{d.employeeCode}{d.departmentName ? ` · ${d.departmentName}` : ''}</p>
                        </td>
                        <td className="px-5 py-2.5 text-right align-middle text-slate-500 dark:text-slate-400">{cmoney(d.baseSalary, d.currencySymbol)}</td>
                        <td className="px-5 py-2.5 text-right align-middle text-slate-700 dark:text-slate-300">{cmoney(d.grossPay, d.currencySymbol)}</td>
                        <td className="px-5 py-2.5 text-right align-middle text-red-500">−{cmoney(d.totalDeductions, d.currencySymbol)}</td>
                        <td className="px-5 py-2.5 text-right align-middle font-semibold text-slate-800 dark:text-slate-200">{cmoney(d.netPay, d.currencySymbol)}</td>
                        <td className="px-5 py-2.5 text-right align-middle hidden sm:table-cell text-slate-500 dark:text-slate-400">{cmoney(d.employerCost, d.currencySymbol)}</td>
                        <td className="px-5 py-2.5 text-center align-middle">
                          <ChevronRight className={`w-4 h-4 text-slate-300 dark:text-slate-600 transition-transform ${selectedDetail?.id === d.id ? 'rotate-90' : ''}`} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Desglose (recibo) del empleado seleccionado */}
            {selectedDetail && (
              <div>
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                  Desglose — {selectedDetail.employeeName}
                  {selectedDetail.currencyId !== resultsPeriod.baseCurrencyId && ` (montos en ${selectedDetail.currencyCode}, tasa ${selectedDetail.exchangeRate} → ${resultsPeriod.baseCurrencyCode})`}
                </p>
                {linesLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-8 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <div className="border border-slate-100 dark:border-slate-700/60 rounded-lg overflow-hidden">
                    {detailLines.map(l => (
                      <div key={l.id} className="flex items-center gap-3 px-4 py-2 border-b last:border-b-0 border-slate-50 dark:border-slate-700/40">
                        <span className={`shrink-0 inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${conceptTypeBadge(l.conceptType)}`}>
                          {conceptTypeLabel(l.conceptType)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{l.conceptName}</p>
                          {l.baseUsed != null && (
                            <p className="text-xs text-slate-400">Base {cmoney(l.baseUsed, selectedDetail.currencySymbol)}{l.rateUsed != null ? ` × ${l.rateUsed}%` : ''}</p>
                          )}
                        </div>
                        <span className={`text-sm font-semibold ${
                          l.conceptType === 'Deduction' ? 'text-red-500'
                          : l.conceptType === 'Earning' ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-sky-600 dark:text-sky-400'
                        }`}>
                          {l.conceptType === 'Deduction' ? '−' : l.conceptType === 'Earning' ? '+' : ''}{cmoney(l.amount, selectedDetail.currencySymbol)}
                        </span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-900/40">
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Neto a pagar</span>
                      <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{cmoney(selectedDetail.netPay, selectedDetail.currencySymbol)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
            </div>
          </div>
        </div>
      )}

      {/* Modal crear/editar concepto */}
      {conceptMounted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${conceptClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden ${conceptClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            {/* Encabezado fijo */}
            <div className="px-6 pt-6 shrink-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-5">
                {editingConcept ? 'Editar Concepto' : 'Nuevo Concepto'}
              </h2>
            </div>
            {/* Cuerpo con scroll propio */}
            <div className="flex-1 overflow-y-auto px-6 pb-5 space-y-4 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className={labelCls}>Código <span className="text-red-500">*</span></label>
                  <input type="text" maxLength={20} placeholder="Ej: AFP" value={conceptForm.code} disabled={!!editingConcept}
                    onChange={e => setConceptForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                    className={`${inputCls} font-mono ${editingConcept ? 'opacity-60 cursor-not-allowed' : ''}`} />
                </div>
                <div className="sm:col-span-2 space-y-1.5">
                  <label className={labelCls}>Nombre <span className="text-red-500">*</span></label>
                  <input type="text" maxLength={150} placeholder="Ej: Fondo de pensiones" value={conceptForm.name}
                    onChange={e => setConceptForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={labelCls}>Tipo de concepto <span className="text-red-500">*</span></label>
                  <SearchSelect options={CONCEPT_TYPES} value={conceptForm.conceptType}
                    onChange={v => setConceptForm(f => ({ ...f, conceptType: v || 'Earning' }))}
                    placeholder="Selecciona…" searchPlaceholder="Buscar…" clearable={false} />
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Método de cálculo <span className="text-red-500">*</span></label>
                  <SearchSelect options={CALC_TYPES} value={conceptForm.calcType}
                    onChange={v => setConceptForm(f => ({ ...f, calcType: v || 'Fixed' }))}
                    placeholder="Selecciona…" searchPlaceholder="Buscar…" clearable={false} />
                </div>
              </div>

              {/* Parámetros según el método */}
              {conceptForm.calcType === 'Fixed' && (
                <div className="space-y-1.5">
                  <label className={labelCls}>Monto por defecto</label>
                  <input type="number" min={0} step="0.01" placeholder="Vacío = el monto se indica por asignación o novedad" value={conceptForm.defaultAmount}
                    onChange={e => setConceptForm(f => ({ ...f, defaultAmount: e.target.value }))} className={inputCls} />
                </div>
              )}
              {conceptForm.calcType === 'Percent' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className={labelCls}>Porcentaje % <span className="text-red-500">*</span></label>
                    <input type="number" min={0} max={100} step="0.0001" placeholder="Ej: 5.50" value={conceptForm.percentage}
                      onChange={e => setConceptForm(f => ({ ...f, percentage: e.target.value }))} className={inputCls} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}>Base de cálculo <span className="text-red-500">*</span></label>
                    <SearchSelect options={BASE_TYPES} value={conceptForm.baseType}
                      onChange={v => setConceptForm(f => ({ ...f, baseType: v }))}
                      placeholder="Selecciona…" searchPlaceholder="Buscar…" clearable={false} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}>Tope mensual de la base</label>
                    <input type="number" min={0} step="0.01" placeholder="Vacío = sin tope" value={conceptForm.baseCapAmount}
                      onChange={e => setConceptForm(f => ({ ...f, baseCapAmount: e.target.value }))} className={inputCls} />
                  </div>
                </div>
              )}
              {conceptForm.calcType === 'Brackets' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className={labelCls}>Base de cálculo <span className="text-red-500">*</span></label>
                    <SearchSelect options={BASE_TYPES} value={conceptForm.baseType}
                      onChange={v => setConceptForm(f => ({ ...f, baseType: v }))}
                      placeholder="Selecciona…" searchPlaceholder="Buscar…" clearable={false} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}>Factor de anualización <span className="text-red-500">*</span></label>
                    <input type="number" min={0.0001} step="0.0001" placeholder="1 = escala por período, 12 = escala anual" value={conceptForm.annualizationFactor}
                      onChange={e => setConceptForm(f => ({ ...f, annualizationFactor: e.target.value }))} className={inputCls} />
                  </div>
                  <p className="sm:col-span-2 text-xs text-slate-400">
                    Los tramos de la escala se editan con el botón de capas de la tabla, después de guardar el concepto.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  <input type="checkbox" checked={conceptForm.appliesToAll}
                    onChange={e => setConceptForm(f => ({ ...f, appliesToAll: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                  Aplica a todos los empleados
                </label>
                {conceptForm.conceptType === 'Deduction' && (
                  <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                    <input type="checkbox" checked={conceptForm.affectsTaxable}
                      onChange={e => setConceptForm(f => ({ ...f, affectsTaxable: e.target.checked }))}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                    Reduce la base imponible
                  </label>
                )}
                <div className="flex items-center gap-2.5">
                  <label className={`${labelCls} whitespace-nowrap`}>Orden</label>
                  <input type="number" min={0} max={9999} value={conceptForm.calcOrder}
                    onChange={e => setConceptForm(f => ({ ...f, calcOrder: e.target.value }))} className={`${inputCls} w-24`} />
                </div>
              </div>

              {conceptError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {conceptError}
                </div>
              )}
            </div>
            {/* Pie fijo: acciones */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button onClick={() => setConceptModalOpen(false)} disabled={conceptSaving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveConcept} disabled={conceptSaving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {conceptSaving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Save className="w-3.5 h-3.5" />}
                {conceptSaving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editor de tramos */}
      {bracketsMounted && bracketsConcept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${bracketsClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden ${bracketsClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            {/* Encabezado fijo */}
            <div className="px-6 pt-6 shrink-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">Tramos — {bracketsConcept.name}</h2>
              <p className="text-sm text-slate-500 mb-5">
                La base {(bracketsConcept.annualizationFactor ?? 1) !== 1 ? `se multiplica por ${bracketsConcept.annualizationFactor} y ` : ''}entra a la escala: cuota fija del tramo + tasa sobre el excedente del límite inferior.
              </p>
            </div>
            {/* Cuerpo con scroll propio */}
            <div className="flex-1 overflow-y-auto px-6 pb-5 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_1fr_1fr_5rem_2rem] gap-2 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-1">
                <span>Desde</span><span>Hasta (vacío = ∞)</span><span>Cuota fija</span><span>Tasa %</span><span></span>
              </div>
              {bracketRows.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_5rem_2rem] gap-2 items-center">
                  <input type="number" min={0} step="0.01" value={String(r.lowerLimit)}
                    onChange={e => updateBracketRow(i, 'lowerLimit', e.target.value)} className={inputCls} />
                  <input type="number" min={0} step="0.01" value={r.upperLimit == null ? '' : String(r.upperLimit)} placeholder="∞"
                    onChange={e => updateBracketRow(i, 'upperLimit', e.target.value)} className={inputCls} />
                  <input type="number" min={0} step="0.01" value={String(r.fixedQuota)}
                    onChange={e => updateBracketRow(i, 'fixedQuota', e.target.value)} className={inputCls} />
                  <input type="number" min={0} max={100} step="0.01" value={String(r.ratePercent)}
                    onChange={e => updateBracketRow(i, 'ratePercent', e.target.value)} className={inputCls} />
                  <button onClick={() => setBracketRows(rows => rows.filter((_, idx) => idx !== i))}
                    title="Quitar tramo" className={deleteCls}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setBracketRows(rows => [...rows, {
                  lowerLimit: rows.length > 0 ? (rows[rows.length - 1].upperLimit ?? 0) : 0,
                  upperLimit: null, fixedQuota: 0, ratePercent: 0,
                }])}
                className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline mt-1">
                <Plus className="w-3.5 h-3.5" />
                Agregar tramo
              </button>
            </div>
            </div>
            {/* Pie fijo: acciones */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button onClick={() => setBracketsConcept(null)} disabled={bracketsSaving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveBrackets} disabled={bracketsSaving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {bracketsSaving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Save className="w-3.5 h-3.5" />}
                {bracketsSaving ? 'Guardando…' : 'Guardar Tramos'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmaciones */}
      <ConfirmDialog
        open={!!payTarget}
        title="¿Marcar como pagado?"
        message={`El período "${payTarget?.name}" quedará en estado final Pagado y ya no podrá modificarse ni recalcularse.`}
        confirmLabel="Sí, marcar pagado"
        cancelLabel="Cancelar"
        onConfirm={handlePay}
        onCancel={() => setPayTarget(null)}
      />

      <ConfirmDialog
        open={!!reopenTarget}
        title="¿Reabrir período?"
        message={`El período "${reopenTarget?.name}" volverá a estado Abierto para permitir cambios y recálculo. Los resultados actuales se conservan hasta el próximo cálculo.`}
        confirmLabel="Sí, reabrir"
        cancelLabel="Cancelar"
        onConfirm={handleReopen}
        onCancel={() => setReopenTarget(null)}
      />

      <ConfirmDialog
        open={!!deletePeriodTarget}
        title="¿Eliminar período?"
        message={`El período "${deletePeriodTarget?.name}" se eliminará permanentemente junto con sus novedades y resultados calculados.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDeletePeriod}
        onCancel={() => setDeletePeriodTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteConceptTarget}
        title="¿Eliminar concepto?"
        message={`El concepto "${deleteConceptTarget?.name}" se eliminará permanentemente. Solo es posible si nunca se ha usado en cálculos, asignaciones o novedades.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDeleteConcept}
        onCancel={() => setDeleteConceptTarget(null)}
      />
    </div>
  )
}
