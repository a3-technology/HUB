import { useEffect, useRef, useState } from 'react'
import { Plus, Search, Pencil, Eye, ToggleLeft, ToggleRight, RefreshCw, Save, Trash2, Briefcase, Users, UserCheck, ClipboardList, Mail, Phone, Download, FileText, Upload, X, Info } from 'lucide-react'
import { vacanciesApi, candidatesApi, applicationsApi, positionsApi, departmentsApi, identificationTypesApi, currenciesApi, employeesApi } from '../../lib/api'
import { fmtMoneyPlain } from '../../lib/format'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Pagination, usePagination, type PageSize } from '../../components/Pagination'
import { SearchSelect } from '../../components/SearchSelect'
import { MultiSearchSelect } from '../../components/MultiSearchSelect'
import { DatePicker } from '../../components/DatePicker'
import { QuickCreateModal } from '../../components/QuickCreateModal'
import { TabsScroller } from '../../components/TabsScroller'
import { PhoneInput } from '../../components/PhoneInput'
import { useToast } from '../../context/ToastContext'
import { useModalTransition } from '../../hooks/useModalTransition'
import { usePermission } from '../../hooks/usePermission'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Vacancy {
  id: string
  title: string
  description?: string
  positionId: string
  positionName: string
  departmentId: string
  departmentName: string
  openingsCount: number
  salaryMin?: number
  salaryMax?: number
  currencyId?: string
  currencyCode?: string
  currencySymbol?: string
  status: VacancyStatus
  publishedDate: string
  closingDate?: string
  applicationCount: number
  hiredCount: number
  createdAt: string
  updatedAt?: string
}

interface Candidate {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  resumeUrl?: string
  source?: string
  notes?: string
  isActive: boolean
  applicationCount: number
  createdAt: string
  updatedAt?: string
}

interface Application {
  id: string
  vacancyId: string
  vacancyTitle: string
  vacancyStatus: VacancyStatus
  positionName: string
  departmentName: string
  candidateId: string
  candidateFirstName: string
  candidateLastName: string
  candidateEmail: string
  candidatePhone?: string
  stage: Stage
  appliedDate: string
  notes?: string
  employeeId?: string
  employeeCode?: string
  createdAt: string
  updatedAt?: string
}

interface Option { id: string; name: string }
interface CurrencyOption { id: string; code: string; name: string; symbol: string }

/** Transición de etapa de una postulación (línea de tiempo del proceso). */
interface StageHistoryEntry {
  id: string
  fromStage?: Stage
  toStage: Stage
  changedAt: string
}

/** Evento de la trayectoria laboral de un empleado. */
interface JobHistoryEntry {
  id: string
  changeType: 'Hire' | 'Position' | 'Department' | 'Salary'
  oldValue?: string
  newValue: string
  changedAt: string
}

const JOB_CHANGE_LABELS: Record<JobHistoryEntry['changeType'], string> = {
  Hire:       'Contratación',
  Position:   'Cambio de cargo',
  Department: 'Cambio de departamento',
  Salary:     'Cambio de salario',
}

/** Ficha del empleado consultada al hacer click en el código desde una postulación contratada. */
interface EmployeeDetail {
  id: string
  code: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  identificationTypeName: string
  identificationNumber: string
  salary: number
  currencyCode?: string
  currencySymbol?: string
  positionName: string
  departmentName: string
  hireDate: string
  isActive: boolean
  resumeUrl?: string
}

type VacancyStatus = 'Open' | 'OnHold' | 'Closed' | 'Cancelled'
type Stage = 'Applied' | 'Screening' | 'Interview' | 'Offer' | 'Hired' | 'Rejected'
type Tab = 'vacantes' | 'candidatos' | 'postulaciones'

// ── Catálogos de estados y etapas (códigos en inglés, etiquetas en español) ───

