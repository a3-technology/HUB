import { useEffect, useRef, useState } from 'react'
import {
  Plus, Search, Pencil, RefreshCw, Save, Trash2, FolderOpen,
  FileSignature, FileCheck2, FileClock, FileX2, Clock, ListChecks, Tags,
  RotateCw, Ban, Upload, FileDown,
} from 'lucide-react'
import {
  employeeContractsApi, workTypesApi, timeEntriesApi,
  employeesApi, contractTypesApi, currenciesApi,
} from '../../lib/api'
import { fmtMoneyPlain } from '../../lib/format'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { SearchSelect } from '../../components/SearchSelect'
import { DatePicker } from '../../components/DatePicker'
import { TabsScroller } from '../../components/TabsScroller'
import { Pagination, usePagination, type PageSize } from '../../components/Pagination'
import { useToast } from '../../context/ToastContext'
import { useModalTransition } from '../../hooks/useModalTransition'
import { usePermission } from '../../hooks/usePermission'

// ── Tipos ─────────────────────────────────────────────────────────────────────

/** Contrato de un empleado (hr.SP_GetEmployeeContracts). */
interface EmployeeContract {
  id: string
  employeeId: string
  employeeCode: string
  employeeName: string
  contractTypeId: string
  contractTypeName: string
  startDate: string
  endDate?: string
  /** Base salarial (base de cálculo): Monthly | Hourly | Service. */
  payUnit: string
  /** Frecuencia de pago (calendario de nómina): Monthly | Biweekly | Weekly. */
  payFrequency: string
  /** Jornada laboral: Day | Night | Mixed; null si no se especificó. */
  workShift?: string
  payRate: number
  currencyId?: string
  currencyCode?: string
  weeklyHours?: number
  /** Estado persistido: Active | Terminated | Renewed. */
  status: string
  /** Estado derivado: agrega Expired cuando un contrato activo ya venció. */
  effectiveStatus: string
  /** Días restantes hasta el vencimiento (solo activos con fecha de fin). */
  expiresInDays?: number
  /** Motivo tipificado: Resignation | Dismissal | Expiration | MutualAgreement | Other. */
  terminationType?: string
  terminationReason?: string
  /** Ruta del documento firmado en Blob Storage; null si no se ha subido. */
  documentUrl?: string
  /** Nombre original del archivo del documento firmado. */
  documentFileName?: string
  notes?: string
  previousContractId?: string
}

/** Registro de horas por tipo de trabajo (hr.SP_GetTimeEntries). */
interface TimeEntry {
  id: string
  employeeId: string
  employeeCode: string
  employeeName: string
  departmentName: string
  workTypeId: string
  workTypeName: string
  rateMultiplier: number
  contractId?: string
  contractTypeName?: string
  workDate: string
  hours: number
  description?: string
  estimatedAmount?: number
}

/** Resumen de horas por empleado y tipo (hr.SP_GetTimeEntriesSummary). */
interface TimeEntrySummary {
  employeeId: string
  employeeCode: string
  employeeName: string
  departmentName: string
  workTypeId: string
  workTypeName: string
  rateMultiplier: number
  totalHours: number
  estimatedAmount: number
}

interface WorkType {
  id: string
  name: string
  description?: string
  rateMultiplier: number
  isActive: boolean
}

interface Employee {
  id: string
  code: string
  firstName: string
  lastName: string
  isActive: boolean
}

interface ContractType { id: string; name: string; isActive: boolean }
interface Currency { id: string; code: string; name: string; isActive: boolean }

interface ContractForm {
  employeeId: string
  contractTypeId: string
  startDate: string
  endDate: string
  payUnit: string
  payFrequency: string
  workShift: string
  payRate: string
  currencyId: string
  weeklyHours: string
  notes: string
}

interface RenewForm { startDate: string; endDate: string; payRate: string; notes: string }
interface TerminateForm { endDate: string; terminationType: string; reason: string }
interface EntryForm {
  employeeId: string
  workTypeId: string
  workDate: string
  hours: string
  contractId: string
  description: string
}
interface WorkTypeForm { name: string; description: string; rateMultiplier: string }

type Tab = 'contratos' | 'horas' | 'resumen' | 'tipos'

const EMPTY_CONTRACT_FORM: ContractForm = {
  employeeId: '', contractTypeId: '', startDate: '', endDate: '',
  payUnit: 'Monthly', payFrequency: 'Monthly', workShift: '', payRate: '', currencyId: '', weeklyHours: '', notes: '',
}
const EMPTY_RENEW_FORM: RenewForm = { startDate: '', endDate: '', payRate: '', notes: '' }
const EMPTY_TERMINATE_FORM: TerminateForm = { endDate: '', terminationType: 'Resignation', reason: '' }
const EMPTY_ENTRY_FORM: EntryForm = { employeeId: '', workTypeId: '', workDate: '', hours: '', contractId: '', description: '' }
const EMPTY_WORKTYPE_FORM: WorkTypeForm = { name: '', description: '', rateMultiplier: '1.00' }

/** Etiquetas de la base salarial del contrato (base de cálculo). */
const PAY_UNIT_LABELS: Record<string, string> = {
  Monthly: 'Mensual',
  Hourly:  'Por hora',
  Service: 'Por servicio',
}

/** Etiquetas de la frecuencia de pago (calendario de nómina). */
const PAY_FREQUENCY_LABELS: Record<string, string> = {
  Monthly:  'Mensual',
  Biweekly: 'Quincenal',
  Weekly:   'Semanal',
}

/** Etiquetas de la jornada laboral. */
const WORK_SHIFT_LABELS: Record<string, string> = {
  Day:   'Diurna',
  Night: 'Nocturna',
  Mixed: 'Mixta',
}

/** Etiquetas del motivo tipificado de finalización del contrato. */
const TERMINATION_TYPE_LABELS: Record<string, string> = {
  Resignation:     'Renuncia',
  Dismissal:       'Despido',
  Expiration:      'Vencimiento',
  MutualAgreement: 'Mutuo acuerdo',
  Other:           'Otro',
}

