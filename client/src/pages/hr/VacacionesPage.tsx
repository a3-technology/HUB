import { useEffect, useState } from 'react'
import {
  Plus, Search, Pencil, RefreshCw, Save, Trash2, Eye, Check, X, Ban,
  ClipboardList, CalendarDays, Clock, CheckCircle2, TreePalm, FolderOpen, HeartPulse, Settings,
} from 'lucide-react'
import { vacationsApi, employeesApi, leavesApi, leaveTypesApi } from '../../lib/api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { SearchSelect } from '../../components/SearchSelect'
import { DatePicker } from '../../components/DatePicker'
import { TabsScroller } from '../../components/TabsScroller'
import { QuickCreateModal } from '../../components/QuickCreateModal'
import { Pagination, usePagination, type PageSize } from '../../components/Pagination'
import { useToast } from '../../context/ToastContext'
import { useModalTransition } from '../../hooks/useModalTransition'
import { usePermission } from '../../hooks/usePermission'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface VacationRequest {
  id: string
  employeeId: string
  employeeCode: string
  employeeName: string
  departmentName: string
  startDate: string
  endDate: string
  requestedDays: number
  reason?: string
  status: string
  reviewedBy?: string
  reviewedByName?: string
  reviewComment?: string
  reviewedAt?: string
  createdAt: string
  updatedAt?: string
}

/** Saldo acumulativo: meses trabajados × tasa mensual − usados/pendientes.
 *  No se reinicia por año; lo no usado se arrastra automáticamente. */
interface VacationBalance {
  employeeId: string
  employeeCode: string
  employeeName: string
  departmentName: string
  hireDate: string
  monthsWorked: number
  accrualRate: number
  /** Días acumulados a la fecha (incluye la edición manual del saldo, si existe). */
  accruedDays: number
  usedDays: number
  pendingDays: number
  availableDays: number
}

interface Employee {
  id: string
  code: string
  firstName: string
  lastName: string
  isActive: boolean
}

interface RequestForm {
  employeeId: string
  startDate: string
  endDate: string
  reason: string
}

/** Ausencia/incapacidad registrada (hr.EmployeeLeaves + joins). */
interface EmployeeLeave {
  id: string
  employeeId: string
  employeeCode: string
  employeeName: string
  departmentName: string
  leaveTypeId: string
  leaveTypeName: string
  isPaid: boolean
  requiresDocument: boolean
  startDate: string
  endDate: string
  /** Días calendario del período (inclusive). */
  days: number
  documentNumber?: string
  notes?: string
  /** Active | Finished | Voided (derivado por el servidor). */
  status: string
  registeredByName?: string
  createdAt: string
  updatedAt?: string
}

/** Tipo de ausencia del catálogo hr.LeaveTypes. */
interface LeaveType {
  id: string
  name: string
  isPaid: boolean
  requiresDocument: boolean
  isActive: boolean
}

interface LeaveForm {
  employeeId: string
  leaveTypeId: string
  startDate: string
  endDate: string
  documentNumber: string
  notes: string
}

type Tab = 'solicitudes' | 'saldos' | 'incapacidades'

const EMPTY_FORM: RequestForm = { employeeId: '', startDate: '', endDate: '', reason: '' }
const EMPTY_LEAVE_FORM: LeaveForm = { employeeId: '', leaveTypeId: '', startDate: '', endDate: '', documentNumber: '', notes: '' }