const VACANCY_STATUSES: { value: VacancyStatus; label: string; badge: string }[] = [
  { value: 'Open',      label: 'Abierta',   badge: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
  { value: 'OnHold',    label: 'En pausa',  badge: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
  { value: 'Closed',    label: 'Cerrada',   badge: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400' },
  { value: 'Cancelled', label: 'Cancelada', badge: 'bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400' },
]

const STAGES: { value: Stage; label: string; badge: string }[] = [
  { value: 'Applied',   label: 'Postulado',    badge: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400' },
  { value: 'Screening', label: 'Preselección', badge: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400' },
  { value: 'Interview', label: 'Entrevista',   badge: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
  { value: 'Offer',     label: 'Oferta',       badge: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400' },
  { value: 'Hired',     label: 'Contratado',   badge: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
  { value: 'Rejected',  label: 'Rechazado',    badge: 'bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400' },
]

const statusInfo = (s: VacancyStatus) => VACANCY_STATUSES.find(x => x.value === s) ?? VACANCY_STATUSES[0]
const stageInfo  = (s: Stage)         => STAGES.find(x => x.value === s) ?? STAGES[0]

// ── Formularios ───────────────────────────────────────────────────────────────

interface VacancyForm {
  title: string
  description: string
  positionId: string
  departmentId: string
  openingsCount: string
  salaryMin: string
  salaryMax: string
  currencyId: string
  closingDate: string
}

interface CandidateForm {
  firstName: string
  lastName: string
  email: string
  phone: string
  resumeUrl: string
  source: string
  notes: string
}

interface ApplicationForm {
  vacancyId: string
  candidateIds: string[]
  notes: string
}

interface HireForm {
  code: string
  identificationTypeId: string
  identificationNumber: string
  salary: string
  currencyId: string
  hireDate: string
}

const EMPTY_VACANCY: VacancyForm     = { title: '', description: '', positionId: '', departmentId: '', openingsCount: '1', salaryMin: '', salaryMax: '', currencyId: '', closingDate: '' }
const EMPTY_CANDIDATE: CandidateForm = { firstName: '', lastName: '', email: '', phone: '', resumeUrl: '', source: '', notes: '' }
const EMPTY_APPLICATION: ApplicationForm = { vacancyId: '', candidateIds: [], notes: '' }
const EMPTY_HIRE: HireForm = { code: '', identificationTypeId: '', identificationNumber: '', salary: '', currencyId: '', hireDate: '' }

// ── Utilidades ────────────────────────────────────────────────────────────────

const initials = (firstName: string, lastName: string) =>
  `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' })

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const salaryRange = (min?: number, max?: number, symbol?: string) => {
  if (min == null && max == null) return null
  const prefix = symbol ? `${symbol} ` : ''
  if (min != null && max != null) return `${prefix}${fmtMoneyPlain(min)} – ${fmtMoneyPlain(max)}`
  return prefix + fmtMoneyPlain((min ?? max)!)
}

// Clases compartidas de inputs y botones de los modales
const inputCls  = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition'
const labelCls  = 'block text-sm font-medium text-slate-700 dark:text-slate-300'
const thCls     = 'px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider'
const actionCls = 'w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors'
const deleteCls = 'w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors'

export function ReclutamientoPage() {
  const toast = useToast()

  const canCreateVacancy      = usePermission('hr.vacancies.create')
  const canUpdateVacancy      = usePermission('hr.vacancies.update')
  const canChangeStatusVacancy = usePermission('hr.vacancies.change-status')
  const canDeleteVacancy      = usePermission('hr.vacancies.delete')

  const canCreateCandidate = usePermission('hr.candidates.create')
  const canUpdateCandidate = usePermission('hr.candidates.update')
  const canToggleCandidate = usePermission('hr.candidates.toggle')
  const canDeleteCandidate = usePermission('hr.candidates.delete')
  const canUploadResume    = usePermission('hr.candidates.resume-upload')
  const canDeleteResume    = usePermission('hr.candidates.resume-delete')

  const canCreateApplication     = usePermission('hr.applications.create')
  const canUpdateApplication     = usePermission('hr.applications.update')
  const canChangeStageApplication = usePermission('hr.applications.change-stage')
  const canHireApplication       = usePermission('hr.applications.hire')
  const canDeleteApplication     = usePermission('hr.applications.delete')

  // Catálogos con creación rápida inline desde los formularios de vacante/contratación
  const canCreatePosition           = usePermission('hr.positions.create')
  const canCreateDepartment         = usePermission('hr.departments.create')
  const canCreateCurrency           = usePermission('general.currencies.create')
  const canCreateIdentificationType = usePermission('hr.identification-types.create')

  const [tab, setTab] = useState<Tab>('vacantes')

  const [vacancies, setVacancies]       = useState<Vacancy[]>([])
  const [candidates, setCandidates]     = useState<Candidate[]>([])
  const [applications, setApplications] = useState<Application[]>([])
  const [positions, setPositions]       = useState<Option[]>([])
  const [departments, setDepartments]   = useState<Option[]>([])
  const [idTypes, setIdTypes]           = useState<Option[]>([])
  const [currencies, setCurrencies]     = useState<CurrencyOption[]>([])
  const [loading, setLoading]           = useState(true)
  const [refreshing, setRefreshing]     = useState(false)

  const [search, setSearch]         = useState('')
  const [page, setPage]             = useState(1)
  const [pageSize, setPageSize]     = useState<PageSize>(10)
  const [stageFilter, setStageFilter] = useState<Stage | ''>('')

  // ── Modal de vacante ──
  const [vacModalOpen, setVacModalOpen] = useState(false)
  const [editingVac, setEditingVac]     = useState<Vacancy | null>(null)
  const [vacForm, setVacForm]           = useState<VacancyForm>(EMPTY_VACANCY)
  const [vacError, setVacError]         = useState<string | null>(null)
  const [vacSaving, setVacSaving]       = useState(false)
  const { mounted: vacMounted, closing: vacClosing } = useModalTransition(vacModalOpen)

  // ── Creación rápida de cargo desde el propio modal de vacante ──
  const [posModalOpen, setPosModalOpen] = useState(false)
  const [posForm, setPosForm]           = useState({ name: '', description: '' })
  const [posSaving, setPosSaving]       = useState(false)
  const [posError, setPosError]         = useState<string | null>(null)
  const { mounted: posModalMounted, closing: posModalClosing } = useModalTransition(posModalOpen)

  // ── Creación rápida de departamento desde el propio modal de vacante ──
  const [deptModalOpen, setDeptModalOpen] = useState(false)
  const [deptForm, setDeptForm]           = useState({ name: '', description: '' })
  const [deptSaving, setDeptSaving]       = useState(false)
  const [deptError, setDeptError]         = useState<string | null>(null)
  const { mounted: deptModalMounted, closing: deptModalClosing } = useModalTransition(deptModalOpen)

  // ── Creación rápida de moneda desde los modales de vacante y contratación ──
  const [curModalOpen, setCurModalOpen] = useState(false)
  const [curForm, setCurForm]           = useState({ code: '', name: '', symbol: '' })
  const [curSaving, setCurSaving]       = useState(false)
  const [curError, setCurError]         = useState<string | null>(null)
  const [curTarget, setCurTarget]       = useState<'vacancy' | 'hire'>('vacancy')
  const { mounted: curModalMounted, closing: curModalClosing } = useModalTransition(curModalOpen)

  // ── Modal de candidato ──
  const [candModalOpen, setCandModalOpen] = useState(false)
  const [editingCand, setEditingCand]     = useState<Candidate | null>(null)
  const [candForm, setCandForm]           = useState<CandidateForm>(EMPTY_CANDIDATE)
  const [candError, setCandError]         = useState<string | null>(null)
  const [candSaving, setCandSaving]       = useState(false)
  const { mounted: candMounted, closing: candClosing } = useModalTransition(candModalOpen)

  // ── Modal de postulación ──
  const [appModalOpen, setAppModalOpen] = useState(false)
  const [editingApp, setEditingApp]     = useState<Application | null>(null)
  const [appForm, setAppForm]           = useState<ApplicationForm>(EMPTY_APPLICATION)
  const [appError, setAppError]         = useState<string | null>(null)
  const [appSaving, setAppSaving]       = useState(false)
  const { mounted: appMounted, closing: appClosing } = useModalTransition(appModalOpen)

  // ── Modal de contratación ──
  const [hireTarget, setHireTarget] = useState<Application | null>(null)
  const [hireForm, setHireForm]     = useState<HireForm>(EMPTY_HIRE)
  const [hireError, setHireError]   = useState<string | null>(null)
  const [hireSaving, setHireSaving] = useState(false)
  const { mounted: hireMounted, closing: hireClosing } = useModalTransition(!!hireTarget)

  // ── Modal de detalle de vacante (solo lectura) ──
  const [detailTarget, setDetailTarget] = useState<Vacancy | null>(null)
  const { mounted: detailMounted, closing: detailClosing } = useModalTransition(!!detailTarget)

  // ── Modal de detalle de postulación (solo lectura) ──
  const [appDetailTarget, setAppDetailTarget] = useState<Application | null>(null)
  const { mounted: appDetailMounted, closing: appDetailClosing } = useModalTransition(!!appDetailTarget)

  // ── Modal de detalle de candidato (solo lectura) ──
  const [candDetailTarget, setCandDetailTarget] = useState<Candidate | null>(null)
  const { mounted: candDetailMounted, closing: candDetailClosing } = useModalTransition(!!candDetailTarget)

  // ── Ficha del empleado generado por una contratación (solo lectura) ──
  const [empDetail, setEmpDetail] = useState<EmployeeDetail | null>(null)
  const { mounted: empDetailMounted, closing: empDetailClosing } = useModalTransition(!!empDetail)

  // ── Trazabilidad: línea de tiempo de la postulación y trayectoria del empleado ──
  const [appHistory, setAppHistory] = useState<StageHistoryEntry[]>([])
  const [empHistory, setEmpHistory] = useState<JobHistoryEntry[]>([])

  useEffect(() => {
    if (!appDetailTarget) { setAppHistory([]); return }
    applicationsApi.history(appDetailTarget.id)
      .then(res => res.ok ? res.json() : [])
      .then(setAppHistory)
      .catch(() => setAppHistory([]))
  }, [appDetailTarget])

  useEffect(() => {
    if (!empDetail) { setEmpHistory([]); return }
    employeesApi.history(empDetail.id)
      .then(res => res.ok ? res.json() : [])
      .then(setEmpHistory)
      .catch(() => setEmpHistory([]))
  }, [empDetail])

  // ── Modal de cambio de estado / etapa ──
  const [statusTarget, setStatusTarget] = useState<Vacancy | null>(null)
  const { mounted: statusMounted, closing: statusClosing } = useModalTransition(!!statusTarget)
  const [stageTarget, setStageTarget]   = useState<Application | null>(null)
  const { mounted: stageMounted, closing: stageClosing } = useModalTransition(!!stageTarget)

  // ── Confirmaciones ──
  const [deleteVacTarget, setDeleteVacTarget]   = useState<Vacancy | null>(null)
  const [toggleCandTarget, setToggleCandTarget] = useState<Candidate | null>(null)
  const [deleteCandTarget, setDeleteCandTarget] = useState<Candidate | null>(null)
  const [deleteAppTarget, setDeleteAppTarget]   = useState<Application | null>(null)
  const [deleteResumeTarget, setDeleteResumeTarget] = useState<Candidate | null>(null)

  // ── Carga de datos ──────────────────────────────────────────────────────────

  const loadAll = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true)
    try {
      const [vacRes, candRes, appRes] = await Promise.all([
        vacanciesApi.list(),
        candidatesApi.list(),
        applicationsApi.list(),
      ])
      if (vacRes.ok)  setVacancies(await vacRes.json())
      if (candRes.ok) setCandidates(await candRes.json())
      if (appRes.ok)  setApplications(await appRes.json())
    } finally {
      silent ? setRefreshing(false) : setLoading(false)
    }
  }

  const loadCatalogs = async () => {
    const [posRes, depRes, idtRes, curRes] = await Promise.all([positionsApi.list(), departmentsApi.list(), identificationTypesApi.list(), currenciesApi.list()])
    if (posRes.ok) setPositions(await posRes.json())
    if (depRes.ok) setDepartments(await depRes.json())
    if (idtRes.ok) setIdTypes(await idtRes.json())
    if (curRes.ok) setCurrencies(await curRes.json())
  }

  useEffect(() => { loadAll(); loadCatalogs() }, [])

  const changeTab = (t: Tab) => { setTab(t); setSearch(''); setPage(1); setStageFilter('') }
  const handleSearch = (value: string) => { setSearch(value); setPage(1) }

  // ── Indicadores ─────────────────────────────────────────────────────────────

  const kpis = {
    openVacancies:    vacancies.filter(v => v.status === 'Open').length,
    activeCandidates: candidates.filter(c => c.isActive).length,
    inProcess:        applications.filter(a => a.stage !== 'Hired' && a.stage !== 'Rejected').length,
    hired:            applications.filter(a => a.stage === 'Hired').length,
  }

  // ── Filtros por tab ─────────────────────────────────────────────────────────

  const q = search.toLowerCase()

  const filteredVacancies = vacancies
    .filter(v =>
      v.title.toLowerCase().includes(q) ||
      v.positionName.toLowerCase().includes(q) ||
      v.departmentName.toLowerCase().includes(q)
    )
  const paginatedVacancies = usePagination(filteredVacancies, page, pageSize)

  const filteredCandidates = candidates
    .filter(c =>
      c.firstName.toLowerCase().includes(q) ||
      c.lastName.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.source ?? '').toLowerCase().includes(q)
    )
  const paginatedCandidates = usePagination(filteredCandidates, page, pageSize)

  const filteredApplications = applications
    .filter(a => !stageFilter || a.stage === stageFilter)
    .filter(a =>
      a.candidateFirstName.toLowerCase().includes(q) ||
      a.candidateLastName.toLowerCase().includes(q) ||
      a.candidateEmail.toLowerCase().includes(q) ||
      a.vacancyTitle.toLowerCase().includes(q) ||
      a.positionName.toLowerCase().includes(q)
    )
  const paginatedApplications = usePagination(filteredApplications, page, pageSize)

  const globalIndex = (i: number) =>
    pageSize === 'all' ? i + 1 : (page - 1) * (pageSize as number) + i + 1

  // ── Creación rápida de cargo y departamento ────────────────────────────────

  const openPosModal  = (query: string) => { setPosForm({ name: query, description: '' }); setPosError(null); setPosModalOpen(true) }
  const closePosModal = () => setPosModalOpen(false)

  const openDeptModal  = (query: string) => { setDeptForm({ name: query, description: '' }); setDeptError(null); setDeptModalOpen(true) }
  const closeDeptModal = () => setDeptModalOpen(false)

  const handleSavePos = async () => {
    if (!posForm.name.trim()) { setPosError('El nombre es requerido.'); return }
    setPosSaving(true); setPosError(null)
    try {
      const payload = { name: posForm.name.trim(), description: posForm.description.trim() || undefined }
      const res = await positionsApi.create(payload)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al crear el cargo.' }))
        setPosError(err.message); toast.error(err.message); return
      }
      const result = await res.json()
      toast.success('Cargo creado correctamente.')
      const posRes = await positionsApi.list()
      if (posRes.ok) setPositions(await posRes.json())
      setVacForm(f => ({ ...f, positionId: result.id }))
      closePosModal()
    } finally { setPosSaving(false) }
  }

  const handleSaveDept = async () => {
    if (!deptForm.name.trim()) { setDeptError('El nombre es requerido.'); return }
    setDeptSaving(true); setDeptError(null)
    try {
      const payload = { name: deptForm.name.trim(), description: deptForm.description.trim() || undefined }
      const res = await departmentsApi.create(payload)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al crear el departamento.' }))
        setDeptError(err.message); toast.error(err.message); return
      }
      const result = await res.json()
      toast.success('Departamento creado correctamente.')
      const depRes = await departmentsApi.list()
      if (depRes.ok) setDepartments(await depRes.json())
      setVacForm(f => ({ ...f, departmentId: result.id }))
      closeDeptModal()
    } finally { setDeptSaving(false) }
  }

  // ── Creación rápida de moneda ──────────────────────────────────────────────
  // El mismo modal sirve al formulario de vacante y al de contratación; curTarget
  // indica a cuál de los dos se asigna la moneda recién creada.

  const openCurModal = (target: 'vacancy' | 'hire') => (query: string) => {
    setCurTarget(target)
    setCurForm({ code: query.toUpperCase().slice(0, 3), name: '', symbol: '' })
    setCurError(null)
    setCurModalOpen(true)
  }
  const closeCurModal = () => setCurModalOpen(false)

  const handleSaveCur = async () => {
    if (!curForm.code.trim() || !curForm.name.trim() || !curForm.symbol.trim()) {
      setCurError('Código, nombre y símbolo son requeridos.'); return
    }
    if (curForm.code.trim().length !== 3) {
      setCurError('El código debe tener 3 letras (ISO 4217).'); return
    }
    setCurSaving(true); setCurError(null)
    try {
      const payload = { code: curForm.code.trim().toUpperCase(), name: curForm.name.trim(), symbol: curForm.symbol.trim() }
      const res = await currenciesApi.create(payload)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al crear la moneda.' }))
        setCurError(err.message); toast.error(err.message); return
      }
      const result = await res.json()
      toast.success('Moneda creada correctamente.')
      const curRes = await currenciesApi.list()
      if (curRes.ok) setCurrencies(await curRes.json())
      if (curTarget === 'vacancy') setVacForm(f => ({ ...f, currencyId: result.id }))
      else setHireForm(f => ({ ...f, currencyId: result.id }))
      closeCurModal()
    } finally { setCurSaving(false) }
  }

  // ── Creación rápida de tipo de identificación (modal de contratación) ─────

  const [idtQuickOpen, setIdtQuickOpen]   = useState(false)
  const [idtQuickQuery, setIdtQuickQuery] = useState('')

  const openIdtQuick = (query: string) => { setIdtQuickQuery(query); setIdtQuickOpen(true) }

  /** Crea el tipo de identificación, refresca el catálogo y lo deja
   *  seleccionado en el formulario de contratación. */
  const handleSaveIdtQuick = async (name: string): Promise<string | null> => {
    const res = await identificationTypesApi.create({ name })
    if (!res.ok) return (await res.json().catch(() => null))?.message ?? 'Error al crear el tipo de identificación.'
    const { id } = await res.json()
    toast.success('Tipo de identificación creado correctamente.')
    const idtRes = await identificationTypesApi.list()
    if (idtRes.ok) setIdTypes(await idtRes.json())
    setHireForm(f => ({ ...f, identificationTypeId: id }))
    return null
  }

  // ── Vacantes: CRUD ──────────────────────────────────────────────────────────

  const openCreateVacancy = () => {
    setEditingVac(null)
    setVacForm(EMPTY_VACANCY)
    setVacError(null)
    setVacModalOpen(true)
  }

  const openEditVacancy = (v: Vacancy) => {
    setEditingVac(v)
    setVacForm({
      title: v.title, description: v.description ?? '',
      positionId: v.positionId, departmentId: v.departmentId,
      openingsCount: String(v.openingsCount),
      salaryMin: v.salaryMin != null ? String(v.salaryMin) : '',
      salaryMax: v.salaryMax != null ? String(v.salaryMax) : '',
      currencyId: v.currencyId ?? '',
      closingDate: v.closingDate ? v.closingDate.slice(0, 10) : '',
    })
    setVacError(null)
    setVacModalOpen(true)
  }

  const handleSaveVacancy = async () => {
    if (!vacForm.title.trim() || !vacForm.positionId || !vacForm.departmentId) {
      setVacError('Completa todos los campos requeridos.'); return
    }
    const openings = Number(vacForm.openingsCount)
    if (!Number.isInteger(openings) || openings < 1) {
      setVacError('El número de plazas debe ser un entero mayor o igual a 1.'); return
    }
    const salaryMin = vacForm.salaryMin.trim() === '' ? undefined : Number(vacForm.salaryMin)
    const salaryMax = vacForm.salaryMax.trim() === '' ? undefined : Number(vacForm.salaryMax)
    if ((salaryMin != null && (Number.isNaN(salaryMin) || salaryMin < 0)) ||
        (salaryMax != null && (Number.isNaN(salaryMax) || salaryMax < 0))) {
      setVacError('El rango salarial debe contener números mayores o iguales a cero.'); return
    }
    if (salaryMin != null && salaryMax != null && salaryMax < salaryMin) {
      setVacError('El salario máximo no puede ser menor que el mínimo.'); return
    }
    if ((salaryMin != null || salaryMax != null) && !vacForm.currencyId) {
      setVacError('Indica la moneda del rango salarial.'); return
    }
    setVacSaving(true); setVacError(null)
    try {
      const payload = {
        title: vacForm.title.trim(),
        description: vacForm.description.trim() || undefined,
        positionId: vacForm.positionId,
        departmentId: vacForm.departmentId,
        openingsCount: openings,
        salaryMin, salaryMax,
        currencyId: vacForm.currencyId || undefined,
        closingDate: vacForm.closingDate || undefined,
      }
      const res = editingVac
        ? await vacanciesApi.update(editingVac.id, payload)
        : await vacanciesApi.create(payload)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar la vacante.' }))
        setVacError(err.message); toast.error(err.message); return
      }
      toast.success(editingVac ? 'Vacante actualizada correctamente.' : 'Vacante creada correctamente.')
      setVacModalOpen(false); await loadAll(true)
    } finally { setVacSaving(false) }
  }

  const handleChangeStatus = async (status: VacancyStatus) => {
    if (!statusTarget) return
    try {
      const res = await vacanciesApi.changeStatus(statusTarget.id, status)
      if (res.ok) { toast.success('Estado de la vacante actualizado.'); await loadAll(true) }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo cambiar el estado.' }))
        toast.error(err.message)
      }
    } finally { setStatusTarget(null) }
  }

  const handleDeleteVacancy = async () => {
    if (!deleteVacTarget) return
    try {
      const res = await vacanciesApi.remove(deleteVacTarget.id)
      if (res.ok) { toast.success('Vacante eliminada correctamente.'); await loadAll(true) }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar la vacante.' }))
        toast.error(err.message)
      }
    } finally { setDeleteVacTarget(null) }
  }

  // ── Candidatos: CRUD ────────────────────────────────────────────────────────

  // CV seleccionado en el modal; se sube a Azure Blob Storage al guardar.
  // El input de archivo vive oculto y se dispara desde los botones del campo.
  const [candResumeFile, setCandResumeFile] = useState<File | null>(null)
  const candResumeInputRef = useRef<HTMLInputElement>(null)

  // Nombre visible del CV registrado: el archivo del contenedor o la URL externa
  const resumeFileName = (resumeUrl: string) =>
    resumeUrl.startsWith('http') ? 'Enlace externo' : resumeUrl.split('/').pop() ?? 'CV'

  const openCreateCandidate = () => {
    setEditingCand(null)
    setCandForm(EMPTY_CANDIDATE)
    setCandResumeFile(null)
    setCandError(null)
    setCandModalOpen(true)
  }

  const openEditCandidate = (c: Candidate) => {
    setEditingCand(c)
    setCandForm({
      firstName: c.firstName, lastName: c.lastName, email: c.email,
      phone: c.phone ?? '', resumeUrl: c.resumeUrl ?? '',
      source: c.source ?? '', notes: c.notes ?? '',
    })
    setCandResumeFile(null)
    setCandError(null)
    setCandModalOpen(true)
  }

  const handleSaveCandidate = async () => {
    if (!candForm.firstName.trim() || !candForm.lastName.trim() || !candForm.email.trim()) {
      setCandError('Completa todos los campos requeridos.'); return
    }
    setCandSaving(true); setCandError(null)
    try {
      const payload = {
        firstName: candForm.firstName.trim(), lastName: candForm.lastName.trim(),
        email: candForm.email.trim(), phone: candForm.phone.trim() || undefined,
        resumeUrl: candForm.resumeUrl.trim() || undefined,
        source: candForm.source.trim() || undefined,
        notes: candForm.notes.trim() || undefined,
      }
      const res = editingCand
        ? await candidatesApi.update(editingCand.id, payload)
        : await candidatesApi.create(payload)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar el candidato.' }))
        setCandError(err.message); toast.error(err.message); return
      }
      const result = await res.json()
      toast.success(editingCand ? 'Candidato actualizado correctamente.' : 'Candidato creado correctamente.')

      // Si se seleccionó un CV, se sube al contenedor a3hub ligado al candidato
      if (candResumeFile) {
        const candidateId = editingCand?.id ?? result.id
        const upRes = await candidatesApi.uploadResume(candidateId, candResumeFile)
        if (upRes.ok) {
          toast.success('Currículum subido correctamente.')
        } else {
          const err = await upRes.json().catch(() => ({ message: 'No se pudo subir el currículum.' }))
          toast.error(`El candidato se guardó, pero el CV no se pudo subir: ${err.message}`)
        }
      }

      setCandModalOpen(false); await loadAll(true)
    } finally { setCandSaving(false) }
  }

  // Abre el CV del candidato con una URL temporal firmada (SAS) del contenedor.
  // La pestaña se abre ANTES del await: si se abre después de una llamada
  // asíncrona, el bloqueador de popups del navegador la cancela.
  const openCandidateResume = async (candidateId: string) => {
    const win = window.open('', '_blank')
    try {
      const res = await candidatesApi.resumeUrl(candidateId)
      if (!res.ok) {
        win?.close()
        const err = await res.json().catch(() => ({ message: 'No se pudo abrir el currículum.' }))
        toast.error(err.message); return
      }
      const { url } = await res.json()
      if (win) win.location.href = url
      else window.open(url, '_blank', 'noopener')
    } catch {
      win?.close()
      toast.error('No se pudo abrir el currículum.')
    }
  }

  const handleToggleCandidate = async () => {
    if (!toggleCandTarget) return
    const wasActive = toggleCandTarget.isActive
    try {
      const res = await candidatesApi.toggle(toggleCandTarget.id)
      if (res.ok) { toast.success(wasActive ? 'Candidato desactivado.' : 'Candidato activado.'); await loadAll(true) }
      else toast.error('No se pudo cambiar el estado del candidato.')
    } finally { setToggleCandTarget(null) }
  }

  const handleDeleteCandidate = async () => {
    if (!deleteCandTarget) return
    try {
      const res = await candidatesApi.remove(deleteCandTarget.id)
      if (res.ok) { toast.success('Candidato eliminado correctamente.'); await loadAll(true) }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar el candidato.' }))
        toast.error(err.message)
      }
    } finally { setDeleteCandTarget(null) }
  }

  // Quita el CV del candidato: borra el archivo del contenedor y limpia la
  // referencia. El modal de edición queda abierto reflejando que ya no hay CV.
  const handleDeleteResume = async () => {
    if (!deleteResumeTarget) return
    try {
      const res = await candidatesApi.deleteResume(deleteResumeTarget.id)
      if (res.ok) {
        toast.success('Currículum eliminado correctamente.')
        setEditingCand(c => c && c.id === deleteResumeTarget.id ? { ...c, resumeUrl: undefined } : c)
        setCandForm(f => ({ ...f, resumeUrl: '' }))
        await loadAll(true)
      } else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar el currículum.' }))
        toast.error(err.message)
      }
    } finally { setDeleteResumeTarget(null) }
  }

  // ── Postulaciones: CRUD ─────────────────────────────────────────────────────

  const openVacanciesOptions = vacancies.filter(v => v.status === 'Open')
  // Candidatos ya contratados como empleados: no pueden postularse de nuevo
  // (la contratación duplicaría a la persona en hr.Employees)
  const hiredCandidateIds = new Set(applications.filter(a => a.employeeId).map(a => a.candidateId))
  const activeCandidatesOptions = candidates.filter(c => c.isActive && !hiredCandidateIds.has(c.id))

  const openCreateApplication = () => {
    setEditingApp(null)
    setAppForm(EMPTY_APPLICATION)
    setAppError(null)
    setAppModalOpen(true)
  }

  const openEditApplication = (a: Application) => {
    setEditingApp(a)
    setAppForm({ vacancyId: a.vacancyId, candidateIds: [a.candidateId], notes: a.notes ?? '' })
    setAppError(null)
    setAppModalOpen(true)
  }

  const handleSaveApplication = async () => {
    if (!editingApp && (!appForm.vacancyId || appForm.candidateIds.length === 0)) {
      setAppError('Selecciona la vacante y al menos un candidato.'); return
    }
    setAppSaving(true); setAppError(null)
    try {
      if (editingApp) {
        const res = await applicationsApi.updateNotes(editingApp.id, appForm.notes.trim() || undefined)
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: 'Error al guardar la postulación.' }))
          setAppError(err.message); toast.error(err.message); return
        }
        toast.success('Postulación actualizada correctamente.')
        setAppModalOpen(false); await loadAll(true)
        return
      }

      // Alta múltiple: se registra una postulación por cada candidato seleccionado.
      // Las notas escritas se comparten entre todas.
      const notes = appForm.notes.trim() || undefined
      const failedIds: string[] = []
      const failedMessages: string[] = []
      for (const candidateId of appForm.candidateIds) {
        const res = await applicationsApi.create({ vacancyId: appForm.vacancyId, candidateId, notes })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: 'Error al registrar la postulación.' }))
          const cand = candidates.find(c => c.id === candidateId)
          failedIds.push(candidateId)
          failedMessages.push(`${cand ? `${cand.firstName} ${cand.lastName}` : 'Candidato'}: ${err.message}`)
        }
      }
      const created = appForm.candidateIds.length - failedIds.length
      if (created > 0) {
        toast.success(created === 1 ? 'Postulación registrada correctamente.' : `${created} postulaciones registradas correctamente.`)
        await loadAll(true)
      }
      if (failedIds.length > 0) {
        // El modal queda abierto solo con los candidatos que fallaron, con el
        // detalle del rechazo de cada uno, para corregir o descartar.
        setAppForm(f => ({ ...f, candidateIds: failedIds }))
        setAppError(failedMessages.join('\n'))
      } else {
        setAppModalOpen(false)
      }
    } finally { setAppSaving(false) }
  }

  const handleChangeStage = async (stage: Stage) => {
    if (!stageTarget) return
    // Contratar sigue su propio flujo: abre el modal que crea el empleado.
    if (stage === 'Hired') { openHire(stageTarget); setStageTarget(null); return }
    try {
      const res = await applicationsApi.changeStage(stageTarget.id, stage)
      if (res.ok) {
        toast.success('Etapa actualizada correctamente.')
        await loadAll(true)
      } else {
        const err = await res.json().catch(() => ({ message: 'No se pudo cambiar la etapa.' }))
        toast.error(err.message)
      }
    } finally { setStageTarget(null) }
  }

  // Consulta la ficha del empleado vinculado a una postulación contratada
  const openEmployeeDetail = async (employeeId: string) => {
    const res = await employeesApi.getById(employeeId)
    if (!res.ok) { toast.error('No se pudo cargar la ficha del empleado.'); return }
    setEmpDetail(await res.json())
  }

  // Abre el CV asociado al empleado (el del candidato de origen) con URL firmada.
  // La pestaña se abre ANTES del await para que el bloqueador de popups no la cancele.
  const openEmployeeResume = async (employeeId: string) => {
    const win = window.open('', '_blank')
    try {
      const res = await employeesApi.resumeUrl(employeeId)
      if (!res.ok) {
        win?.close()
        const err = await res.json().catch(() => ({ message: 'No se pudo abrir el currículum.' }))
        toast.error(err.message); return
      }
      const { url } = await res.json()
      if (win) win.location.href = url
      else window.open(url, '_blank', 'noopener')
    } catch {
      win?.close()
      toast.error('No se pudo abrir el currículum.')
    }
  }

  const openStageModal = (a: Application) => {
    if (a.employeeId) {
      toast.error(`Esta postulación ya generó el empleado ${a.employeeCode ?? ''} y no se puede cambiar de etapa.`)
      return
    }
    if (a.stage === 'Rejected') {
      toast.error('Una postulación rechazada es final; si el candidato reaplica, registra una nueva postulación.')
      return
    }
    setStageTarget(a)
  }

  // Hired y Rejected son etapas finales: el badge no debe invitar a cambiarlas
  const stageIsFinal = (a: Application) => !!a.employeeId || a.stage === 'Rejected' || a.stage === 'Hired'

  // ── Contratación: crea el empleado a partir del candidato y la vacante ──────

  const openHire = (a: Application) => {
    const vacancy = vacancies.find(v => v.id === a.vacancyId)
    setHireForm({
      ...EMPTY_HIRE,
      salary: vacancy?.salaryMin != null ? String(vacancy.salaryMin) : '',
      currencyId: vacancy?.currencyId ?? currencies[0]?.id ?? '',
      hireDate: new Date().toISOString().slice(0, 10),
    })
    setHireError(null)
    setHireTarget(a)
  }

  const handleHire = async () => {
    if (!hireTarget) return
    if (!hireForm.code.trim() || !hireForm.identificationTypeId || !hireForm.identificationNumber.trim() || !hireForm.currencyId || !hireForm.hireDate) {
      setHireError('Completa todos los campos requeridos.'); return
    }
    const salary = hireForm.salary.trim() === '' ? 0 : Number(hireForm.salary)
    if (Number.isNaN(salary) || salary < 0) {
      setHireError('La remuneración debe ser un número mayor o igual a cero.'); return
    }
    setHireSaving(true); setHireError(null)
    try {
      const res = await applicationsApi.hire(hireTarget.id, {
        code: hireForm.code.trim(),
        identificationTypeId: hireForm.identificationTypeId,
        identificationNumber: hireForm.identificationNumber.trim(),
        salary,
        currencyId: hireForm.currencyId,
        hireDate: hireForm.hireDate,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al contratar al candidato.' }))
        setHireError(err.message); toast.error(err.message); return
      }
      // El SP informa si la vacante completó sus plazas y fue cerrada.
      const result = await res.json().catch(() => null)
      toast.success(result?.message ?? 'Candidato contratado correctamente.')
      setHireTarget(null); await loadAll(true)
    } finally { setHireSaving(false) }
  }

  const handleDeleteApplication = async () => {
    if (!deleteAppTarget) return
    try {
      const res = await applicationsApi.remove(deleteAppTarget.id)
      if (res.ok) { toast.success('Postulación eliminada correctamente.'); await loadAll(true) }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar la postulación.' }))
        toast.error(err.message)
      }
    } finally { setDeleteAppTarget(null) }
  }

  // ── Configuración del encabezado según tab ──────────────────────────────────

  const canCreateForTab = { vacantes: canCreateVacancy, candidatos: canCreateCandidate, postulaciones: canCreateApplication }[tab]

  const newButton = {
    vacantes: {
      label: 'Nueva Vacante',
      onClick: openCreateVacancy,
      disabled: positions.length === 0 || departments.length === 0,
      disabledHint: 'Primero crea cargos y departamentos',
    },
    candidatos: {
      label: 'Nuevo Candidato',
      onClick: openCreateCandidate,
      disabled: false,
      disabledHint: undefined,
    },
    postulaciones: {
      label: 'Nueva Postulación',
      onClick: openCreateApplication,
      disabled: openVacanciesOptions.length === 0 || activeCandidatesOptions.length === 0,
      disabledHint: 'Necesitas al menos una vacante abierta y un candidato activo',
    },
  }[tab]

  const searchPlaceholder = {
    vacantes:      'Buscar por título, cargo o departamento…',
    candidatos:    'Buscar por nombre, correo o fuente…',
    postulaciones: 'Buscar por candidato o vacante…',
  }[tab]

  const emptyMessage = {
    vacantes:      'No hay vacantes registradas.',
    candidatos:    'No hay candidatos registrados.',
    postulaciones: 'No hay postulaciones registradas.',
  }[tab]

  const tabs: { key: Tab; label: string; icon: typeof Briefcase; count: number }[] = [
    { key: 'vacantes',      label: 'Vacantes',      icon: Briefcase,     count: vacancies.length },
    { key: 'candidatos',    label: 'Candidatos',    icon: Users,         count: candidates.length },
    { key: 'postulaciones', label: 'Postulaciones', icon: ClipboardList, count: applications.length },
  ]

  const kpiCards = [
    { label: 'Vacantes abiertas',   value: kpis.openVacancies,    icon: Briefcase,     color: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400' },
    { label: 'Candidatos activos',  value: kpis.activeCandidates, icon: Users,         color: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400' },
    { label: 'En proceso',          value: kpis.inProcess,        icon: ClipboardList, color: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
    { label: 'Contratados',         value: kpis.hired,            icon: UserCheck,     color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
  ]

  const currentTotal = { vacantes: filteredVacancies.length, candidatos: filteredCandidates.length, postulaciones: filteredApplications.length }[tab]

  return (
    <div className="p-6 space-y-4">

      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Reclutamiento</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : 'Gestión de vacantes, candidatos y proceso de selección'}
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
          {canCreateForTab && (
            <button
              onClick={newButton.onClick}
              disabled={newButton.disabled}
              title={newButton.disabled ? newButton.disabledHint : undefined}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              {newButton.label}
            </button>
          )}
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* Búsqueda + filtro de etapas */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 min-w-0 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
          />
        </div>

        {tab === 'postulaciones' && (
          <div className="w-full sm:w-56 shrink-0">
            <SearchSelect
              options={STAGES.map(s => ({ value: s.value, label: s.label }))}
              value={stageFilter}
              onChange={v => { setStageFilter(v as Stage | ''); setPage(1) }}
              placeholder="Filtrar por etapa…"
              searchPlaceholder="Buscar etapa…"
            />
          </div>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">

            {/* Cabecera según tab */}
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
                <th className={`${thCls} text-center w-12`}>#</th>
                {tab === 'vacantes' && (<>
                  <th className={`${thCls} text-left`}>Vacante</th>
                  <th className={`${thCls} text-center hidden md:table-cell`}>Departamento</th>
                  <th className={`${thCls} text-center hidden sm:table-cell`}>Plazas</th>
                  <th className={`${thCls} text-left hidden lg:table-cell`}>Salario</th>
                  <th className={`${thCls} text-center hidden lg:table-cell`}>Publicada</th>
                  <th className={`${thCls} text-center hidden sm:table-cell`}>Postulaciones</th>
                  <th className={`${thCls} text-center`}>Estado</th>
                  <th className={`${thCls} text-center`}>Acciones</th>
                </>)}
                {tab === 'candidatos' && (<>
                  <th className={`${thCls} text-left`}>Candidato</th>
                  <th className={`${thCls} text-left hidden md:table-cell`}>Teléfono</th>
                  <th className={`${thCls} text-center hidden lg:table-cell`}>Fuente</th>
                  <th className={`${thCls} text-center hidden sm:table-cell`}>Postulaciones</th>
                  <th className={`${thCls} text-center`}>Estado</th>
                  <th className={`${thCls} text-center`}>Acciones</th>
                </>)}
                {tab === 'postulaciones' && (<>
                  <th className={`${thCls} text-left`}>Candidato</th>
                  <th className={`${thCls} text-left hidden sm:table-cell`}>Vacante</th>
                  <th className={`${thCls} text-center hidden lg:table-cell`}>Postulado</th>
                  <th className={`${thCls} text-center`}>Etapa</th>
                  <th className={`${thCls} text-center`}>Acciones</th>
                </>)}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50 dark:border-slate-700/40">
                    {Array.from({ length: tab === 'postulaciones' ? 5 : 7 }).map((_, j) => (
                      <td key={j} className="px-5 py-3">
                        <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : currentTotal === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-16 text-center">
                    <ClipboardList className="w-9 h-9 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">
                      {search || stageFilter ? 'Sin resultados para el filtro aplicado.' : emptyMessage}
                    </p>
                  </td>
                </tr>
              ) : tab === 'vacantes' ? (
                paginatedVacancies.map((v, i) => (
                  <tr key={v.id} className="border-b border-slate-50 dark:border-slate-700/40 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition-colors">
                    <td className="px-5 py-2 text-xs text-slate-400 dark:text-slate-500 font-medium text-center align-middle">{globalIndex(i)}</td>
                    <td className="px-5 py-2 align-middle">
                      <div className="leading-tight">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">{v.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{v.positionName}</p>
                      </div>
                    </td>
                    <td className="px-5 py-2 text-center align-middle hidden md:table-cell">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                        {v.departmentName}
                      </span>
                    </td>
                    <td className="px-5 py-2 text-center align-middle hidden sm:table-cell text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{v.hiredCount}</span> / {v.openingsCount}
                    </td>
                    <td className="px-5 py-2 align-middle hidden lg:table-cell text-slate-500 dark:text-slate-400">
                      {salaryRange(v.salaryMin, v.salaryMax, v.currencySymbol ?? v.currencyCode) ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </td>
                    <td className="px-5 py-2 text-center align-middle hidden lg:table-cell text-slate-500 dark:text-slate-400">
                      {formatDate(v.publishedDate)}
                    </td>
                    <td className="px-5 py-2 text-center align-middle hidden sm:table-cell text-slate-500 dark:text-slate-400">
                      {v.applicationCount}
                    </td>
                    <td className="px-5 py-2 text-center align-middle">
                      {canChangeStatusVacancy ? (
                        <button
                          onClick={() => setStatusTarget(v)}
                          title="Cambiar estado"
                          className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full cursor-pointer hover:opacity-80 transition-opacity ${statusInfo(v.status).badge}`}
                        >
                          {statusInfo(v.status).label}
                        </button>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${statusInfo(v.status).badge}`}>
                          {statusInfo(v.status).label}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2 align-middle">
                      <div className="flex items-center justify-center gap-0.5">
                        <button onClick={() => setDetailTarget(v)} title="Ver detalle" className={actionCls}>
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {v.status !== 'Closed' && v.status !== 'Cancelled' && canUpdateVacancy && (
                          <button onClick={() => openEditVacancy(v)} title="Editar" className={actionCls}>
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {v.status !== 'Closed' && canDeleteVacancy && (
                          <button onClick={() => setDeleteVacTarget(v)} title="Eliminar" className={deleteCls}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : tab === 'candidatos' ? (
                paginatedCandidates.map((c, i) => (
                  <tr key={c.id} className="border-b border-slate-50 dark:border-slate-700/40 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition-colors">
                    <td className="px-5 py-2 text-xs text-slate-400 dark:text-slate-500 font-medium text-center align-middle">{globalIndex(i)}</td>
                    <td className="px-5 py-2 align-middle">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold shrink-0">
                          {initials(c.firstName, c.lastName)}
                        </div>
                        <div className="leading-tight">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">{c.firstName} {c.lastName}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{c.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-2 align-middle hidden md:table-cell text-slate-500 dark:text-slate-400">
                      {c.phone ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </td>
                    <td className="px-5 py-2 text-center align-middle hidden lg:table-cell">
                      {c.source
                        ? <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400">{c.source}</span>
                        : <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </td>
                    <td className="px-5 py-2 text-center align-middle hidden sm:table-cell text-slate-500 dark:text-slate-400">
                      {c.applicationCount}
                    </td>
                    <td className="px-5 py-2 text-center align-middle">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                        c.isActive
                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                          : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500'
                      }`}>
                        {c.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-5 py-2 align-middle">
                      <div className="flex items-center justify-center gap-0.5">
                        <button onClick={() => setCandDetailTarget(c)} title="Ver detalle" className={actionCls}>
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {c.resumeUrl && (
                          <button onClick={() => openCandidateResume(c.id)} title="Descargar CV" className={actionCls}>
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canUpdateCandidate && (
                          <button onClick={() => openEditCandidate(c)} title="Editar" className={actionCls}>
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canToggleCandidate && (
                          <button
                            onClick={() => setToggleCandTarget(c)}
                            title={c.isActive ? 'Desactivar' : 'Activar'}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                              c.isActive
                                ? 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
                                : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                            }`}
                          >
                            {c.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                          </button>
                        )}
                        {canDeleteCandidate && (
                          <button onClick={() => setDeleteCandTarget(c)} title="Eliminar" className={deleteCls}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                paginatedApplications.map((a, i) => (
                  <tr key={a.id} className="border-b border-slate-50 dark:border-slate-700/40 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition-colors">
                    <td className="px-5 py-2 text-xs text-slate-400 dark:text-slate-500 font-medium text-center align-middle">{globalIndex(i)}</td>
                    <td className="px-5 py-2 align-middle">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold shrink-0">
                          {initials(a.candidateFirstName, a.candidateLastName)}
                        </div>
                        <div className="leading-tight">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">{a.candidateFirstName} {a.candidateLastName}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{a.candidateEmail}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-2 align-middle hidden sm:table-cell">
                      <div className="leading-tight">
                        <p className="text-slate-700 dark:text-slate-300">{a.vacancyTitle}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{a.departmentName}</p>
                      </div>
                    </td>
                    <td className="px-5 py-2 text-center align-middle hidden lg:table-cell text-slate-500 dark:text-slate-400">
                      {formatDate(a.appliedDate)}
                    </td>
                    <td className="px-5 py-2 text-center align-middle">
                      {(canChangeStageApplication || canHireApplication) ? (
                        <button
                          onClick={() => openStageModal(a)}
                          title={a.employeeId
                            ? `Empleado ${a.employeeCode}`
                            : a.stage === 'Rejected' ? 'Postulación rechazada — etapa final' : 'Cambiar etapa'}
                          className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-opacity ${
                            stageIsFinal(a) ? 'cursor-default' : 'cursor-pointer hover:opacity-80'
                          } ${stageInfo(a.stage).badge}`}
                        >
                          {stageInfo(a.stage).label}
                        </button>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${stageInfo(a.stage).badge}`}>
                          {stageInfo(a.stage).label}
                        </span>
                      )}
                      {a.employeeCode && a.employeeId && (
                        <button
                          onClick={() => openEmployeeDetail(a.employeeId!)}
                          title="Ver ficha del empleado"
                          className="text-[11px] text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline mt-0.5 mx-auto flex items-center justify-center gap-1 transition-colors"
                        >
                          <UserCheck className="w-3 h-3" />{a.employeeCode}
                        </button>
                      )}
                    </td>
                    <td className="px-5 py-2 align-middle">
                      <div className="flex items-center justify-center gap-0.5">
                        <button onClick={() => setAppDetailTarget(a)} title="Ver detalle" className={actionCls}>
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {!a.employeeId && canUpdateApplication && (
                          <button onClick={() => openEditApplication(a)} title="Editar notas" className={actionCls}>
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {!a.employeeId && canDeleteApplication && (
                          <button onClick={() => setDeleteAppTarget(a)} title="Eliminar" className={deleteCls}>
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

        {/* Paginación */}
        {!loading && currentTotal > 0 && (
          <Pagination
            total={currentTotal}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}
      </div>

      {/* Modal crear / editar vacante */}
      {vacMounted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${vacClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden ${vacClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            {/* Encabezado fijo */}
            <div className="px-6 pt-6 shrink-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-5">
                {editingVac ? 'Editar Vacante' : 'Nueva Vacante'}
              </h2>
            </div>
            {/* Cuerpo con scroll propio */}
            <div className="flex-1 overflow-y-auto px-6 pb-5 space-y-4 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
              <div className="space-y-1.5">
                <label className={labelCls}>Título <span className="text-red-500">*</span></label>
                <input type="text" maxLength={150} placeholder="Ej: Desarrollador Full Stack Senior" value={vacForm.title}
                  onChange={e => setVacForm(f => ({ ...f, title: e.target.value }))} className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Descripción</label>
                <textarea rows={3} maxLength={1000} placeholder="Requisitos y responsabilidades del puesto…" value={vacForm.description}
                  onChange={e => setVacForm(f => ({ ...f, description: e.target.value }))} className={`${inputCls} resize-none`} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={labelCls}>Cargo <span className="text-red-500">*</span></label>
                  <SearchSelect
                    value={vacForm.positionId}
                    onChange={positionId => setVacForm(f => ({ ...f, positionId }))}
                    options={[...positions].sort((a, b) => a.name.localeCompare(b.name)).map(p => ({ value: p.id, label: p.name }))}
                    placeholder="Selecciona un cargo…"
                    searchPlaceholder="Buscar cargo…"
                    emptyLabel="No se encontraron cargos."
                    onCreateNew={canCreatePosition ? openPosModal : undefined}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Departamento <span className="text-red-500">*</span></label>
                  <SearchSelect
                    value={vacForm.departmentId}
                    onChange={departmentId => setVacForm(f => ({ ...f, departmentId }))}
                    options={[...departments].sort((a, b) => a.name.localeCompare(b.name)).map(d => ({ value: d.id, label: d.name }))}
                    placeholder="Selecciona un departamento…"
                    searchPlaceholder="Buscar departamento…"
                    emptyLabel="No se encontraron departamentos."
                    onCreateNew={canCreateDepartment ? openDeptModal : undefined}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={labelCls}>Plazas <span className="text-red-500">*</span></label>
                  <input type="number" min={1} step={1} value={vacForm.openingsCount}
                    onChange={e => setVacForm(f => ({ ...f, openingsCount: e.target.value }))} className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Fecha límite</label>
                  <DatePicker value={vacForm.closingDate}
                    onChange={closingDate => setVacForm(f => ({ ...f, closingDate }))} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className={labelCls}>Salario mínimo</label>
                  <input type="number" min={0} step="0.01" placeholder="Opcional" value={vacForm.salaryMin}
                    onChange={e => setVacForm(f => ({ ...f, salaryMin: e.target.value }))} className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Salario máximo</label>
                  <input type="number" min={0} step="0.01" placeholder="Opcional" value={vacForm.salaryMax}
                    onChange={e => setVacForm(f => ({ ...f, salaryMax: e.target.value }))} className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Moneda</label>
                  <SearchSelect
                    value={vacForm.currencyId}
                    onChange={currencyId => setVacForm(f => ({ ...f, currencyId }))}
                    options={currencies.map(c => ({ value: c.id, label: c.code }))}
                    placeholder="Selecciona una moneda…"
                    searchPlaceholder="Buscar moneda…"
                    emptyLabel="No se encontraron monedas."
                    onCreateNew={canCreateCurrency ? openCurModal('vacancy') : undefined}
                  />
                </div>
              </div>
              {vacError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {vacError}
                </div>
              )}
            </div>
            {/* Pie fijo: acciones */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button onClick={() => setVacModalOpen(false)} disabled={vacSaving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveVacancy} disabled={vacSaving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {vacSaving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Save className="w-3.5 h-3.5" />}
                {vacSaving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal crear cargo — acceso rápido desde el select de vacante */}
      {posModalMounted && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${posModalClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md p-6 ${posModalClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-5">
              Nuevo Cargo
            </h2>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className={labelCls}>Nombre <span className="text-red-500">*</span></label>
                <input type="text" maxLength={100} placeholder="Ej: Desarrollador Senior" value={posForm.name}
                  onChange={e => setPosForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Descripción</label>
                <textarea rows={2} maxLength={500} placeholder="Funciones o responsabilidades del cargo…" value={posForm.description}
                  onChange={e => setPosForm(f => ({ ...f, description: e.target.value }))} className={`${inputCls} resize-none`} />
              </div>
              {posError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {posError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={closePosModal} disabled={posSaving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleSavePos} disabled={posSaving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {posSaving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Save className="w-3.5 h-3.5" />}
                {posSaving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal crear departamento — acceso rápido desde el select de vacante */}
      {deptModalMounted && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${deptModalClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md p-6 ${deptModalClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-5">
              Nuevo Departamento
            </h2>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className={labelCls}>Nombre <span className="text-red-500">*</span></label>
                <input type="text" maxLength={100} placeholder="Ej: Recursos Humanos" value={deptForm.name}
                  onChange={e => setDeptForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Descripción</label>
                <textarea rows={2} maxLength={500} placeholder="Descripción del departamento…" value={deptForm.description}
                  onChange={e => setDeptForm(f => ({ ...f, description: e.target.value }))} className={`${inputCls} resize-none`} />
              </div>
              {deptError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {deptError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={closeDeptModal} disabled={deptSaving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveDept} disabled={deptSaving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {deptSaving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Save className="w-3.5 h-3.5" />}
                {deptSaving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal detalle de vacante — solo lectura */}
      {detailMounted && detailTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${detailClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden ${detailClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            {/* Encabezado fijo */}
            <div className="px-6 pt-6 shrink-0">
              <div className="flex items-start justify-between gap-3 mb-1">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{detailTarget.title}</h2>
                <span className={`shrink-0 inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${statusInfo(detailTarget.status).badge}`}>
                  {statusInfo(detailTarget.status).label}
                </span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
                {detailTarget.positionName} · {detailTarget.departmentName}
              </p>
            </div>
            {/* Cuerpo con scroll propio */}
            <div className="flex-1 overflow-y-auto px-6 pb-5 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
            {detailTarget.description && (
              <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line mb-5">{detailTarget.description}</p>
            )}
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
              <div>
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Plazas cubiertas</p>
                <p className="text-slate-700 dark:text-slate-200">
                  <span className="font-semibold">{detailTarget.hiredCount}</span> / {detailTarget.openingsCount}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Rango salarial</p>
                <p className="text-slate-700 dark:text-slate-200">
                  {salaryRange(detailTarget.salaryMin, detailTarget.salaryMax, detailTarget.currencySymbol ?? detailTarget.currencyCode) ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Publicada</p>
                <p className="text-slate-700 dark:text-slate-200">{formatDate(detailTarget.publishedDate)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Fecha límite</p>
                <p className="text-slate-700 dark:text-slate-200">{detailTarget.closingDate ? formatDate(detailTarget.closingDate) : '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Postulaciones</p>
                <p className="text-slate-700 dark:text-slate-200">{detailTarget.applicationCount}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Última actualización</p>
                <p className="text-slate-700 dark:text-slate-200">{formatDate(detailTarget.updatedAt ?? detailTarget.createdAt)}</p>
              </div>
            </div>
            </div>
            {/* Pie fijo: acciones */}
            <div className="flex items-center justify-end px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button onClick={() => setDetailTarget(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal detalle de candidato — solo lectura */}
      {candDetailMounted && candDetailTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${candDetailClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden ${candDetailClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            {/* Encabezado fijo */}
            <div className="px-6 pt-6 shrink-0">
              <div className="flex items-start justify-between gap-3 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-sm font-bold shrink-0">
                    {initials(candDetailTarget.firstName, candDetailTarget.lastName)}
                  </div>
                  <div className="leading-tight">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {candDetailTarget.firstName} {candDetailTarget.lastName}
                    </h2>
                    <a href={`mailto:${candDetailTarget.email}`}
                      className="inline-flex items-center gap-1 text-xs text-slate-400 mt-0.5 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                      <Mail className="w-3 h-3 shrink-0" />{candDetailTarget.email}
                    </a>
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                    <ClipboardList className="w-3 h-3" />
                    {candDetailTarget.applicationCount} {candDetailTarget.applicationCount === 1 ? 'postulación' : 'postulaciones'}
                  </span>
                  <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${
                    candDetailTarget.isActive
                      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                  }`}>
                    {candDetailTarget.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              </div>
            </div>
            {/* Cuerpo con scroll propio */}
            <div className="flex-1 overflow-y-auto px-6 pb-5 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
              <div>
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Teléfono</p>
                {candDetailTarget.phone ? (
                  <a href={`tel:${candDetailTarget.phone}`}
                    className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />{candDetailTarget.phone}
                  </a>
                ) : (
                  <p className="text-slate-700 dark:text-slate-200">—</p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Fuente</p>
                <p className="text-slate-700 dark:text-slate-200">{candDetailTarget.source ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Currículum</p>
                {candDetailTarget.resumeUrl ? (
                  <button
                    onClick={() => openCandidateResume(candDetailTarget.id)}
                    title={resumeFileName(candDetailTarget.resumeUrl)}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />Descargar CV
                  </button>
                ) : (
                  <p className="text-slate-700 dark:text-slate-200">—</p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Última actualización</p>
                <p className="text-slate-700 dark:text-slate-200">{formatDate(candDetailTarget.updatedAt ?? candDetailTarget.createdAt)}</p>
              </div>
              {candDetailTarget.notes && (
                <div className="col-span-2">
                  <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Notas</p>
                  <p className="text-slate-700 dark:text-slate-200 whitespace-pre-line rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 px-3.5 py-2.5">
                    {candDetailTarget.notes}
                  </p>
                </div>
              )}
            </div>
            </div>
            {/* Pie fijo: acciones */}
            <div className="flex items-center justify-end px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button onClick={() => setCandDetailTarget(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal detalle de postulación — solo lectura */}
      {appDetailMounted && appDetailTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${appDetailClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden ${appDetailClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            {/* Encabezado fijo */}
            <div className="px-6 pt-6 shrink-0">
              <div className="flex items-start justify-between gap-3 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-sm font-bold shrink-0">
                    {initials(appDetailTarget.candidateFirstName, appDetailTarget.candidateLastName)}
                  </div>
                  <div className="leading-tight">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {appDetailTarget.candidateFirstName} {appDetailTarget.candidateLastName}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">{appDetailTarget.candidateEmail}</p>
                  </div>
                </div>
                <span className={`shrink-0 inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${stageInfo(appDetailTarget.stage).badge}`}>
                  {stageInfo(appDetailTarget.stage).label}
                </span>
              </div>
            </div>
            {/* Cuerpo con scroll propio */}
            <div className="flex-1 overflow-y-auto px-6 pb-5 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
            {appDetailTarget.employeeCode && appDetailTarget.employeeId && (
              <button
                onClick={() => openEmployeeDetail(appDetailTarget.employeeId!)}
                title="Ver ficha del empleado"
                className="w-full rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-2 mb-5 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors text-left"
              >
                <UserCheck className="w-4 h-4 shrink-0" />
                <span>Contratado como empleado <span className="font-semibold underline">{appDetailTarget.employeeCode}</span></span>
              </button>
            )}
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
              <div className="col-span-2">
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Vacante</p>
                <p className="text-slate-700 dark:text-slate-200">{appDetailTarget.vacancyTitle}</p>
                <p className="text-xs text-slate-400 mt-0.5">{appDetailTarget.positionName} · {appDetailTarget.departmentName}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Fecha de postulación</p>
                <p className="text-slate-700 dark:text-slate-200">{formatDate(appDetailTarget.appliedDate)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Teléfono</p>
                <p className="text-slate-700 dark:text-slate-200">{appDetailTarget.candidatePhone ?? '—'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Notas</p>
                <p className="text-slate-700 dark:text-slate-200 whitespace-pre-line">{appDetailTarget.notes || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Última actualización</p>
                <p className="text-slate-700 dark:text-slate-200">{formatDate(appDetailTarget.updatedAt ?? appDetailTarget.createdAt)}</p>
              </div>
            </div>
            {appHistory.length > 0 && (
              <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800">
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Línea de tiempo del proceso</p>
                <div className="space-y-0">
                  {appHistory.map((h, i) => (
                    <div key={h.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${
                          i === appHistory.length - 1 ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600'
                        }`} />
                        {i < appHistory.length - 1 && <div className="w-px flex-1 bg-slate-200 dark:bg-slate-700 my-0.5" />}
                      </div>
                      <div className="pb-4 min-w-0">
                        <p className="text-sm text-slate-700 dark:text-slate-200 leading-tight">
                          <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${stageInfo(h.toStage).badge}`}>
                            {stageInfo(h.toStage).label}
                          </span>
                          {h.fromStage && (
                            <span className="text-xs text-slate-400 ml-2">desde {stageInfo(h.fromStage).label}</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">{formatDateTime(h.changedAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            </div>
            {/* Pie fijo: acciones */}
            <div className="flex items-center justify-end px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button onClick={() => setAppDetailTarget(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal ficha del empleado — solo lectura, accesible desde postulaciones contratadas */}
      {empDetailMounted && empDetail && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${empDetailClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden ${empDetailClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            {/* Encabezado fijo */}
            <div className="px-6 pt-6 shrink-0">
              <div className="flex items-start justify-between gap-3 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-sm font-bold shrink-0">
                    {initials(empDetail.firstName, empDetail.lastName)}
                  </div>
                  <div className="leading-tight">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {empDetail.firstName} {empDetail.lastName}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">{empDetail.code} · {empDetail.positionName}</p>
                  </div>
                </div>
                <span className={`shrink-0 inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${
                  empDetail.isActive
                    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                }`}>
                  {empDetail.isActive ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            </div>
            {/* Cuerpo con scroll propio */}
            <div className="flex-1 overflow-y-auto px-6 pb-5 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
              <div>
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Correo</p>
                <p className="text-slate-700 dark:text-slate-200 break-all">{empDetail.email}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Teléfono</p>
                <p className="text-slate-700 dark:text-slate-200">{empDetail.phone ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Identificación</p>
                <p className="text-slate-700 dark:text-slate-200">{empDetail.identificationTypeName}: {empDetail.identificationNumber}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Departamento</p>
                <p className="text-slate-700 dark:text-slate-200">{empDetail.departmentName}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Remuneración</p>
                <p className="text-slate-700 dark:text-slate-200">
                  {(empDetail.currencySymbol ?? empDetail.currencyCode) ? `${empDetail.currencySymbol ?? empDetail.currencyCode} ` : ''}{fmtMoneyPlain(empDetail.salary)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Fecha de ingreso</p>
                <p className="text-slate-700 dark:text-slate-200">{formatDate(empDetail.hireDate)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Currículum</p>
                {empDetail.resumeUrl ? (
                  <button
                    onClick={() => openEmployeeResume(empDetail.id)}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />Descargar CV
                  </button>
                ) : (
                  <p className="text-slate-700 dark:text-slate-200">—</p>
                )}
              </div>
            </div>
            {empHistory.length > 0 && (
              <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800">
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Trayectoria laboral</p>
                <div className="space-y-0">
                  {empHistory.map((h, i) => (
                    <div key={h.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${i === 0 ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                        {i < empHistory.length - 1 && <div className="w-px flex-1 bg-slate-200 dark:bg-slate-700 my-0.5" />}
                      </div>
                      <div className="pb-4 min-w-0">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 leading-tight">{JOB_CHANGE_LABELS[h.changeType]}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {h.oldValue ? <><span className="line-through opacity-70">{h.oldValue}</span> → {h.newValue}</> : h.newValue}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">{formatDateTime(h.changedAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            </div>
            {/* Pie fijo: acciones */}
            <div className="flex items-center justify-end px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button onClick={() => setEmpDetail(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal crear moneda — acceso rápido desde los selects de vacante y contratación */}
      {/* Modal crear tipo de identificación — acceso rápido desde el modal de contratación */}
      <QuickCreateModal
        open={idtQuickOpen}
        title="Nuevo Tipo de Identificación"
        placeholder="Ej: Cédula, Pasaporte"
        initialName={idtQuickQuery}
        onClose={() => setIdtQuickOpen(false)}
        onSave={handleSaveIdtQuick}
      />

      {curModalMounted && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${curModalClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md p-6 ${curModalClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-5">
              Nueva Moneda
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={labelCls}>Código ISO <span className="text-red-500">*</span></label>
                  <input type="text" maxLength={3} placeholder="Ej: DOP" value={curForm.code}
                    onChange={e => setCurForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} className={`${inputCls} uppercase`} />
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Símbolo <span className="text-red-500">*</span></label>
                  <input type="text" maxLength={5} placeholder="Ej: RD$" value={curForm.symbol}
                    onChange={e => setCurForm(f => ({ ...f, symbol: e.target.value }))} className={inputCls} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Nombre <span className="text-red-500">*</span></label>
                <input type="text" maxLength={100} placeholder="Ej: Peso dominicano" value={curForm.name}
                  onChange={e => setCurForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
              </div>
              {curError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {curError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={closeCurModal} disabled={curSaving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveCur} disabled={curSaving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {curSaving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Save className="w-3.5 h-3.5" />}
                {curSaving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal crear / editar candidato */}
      {candMounted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${candClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden ${candClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            {/* Encabezado fijo */}
            <div className="px-6 pt-6 shrink-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-5">
                {editingCand ? 'Editar Candidato' : 'Nuevo Candidato'}
              </h2>
            </div>
            {/* Cuerpo con scroll propio */}
            <div className="flex-1 overflow-y-auto px-6 pb-5 space-y-4 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={labelCls}>Nombre <span className="text-red-500">*</span></label>
                  <input type="text" maxLength={100} placeholder="Ej: Carlos" value={candForm.firstName}
                    onChange={e => setCandForm(f => ({ ...f, firstName: e.target.value }))} className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Apellido <span className="text-red-500">*</span></label>
                  <input type="text" maxLength={100} placeholder="Ej: Martínez" value={candForm.lastName}
                    onChange={e => setCandForm(f => ({ ...f, lastName: e.target.value }))} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={labelCls}>Correo <span className="text-red-500">*</span></label>
                  <input type="email" maxLength={150} placeholder="nombre@correo.com" value={candForm.email}
                    onChange={e => setCandForm(f => ({ ...f, email: e.target.value }))} className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Teléfono</label>
                  <PhoneInput value={candForm.phone}
                    onChange={phone => setCandForm(f => ({ ...f, phone }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={labelCls}>Fuente</label>
                  <input type="text" maxLength={100} placeholder="Ej: LinkedIn, Referido…" value={candForm.source}
                    onChange={e => setCandForm(f => ({ ...f, source: e.target.value }))} className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <label className={labelCls}>Currículum</label>
                    <span title="Formatos aceptados: PDF, DOC o DOCX (máx. 10 MB)" className="cursor-help">
                      <Info className="w-3.5 h-3.5 text-slate-400" />
                    </span>
                  </div>
                  <input
                    ref={candResumeInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0] ?? null
                      if (file && file.size > 10 * 1024 * 1024) {
                        toast.error('El currículum no puede superar 10 MB.')
                        e.target.value = ''
                        return
                      }
                      setCandResumeFile(file)
                    }}
                  />
                  {candResumeFile ? (
                    /* Archivo nuevo elegido: se sube al guardar */
                    <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/60 dark:bg-indigo-500/10"
                      title={editingCand?.resumeUrl ? 'Reemplazará al CV actual al guardar' : 'Se subirá al guardar'}>
                      <FileText className="w-4 h-4 text-indigo-500 dark:text-indigo-400 shrink-0" />
                      <p className="flex-1 min-w-0 text-sm text-slate-700 dark:text-slate-200 truncate">{candResumeFile.name}</p>
                      <button onClick={() => { setCandResumeFile(null); if (candResumeInputRef.current) candResumeInputRef.current.value = '' }}
                        title="Quitar archivo"
                        className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : editingCand?.resumeUrl ? (
                    /* CV ya registrado: nombre del archivo + descargar + reemplazar + quitar */
                    <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                      <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                      <p className="flex-1 min-w-0 text-sm text-slate-700 dark:text-slate-200 truncate" title={resumeFileName(editingCand.resumeUrl)}>
                        {resumeFileName(editingCand.resumeUrl)}
                      </p>
                      <button onClick={() => openCandidateResume(editingCand.id)} title="Descargar CV"
                        className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      {canUploadResume && (
                        <button onClick={() => candResumeInputRef.current?.click()} title="Reemplazar CV"
                          className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors">
                          <Upload className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canDeleteResume && (
                        <button onClick={() => setDeleteResumeTarget(editingCand)} title="Quitar CV"
                          className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ) : canUploadResume ? (
                    /* Sin CV: botón para elegir archivo */
                    <button onClick={() => candResumeInputRef.current?.click()}
                      className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-sm text-slate-500 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                      <Upload className="w-4 h-4" />
                      Seleccionar archivo…
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Notas</label>
                <textarea rows={2} maxLength={1000} placeholder="Observaciones sobre el candidato…" value={candForm.notes}
                  onChange={e => setCandForm(f => ({ ...f, notes: e.target.value }))} className={`${inputCls} resize-none`} />
              </div>
              {candError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {candError}
                </div>
              )}
            </div>
            {/* Pie fijo: acciones */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button onClick={() => setCandModalOpen(false)} disabled={candSaving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveCandidate} disabled={candSaving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {candSaving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Save className="w-3.5 h-3.5" />}
                {candSaving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal registrar / editar postulación */}
      {appMounted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${appClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md p-6 ${appClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-5">
              {editingApp ? 'Editar Postulación' : 'Nueva Postulación'}
            </h2>
            <div className="space-y-4">
              {editingApp ? (
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 px-4 py-3 space-y-1 text-sm">
                  <p className="font-semibold text-slate-800 dark:text-slate-200">
                    {editingApp.candidateFirstName} {editingApp.candidateLastName}
                  </p>
                  <p className="text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <Briefcase className="w-3.5 h-3.5 shrink-0" />{editingApp.vacancyTitle}
                  </p>
                  <p className="text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 shrink-0" />{editingApp.candidateEmail}
                  </p>
                  {editingApp.candidatePhone && (
                    <p className="text-slate-500 dark:text-slate-400 flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 shrink-0" />{editingApp.candidatePhone}
                    </p>
                  )}
                </div>
              ) : (<>
                <div className="space-y-1.5">
                  <label className={labelCls}>Vacante <span className="text-red-500">*</span></label>
                  <SearchSelect
                    value={appForm.vacancyId}
                    onChange={vacancyId => setAppForm(f => ({ ...f, vacancyId }))}
                    options={openVacanciesOptions.map(v => ({ value: v.id, label: `${v.title} - ${v.departmentName}` }))}
                    placeholder="Selecciona una vacante abierta…"
                    searchPlaceholder="Buscar vacante…"
                    emptyLabel="No hay vacantes abiertas."
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Candidatos <span className="text-red-500">*</span></label>
                  <MultiSearchSelect
                    values={appForm.candidateIds}
                    onChange={candidateIds => setAppForm(f => ({ ...f, candidateIds }))}
                    options={[...activeCandidatesOptions].sort((a, b) => a.firstName.localeCompare(b.firstName)).map(c => ({ value: c.id, label: `${c.firstName} ${c.lastName}` }))}
                    placeholder="Selecciona uno o más candidatos…"
                    searchPlaceholder="Buscar candidato…"
                    emptyLabel="No hay candidatos activos."
                  />
                </div>
              </>)}
              <div className="space-y-1.5">
                <label className={labelCls}>Notas</label>
                <textarea rows={3} maxLength={1000} placeholder="Observaciones del proceso…" value={appForm.notes}
                  onChange={e => setAppForm(f => ({ ...f, notes: e.target.value }))} className={`${inputCls} resize-none`} />
              </div>
              {appError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400 whitespace-pre-line">
                  {appError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setAppModalOpen(false)} disabled={appSaving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveApplication} disabled={appSaving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {appSaving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Save className="w-3.5 h-3.5" />}
                {appSaving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal cambio de estado de vacante */}
      {statusMounted && statusTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${statusClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-xs p-6 ${statusClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">Cambiar estado</h2>
            <p className="text-sm text-slate-500 mb-4 truncate">{statusTarget.title}</p>
            <div className="space-y-1.5">
              {VACANCY_STATUSES.map(s => (
                <button
                  key={s.value}
                  onClick={() => handleChangeStatus(s.value)}
                  disabled={s.value === statusTarget.status}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    s.value === statusTarget.status
                      ? 'bg-slate-50 dark:bg-slate-800 text-slate-400 cursor-default'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {s.label}
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.badge}`}>
                    {s.value === statusTarget.status ? 'Actual' : ''}
                    {s.value !== statusTarget.status && '→'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal cambio de etapa de postulación */}
      {stageMounted && stageTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${stageClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-xs p-6 ${stageClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">Cambiar etapa</h2>
            <p className="text-sm text-slate-500 mb-4 truncate">
              {stageTarget.candidateFirstName} {stageTarget.candidateLastName} · {stageTarget.vacancyTitle}
            </p>
            <div className="space-y-1.5">
              {STAGES.filter(s => s.value === 'Hired' ? canHireApplication : canChangeStageApplication).map(s => (
                <button
                  key={s.value}
                  onClick={() => handleChangeStage(s.value)}
                  disabled={s.value === stageTarget.stage}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    s.value === stageTarget.stage
                      ? 'bg-slate-50 dark:bg-slate-800 text-slate-400 cursor-default'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {s.label}
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.badge}`}>
                    {s.value === stageTarget.stage ? 'Actual' : '→'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal de contratación — crea el empleado a partir del candidato y la vacante */}
      {hireMounted && hireTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${hireClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden ${hireClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            {/* Encabezado fijo */}
            <div className="px-6 pt-6 shrink-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">Contratar Candidato</h2>
              <p className="text-sm text-slate-500 mb-4">Se creará el registro del empleado con estos datos.</p>

              {/* Datos que se toman del candidato y la vacante */}
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 px-4 py-3 space-y-1 text-sm mb-4">
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  {hireTarget.candidateFirstName} {hireTarget.candidateLastName}
                </p>
                <p className="text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 shrink-0" />{hireTarget.candidateEmail}
                </p>
                <p className="text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <Briefcase className="w-3.5 h-3.5 shrink-0" />{hireTarget.positionName} · {hireTarget.departmentName}
                </p>
              </div>
            </div>
            {/* Cuerpo con scroll propio */}
            <div className="flex-1 overflow-y-auto px-6 pb-5 space-y-4 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={labelCls}>Código <span className="text-red-500">*</span></label>
                  <input type="text" maxLength={10} placeholder="Ej: EMP001" value={hireForm.code}
                    onChange={e => setHireForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Fecha de contratación <span className="text-red-500">*</span></label>
                  <DatePicker value={hireForm.hireDate}
                    onChange={hireDate => setHireForm(f => ({ ...f, hireDate }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={labelCls}>Tipo de identificación <span className="text-red-500">*</span></label>
                  <SearchSelect
                    value={hireForm.identificationTypeId}
                    onChange={identificationTypeId => setHireForm(f => ({ ...f, identificationTypeId }))}
                    options={[...idTypes].sort((a, b) => a.name.localeCompare(b.name)).map(t => ({ value: t.id, label: t.name }))}
                    placeholder="Selecciona un tipo…"
                    searchPlaceholder="Buscar tipo…"
                    emptyLabel="No se encontraron tipos."
                    onCreateNew={canCreateIdentificationType ? openIdtQuick : undefined}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>N° de identificación <span className="text-red-500">*</span></label>
                  <input type="text" maxLength={50} placeholder="Ej: 001-1234567-8" value={hireForm.identificationNumber}
                    onChange={e => setHireForm(f => ({ ...f, identificationNumber: e.target.value }))} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={labelCls}>Remuneración</label>
                  <input type="number" min={0} step="0.01" placeholder="0.00" value={hireForm.salary}
                    onChange={e => setHireForm(f => ({ ...f, salary: e.target.value }))} className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Moneda <span className="text-red-500">*</span></label>
                  <SearchSelect
                    value={hireForm.currencyId}
                    onChange={currencyId => setHireForm(f => ({ ...f, currencyId }))}
                    options={currencies.map(c => ({ value: c.id, label: c.code }))}
                    onCreateNew={canCreateCurrency ? openCurModal('hire') : undefined}
                    placeholder="Moneda"
                    searchPlaceholder="Buscar moneda…"
                    emptyLabel="No se encontraron monedas."
                  />
                </div>
              </div>
              {hireError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {hireError}
                </div>
              )}
            </div>
            {/* Pie fijo: acciones */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button onClick={() => setHireTarget(null)} disabled={hireSaving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleHire} disabled={hireSaving}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {hireSaving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <UserCheck className="w-3.5 h-3.5" />}
                {hireSaving ? 'Contratando…' : 'Contratar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmaciones */}
      <ConfirmDialog
        open={!!deleteVacTarget}
        title="¿Eliminar vacante?"
        message={`La vacante "${deleteVacTarget?.title}" se eliminará permanentemente. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDeleteVacancy}
        onCancel={() => setDeleteVacTarget(null)}
      />

      <ConfirmDialog
        open={!!toggleCandTarget}
        title={toggleCandTarget?.isActive ? '¿Desactivar candidato?' : '¿Activar candidato?'}
        message={
          toggleCandTarget?.isActive
            ? `El candidato "${toggleCandTarget.firstName} ${toggleCandTarget.lastName}" será desactivado y no podrá postularse a vacantes.`
            : `El candidato "${toggleCandTarget?.firstName} ${toggleCandTarget?.lastName}" volverá a estar activo.`
        }
        confirmLabel={toggleCandTarget?.isActive ? 'Sí, desactivar' : 'Sí, activar'}
        cancelLabel="Cancelar"
        onConfirm={handleToggleCandidate}
        onCancel={() => setToggleCandTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteCandTarget}
        title="¿Eliminar candidato?"
        message={`El candidato "${deleteCandTarget?.firstName} ${deleteCandTarget?.lastName}" se eliminará permanentemente. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDeleteCandidate}
        onCancel={() => setDeleteCandTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteResumeTarget}
        title="¿Quitar currículum?"
        message={`El CV "${deleteResumeTarget?.resumeUrl ? resumeFileName(deleteResumeTarget.resumeUrl) : ''}" de "${deleteResumeTarget?.firstName} ${deleteResumeTarget?.lastName}" se eliminará permanentemente del almacenamiento. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, quitar"
        cancelLabel="Cancelar"
        onConfirm={handleDeleteResume}
        onCancel={() => setDeleteResumeTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteAppTarget}
        title="¿Eliminar postulación?"
        message={`La postulación de "${deleteAppTarget?.candidateFirstName} ${deleteAppTarget?.candidateLastName}" a "${deleteAppTarget?.vacancyTitle}" se eliminará permanentemente.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDeleteApplication}
        onCancel={() => setDeleteAppTarget(null)}
      />
    </div>
  )
}