/** Estados derivados del contrato (el servidor agrega Expired al vencer). */
const CONTRACT_STATUS_META: Record<string, { label: string; badge: string }> = {
  Active:     { label: 'Activo',     badge: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
  Expired:    { label: 'Vencido',    badge: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' },
  Terminated: { label: 'Terminado',  badge: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400' },
  Renewed:    { label: 'Renovado',   badge: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400' },
}

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const firstOfMonthISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

const formatDateShort = (iso: string) =>
  new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' })

const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition'
const thCls = 'px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider'

export function ContratosPage() {
  const toast = useToast()

  const canContractCreate      = usePermission('hr.contracts.create')
  const canContractUpdate      = usePermission('hr.contracts.update')
  const canContractRenew       = usePermission('hr.contracts.renew')
  const canContractTerminate   = usePermission('hr.contracts.terminate')
  const canContractDelete      = usePermission('hr.contracts.delete')
  const canContractDocUpload   = usePermission('hr.contracts.document-upload')
  const canEntryCreate         = usePermission('hr.time-entries.create')
  const canEntryUpdate         = usePermission('hr.time-entries.update')
  const canEntryDelete         = usePermission('hr.time-entries.delete')
  const canWorkTypeCreate      = usePermission('hr.work-types.create')
  const canWorkTypeUpdate      = usePermission('hr.work-types.update')
  const canWorkTypeToggle      = usePermission('hr.work-types.toggle')
  const canWorkTypeDelete      = usePermission('hr.work-types.delete')

  const [tab, setTab] = useState<Tab>('contratos')
  const [contracts, setContracts]   = useState<EmployeeContract[]>([])
  const [entries, setEntries]       = useState<TimeEntry[]>([])
  const [summary, setSummary]       = useState<TimeEntrySummary[]>([])
  const [workTypes, setWorkTypes]   = useState<WorkType[]>([])
  const [employees, setEmployees]   = useState<Employee[]>([])
  const [contractTypes, setContractTypes] = useState<ContractType[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving]         = useState(false)

  const [search, setSearch]         = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [fromDate, setFromDate]     = useState(firstOfMonthISO())
  const [toDate, setToDate]         = useState(todayISO())
  const [page, setPage]             = useState(1)
  const [pageSize, setPageSize]     = useState<PageSize>(10)

  // Modal crear / editar contrato
  const [contractModalOpen, setContractModalOpen] = useState(false)
  const [editingContract, setEditingContract]     = useState<EmployeeContract | null>(null)
  const [contractForm, setContractForm]           = useState<ContractForm>(EMPTY_CONTRACT_FORM)
  const [contractError, setContractError]         = useState<string | null>(null)
  const { mounted: contractMounted, closing: contractClosing } = useModalTransition(contractModalOpen)

  // Modal renovar contrato
  const [renewTarget, setRenewTarget] = useState<EmployeeContract | null>(null)
  const [renewForm, setRenewForm]     = useState<RenewForm>(EMPTY_RENEW_FORM)
  const [renewError, setRenewError]   = useState<string | null>(null)
  const { mounted: renewMounted, closing: renewClosing } = useModalTransition(!!renewTarget)

  // Modal terminar contrato
  const [terminateTarget, setTerminateTarget] = useState<EmployeeContract | null>(null)
  const [terminateForm, setTerminateForm]     = useState<TerminateForm>(EMPTY_TERMINATE_FORM)
  const [terminateError, setTerminateError]   = useState<string | null>(null)
  const { mounted: terminateMounted, closing: terminateClosing } = useModalTransition(!!terminateTarget)

  // Modal registrar / editar horas
  const [entryModalOpen, setEntryModalOpen] = useState(false)
  const [editingEntry, setEditingEntry]     = useState<TimeEntry | null>(null)
  const [entryForm, setEntryForm]           = useState<EntryForm>(EMPTY_ENTRY_FORM)
  const [entryError, setEntryError]         = useState<string | null>(null)
  const { mounted: entryMounted, closing: entryClosing } = useModalTransition(entryModalOpen)

  // Modal crear / editar tipo de trabajo
  const [workTypeModalOpen, setWorkTypeModalOpen] = useState(false)
  const [editingWorkType, setEditingWorkType]     = useState<WorkType | null>(null)
  const [workTypeForm, setWorkTypeForm]           = useState<WorkTypeForm>(EMPTY_WORKTYPE_FORM)
  const [workTypeError, setWorkTypeError]         = useState<string | null>(null)
  const { mounted: workTypeMounted, closing: workTypeClosing } = useModalTransition(workTypeModalOpen)

  // Confirmaciones
  const [deleteContractTarget, setDeleteContractTarget] = useState<EmployeeContract | null>(null)
  const [deleteEntryTarget, setDeleteEntryTarget]       = useState<TimeEntry | null>(null)
  const [deleteWorkTypeTarget, setDeleteWorkTypeTarget] = useState<WorkType | null>(null)

  // Subida del documento firmado (input file oculto por contrato)
  const documentInputRef = useRef<HTMLInputElement>(null)
  const [documentTarget, setDocumentTarget] = useState<EmployeeContract | null>(null)
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null)

  const loadAll = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true)
    try {
      const [conRes, entRes, sumRes, wtRes, empRes, ctRes, curRes] = await Promise.all([
        employeeContractsApi.list(),
        timeEntriesApi.list(fromDate, toDate),
        timeEntriesApi.summary(fromDate, toDate),
        workTypesApi.list(),
        employeesApi.list(),
        contractTypesApi.list(true),
        currenciesApi.list(),
      ])
      if (conRes.ok) setContracts(await conRes.json())
      if (entRes.ok) setEntries(await entRes.json())
      if (sumRes.ok) setSummary(await sumRes.json())
      if (wtRes.ok)  setWorkTypes(await wtRes.json())
      if (empRes.ok) setEmployees(await empRes.json())
      if (ctRes.ok)  setContractTypes(await ctRes.json())
      if (curRes.ok) setCurrencies(await curRes.json())
    } finally {
      silent ? setRefreshing(false) : setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  // Recarga horas y resumen al cambiar el rango de fechas consultado
  useEffect(() => {
    if (loading) return
    timeEntriesApi.list(fromDate, toDate).then(async res => { if (res.ok) setEntries(await res.json()) })
    timeEntriesApi.summary(fromDate, toDate).then(async res => { if (res.ok) setSummary(await res.json()) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate])

  const changeTab = (t: Tab) => { setTab(t); setSearch(''); setPage(1) }
  const handleSearch = (value: string) => { setSearch(value); setPage(1) }

  // ── Filtros ─────────────────────────────────────────────────────────────────

  const term = search.toLowerCase()

  const filteredContracts = contracts.filter(c =>
    (c.employeeName.toLowerCase().includes(term) ||
     c.employeeCode.toLowerCase().includes(term) ||
     c.contractTypeName.toLowerCase().includes(term)) &&
    (!statusFilter || c.effectiveStatus === statusFilter)
  )

  const filteredEntries = entries.filter(e =>
    e.employeeName.toLowerCase().includes(term) ||
    e.employeeCode.toLowerCase().includes(term) ||
    e.workTypeName.toLowerCase().includes(term)
  )

  const filteredSummary = summary.filter(s =>
    s.employeeName.toLowerCase().includes(term) ||
    s.employeeCode.toLowerCase().includes(term) ||
    s.workTypeName.toLowerCase().includes(term)
  )

  const filteredWorkTypes = workTypes.filter(w => w.name.toLowerCase().includes(term))

  const paginatedContracts = usePagination(filteredContracts, page, pageSize)
  const paginatedEntries   = usePagination(filteredEntries, page, pageSize)
  const paginatedSummary   = usePagination(filteredSummary, page, pageSize)

  const activeEmployeeOptions = employees
    .filter(e => e.isActive)
    .map(e => ({ value: e.id, label: `${e.firstName} ${e.lastName} (${e.code})` }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const contractTypeOptions = contractTypes
    .filter(c => c.isActive)
    .map(c => ({ value: c.id, label: c.name }))

  const currencyOptions = currencies
    .filter(c => c.isActive)
    .map(c => ({ value: c.id, label: `${c.code} - ${c.name}` }))

  const workTypeOptions = workTypes
    .filter(w => w.isActive)
    .map(w => ({ value: w.id, label: `${w.name} (×${w.rateMultiplier})` }))

  const payUnitOptions      = Object.entries(PAY_UNIT_LABELS).map(([value, label]) => ({ value, label }))
  const payFrequencyOptions = Object.entries(PAY_FREQUENCY_LABELS).map(([value, label]) => ({ value, label }))
  const workShiftOptions    = Object.entries(WORK_SHIFT_LABELS).map(([value, label]) => ({ value, label }))

  /** Contratos activos del empleado seleccionado en el formulario de horas. */
  const entryContractOptions = contracts
    .filter(c => c.employeeId === entryForm.employeeId && c.status === 'Active')
    .map(c => ({ value: c.id, label: `${c.contractTypeName} (${PAY_UNIT_LABELS[c.payUnit] ?? c.payUnit}, desde ${formatDateShort(c.startDate)})` }))

  // ── Indicadores ─────────────────────────────────────────────────────────────

  const kpis = {
    active:   contracts.filter(c => c.effectiveStatus === 'Active').length,
    expiring: contracts.filter(c => c.effectiveStatus === 'Active' && c.expiresInDays !== undefined && c.expiresInDays !== null && c.expiresInDays <= 30).length,
    expired:  contracts.filter(c => c.effectiveStatus === 'Expired').length,
    hours:    entries.reduce((acc, e) => acc + e.hours, 0),
  }

  const kpiCards = [
    { label: 'Contratos activos',   value: kpis.active,   icon: FileCheck2, color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
    { label: 'Vencen en ≤ 30 días', value: kpis.expiring, icon: FileClock,  color: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
    { label: 'Vencidos',            value: kpis.expired,  icon: FileX2,     color: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' },
    { label: 'Horas del período',   value: kpis.hours,    icon: Clock,      color: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400' },
  ]

  const tabs: { key: Tab; label: string; icon: typeof FileSignature; count: number }[] = [
    { key: 'contratos', label: 'Contratos',         icon: FileSignature, count: contracts.length },
    { key: 'horas',     label: 'Registro de Horas', icon: Clock,         count: entries.length },
    { key: 'resumen',   label: 'Resumen',           icon: ListChecks,    count: summary.length },
    { key: 'tipos',     label: 'Tipos de Trabajo',  icon: Tags,          count: workTypes.length },
  ]

  // ── Contratos ───────────────────────────────────────────────────────────────

  const openContractCreate = () => {
    setEditingContract(null)
    setContractForm({ ...EMPTY_CONTRACT_FORM, startDate: todayISO() })
    setContractError(null); setContractModalOpen(true)
  }

  const openContractEdit = (c: EmployeeContract) => {
    setEditingContract(c)
    setContractForm({
      employeeId: c.employeeId,
      contractTypeId: c.contractTypeId,
      startDate: c.startDate.slice(0, 10),
      endDate: c.endDate ? c.endDate.slice(0, 10) : '',
      payUnit: c.payUnit,
      payFrequency: c.payFrequency,
      workShift: c.workShift ?? '',
      payRate: String(c.payRate),
      currencyId: c.currencyId ?? '',
      weeklyHours: c.weeklyHours ? String(c.weeklyHours) : '',
      notes: c.notes ?? '',
    })
    setContractError(null); setContractModalOpen(true)
  }

  const handleSaveContract = async () => {
    if (!editingContract && !contractForm.employeeId) { setContractError('Selecciona un empleado.'); return }
    if (!editingContract && !contractForm.contractTypeId) { setContractError('Selecciona el tipo de contrato.'); return }
    if (!contractForm.startDate) { setContractError('La fecha de inicio es requerida.'); return }
    if (contractForm.endDate && contractForm.endDate < contractForm.startDate) {
      setContractError('La fecha de fin no puede ser anterior a la de inicio.'); return
    }
    const rate = Number(contractForm.payRate)
    if (!contractForm.payRate || isNaN(rate) || rate < 0) { setContractError('Indica un monto válido.'); return }
    const weekly = contractForm.weeklyHours ? Number(contractForm.weeklyHours) : null
    if (weekly !== null && (isNaN(weekly) || weekly < 1 || weekly > 168)) {
      setContractError('Las horas semanales deben estar entre 1 y 168.'); return
    }
    setSaving(true); setContractError(null)
    try {
      const base = {
        startDate: contractForm.startDate,
        endDate: contractForm.endDate || null,
        payUnit: contractForm.payUnit,
        payFrequency: contractForm.payFrequency,
        workShift: contractForm.workShift || null,
        payRate: rate,
        currencyId: contractForm.currencyId || null,
        weeklyHours: weekly,
        notes: contractForm.notes.trim() || null,
      }
      const res = editingContract
        ? await employeeContractsApi.update(editingContract.id, base)
        : await employeeContractsApi.create({ ...base, employeeId: contractForm.employeeId, contractTypeId: contractForm.contractTypeId })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar el contrato.' }))
        setContractError(err.message); toast.error(err.message); return
      }
      toast.success(editingContract ? 'Contrato actualizado correctamente.' : 'Contrato creado correctamente.')
      setContractModalOpen(false); await loadAll(true)
    } finally { setSaving(false) }
  }

  const openRenew = (c: EmployeeContract) => {
    // La renovación inicia el día siguiente al fin del contrato (o mañana si es indefinido)
    const base = c.endDate ? new Date(c.endDate.slice(0, 10) + 'T00:00:00') : new Date()
    base.setDate(base.getDate() + 1)
    const iso = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`
    setRenewForm({ startDate: iso, endDate: '', payRate: String(c.payRate), notes: '' })
    setRenewError(null); setRenewTarget(c)
  }

  const handleRenew = async () => {
    if (!renewTarget) return
    if (!renewForm.startDate) { setRenewError('La fecha de inicio es requerida.'); return }
    if (renewForm.endDate && renewForm.endDate < renewForm.startDate) {
      setRenewError('La fecha de fin no puede ser anterior a la de inicio.'); return
    }
    const rate = renewForm.payRate ? Number(renewForm.payRate) : null
    if (rate !== null && (isNaN(rate) || rate < 0)) { setRenewError('Indica un monto válido.'); return }
    setSaving(true); setRenewError(null)
    try {
      const res = await employeeContractsApi.renew(renewTarget.id, {
        startDate: renewForm.startDate,
        endDate: renewForm.endDate || null,
        payRate: rate,
        notes: renewForm.notes.trim() || null,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al renovar el contrato.' }))
        setRenewError(err.message); toast.error(err.message); return
      }
      toast.success('Contrato renovado correctamente.')
      setRenewTarget(null); await loadAll(true)
    } finally { setSaving(false) }
  }

  const openTerminate = (c: EmployeeContract) => {
    setTerminateForm({ ...EMPTY_TERMINATE_FORM, endDate: todayISO() })
    setTerminateError(null); setTerminateTarget(c)
  }

  const handleTerminate = async () => {
    if (!terminateTarget) return
    if (!terminateForm.endDate) { setTerminateError('La fecha de término es requerida.'); return }
    if (terminateTarget.startDate && terminateForm.endDate < terminateTarget.startDate) {
      setTerminateError('La fecha de término no puede ser anterior a la fecha de inicio del contrato.'); return
    }
    if (!terminateForm.terminationType) { setTerminateError('Selecciona el motivo de la terminación.'); return }
    setSaving(true); setTerminateError(null)
    try {
      const res = await employeeContractsApi.terminate(terminateTarget.id, terminateForm.endDate, terminateForm.terminationType, terminateForm.reason.trim() || undefined)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al terminar el contrato.' }))
        setTerminateError(err.message); toast.error(err.message); return
      }
      toast.success('Contrato terminado correctamente.')
      setTerminateTarget(null); await loadAll(true)
    } finally { setSaving(false) }
  }

  const handleDeleteContract = async () => {
    if (!deleteContractTarget) return
    try {
      const res = await employeeContractsApi.remove(deleteContractTarget.id)
      if (res.ok) { toast.success('Contrato eliminado correctamente.'); await loadAll(true) }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar el contrato.' }))
        toast.error(err.message)
      }
    } finally { setDeleteContractTarget(null) }
  }

  // ── Documento firmado del contrato ──────────────────────────────────────────

  /** Abre el selector de archivo para subir el documento firmado del contrato. */
  const openDocumentPicker = (c: EmployeeContract) => {
    setDocumentTarget(c)
    documentInputRef.current?.click()
  }

  const handleDocumentSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''  // permite volver a elegir el mismo archivo
    if (!file || !documentTarget) return
    setUploadingDocId(documentTarget.id)
    try {
      const res = await employeeContractsApi.uploadDocument(documentTarget.id, file)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al subir el documento.' }))
        toast.error(err.message); return
      }
      toast.success('Documento del contrato guardado.')
      await loadAll(true)
    } finally {
      setUploadingDocId(null); setDocumentTarget(null)
    }
  }

  /** Abre el documento firmado en una pestaña nueva con URL temporal firmada. */
  const handleOpenDocument = async (c: EmployeeContract) => {
    const res = await employeeContractsApi.documentUrl(c.id)
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'No se pudo obtener el documento.' }))
      toast.error(err.message); return
    }
    const { url } = await res.json()
    window.open(url, '_blank', 'noopener')
  }

  // ── Registro de horas ───────────────────────────────────────────────────────

  const openEntryCreate = () => {
    setEditingEntry(null)
    setEntryForm({ ...EMPTY_ENTRY_FORM, workDate: todayISO() })
    setEntryError(null); setEntryModalOpen(true)
  }

  const openEntryEdit = (e: TimeEntry) => {
    setEditingEntry(e)
    setEntryForm({
      employeeId: e.employeeId,
      workTypeId: e.workTypeId,
      workDate: e.workDate.slice(0, 10),
      hours: String(e.hours),
      contractId: e.contractId ?? '',
      description: e.description ?? '',
    })
    setEntryError(null); setEntryModalOpen(true)
  }

  const handleSaveEntry = async () => {
    if (!editingEntry && !entryForm.employeeId) { setEntryError('Selecciona un empleado.'); return }
    if (!entryForm.workTypeId) { setEntryError('Selecciona el tipo de trabajo.'); return }
    if (!entryForm.workDate) { setEntryError('La fecha es requerida.'); return }
    const hours = Number(entryForm.hours)
    if (!entryForm.hours || isNaN(hours) || hours < 0.25 || hours > 24) {
      setEntryError('Las horas deben estar entre 0.25 y 24.'); return
    }
    setSaving(true); setEntryError(null)
    try {
      const payload = {
        employeeId: editingEntry?.employeeId ?? entryForm.employeeId,
        workTypeId: entryForm.workTypeId,
        workDate: entryForm.workDate,
        hours,
        contractId: entryForm.contractId || null,
        description: entryForm.description.trim() || null,
      }
      const res = editingEntry
        ? await timeEntriesApi.update(editingEntry.id, payload)
        : await timeEntriesApi.create(payload)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar el registro de horas.' }))
        setEntryError(err.message); toast.error(err.message); return
      }
      toast.success(editingEntry ? 'Registro de horas actualizado.' : 'Horas registradas correctamente.')
      setEntryModalOpen(false); await loadAll(true)
    } finally { setSaving(false) }
  }

  const handleDeleteEntry = async () => {
    if (!deleteEntryTarget) return
    try {
      const res = await timeEntriesApi.remove(deleteEntryTarget.id)
      if (res.ok) { toast.success('Registro de horas eliminado.'); await loadAll(true) }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar el registro.' }))
        toast.error(err.message)
      }
    } finally { setDeleteEntryTarget(null) }
  }

  // ── Tipos de trabajo ────────────────────────────────────────────────────────

  const openWorkTypeCreate = () => {
    setEditingWorkType(null); setWorkTypeForm(EMPTY_WORKTYPE_FORM)
    setWorkTypeError(null); setWorkTypeModalOpen(true)
  }

  const openWorkTypeEdit = (w: WorkType) => {
    setEditingWorkType(w)
    setWorkTypeForm({ name: w.name, description: w.description ?? '', rateMultiplier: String(w.rateMultiplier) })
    setWorkTypeError(null); setWorkTypeModalOpen(true)
  }

  const handleSaveWorkType = async () => {
    if (!workTypeForm.name.trim()) { setWorkTypeError('El nombre es requerido.'); return }
    const mult = Number(workTypeForm.rateMultiplier)
    if (!workTypeForm.rateMultiplier || isNaN(mult) || mult <= 0 || mult > 99.99) {
      setWorkTypeError('El multiplicador debe estar entre 0.01 y 99.99.'); return
    }
    setSaving(true); setWorkTypeError(null)
    try {
      const payload = {
        name: workTypeForm.name.trim(),
        description: workTypeForm.description.trim() || undefined,
        rateMultiplier: mult,
      }
      const res = editingWorkType
        ? await workTypesApi.update(editingWorkType.id, payload)
        : await workTypesApi.create(payload)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar el tipo de trabajo.' }))
        setWorkTypeError(err.message); toast.error(err.message); return
      }
      toast.success(editingWorkType ? 'Tipo de trabajo actualizado.' : 'Tipo de trabajo creado.')
      setWorkTypeModalOpen(false); await loadAll(true)
    } finally { setSaving(false) }
  }

  const handleToggleWorkType = async (w: WorkType) => {
    const res = await workTypesApi.toggle(w.id)
    if (res.ok) { toast.success(w.isActive ? 'Tipo de trabajo desactivado.' : 'Tipo de trabajo activado.'); await loadAll(true) }
    else {
      const err = await res.json().catch(() => ({ message: 'No se pudo cambiar el estado.' }))
      toast.error(err.message)
    }
  }

  const handleDeleteWorkType = async () => {
    if (!deleteWorkTypeTarget) return
    try {
      const res = await workTypesApi.remove(deleteWorkTypeTarget.id)
      if (res.ok) { toast.success('Tipo de trabajo eliminado.'); await loadAll(true) }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar el tipo de trabajo.' }))
        toast.error(err.message)
      }
    } finally { setDeleteWorkTypeTarget(null) }
  }

  const globalIndex = (i: number) =>
    pageSize === 'all' ? i + 1 : (page - 1) * (pageSize as number) + i + 1

  const headerAction = {
    contratos: canContractCreate ? { label: 'Nuevo Contrato', onClick: openContractCreate } : null,
    horas:     canEntryCreate ? { label: 'Registrar Horas', onClick: openEntryCreate } : null,
    resumen:   null,
    tipos:     canWorkTypeCreate ? { label: 'Nuevo Tipo', onClick: openWorkTypeCreate } : null,
  }[tab]

  const currentTotal =
    tab === 'contratos' ? filteredContracts.length :
    tab === 'horas'     ? filteredEntries.length :
    tab === 'resumen'   ? filteredSummary.length :
    filteredWorkTypes.length

  return (
    <div className="p-6 space-y-4">

      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Contratos y Horas</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : 'Ciclo de vida de contratos y horas trabajadas por tipo de trabajo'}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          <button
            onClick={() => loadAll(true)}
            disabled={refreshing}
            title="Actualizar"
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          {headerAction && (
            <button
              onClick={headerAction.onClick}
              disabled={(tab === 'contratos' || tab === 'horas') && activeEmployeeOptions.length === 0}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              {headerAction.label}
            </button>
          )}
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map(k => (
          <div key={k.label} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${k.color}`}>
              <k.icon className="w-5 h-5" />
            </div>
            <div className="leading-tight min-w-0">
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{loading ? '…' : k.value}</p>
              <p className="text-xs text-slate-400 truncate">{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <TabsScroller>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => changeTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === t.key
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
              tab === t.key
                ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400'
                : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
            }`}>
              {loading ? '…' : t.count}
            </span>
          </button>
        ))}
      </TabsScroller>

      {/* Búsqueda + filtros por tab */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 min-w-0 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder={tab === 'tipos' ? 'Buscar por nombre…' : 'Buscar por empleado, código o tipo…'}
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
          />
        </div>

        {tab === 'contratos' && (
          <div className="w-full sm:w-56 shrink-0">
            <SearchSelect
              options={[
                { value: 'Active',     label: 'Activos' },
                { value: 'Expired',    label: 'Vencidos' },
                { value: 'Terminated', label: 'Terminados' },
                { value: 'Renewed',    label: 'Renovados' },
              ]}
              value={statusFilter}
              onChange={v => { setStatusFilter(v); setPage(1) }}
              placeholder="Filtrar por estado…"
              searchPlaceholder="Buscar estado…"
            />
          </div>
        )}

        {(tab === 'horas' || tab === 'resumen') && (
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-sm text-slate-500 dark:text-slate-400">Del</label>
            <div className="w-40">
              <DatePicker value={fromDate} onChange={d => { if (d) { setFromDate(d); setPage(1) } }} maxDate={toDate || undefined} />
            </div>
            <label className="text-sm text-slate-500 dark:text-slate-400">al</label>
            <div className="w-40">
              <DatePicker value={toDate} onChange={d => { if (d) { setToDate(d); setPage(1) } }} minDate={fromDate || undefined} />
            </div>
          </div>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">

            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
                <th className={`${thCls} text-center w-12`}>#</th>
                {tab === 'contratos' && (<>
                  <th className={`${thCls} text-left`}>Empleado</th>
                  <th className={`${thCls} text-left`}>Tipo</th>
                  <th className={`${thCls} text-center hidden md:table-cell`}>Vigencia</th>
                  <th className={`${thCls} text-right hidden sm:table-cell`}>Monto</th>
                  <th className={`${thCls} text-center hidden lg:table-cell`}>Pago</th>
                  <th className={`${thCls} text-center`}>Estado</th>
                  <th className={`${thCls} text-center`}>Acciones</th>
                </>)}
                {tab === 'horas' && (<>
                  <th className={`${thCls} text-left`}>Empleado</th>
                  <th className={`${thCls} text-center`}>Fecha</th>
                  <th className={`${thCls} text-left`}>Tipo de trabajo</th>
                  <th className={`${thCls} text-center`}>Horas</th>
                  <th className={`${thCls} text-right hidden sm:table-cell`}>Monto est.</th>
                  <th className={`${thCls} text-left hidden lg:table-cell`}>Descripción</th>
                  <th className={`${thCls} text-center`}>Acciones</th>
                </>)}
                {tab === 'resumen' && (<>
                  <th className={`${thCls} text-left`}>Empleado</th>
                  <th className={`${thCls} text-left hidden md:table-cell`}>Departamento</th>
                  <th className={`${thCls} text-left`}>Tipo de trabajo</th>
                  <th className={`${thCls} text-center`}>Horas</th>
                  <th className={`${thCls} text-right`}>Monto est.</th>
                </>)}
                {tab === 'tipos' && (<>
                  <th className={`${thCls} text-left`}>Nombre</th>
                  <th className={`${thCls} text-left hidden md:table-cell`}>Descripción</th>
                  <th className={`${thCls} text-center`}>Multiplicador</th>
                  <th className={`${thCls} text-center`}>Estado</th>
                  <th className={`${thCls} text-center`}>Acciones</th>
                </>)}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50 dark:border-slate-700/40">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-5 py-2">
                        <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" style={{ width: `${[8, 40, 32, 32, 16, 16, 24, 24][j] * 4}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : currentTotal === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center">
                    <FolderOpen className="w-9 h-9 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">
                      {search || statusFilter
                        ? 'Sin resultados para la búsqueda.'
                        : tab === 'contratos'
                          ? 'No hay contratos registrados. Crea el primero con "Nuevo Contrato".'
                          : tab === 'horas'
                            ? 'No hay horas registradas en el período consultado.'
                            : tab === 'resumen'
                              ? 'No hay horas para resumir en el período consultado.'
                              : 'No hay tipos de trabajo registrados.'}
                    </p>
                  </td>
                </tr>
              ) : tab === 'contratos' ? (
                paginatedContracts.map((c, i) => {
                  const meta = CONTRACT_STATUS_META[c.effectiveStatus] ?? { label: c.effectiveStatus, badge: 'bg-slate-100 text-slate-400' }
                  const expiring = c.effectiveStatus === 'Active' && c.expiresInDays !== undefined && c.expiresInDays !== null && c.expiresInDays <= 30
                  return (
                    <tr key={c.id} className="border-b border-slate-50 dark:border-slate-700/40 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition-colors">
                      <td className="px-5 py-2 text-xs text-slate-400 dark:text-slate-500 font-medium text-center align-middle">{globalIndex(i)}</td>
                      <td className="px-5 py-2 text-left align-middle">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">{c.employeeName}</p>
                        <p className="text-xs text-slate-400">{c.employeeCode}</p>
                      </td>
                      <td className="px-5 py-2 text-left align-middle text-slate-600 dark:text-slate-300">{c.contractTypeName}</td>
                      <td className="px-5 py-2 text-center align-middle hidden md:table-cell text-slate-500 dark:text-slate-400">
                        {formatDateShort(c.startDate)} — {c.endDate ? formatDateShort(c.endDate) : 'Indefinido'}
                      </td>
                      <td className="px-5 py-2 text-right align-middle hidden sm:table-cell font-medium text-slate-700 dark:text-slate-200">
                        {fmtMoneyPlain(c.payRate)}{c.currencyCode ? ` ${c.currencyCode}` : ''}
                      </td>
                      <td className="px-5 py-2 text-center align-middle hidden lg:table-cell">
                        <p className="text-slate-500 dark:text-slate-400">{PAY_UNIT_LABELS[c.payUnit] ?? c.payUnit}</p>
                        <p className="text-xs text-slate-400">
                          {PAY_FREQUENCY_LABELS[c.payFrequency] ?? c.payFrequency}
                          {c.workShift ? ` · ${WORK_SHIFT_LABELS[c.workShift] ?? c.workShift}` : ''}
                        </p>
                      </td>
                      <td className="px-5 py-2 text-center align-middle">
                        <span
                          title={c.effectiveStatus === 'Terminated'
                            ? [TERMINATION_TYPE_LABELS[c.terminationType ?? ''] ?? c.terminationType, c.terminationReason].filter(Boolean).join(': ')
                            : expiring ? `Vence en ${c.expiresInDays} días` : undefined}
                          className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${expiring ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' : meta.badge}`}
                        >
                          {expiring ? `Vence en ${c.expiresInDays} d` : meta.label}
                          {c.effectiveStatus === 'Terminated' && c.terminationType &&
                            ` (${TERMINATION_TYPE_LABELS[c.terminationType] ?? c.terminationType})`}
                        </span>
                      </td>
                      <td className="px-5 py-2 align-middle">
                        <div className="flex items-center justify-center gap-0.5">
                          {c.documentUrl && (
                            <button onClick={() => handleOpenDocument(c)} title={`Ver documento firmado (${c.documentFileName ?? 'archivo'})`}
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-500/10 transition-colors">
                              <FileDown className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canContractDocUpload && (
                            <button onClick={() => openDocumentPicker(c)} disabled={uploadingDocId === c.id}
                              title={c.documentUrl ? 'Reemplazar documento firmado' : 'Subir documento firmado (PDF)'}
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors disabled:opacity-50">
                              {uploadingDocId === c.id
                                ? <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-indigo-600 rounded-full animate-spin" />
                                : <Upload className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          {c.status === 'Active' && (<>
                            {canContractUpdate && (
                              <button onClick={() => openContractEdit(c)} title="Editar"
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canContractRenew && (
                              <button onClick={() => openRenew(c)} title="Renovar contrato"
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors">
                                <RotateCw className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canContractTerminate && (
                              <button onClick={() => openTerminate(c)} title="Terminar contrato"
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors">
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>)}
                          {canContractDelete && (
                            <button onClick={() => setDeleteContractTarget(c)} title="Eliminar"
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : tab === 'horas' ? (
                paginatedEntries.map((e, i) => (
                  <tr key={e.id} className="border-b border-slate-50 dark:border-slate-700/40 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition-colors">
                    <td className="px-5 py-2 text-xs text-slate-400 dark:text-slate-500 font-medium text-center align-middle">{globalIndex(i)}</td>
                    <td className="px-5 py-2 text-left align-middle">
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{e.employeeName}</p>
                      <p className="text-xs text-slate-400">{e.employeeCode}</p>
                    </td>
                    <td className="px-5 py-2 text-center align-middle text-slate-500 dark:text-slate-400">{formatDateShort(e.workDate)}</td>
                    <td className="px-5 py-2 text-left align-middle">
                      <span className="text-slate-700 dark:text-slate-200">{e.workTypeName}</span>
                      <span className="text-xs text-slate-400 ml-1.5">×{e.rateMultiplier}</span>
                    </td>
                    <td className="px-5 py-2 text-center align-middle font-medium text-slate-700 dark:text-slate-200">{e.hours}</td>
                    <td className="px-5 py-2 text-right align-middle hidden sm:table-cell text-slate-500 dark:text-slate-400">
                      {e.estimatedAmount != null ? fmtMoneyPlain(e.estimatedAmount) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </td>
                    <td className="px-5 py-2 text-left align-middle hidden lg:table-cell text-slate-500 dark:text-slate-400 max-w-56 truncate">
                      {e.description || <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </td>
                    <td className="px-5 py-2 align-middle">
                      <div className="flex items-center justify-center gap-0.5">
                        {canEntryUpdate && (
                          <button onClick={() => openEntryEdit(e)} title="Editar"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canEntryDelete && (
                          <button onClick={() => setDeleteEntryTarget(e)} title="Eliminar"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : tab === 'resumen' ? (
                paginatedSummary.map((s, i) => (
                  <tr key={`${s.employeeId}-${s.workTypeId}`} className="border-b border-slate-50 dark:border-slate-700/40 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition-colors">
                    <td className="px-5 py-2 text-xs text-slate-400 dark:text-slate-500 font-medium text-center align-middle">{globalIndex(i)}</td>
                    <td className="px-5 py-2 text-left align-middle">
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{s.employeeName}</p>
                      <p className="text-xs text-slate-400">{s.employeeCode}</p>
                    </td>
                    <td className="px-5 py-2 text-left align-middle hidden md:table-cell text-slate-500 dark:text-slate-400">{s.departmentName}</td>
                    <td className="px-5 py-2 text-left align-middle">
                      <span className="text-slate-700 dark:text-slate-200">{s.workTypeName}</span>
                      <span className="text-xs text-slate-400 ml-1.5">×{s.rateMultiplier}</span>
                    </td>
                    <td className="px-5 py-2 text-center align-middle font-medium text-indigo-600 dark:text-indigo-400">{s.totalHours}</td>
                    <td className="px-5 py-2 text-right align-middle font-medium text-slate-700 dark:text-slate-200">
                      {s.estimatedAmount > 0 ? fmtMoneyPlain(s.estimatedAmount) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </td>
                  </tr>
                ))
              ) : (
                filteredWorkTypes.map((w, i) => (
                  <tr key={w.id} className="border-b border-slate-50 dark:border-slate-700/40 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition-colors">
                    <td className="px-5 py-2 text-xs text-slate-400 dark:text-slate-500 font-medium text-center align-middle">{i + 1}</td>
                    <td className="px-5 py-2 text-left align-middle font-semibold text-slate-800 dark:text-slate-200">{w.name}</td>
                    <td className="px-5 py-2 text-left align-middle hidden md:table-cell text-slate-500 dark:text-slate-400 max-w-72 truncate">
                      {w.description || <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </td>
                    <td className="px-5 py-2 text-center align-middle font-medium text-slate-700 dark:text-slate-200">×{w.rateMultiplier}</td>
                    <td className="px-5 py-2 text-center align-middle">
                      {canWorkTypeToggle ? (
                        <button
                          onClick={() => handleToggleWorkType(w)}
                          title={w.isActive ? 'Desactivar' : 'Activar'}
                          className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                            w.isActive
                              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                              : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                          }`}
                        >
                          {w.isActive ? 'Activo' : 'Inactivo'}
                        </button>
                      ) : (
                        <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${
                          w.isActive
                            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                        }`}>
                          {w.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2 align-middle">
                      <div className="flex items-center justify-center gap-0.5">
                        {canWorkTypeUpdate && (
                          <button onClick={() => openWorkTypeEdit(w)} title="Editar"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canWorkTypeDelete && (
                          <button onClick={() => setDeleteWorkTypeTarget(w)} title="Eliminar"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
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

        {!loading && tab !== 'tipos' && currentTotal > 0 && (
          <Pagination
            total={currentTotal}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}
      </div>

      {/* Modal crear / editar contrato */}
      {contractMounted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${contractClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden ${contractClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            {/* Encabezado fijo */}
            <div className="px-6 pt-6 shrink-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">
                {editingContract ? 'Editar Contrato' : 'Nuevo Contrato'}
              </h2>
              <p className="text-xs text-slate-400 mb-5">
                Un empleado puede tener contratos activos de tipos distintos en paralelo (contratos mixtos).
              </p>
            </div>
            {/* Cuerpo con scroll propio */}
            <div className="flex-1 overflow-y-auto px-6 pb-5 space-y-4 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Empleado <span className="text-red-500">*</span></label>
                {editingContract ? (
                  <p className="px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200">
                    {editingContract.employeeName} ({editingContract.employeeCode})
                  </p>
                ) : (
                  <SearchSelect
                    options={activeEmployeeOptions}
                    value={contractForm.employeeId}
                    onChange={v => setContractForm(f => ({ ...f, employeeId: v }))}
                    placeholder="Selecciona un empleado…"
                    searchPlaceholder="Buscar empleado…"
                    emptyLabel="Sin empleados activos."
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Tipo de contrato <span className="text-red-500">*</span></label>
                {editingContract ? (
                  <p className="px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200">
                    {editingContract.contractTypeName}
                  </p>
                ) : (
                  <SearchSelect
                    options={contractTypeOptions}
                    value={contractForm.contractTypeId}
                    onChange={v => setContractForm(f => ({ ...f, contractTypeId: v }))}
                    placeholder="Selecciona el tipo…"
                    searchPlaceholder="Buscar tipo…"
                    emptyLabel="Sin tipos de contrato activos."
                  />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Fecha de inicio <span className="text-red-500">*</span></label>
                  <DatePicker value={contractForm.startDate} onChange={startDate => setContractForm(f => ({ ...f, startDate }))} maxDate={contractForm.endDate || undefined} />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Fecha de fin</label>
                  <DatePicker value={contractForm.endDate} onChange={endDate => setContractForm(f => ({ ...f, endDate }))} minDate={contractForm.startDate || undefined} />
                  <p className="text-xs text-slate-400">Vacía = contrato indefinido.</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Base salarial <span className="text-red-500">*</span></label>
                  <SearchSelect
                    options={payUnitOptions}
                    value={contractForm.payUnit}
                    onChange={v => setContractForm(f => ({ ...f, payUnit: v }))}
                    placeholder="Selecciona…"
                    searchPlaceholder="Buscar…"
                    emptyLabel="—"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Monto <span className="text-red-500">*</span></label>
                  <input type="number" min={0} step="0.01" placeholder="0.00" value={contractForm.payRate}
                    onChange={e => setContractForm(f => ({ ...f, payRate: e.target.value }))}
                    className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Frecuencia de pago <span className="text-red-500">*</span></label>
                  <SearchSelect
                    options={payFrequencyOptions}
                    value={contractForm.payFrequency}
                    onChange={v => setContractForm(f => ({ ...f, payFrequency: v }))}
                    placeholder="Selecciona…"
                    searchPlaceholder="Buscar…"
                    emptyLabel="—"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Jornada laboral</label>
                  <SearchSelect
                    options={[{ value: '', label: 'Sin especificar' }, ...workShiftOptions]}
                    value={contractForm.workShift}
                    onChange={v => setContractForm(f => ({ ...f, workShift: v }))}
                    placeholder="Sin especificar"
                    searchPlaceholder="Buscar…"
                    emptyLabel="—"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Moneda</label>
                  <SearchSelect
                    options={[{ value: '', label: 'Sin especificar' }, ...currencyOptions]}
                    value={contractForm.currencyId}
                    onChange={v => setContractForm(f => ({ ...f, currencyId: v }))}
                    placeholder="Sin especificar"
                    searchPlaceholder="Buscar moneda…"
                    emptyLabel="Sin monedas activas."
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Horas semanales</label>
                  <input type="number" min={1} max={168} step="0.5" placeholder="Ej: 40" value={contractForm.weeklyHours}
                    onChange={e => setContractForm(f => ({ ...f, weeklyHours: e.target.value }))}
                    className={inputCls} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Notas</label>
                <textarea rows={2} maxLength={1000} placeholder="Condiciones particulares del contrato…" value={contractForm.notes}
                  onChange={e => setContractForm(f => ({ ...f, notes: e.target.value }))}
                  className={`${inputCls} resize-none`} />
              </div>
              {contractError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {contractError}
                </div>
              )}
            </div>
            {/* Pie fijo: acciones */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button onClick={() => setContractModalOpen(false)} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveContract} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {saving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Save className="w-3.5 h-3.5" />}
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal renovar contrato */}
      {renewMounted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${renewClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md p-6 ${renewClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">Renovar Contrato</h2>
            <p className="text-xs text-slate-400 mb-5">
              {renewTarget?.employeeName} — {renewTarget?.contractTypeName}. El contrato actual pasa a Renovado y se crea uno nuevo encadenado.
            </p>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nuevo inicio <span className="text-red-500">*</span></label>
                  <DatePicker value={renewForm.startDate} onChange={startDate => setRenewForm(f => ({ ...f, startDate }))} maxDate={renewForm.endDate || undefined} />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nuevo fin</label>
                  <DatePicker value={renewForm.endDate} onChange={endDate => setRenewForm(f => ({ ...f, endDate }))} minDate={renewForm.startDate || undefined} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Monto ({PAY_UNIT_LABELS[renewTarget?.payUnit ?? ''] ?? renewTarget?.payUnit})</label>
                <input type="number" min={0} step="0.01" value={renewForm.payRate}
                  onChange={e => setRenewForm(f => ({ ...f, payRate: e.target.value }))}
                  className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Notas</label>
                <textarea rows={2} maxLength={1000} placeholder="Condiciones de la renovación…" value={renewForm.notes}
                  onChange={e => setRenewForm(f => ({ ...f, notes: e.target.value }))}
                  className={`${inputCls} resize-none`} />
              </div>
              {renewError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {renewError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setRenewTarget(null)} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleRenew} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {saving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <RotateCw className="w-3.5 h-3.5" />}
                {saving ? 'Renovando…' : 'Renovar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal terminar contrato */}
      {terminateMounted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${terminateClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md p-6 ${terminateClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">Terminar Contrato</h2>
            <p className="text-xs text-slate-400 mb-5">
              {terminateTarget?.employeeName} — {terminateTarget?.contractTypeName}. Esta acción cierra el contrato anticipadamente.
            </p>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Fecha de término <span className="text-red-500">*</span></label>
                  <DatePicker value={terminateForm.endDate} onChange={endDate => setTerminateForm(f => ({ ...f, endDate }))} minDate={terminateTarget?.startDate} />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Motivo <span className="text-red-500">*</span></label>
                  <SearchSelect
                    options={Object.entries(TERMINATION_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
                    value={terminateForm.terminationType}
                    onChange={v => setTerminateForm(f => ({ ...f, terminationType: v }))}
                    placeholder="Selecciona…"
                    searchPlaceholder="Buscar…"
                    emptyLabel="—"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Detalle</label>
                <textarea rows={2} maxLength={600} placeholder="Detalle del motivo de la terminación…" value={terminateForm.reason}
                  onChange={e => setTerminateForm(f => ({ ...f, reason: e.target.value }))}
                  className={`${inputCls} resize-none`} />
              </div>
              {terminateError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {terminateError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setTerminateTarget(null)} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleTerminate} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {saving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Ban className="w-3.5 h-3.5" />}
                {saving ? 'Terminando…' : 'Terminar Contrato'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal registrar / editar horas */}
      {entryMounted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${entryClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden ${entryClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            {/* Encabezado fijo */}
            <div className="px-6 pt-6 shrink-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-5">
                {editingEntry ? 'Editar Registro de Horas' : 'Registrar Horas'}
              </h2>
            </div>
            {/* Cuerpo con scroll propio */}
            <div className="flex-1 overflow-y-auto px-6 pb-5 space-y-4 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Empleado <span className="text-red-500">*</span></label>
                {editingEntry ? (
                  <p className="px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200">
                    {editingEntry.employeeName} ({editingEntry.employeeCode})
                  </p>
                ) : (
                  <SearchSelect
                    options={activeEmployeeOptions}
                    value={entryForm.employeeId}
                    onChange={v => setEntryForm(f => ({ ...f, employeeId: v, contractId: '' }))}
                    placeholder="Selecciona un empleado…"
                    searchPlaceholder="Buscar empleado…"
                    emptyLabel="Sin empleados activos."
                  />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Fecha <span className="text-red-500">*</span></label>
                  <DatePicker value={entryForm.workDate} onChange={workDate => setEntryForm(f => ({ ...f, workDate }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Horas <span className="text-red-500">*</span></label>
                  <input type="number" min={0.25} max={24} step="0.25" placeholder="Ej: 8" value={entryForm.hours}
                    onChange={e => setEntryForm(f => ({ ...f, hours: e.target.value }))}
                    className={inputCls} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Tipo de trabajo <span className="text-red-500">*</span></label>
                <SearchSelect
                  options={workTypeOptions}
                  value={entryForm.workTypeId}
                  onChange={v => setEntryForm(f => ({ ...f, workTypeId: v }))}
                  placeholder="Selecciona el tipo…"
                  searchPlaceholder="Buscar tipo…"
                  emptyLabel="Sin tipos de trabajo activos."
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Contrato imputado</label>
                <SearchSelect
                  options={[{ value: '', label: 'Sin imputar a contrato' }, ...entryContractOptions]}
                  value={entryForm.contractId}
                  onChange={v => setEntryForm(f => ({ ...f, contractId: v }))}
                  placeholder="Sin imputar a contrato"
                  searchPlaceholder="Buscar contrato…"
                  emptyLabel="El empleado no tiene contratos activos."
                />
                <p className="text-xs text-slate-400">El monto estimado usa la tarifa hora del contrato por horas.</p>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Descripción</label>
                <textarea rows={2} maxLength={600} placeholder="Trabajo realizado…" value={entryForm.description}
                  onChange={e => setEntryForm(f => ({ ...f, description: e.target.value }))}
                  className={`${inputCls} resize-none`} />
              </div>
              {entryError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {entryError}
                </div>
              )}
            </div>
            {/* Pie fijo: acciones */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button onClick={() => setEntryModalOpen(false)} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveEntry} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {saving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Save className="w-3.5 h-3.5" />}
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal crear / editar tipo de trabajo */}
      {workTypeMounted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${workTypeClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md p-6 ${workTypeClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-5">
              {editingWorkType ? 'Editar Tipo de Trabajo' : 'Nuevo Tipo de Trabajo'}
            </h2>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre <span className="text-red-500">*</span></label>
                <input type="text" maxLength={100} placeholder="Ej: Horas extra" value={workTypeForm.name}
                  onChange={e => setWorkTypeForm(f => ({ ...f, name: e.target.value }))}
                  className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Descripción</label>
                <textarea rows={2} maxLength={500} placeholder="Cuándo aplica este tipo de horas…" value={workTypeForm.description}
                  onChange={e => setWorkTypeForm(f => ({ ...f, description: e.target.value }))}
                  className={`${inputCls} resize-none`} />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Multiplicador de tarifa <span className="text-red-500">*</span></label>
                <input type="number" min={0.01} max={99.99} step="0.05" value={workTypeForm.rateMultiplier}
                  onChange={e => setWorkTypeForm(f => ({ ...f, rateMultiplier: e.target.value }))}
                  className={inputCls} />
                <p className="text-xs text-slate-400">Ej: 1.50 paga las horas al 150 % de la tarifa base.</p>
              </div>
              {workTypeError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {workTypeError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setWorkTypeModalOpen(false)} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveWorkType} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {saving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Save className="w-3.5 h-3.5" />}
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input oculto para subir el documento firmado del contrato */}
      <input
        ref={documentInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={handleDocumentSelected}
      />

      <ConfirmDialog
        open={!!deleteContractTarget}
        title="¿Eliminar contrato?"
        message={`El contrato "${deleteContractTarget?.contractTypeName}" de "${deleteContractTarget?.employeeName}" se eliminará permanentemente. Considera terminarlo en su lugar para conservar el historial.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDeleteContract}
        onCancel={() => setDeleteContractTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteEntryTarget}
        title="¿Eliminar registro de horas?"
        message={`Las ${deleteEntryTarget?.hours} horas de "${deleteEntryTarget?.employeeName}" del ${deleteEntryTarget ? formatDateShort(deleteEntryTarget.workDate) : ''} se eliminarán permanentemente.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDeleteEntry}
        onCancel={() => setDeleteEntryTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteWorkTypeTarget}
        title="¿Eliminar tipo de trabajo?"
        message={`El tipo "${deleteWorkTypeTarget?.name}" se eliminará permanentemente. No se permite si tiene horas registradas.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDeleteWorkType}
        onCancel={() => setDeleteWorkTypeTarget(null)}
      />
    </div>
  )
}