// Estados almacenados como códigos en inglés; se traducen aquí para la UI
const STATUS_META: Record<string, { label: string; badge: string }> = {
  Pending:   { label: 'Pendiente', badge: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
  Approved:  { label: 'Aprobada',  badge: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
  Rejected:  { label: 'Rechazada', badge: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' },
  Cancelled: { label: 'Cancelada', badge: 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500' },
}

const STATUS_FILTERS = ['Pending', 'Approved', 'Rejected', 'Cancelled'] as const

// Estados derivados de las ausencias (el servidor calcula Finished por fecha)
const LEAVE_STATUS_META: Record<string, { label: string; badge: string }> = {
  Active:   { label: 'Vigente',    badge: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400' },
  Finished: { label: 'Finalizada', badge: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
  Voided:   { label: 'Anulada',    badge: 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500' },
}

const LEAVE_STATUS_FILTERS = ['Active', 'Finished', 'Voided'] as const

// Días calendario (inclusive) del período de una ausencia; solo vista previa,
// el servidor recalcula al guardar.
const calendarDays = (from: string, to: string): number => {
  if (!from || !to) return 0
  const start = new Date(from + 'T00:00:00')
  const end   = new Date(to + 'T00:00:00')
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' })

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// Días hábiles (lunes-viernes) entre dos fechas inclusive. Misma regla que
// hr.FN_BusinessDays en el servidor; aquí solo se usa como vista previa.
const businessDays = (from: string, to: string): number => {
  if (!from || !to) return 0
  const start = new Date(from + 'T00:00:00')
  const end   = new Date(to + 'T00:00:00')
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0
  if ((end.getTime() - start.getTime()) / 86400000 > 366) return 0
  let days = 0
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay() // 0 = domingo, 6 = sábado
    if (wd !== 0 && wd !== 6) days++
  }
  return days
}

const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition'
const thCls = 'px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider'

export function VacacionesPage() {
  const toast = useToast()
  const currentYear = new Date().getFullYear()

  const canRequestCreate = usePermission('hr.vacations.request-create')
  const canRequestUpdate = usePermission('hr.vacations.request-update')
  const canRequestReview = usePermission('hr.vacations.request-review')
  const canRequestCancel = usePermission('hr.vacations.request-cancel')
  const canRequestDelete = usePermission('hr.vacations.request-delete')
  const canBalanceUpdate = usePermission('hr.vacations.balance-update')
  const canSettingsUpdate = usePermission('hr.vacations.settings-update')
  const canLeaveTypeCreate = usePermission('hr.leaves.type-create')
  const canLeaveCreate   = usePermission('hr.leaves.create')
  const canLeaveUpdate   = usePermission('hr.leaves.update')
  const canLeaveVoid     = usePermission('hr.leaves.void')
  const canLeaveDelete   = usePermission('hr.leaves.delete')

  const [tab, setTab] = useState<Tab>('solicitudes')
  const [requests, setRequests]     = useState<VacationRequest[]>([])
  const [balances, setBalances]     = useState<VacationBalance[]>([])
  const [employees, setEmployees]   = useState<Employee[]>([])
  const [leaves, setLeaves]         = useState<EmployeeLeave[]>([])
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [search, setSearch]                       = useState('')
  const [statusFilter, setStatusFilter]           = useState('')
  const [leaveStatusFilter, setLeaveStatusFilter] = useState('')
  const [page, setPage]                           = useState(1)
  const [pageSize, setPageSize]                   = useState<PageSize>(10)

  // Modal de edición directa del saldo (meses trabajados y días acumulados)
  const [adjustTarget, setAdjustTarget]   = useState<VacationBalance | null>(null)
  const [adjustMonths, setAdjustMonths]   = useState('')
  const [adjustAccrued, setAdjustAccrued] = useState('')
  const [adjustError, setAdjustError]     = useState<string | null>(null)
  const { mounted: adjustMounted, closing: adjustClosing } = useModalTransition(!!adjustTarget)

  // Configuración: días que acumula un empleado por mes completo trabajado.
  // El modal edita un borrador para que cancelar no pierda el valor cargado.
  const [accrualRate, setAccrualRate]             = useState('')
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [settingsDraft, setSettingsDraft]         = useState('')
  const [settingsError, setSettingsError]         = useState<string | null>(null)
  const [savingSettings, setSavingSettings]       = useState(false)
  const { mounted: settingsMounted, closing: settingsClosing } = useModalTransition(settingsModalOpen)

  // Modal crear / editar solicitud
  const [requestModalOpen, setRequestModalOpen] = useState(false)
  const [editing, setEditing]     = useState<VacationRequest | null>(null)
  const [form, setForm]           = useState<RequestForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving]       = useState(false)
  const { mounted: requestMounted, closing: requestClosing } = useModalTransition(requestModalOpen)

  // Modal de revisión (aprobar / rechazar)
  const [reviewTarget, setReviewTarget]   = useState<VacationRequest | null>(null)
  const [reviewStatus, setReviewStatus]   = useState<'Approved' | 'Rejected'>('Approved')
  const [reviewComment, setReviewComment] = useState('')
  const [reviewError, setReviewError]     = useState<string | null>(null)
  const { mounted: reviewMounted, closing: reviewClosing } = useModalTransition(!!reviewTarget)

  // Modal de detalle
  const [detailTarget, setDetailTarget] = useState<VacationRequest | null>(null)
  const { mounted: detailMounted, closing: detailClosing } = useModalTransition(!!detailTarget)

  // Confirmaciones
  const [cancelTarget, setCancelTarget] = useState<VacationRequest | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<VacationRequest | null>(null)

  // Modal registrar / editar ausencia (incapacidades)
  const [leaveModalOpen, setLeaveModalOpen] = useState(false)
  const [editingLeave, setEditingLeave]     = useState<EmployeeLeave | null>(null)
  const [leaveForm, setLeaveForm]           = useState<LeaveForm>(EMPTY_LEAVE_FORM)
  const [leaveError, setLeaveError]         = useState<string | null>(null)
  const { mounted: leaveMounted, closing: leaveClosing } = useModalTransition(leaveModalOpen)

  // Modal detalle de ausencia
  const [leaveDetail, setLeaveDetail] = useState<EmployeeLeave | null>(null)
  const { mounted: leaveDetailMounted, closing: leaveDetailClosing } = useModalTransition(!!leaveDetail)

  // Confirmaciones de ausencias + creación rápida de tipo de ausencia
  const [voidLeaveTarget, setVoidLeaveTarget]     = useState<EmployeeLeave | null>(null)
  const [deleteLeaveTarget, setDeleteLeaveTarget] = useState<EmployeeLeave | null>(null)
  const [ltQuickOpen, setLtQuickOpen]   = useState(false)
  const [ltQuickQuery, setLtQuickQuery] = useState('')

  const loadAll = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true)
    try {
      const [reqRes, balRes, empRes, leaveRes, ltRes, setRes] = await Promise.all([
        vacationsApi.listRequests(),
        vacationsApi.listBalances(),
        employeesApi.list(),
        leavesApi.list(),
        leaveTypesApi.list(true),
        vacationsApi.getSettings(),
      ])
      if (reqRes.ok)   setRequests(await reqRes.json())
      if (balRes.ok)   setBalances(await balRes.json())
      if (empRes.ok)   setEmployees(await empRes.json())
      if (leaveRes.ok) setLeaves(await leaveRes.json())
      if (ltRes.ok)    setLeaveTypes(await ltRes.json())
      if (setRes.ok)   setAccrualRate(String((await setRes.json()).accrualDaysPerMonth))
    } finally {
      silent ? setRefreshing(false) : setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  const changeTab = (t: Tab) => { setTab(t); setSearch(''); setPage(1); setStatusFilter(''); setLeaveStatusFilter('') }
  const handleSearch = (value: string) => { setSearch(value); setPage(1) }

  // ── Filtros ─────────────────────────────────────────────────────────────────

  const term = search.toLowerCase()

  const filteredRequests = requests
    .filter(r =>
      (!statusFilter || r.status === statusFilter) &&
      (r.employeeName.toLowerCase().includes(term) ||
       r.employeeCode.toLowerCase().includes(term) ||
       r.departmentName.toLowerCase().includes(term))
    )

  const filteredBalances = balances
    .filter(b =>
      b.employeeName.toLowerCase().includes(term) ||
      b.employeeCode.toLowerCase().includes(term) ||
      b.departmentName.toLowerCase().includes(term)
    )

  const filteredLeaves = leaves
    .filter(l =>
      (!leaveStatusFilter || l.status === leaveStatusFilter) &&
      (l.employeeName.toLowerCase().includes(term) ||
       l.employeeCode.toLowerCase().includes(term) ||
       l.departmentName.toLowerCase().includes(term) ||
       l.leaveTypeName.toLowerCase().includes(term))
    )

  const paginatedRequests = usePagination(filteredRequests, page, pageSize)
  const paginatedBalances = usePagination(filteredBalances, page, pageSize)
  const paginatedLeaves   = usePagination(filteredLeaves, page, pageSize)

  const activeEmployeeOptions = employees
    .filter(e => e.isActive)
    .map(e => ({ value: e.id, label: `${e.firstName} ${e.lastName} (${e.code})` }))
    .sort((a, b) => a.label.localeCompare(b.label))

  // ── Indicadores ─────────────────────────────────────────────────────────────

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const kpis = {
    pending: requests.filter(r => r.status === 'Pending').length,
    approvedYear: requests.filter(r => r.status === 'Approved' && new Date(r.startDate).getFullYear() === currentYear).length,
    approvedDaysYear: requests
      .filter(r => r.status === 'Approved' && new Date(r.startDate).getFullYear() === currentYear)
      .reduce((sum, r) => sum + r.requestedDays, 0),
    onVacationToday: requests.filter(r =>
      r.status === 'Approved' && new Date(r.startDate) <= today && new Date(r.endDate) >= today
    ).length,
    onLeaveToday: leaves.filter(l =>
      l.status !== 'Voided' && new Date(l.startDate) <= today && new Date(l.endDate) >= today
    ).length,
  }

  const kpiCards = [
    { label: 'Pendientes de revisión',  value: kpis.pending,          icon: Clock,        color: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
    { label: `Aprobadas en ${currentYear}`, value: kpis.approvedYear, icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
    { label: `Días aprobados en ${currentYear}`, value: kpis.approvedDaysYear, icon: CalendarDays, color: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400' },
    { label: 'De vacaciones hoy',       value: kpis.onVacationToday,  icon: TreePalm,     color: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400' },
    { label: 'Incapacitados hoy',       value: kpis.onLeaveToday,     icon: HeartPulse,   color: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400' },
  ]

  const tabs: { key: Tab; label: string; icon: typeof ClipboardList; count: number }[] = [
    { key: 'solicitudes',   label: 'Solicitudes',   icon: ClipboardList, count: requests.length },
    { key: 'saldos',        label: 'Saldos',        icon: CalendarDays,  count: balances.length },
    { key: 'incapacidades', label: 'Incapacidades', icon: HeartPulse,    count: leaves.length },
  ]

  // ── Solicitudes: crear / editar ─────────────────────────────────────────────

  const openCreate = () => {
    setEditing(null); setForm(EMPTY_FORM); setFormError(null); setRequestModalOpen(true)
  }

  const openEdit = (r: VacationRequest) => {
    setEditing(r)
    setForm({
      employeeId: r.employeeId,
      startDate: r.startDate.slice(0, 10),
      endDate: r.endDate.slice(0, 10),
      reason: r.reason ?? '',
    })
    setFormError(null)
    setRequestModalOpen(true)
  }

  const closeRequestModal = () => { setRequestModalOpen(false); setEditing(null); setFormError(null) }

  const previewDays = businessDays(form.startDate, form.endDate)

  const handleSaveRequest = async () => {
    if (!editing && !form.employeeId) { setFormError('Selecciona un empleado.'); return }
    if (!form.startDate || !form.endDate) { setFormError('Indica la fecha de inicio y la fecha final.'); return }
    if (form.endDate < form.startDate) { setFormError('La fecha final no puede ser anterior a la fecha inicial.'); return }
    setSaving(true); setFormError(null)
    try {
      const res = editing
        ? await vacationsApi.updateRequest(editing.id, {
            startDate: form.startDate, endDate: form.endDate, reason: form.reason.trim() || undefined,
          })
        : await vacationsApi.createRequest({
            employeeId: form.employeeId, startDate: form.startDate, endDate: form.endDate, reason: form.reason.trim() || undefined,
          })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar.' }))
        setFormError(err.message); toast.error(err.message); return
      }
      toast.success(editing ? 'Solicitud actualizada correctamente.' : 'Solicitud de vacaciones creada correctamente.')
      closeRequestModal(); await loadAll(true)
    } finally { setSaving(false) }
  }

  // ── Solicitudes: revisar / cancelar / eliminar ──────────────────────────────

  const openReview = (r: VacationRequest, status: 'Approved' | 'Rejected') => {
    setReviewTarget(r); setReviewStatus(status); setReviewComment(''); setReviewError(null)
  }

  const handleReview = async () => {
    if (!reviewTarget) return
    setSaving(true); setReviewError(null)
    try {
      const res = await vacationsApi.review(reviewTarget.id, {
        status: reviewStatus, reviewComment: reviewComment.trim() || undefined,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al revisar la solicitud.' }))
        setReviewError(err.message); toast.error(err.message); return
      }
      toast.success(reviewStatus === 'Approved' ? 'Solicitud aprobada correctamente.' : 'Solicitud rechazada correctamente.')
      setReviewTarget(null); await loadAll(true)
    } finally { setSaving(false) }
  }

  const handleCancel = async () => {
    if (!cancelTarget) return
    try {
      const res = await vacationsApi.cancel(cancelTarget.id)
      if (res.ok) { toast.success('Solicitud cancelada correctamente.'); await loadAll(true) }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo cancelar la solicitud.' }))
        toast.error(err.message)
      }
    } finally { setCancelTarget(null) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await vacationsApi.removeRequest(deleteTarget.id)
      if (res.ok) { toast.success('Solicitud eliminada correctamente.'); await loadAll(true) }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar la solicitud.' }))
        toast.error(err.message)
      }
    } finally { setDeleteTarget(null) }
  }

  // ── Edición directa del saldo ───────────────────────────────────────────────

  const openAdjustModal = (b: VacationBalance) => {
    setAdjustTarget(b)
    setAdjustMonths(String(b.monthsWorked))
    setAdjustAccrued(String(b.accruedDays))
    setAdjustError(null)
  }

  const handleSaveBalance = async () => {
    if (!adjustTarget) return
    const months = Number(adjustMonths)
    if (adjustMonths.trim() === '' || !Number.isInteger(months) || months < 0 || months > 600) {
      setAdjustError('Los meses trabajados deben ser un número entero entre 0 y 600.'); return
    }
    const accrued = Number(adjustAccrued)
    if (adjustAccrued.trim() === '' || isNaN(accrued) || accrued < 0 || accrued > 999) {
      setAdjustError('Los días acumulados deben ser un número entre 0 y 999.'); return
    }
    setSaving(true); setAdjustError(null)
    try {
      const res = await vacationsApi.updateBalance({
        employeeId: adjustTarget.employeeId,
        monthsWorked: months,
        accruedDays: accrued,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al actualizar el saldo.' }))
        setAdjustError(err.message); toast.error(err.message); return
      }
      toast.success('Saldo de vacaciones actualizado correctamente.')
      setAdjustTarget(null); await loadAll(true)
    } finally { setSaving(false) }
  }

  // ── Configuración del devengo ───────────────────────────────────────────────

  const openSettingsModal = () => {
    setSettingsDraft(accrualRate); setSettingsError(null); setSettingsModalOpen(true)
  }

  const handleSaveSettings = async () => {
    const rate = Number(settingsDraft)
    if (settingsDraft.trim() === '' || isNaN(rate) || rate < 0 || rate > 31) {
      setSettingsError('La acumulación mensual debe ser un número entre 0 y 31 días.'); return
    }
    setSavingSettings(true); setSettingsError(null)
    try {
      const res = await vacationsApi.updateSettings(rate)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al actualizar la configuración.' }))
        setSettingsError(err.message); toast.error(err.message); return
      }
      toast.success('Acumulación mensual actualizada correctamente.')
      setSettingsModalOpen(false)
      await loadAll(true)
    } finally { setSavingSettings(false) }
  }

  // ── Incapacidades / ausencias ───────────────────────────────────────────────

  const leaveTypeOptions = [...leaveTypes]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(t => ({ value: t.id, label: t.name }))

  /** Tipo elegido en el formulario: define si la constancia es obligatoria. */
  const selectedLeaveType = leaveTypes.find(t => t.id === leaveForm.leaveTypeId)

  const openCreateLeave = () => {
    setEditingLeave(null); setLeaveForm(EMPTY_LEAVE_FORM); setLeaveError(null); setLeaveModalOpen(true)
  }

  const openEditLeave = (l: EmployeeLeave) => {
    setEditingLeave(l)
    setLeaveForm({
      employeeId: l.employeeId,
      leaveTypeId: l.leaveTypeId,
      startDate: l.startDate.slice(0, 10),
      endDate: l.endDate.slice(0, 10),
      documentNumber: l.documentNumber ?? '',
      notes: l.notes ?? '',
    })
    setLeaveError(null)
    setLeaveModalOpen(true)
  }

  const closeLeaveModal = () => { setLeaveModalOpen(false); setEditingLeave(null); setLeaveError(null) }

  const previewLeaveDays = calendarDays(leaveForm.startDate, leaveForm.endDate)

  const handleSaveLeave = async () => {
    if (!editingLeave && !leaveForm.employeeId) { setLeaveError('Selecciona un empleado.'); return }
    if (!leaveForm.leaveTypeId) { setLeaveError('Selecciona el tipo de ausencia.'); return }
    if (!leaveForm.startDate || !leaveForm.endDate) { setLeaveError('Indica la fecha de inicio y la fecha final.'); return }
    if (leaveForm.endDate < leaveForm.startDate) { setLeaveError('La fecha final no puede ser anterior a la fecha inicial.'); return }
    if (selectedLeaveType?.requiresDocument && !leaveForm.documentNumber.trim()) {
      setLeaveError('Este tipo de ausencia requiere el número de constancia o boleta médica.'); return
    }
    setSaving(true); setLeaveError(null)
    try {
      const payload = {
        leaveTypeId: leaveForm.leaveTypeId,
        startDate: leaveForm.startDate,
        endDate: leaveForm.endDate,
        documentNumber: leaveForm.documentNumber.trim() || undefined,
        notes: leaveForm.notes.trim() || undefined,
      }
      const res = editingLeave
        ? await leavesApi.update(editingLeave.id, payload)
        : await leavesApi.create({ ...payload, employeeId: leaveForm.employeeId })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar la ausencia.' }))
        setLeaveError(err.message); toast.error(err.message); return
      }
      toast.success(editingLeave ? 'Ausencia actualizada correctamente.' : 'Ausencia registrada correctamente.')
      closeLeaveModal(); await loadAll(true)
    } finally { setSaving(false) }
  }

  const handleVoidLeave = async () => {
    if (!voidLeaveTarget) return
    try {
      const res = await leavesApi.void(voidLeaveTarget.id)
      if (res.ok) { toast.success('Ausencia anulada correctamente.'); await loadAll(true) }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo anular la ausencia.' }))
        toast.error(err.message)
      }
    } finally { setVoidLeaveTarget(null) }
  }

  const handleDeleteLeave = async () => {
    if (!deleteLeaveTarget) return
    try {
      const res = await leavesApi.remove(deleteLeaveTarget.id)
      if (res.ok) { toast.success('Ausencia eliminada correctamente.'); await loadAll(true) }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar la ausencia.' }))
        toast.error(err.message)
      }
    } finally { setDeleteLeaveTarget(null) }
  }

  // Creación rápida de tipo de ausencia desde el select del formulario
  const openLtQuick = (query: string) => { setLtQuickQuery(query); setLtQuickOpen(true) }

  const handleSaveLtQuick = async (name: string): Promise<string | null> => {
    const res = await leaveTypesApi.create({ name })
    if (!res.ok) return (await res.json().catch(() => null))?.message ?? 'Error al crear el tipo de ausencia.'
    const { id } = await res.json()
    toast.success('Tipo de ausencia creado correctamente.')
    const ltRes = await leaveTypesApi.list(true)
    if (ltRes.ok) setLeaveTypes(await ltRes.json())
    setLeaveForm(f => ({ ...f, leaveTypeId: id }))
    return null
  }

  const globalIndex = (i: number) =>
    pageSize === 'all' ? i + 1 : (page - 1) * (pageSize as number) + i + 1


  const currentTotal =
    tab === 'solicitudes' ? filteredRequests.length :
    tab === 'saldos'      ? filteredBalances.length :
    filteredLeaves.length

  return (
    <div className="p-6 space-y-4">

      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Vacaciones y Ausencias</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : 'Solicitudes y saldos de vacaciones, incapacidades y permisos del personal'}
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
          {((tab === 'incapacidades' && canLeaveCreate) || (tab !== 'incapacidades' && canRequestCreate)) && (
            <button
              onClick={tab === 'incapacidades' ? openCreateLeave : openCreate}
              disabled={activeEmployeeOptions.length === 0}
              title={activeEmployeeOptions.length === 0 ? 'Primero registra empleados activos' : undefined}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              {tab === 'incapacidades' ? 'Registrar Incapacidad' : 'Nueva Solicitud'}
            </button>
          )}
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {kpiCards.map(k => (
          <div key={k.label} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-3 max-md:last:odd:col-span-2">
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

      {/* Búsqueda + filtros */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 min-w-0 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por empleado, código o departamento…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
          />
        </div>

        {tab === 'solicitudes' && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              onClick={() => { setStatusFilter(''); setPage(1) }}
              className={`text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
                statusFilter === ''
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Todas
            </button>
            {STATUS_FILTERS.map(s => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setPage(1) }}
                className={`text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
                  statusFilter === s
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {STATUS_META[s].label}
              </button>
            ))}
          </div>
        )}

        {tab === 'saldos' && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-slate-400 whitespace-nowrap">
              Acumulación: <span className="font-semibold text-slate-500 dark:text-slate-300">{accrualRate || '…'} días/mes</span>
            </span>
            {canSettingsUpdate && (
              <button
                onClick={openSettingsModal}
                title="Configurar acumulación mensual"
                className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {tab === 'incapacidades' && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              onClick={() => { setLeaveStatusFilter(''); setPage(1) }}
              className={`text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
                leaveStatusFilter === ''
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Todas
            </button>
            {LEAVE_STATUS_FILTERS.map(s => (
              <button
                key={s}
                onClick={() => { setLeaveStatusFilter(s); setPage(1) }}
                className={`text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
                  leaveStatusFilter === s
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {LEAVE_STATUS_META[s].label}
              </button>
            ))}
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
                {tab === 'solicitudes' && (<>
                  <th className={`${thCls} text-left`}>Empleado</th>
                  <th className={`${thCls} text-left hidden md:table-cell`}>Departamento</th>
                  <th className={`${thCls} text-center`}>Período</th>
                  <th className={`${thCls} text-center`}>Días</th>
                  <th className={`${thCls} text-center`}>Estado</th>
                  <th className={`${thCls} text-left hidden lg:table-cell`}>Revisor</th>
                  <th className={`${thCls} text-center`}>Acciones</th>
                </>)}
                {tab === 'saldos' && (<>
                  <th className={`${thCls} text-left`}>Empleado</th>
                  <th className={`${thCls} text-left hidden lg:table-cell`}>Departamento</th>
                  <th className={`${thCls} text-center hidden md:table-cell`}>Ingreso</th>
                  <th className={`${thCls} text-center hidden sm:table-cell`}>Meses</th>
                  <th className={`${thCls} text-center`}>Acumulados</th>
                  <th className={`${thCls} text-center`}>Usados</th>
                  <th className={`${thCls} text-center hidden sm:table-cell`}>Pendientes</th>
                  <th className={`${thCls} text-center`}>Disponibles</th>
                  <th className={`${thCls} text-center`}>Acciones</th>
                </>)}
                {tab === 'incapacidades' && (<>
                  <th className={`${thCls} text-left`}>Empleado</th>
                  <th className={`${thCls} text-left hidden lg:table-cell`}>Departamento</th>
                  <th className={`${thCls} text-left`}>Tipo</th>
                  <th className={`${thCls} text-center`}>Período</th>
                  <th className={`${thCls} text-center`}>Días</th>
                  <th className={`${thCls} text-left hidden md:table-cell`}>Constancia</th>
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
                        <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" style={{ width: `${[8, 40, 32, 40, 10, 20, 32, 24][j] * 4}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : currentTotal === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-16 text-center">
                    <FolderOpen className="w-9 h-9 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">
                      {search || statusFilter || leaveStatusFilter
                        ? 'Sin resultados para los filtros aplicados.'
                        : tab === 'solicitudes'
                          ? 'No hay solicitudes de vacaciones registradas.'
                          : tab === 'saldos'
                            ? 'No hay empleados activos para mostrar saldos.'
                            : 'No hay incapacidades ni ausencias registradas.'}
                    </p>
                  </td>
                </tr>
              ) : tab === 'solicitudes' ? (
                paginatedRequests.map((r, i) => {
                  const meta = STATUS_META[r.status] ?? { label: r.status, badge: 'bg-slate-100 text-slate-400' }
                  return (
                    <tr key={r.id} className="border-b border-slate-50 dark:border-slate-700/40 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition-colors">
                      <td className="px-5 py-2 text-xs text-slate-400 dark:text-slate-500 font-medium text-center align-middle">{globalIndex(i)}</td>
                      <td className="px-5 py-2 text-left align-middle">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">{r.employeeName}</p>
                        <p className="text-xs text-slate-400">{r.employeeCode}</p>
                      </td>
                      <td className="px-5 py-2 text-left align-middle hidden md:table-cell text-slate-500 dark:text-slate-400">{r.departmentName}</td>
                      <td className="px-5 py-2 text-center align-middle text-slate-500 dark:text-slate-400">
                        {formatDate(r.startDate)} — {formatDate(r.endDate)}
                      </td>
                      <td className="px-5 py-2 text-center align-middle font-semibold text-slate-700 dark:text-slate-200">{r.requestedDays}</td>
                      <td className="px-5 py-2 text-center align-middle">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${meta.badge}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-5 py-2 text-left align-middle hidden lg:table-cell text-slate-500 dark:text-slate-400">
                        {r.reviewedByName ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                      <td className="px-5 py-2 align-middle">
                        <div className="flex items-center justify-center gap-0.5">
                          <button
                            onClick={() => setDetailTarget(r)}
                            title="Ver detalle"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {r.status === 'Pending' && (<>
                            {canRequestReview && (
                              <button
                                onClick={() => openReview(r, 'Approved')}
                                title="Aprobar"
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            {canRequestReview && (
                              <button
                                onClick={() => openReview(r, 'Rejected')}
                                title="Rechazar"
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                            {canRequestUpdate && (
                              <button
                                onClick={() => openEdit(r)}
                                title="Editar"
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>)}
                          {(r.status === 'Pending' || r.status === 'Approved') && canRequestCancel && (
                            <button
                              onClick={() => setCancelTarget(r)}
                              title="Cancelar solicitud"
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {r.status !== 'Approved' && canRequestDelete && (
                            <button
                              onClick={() => setDeleteTarget(r)}
                              title="Eliminar"
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : tab === 'saldos' ? (
                paginatedBalances.map((b, i) => (
                  <tr key={b.employeeId} className="border-b border-slate-50 dark:border-slate-700/40 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition-colors">
                    <td className="px-5 py-2 text-xs text-slate-400 dark:text-slate-500 font-medium text-center align-middle">{globalIndex(i)}</td>
                    <td className="px-5 py-2 text-left align-middle">
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{b.employeeName}</p>
                      <p className="text-xs text-slate-400">{b.employeeCode}</p>
                    </td>
                    <td className="px-5 py-2 text-left align-middle hidden lg:table-cell text-slate-500 dark:text-slate-400">{b.departmentName}</td>
                    <td className="px-5 py-2 text-center align-middle hidden md:table-cell text-slate-500 dark:text-slate-400">{formatDate(b.hireDate)}</td>
                    <td className="px-5 py-2 text-center align-middle hidden sm:table-cell text-slate-500 dark:text-slate-400">{b.monthsWorked}</td>
                    <td className="px-5 py-2 text-center align-middle text-slate-700 dark:text-slate-200 font-medium">{b.accruedDays.toLocaleString('en-US')}</td>
                    <td className="px-5 py-2 text-center align-middle text-slate-500 dark:text-slate-400">{b.usedDays}</td>
                    <td className="px-5 py-2 text-center align-middle hidden sm:table-cell text-slate-500 dark:text-slate-400">{b.pendingDays}</td>
                    <td className="px-5 py-2 text-center align-middle">
                      <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${
                        b.availableDays > 0
                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                          : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
                      }`}>
                        {b.availableDays.toLocaleString('en-US')}
                      </span>
                    </td>
                    <td className="px-5 py-2 align-middle">
                      <div className="flex items-center justify-center">
                        {canBalanceUpdate && (
                          <button
                            onClick={() => openAdjustModal(b)}
                            title="Editar saldo"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                paginatedLeaves.map((l, i) => {
                  const meta = LEAVE_STATUS_META[l.status] ?? { label: l.status, badge: 'bg-slate-100 text-slate-400' }
                  return (
                    <tr key={l.id} className="border-b border-slate-50 dark:border-slate-700/40 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition-colors">
                      <td className="px-5 py-2 text-xs text-slate-400 dark:text-slate-500 font-medium text-center align-middle">{globalIndex(i)}</td>
                      <td className="px-5 py-2 text-left align-middle">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">{l.employeeName}</p>
                        <p className="text-xs text-slate-400">{l.employeeCode}</p>
                      </td>
                      <td className="px-5 py-2 text-left align-middle hidden lg:table-cell text-slate-500 dark:text-slate-400">{l.departmentName}</td>
                      <td className="px-5 py-2 text-left align-middle text-slate-500 dark:text-slate-400">{l.leaveTypeName}</td>
                      <td className="px-5 py-2 text-center align-middle text-slate-500 dark:text-slate-400">
                        {formatDate(l.startDate)} — {formatDate(l.endDate)}
                      </td>
                      <td className="px-5 py-2 text-center align-middle font-semibold text-slate-700 dark:text-slate-200">{l.days}</td>
                      <td className="px-5 py-2 text-left align-middle hidden md:table-cell text-slate-500 dark:text-slate-400">
                        {l.documentNumber ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                      <td className="px-5 py-2 text-center align-middle">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${meta.badge}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-5 py-2 align-middle">
                        <div className="flex items-center justify-center gap-0.5">
                          <button
                            onClick={() => setLeaveDetail(l)}
                            title="Ver detalle"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {l.status !== 'Voided' && (<>
                            {canLeaveUpdate && (
                              <button
                                onClick={() => openEditLeave(l)}
                                title="Editar / prorrogar"
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canLeaveVoid && (
                              <button
                                onClick={() => setVoidLeaveTarget(l)}
                                title="Anular"
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>)}
                          {l.status === 'Voided' && canLeaveDelete && (
                            <button
                              onClick={() => setDeleteLeaveTarget(l)}
                              title="Eliminar"
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

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

      {/* Modal crear / editar solicitud */}
      {requestMounted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${requestClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md p-6 ${requestClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-5">
              {editing ? 'Editar Solicitud de Vacaciones' : 'Nueva Solicitud de Vacaciones'}
            </h2>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Empleado <span className="text-red-500">*</span></label>
                {editing ? (
                  <p className="px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200">
                    {editing.employeeName} ({editing.employeeCode})
                  </p>
                ) : (
                  <SearchSelect
                    options={activeEmployeeOptions}
                    value={form.employeeId}
                    onChange={v => setForm(f => ({ ...f, employeeId: v }))}
                    placeholder="Selecciona un empleado…"
                    searchPlaceholder="Buscar empleado…"
                    emptyLabel="Sin empleados activos."
                  />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Desde <span className="text-red-500">*</span></label>
                  <DatePicker value={form.startDate}
                    onChange={startDate => setForm(f => ({ ...f, startDate }))} maxDate={form.endDate || undefined} />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Hasta <span className="text-red-500">*</span></label>
                  <DatePicker value={form.endDate}
                    onChange={endDate => setForm(f => ({ ...f, endDate }))} minDate={form.startDate || undefined} />
                </div>
              </div>
              {previewDays > 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 px-4 py-2.5 text-sm text-indigo-600 dark:text-indigo-400">
                  <CalendarDays className="w-4 h-4 shrink-0" />
                  {previewDays} día{previewDays === 1 ? '' : 's'} hábil{previewDays === 1 ? '' : 'es'} (lunes a viernes)
                </div>
              )}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Motivo</label>
                <textarea rows={3} maxLength={500} placeholder="Motivo u observaciones de la solicitud…" value={form.reason}
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  className={`${inputCls} resize-none`} />
              </div>
              {formError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {formError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={closeRequestModal} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveRequest} disabled={saving}
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

      {/* Modal aprobar / rechazar */}
      {reviewMounted && reviewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${reviewClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md p-6 ${reviewClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-5">
              {reviewStatus === 'Approved' ? 'Aprobar Solicitud' : 'Rechazar Solicitud'}
            </h2>
            <div className="space-y-4">
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-4 py-3 text-sm space-y-1">
                <p className="font-semibold text-slate-800 dark:text-slate-200">{reviewTarget.employeeName} ({reviewTarget.employeeCode})</p>
                <p className="text-slate-500 dark:text-slate-400">
                  {formatDate(reviewTarget.startDate)} — {formatDate(reviewTarget.endDate)} · {reviewTarget.requestedDays} día{reviewTarget.requestedDays === 1 ? '' : 's'} hábil{reviewTarget.requestedDays === 1 ? '' : 'es'}
                </p>
                {reviewTarget.reason && <p className="text-slate-500 dark:text-slate-400 italic">"{reviewTarget.reason}"</p>}
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Comentario</label>
                <textarea rows={3} maxLength={500} placeholder="Comentario para el empleado (opcional)…" value={reviewComment}
                  onChange={e => setReviewComment(e.target.value)}
                  className={`${inputCls} resize-none`} />
              </div>
              {reviewError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {reviewError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setReviewTarget(null)} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleReview} disabled={saving}
                className={`flex items-center gap-2 px-4 py-2 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors ${
                  reviewStatus === 'Approved' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                }`}>
                {saving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : reviewStatus === 'Approved' ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                {saving ? 'Guardando…' : reviewStatus === 'Approved' ? 'Aprobar' : 'Rechazar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal detalle */}
      {detailMounted && detailTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${detailClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} onClick={() => setDetailTarget(null)} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md p-6 ${detailClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <div className="flex items-start justify-between gap-3 mb-5">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Detalle de la Solicitud</h2>
              <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${
                (STATUS_META[detailTarget.status] ?? { badge: 'bg-slate-100 text-slate-400' }).badge
              }`}>
                {(STATUS_META[detailTarget.status] ?? { label: detailTarget.status }).label}
              </span>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Empleado</p>
                <p className="text-slate-700 dark:text-slate-200 font-medium">{detailTarget.employeeName} ({detailTarget.employeeCode})</p>
                <p className="text-slate-500 dark:text-slate-400">{detailTarget.departmentName}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Período</p>
                  <p className="text-slate-700 dark:text-slate-200">{formatDate(detailTarget.startDate)} — {formatDate(detailTarget.endDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Días hábiles</p>
                  <p className="text-slate-700 dark:text-slate-200">{detailTarget.requestedDays}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Motivo</p>
                <p className="text-slate-700 dark:text-slate-200">{detailTarget.reason ?? <span className="text-slate-300 dark:text-slate-600">Sin motivo indicado.</span>}</p>
              </div>
              {detailTarget.reviewedAt && (
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-4 py-3 space-y-1">
                  <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Revisión</p>
                  <p className="text-slate-700 dark:text-slate-200">
                    {detailTarget.reviewedByName ?? '—'} · {formatDateTime(detailTarget.reviewedAt)}
                  </p>
                  {detailTarget.reviewComment && (
                    <p className="text-slate-500 dark:text-slate-400 italic">"{detailTarget.reviewComment}"</p>
                  )}
                </div>
              )}
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Solicitada</p>
                <p className="text-slate-700 dark:text-slate-200">{formatDateTime(detailTarget.createdAt)}</p>
              </div>
            </div>
            <div className="flex items-center justify-end mt-6">
              <button onClick={() => setDetailTarget(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de edición directa del saldo */}
      {adjustMounted && adjustTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${adjustClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md p-6 ${adjustClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">Editar Saldo de Vacaciones</h2>
            <p className="text-xs text-slate-400 mb-5">Fija los meses trabajados y los días acumulados; el devengo mensual continúa a partir de estos valores.</p>
            <div className="space-y-4">
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-4 py-3 text-sm space-y-1">
                <p className="font-semibold text-slate-800 dark:text-slate-200">{adjustTarget.employeeName} ({adjustTarget.employeeCode})</p>
                <p className="text-slate-500 dark:text-slate-400">
                  Usados: {adjustTarget.usedDays} · Pendientes: {adjustTarget.pendingDays} · Tasa mensual: {adjustTarget.accrualRate.toLocaleString('en-US')}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Meses trabajados <span className="text-red-500">*</span></label>
                  <input type="number" min={0} max={600} step={1} value={adjustMonths}
                    onChange={e => setAdjustMonths(e.target.value)}
                    className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Días acumulados <span className="text-red-500">*</span></label>
                  <input type="number" min={0} max={999} step={0.01} value={adjustAccrued}
                    onChange={e => setAdjustAccrued(e.target.value)}
                    className={inputCls} />
                </div>
              </div>
              {!isNaN(Number(adjustAccrued)) && adjustAccrued.trim() !== '' && (
                <p className="text-xs text-slate-400">
                  Disponible resultante: <span className="font-semibold text-slate-600 dark:text-slate-300">
                    {(Number(adjustAccrued) - adjustTarget.usedDays - adjustTarget.pendingDays).toLocaleString('en-US')}
                  </span> día(s)
                </p>
              )}
              {adjustError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {adjustError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setAdjustTarget(null)} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveBalance} disabled={saving}
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

      {/* Modal de configuración del devengo mensual */}
      {settingsMounted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${settingsClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md p-6 ${settingsClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">Configuración de Vacaciones</h2>
            <p className="text-xs text-slate-400 mb-5">Aplica a todos los empleados y recalcula los saldos al guardar.</p>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Días acumulados por mes trabajado <span className="text-red-500">*</span></label>
                <input
                  type="number" min={0} max={31} step={0.01} autoFocus value={settingsDraft}
                  onChange={e => setSettingsDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveSettings() }}
                  className={inputCls}
                />
                <p className="text-xs text-slate-400">Ej: 1.17 equivale a 14 días por año (14 ÷ 12 meses).</p>
              </div>
              {settingsError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {settingsError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setSettingsModalOpen(false)} disabled={savingSettings}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveSettings} disabled={savingSettings}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {savingSettings
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Save className="w-3.5 h-3.5" />}
                {savingSettings ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal registrar / editar incapacidad */}
      {leaveMounted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${leaveClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md p-6 ${leaveClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-5">
              {editingLeave ? 'Editar Incapacidad / Ausencia' : 'Registrar Incapacidad / Ausencia'}
            </h2>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Empleado <span className="text-red-500">*</span></label>
                {editingLeave ? (
                  <p className="px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200">
                    {editingLeave.employeeName} ({editingLeave.employeeCode})
                  </p>
                ) : (
                  <SearchSelect
                    options={activeEmployeeOptions}
                    value={leaveForm.employeeId}
                    onChange={v => setLeaveForm(f => ({ ...f, employeeId: v }))}
                    placeholder="Selecciona un empleado…"
                    searchPlaceholder="Buscar empleado…"
                    emptyLabel="Sin empleados activos."
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Tipo de ausencia <span className="text-red-500">*</span></label>
                <SearchSelect
                  options={leaveTypeOptions}
                  value={leaveForm.leaveTypeId}
                  onChange={v => setLeaveForm(f => ({ ...f, leaveTypeId: v }))}
                  placeholder="Selecciona un tipo…"
                  searchPlaceholder="Buscar tipo…"
                  emptyLabel="No se encontraron tipos."
                  onCreateNew={canLeaveTypeCreate ? openLtQuick : undefined}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Desde <span className="text-red-500">*</span></label>
                  <DatePicker value={leaveForm.startDate}
                    onChange={startDate => setLeaveForm(f => ({ ...f, startDate }))} maxDate={leaveForm.endDate || undefined} />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Hasta <span className="text-red-500">*</span></label>
                  <DatePicker value={leaveForm.endDate}
                    onChange={endDate => setLeaveForm(f => ({ ...f, endDate }))} minDate={leaveForm.startDate || undefined} />
                </div>
              </div>
              {previewLeaveDays > 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-rose-50 dark:bg-rose-500/10 px-4 py-2.5 text-sm text-rose-600 dark:text-rose-400">
                  <HeartPulse className="w-4 h-4 shrink-0" />
                  {previewLeaveDays} día{previewLeaveDays === 1 ? '' : 's'} calendario
                </div>
              )}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  N° de constancia / boleta médica {selectedLeaveType?.requiresDocument && <span className="text-red-500">*</span>}
                </label>
                <input type="text" maxLength={50} placeholder="Ej: INC-2026-00123" value={leaveForm.documentNumber}
                  onChange={e => setLeaveForm(f => ({ ...f, documentNumber: e.target.value }))}
                  className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Observaciones</label>
                <textarea rows={3} maxLength={500} placeholder="Diagnóstico, centro médico u otras notas…" value={leaveForm.notes}
                  onChange={e => setLeaveForm(f => ({ ...f, notes: e.target.value }))}
                  className={`${inputCls} resize-none`} />
              </div>
              {leaveError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {leaveError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={closeLeaveModal} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveLeave} disabled={saving}
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

      {/* Modal detalle de incapacidad */}
      {leaveDetailMounted && leaveDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${leaveDetailClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} onClick={() => setLeaveDetail(null)} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md p-6 ${leaveDetailClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <div className="flex items-start justify-between gap-3 mb-5">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Detalle de la Ausencia</h2>
              <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${
                (LEAVE_STATUS_META[leaveDetail.status] ?? { badge: 'bg-slate-100 text-slate-400' }).badge
              }`}>
                {(LEAVE_STATUS_META[leaveDetail.status] ?? { label: leaveDetail.status }).label}
              </span>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Empleado</p>
                <p className="text-slate-700 dark:text-slate-200 font-medium">{leaveDetail.employeeName} ({leaveDetail.employeeCode})</p>
                <p className="text-slate-500 dark:text-slate-400">{leaveDetail.departmentName}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Tipo</p>
                  <p className="text-slate-700 dark:text-slate-200">{leaveDetail.leaveTypeName}</p>
                  <p className="text-xs text-slate-400">{leaveDetail.isPaid ? 'Remunerada' : 'No remunerada'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">N° de constancia</p>
                  <p className="text-slate-700 dark:text-slate-200">{leaveDetail.documentNumber ?? <span className="text-slate-300 dark:text-slate-600">—</span>}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Período</p>
                  <p className="text-slate-700 dark:text-slate-200">{formatDate(leaveDetail.startDate)} — {formatDate(leaveDetail.endDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Días calendario</p>
                  <p className="text-slate-700 dark:text-slate-200">{leaveDetail.days}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Observaciones</p>
                <p className="text-slate-700 dark:text-slate-200">{leaveDetail.notes ?? <span className="text-slate-300 dark:text-slate-600">Sin observaciones.</span>}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Registrada</p>
                <p className="text-slate-700 dark:text-slate-200">
                  {formatDateTime(leaveDetail.createdAt)}
                  {leaveDetail.registeredByName ? ` · por ${leaveDetail.registeredByName}` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end mt-6">
              <button onClick={() => setLeaveDetail(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal crear tipo de ausencia — acceso rápido desde el select */}
      <QuickCreateModal
        open={ltQuickOpen}
        title="Nuevo Tipo de Ausencia"
        placeholder="Ej: Incapacidad por enfermedad"
        initialName={ltQuickQuery}
        onClose={() => setLtQuickOpen(false)}
        onSave={handleSaveLtQuick}
      />

      <ConfirmDialog
        open={!!voidLeaveTarget}
        title="¿Anular ausencia?"
        message={`La ausencia de "${voidLeaveTarget?.employeeName}" (${voidLeaveTarget ? formatDate(voidLeaveTarget.startDate) : ''} — ${voidLeaveTarget ? formatDate(voidLeaveTarget.endDate) : ''}) quedará anulada y dejará de contar en validaciones y reportes.`}
        confirmLabel="Sí, anular"
        cancelLabel="Volver"
        onConfirm={handleVoidLeave}
        onCancel={() => setVoidLeaveTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteLeaveTarget}
        title="¿Eliminar ausencia?"
        message={`La ausencia anulada de "${deleteLeaveTarget?.employeeName}" se eliminará permanentemente. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDeleteLeave}
        onCancel={() => setDeleteLeaveTarget(null)}
      />

      <ConfirmDialog
        open={!!cancelTarget}
        title="¿Cancelar solicitud de vacaciones?"
        message={`La solicitud de "${cancelTarget?.employeeName}" (${cancelTarget ? formatDate(cancelTarget.startDate) : ''} — ${cancelTarget ? formatDate(cancelTarget.endDate) : ''}) será cancelada y los días volverán al saldo disponible.`}
        confirmLabel="Sí, cancelar solicitud"
        cancelLabel="Volver"
        onConfirm={handleCancel}
        onCancel={() => setCancelTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar solicitud de vacaciones?"
        message={`La solicitud de "${deleteTarget?.employeeName}" se eliminará permanentemente. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
