import { useEffect, useState } from 'react'
import {
  Plus, Search, Pencil, RefreshCw, Save, Trash2, Check,
  CalendarDays, Clock, CheckCircle2, FolderOpen, UserCheck, UserX,
  AlarmClock, ClipboardCheck, CalendarClock, Star, Link2, ChevronLeft, ChevronRight, ShieldCheck,
  Eye, X, MapPin, Building2, FileText,
} from 'lucide-react'
import { attendanceApi, employeesApi } from '../../lib/api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { SearchSelect } from '../../components/SearchSelect'
import { DatePicker } from '../../components/DatePicker'
import { TimePicker } from '../../components/TimePicker'
import { TabsScroller } from '../../components/TabsScroller'
import { Pagination, usePagination, type PageSize } from '../../components/Pagination'
import { useToast } from '../../context/ToastContext'
import { useModalTransition } from '../../hooks/useModalTransition'
import { usePermission } from '../../hooks/usePermission'

// ── Tipos ─────────────────────────────────────────────────────────────────────

/** Asistencia de un empleado en la fecha consultada (hr.SP_GetAttendanceDay). */
interface AttendanceDay {
  employeeId: string
  employeeCode: string
  employeeName: string
  departmentName: string
  scheduleId: string
  scheduleName: string
  startTime: string
  endTime: string
  toleranceMinutes: number
  recordId?: string
  checkIn?: string
  checkOut?: string
  notes?: string
  /** IP pública desde la que se marcó en el kiosco del login (undefined si fue corregido manualmente). */
  checkInIp?: string
  checkOutIp?: string
  /** Leave | Vacation | Holiday | DayOff | Late | Present | Absent | Pending | Scheduled. */
  status: string
  lateMinutes: number
  holidayName?: string
  leaveTypeName?: string
}

interface AttendanceSummary {
  employeeId: string
  employeeCode: string
  employeeName: string
  departmentName: string
  presentDays: number
  lateDays: number
  absentDays: number
  justifiedDays: number
}

interface WorkSchedule {
  id: string
  name: string
  startTime: string
  endTime: string
  toleranceMinutes: number
  /** CSV ISO: 1=lunes … 7=domingo. */
  workDays: string
  isDefault: boolean
  isActive: boolean
  assignedCount: number
}

interface Holiday {
  id: string
  name: string
  holidayDate: string
  isRecurring: boolean
}

interface Employee {
  id: string
  code: string
  firstName: string
  lastName: string
  isActive: boolean
}

/** Asignación de turno con vigencia (hr.SP_GetEmployeeScheduleAssignments). */
interface ScheduleAssignment {
  id: string
  scheduleId: string
  scheduleName: string
  startTime: string
  endTime: string
  workDays: string
  effectiveFrom: string
  effectiveTo?: string
  isCurrent: boolean
}

interface RecordForm {
  employeeId: string
  checkIn: string
  checkOut: string
  notes: string
}

interface ScheduleForm {
  name: string
  startTime: string
  endTime: string
  toleranceMinutes: string
  workDays: Set<number>
  isDefault: boolean
}

interface HolidayForm {
  name: string
  holidayDate: string
  isRecurring: boolean
}

type Tab = 'marcajes' | 'resumen' | 'horarios' | 'feriados'

const EMPTY_RECORD_FORM: RecordForm = { employeeId: '', checkIn: '', checkOut: '', notes: '' }
const EMPTY_SCHEDULE_FORM: ScheduleForm = { name: '', startTime: '08:00', endTime: '17:00', toleranceMinutes: '10', workDays: new Set([1, 2, 3, 4, 5]), isDefault: false }
const EMPTY_HOLIDAY_FORM: HolidayForm = { name: '', holidayDate: '', isRecurring: true }

// Estados derivados del día (el servidor los calcula cruzando vacaciones,
// incapacidades, feriados y el horario del empleado)
const STATUS_META: Record<string, { label: string; badge: string }> = {
  Present:   { label: 'Presente',    badge: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
  Late:      { label: 'Tardanza',    badge: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
  Absent:    { label: 'Ausente',     badge: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' },
  Pending:   { label: 'Sin marcar',  badge: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400' },
  Scheduled: { label: 'Programado',  badge: 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500' },
  Vacation:  { label: 'Vacaciones',  badge: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400' },
  Leave:     { label: 'Incapacidad', badge: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400' },
  Holiday:   { label: 'Feriado',     badge: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400' },
  DayOff:    { label: 'Día libre',   badge: 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500' },
}

/** Etiquetas de los días ISO (1=lunes … 7=domingo) para el editor de horarios. */
const DAY_LABELS: Record<number, string> = { 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S', 7: 'D' }

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 'HH:mm:ss' → 'HH:mm' (24h), para llenar inputs type="time". */
const formatTime = (t?: string) => t ? t.slice(0, 5) : ''

/** 'HH:mm:ss' → hora legible en 12 horas con AM/PM (ej: 8:00 AM). */
const formatTime12 = (t?: string) => {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/** Minutos de retraso → texto legible en horas y minutos (ej: 7 h 18 min). */
const formatLate = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

const formatDateShort = (iso: string) =>
  new Date(iso).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** CSV de días laborables → texto legible (ej: 'L, M, X, J, V'). */
const workDaysLabel = (csv: string) =>
  csv.split(',').filter(Boolean).map(d => DAY_LABELS[Number(d)] ?? d).join(', ')

const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition'
const thCls = 'px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider'

export function AsistenciaPage() {
  const toast = useToast()
  const now = new Date()

  const canRecordCreate    = usePermission('hr.attendance.record-create')
  const canRecordDelete    = usePermission('hr.attendance.record-delete')
  const canScheduleCreate  = usePermission('hr.attendance.schedule-create')
  const canScheduleUpdate  = usePermission('hr.attendance.schedule-update')
  const canScheduleDelete  = usePermission('hr.attendance.schedule-delete')
  const canScheduleAssign  = usePermission('hr.attendance.schedule-assign')
  const canHolidayCreate   = usePermission('hr.attendance.holiday-create')
  const canHolidayUpdate   = usePermission('hr.attendance.holiday-update')
  const canHolidayDelete   = usePermission('hr.attendance.holiday-delete')

  const [tab, setTab] = useState<Tab>('marcajes')
  const [dayRows, setDayRows]     = useState<AttendanceDay[]>([])
  const [summary, setSummary]     = useState<AttendanceSummary[]>([])
  const [schedules, setSchedules] = useState<WorkSchedule[]>([])
  const [holidays, setHolidays]   = useState<Holiday[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving]       = useState(false)

  const [search, setSearch]     = useState('')
  const [date, setDate]         = useState(todayISO())
  const [sumYear, setSumYear]   = useState(now.getFullYear())
  const [sumMonth, setSumMonth] = useState(now.getMonth() + 1) // 1-12
  const [page, setPage]         = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(10)

  // Modal registrar / corregir marcaje
  const [recordModalOpen, setRecordModalOpen] = useState(false)
  const [recordTarget, setRecordTarget]       = useState<AttendanceDay | null>(null)
  const [recordForm, setRecordForm]           = useState<RecordForm>(EMPTY_RECORD_FORM)
  const [recordError, setRecordError]         = useState<string | null>(null)
  const { mounted: recordMounted, closing: recordClosing } = useModalTransition(recordModalOpen)

  // Modal crear / editar horario
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [editingSchedule, setEditingSchedule]     = useState<WorkSchedule | null>(null)
  const [scheduleForm, setScheduleForm]           = useState<ScheduleForm>(EMPTY_SCHEDULE_FORM)
  const [scheduleError, setScheduleError]         = useState<string | null>(null)
  const { mounted: scheduleMounted, closing: scheduleClosing } = useModalTransition(scheduleModalOpen)

  // Modal asignar turno a un empleado (con vigencia)
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [assignEmployeeId, setAssignEmployeeId] = useState('')
  const [assignScheduleId, setAssignScheduleId] = useState('')
  const [assignEffectiveFrom, setAssignEffectiveFrom] = useState(todayISO())
  const [assignHistory, setAssignHistory]       = useState<ScheduleAssignment[]>([])
  const [assignError, setAssignError]           = useState<string | null>(null)
  const { mounted: assignMounted, closing: assignClosing } = useModalTransition(assignModalOpen)

  // Historial de turnos del empleado seleccionado en el modal de asignación
  useEffect(() => {
    if (!assignEmployeeId) { setAssignHistory([]); return }
    attendanceApi.scheduleAssignments(assignEmployeeId).then(async res => {
      if (res.ok) setAssignHistory(await res.json())
    })
  }, [assignEmployeeId])

  // Modal crear / editar feriado
  const [holidayModalOpen, setHolidayModalOpen] = useState(false)
  const [editingHoliday, setEditingHoliday]     = useState<Holiday | null>(null)
  const [holidayForm, setHolidayForm]           = useState<HolidayForm>(EMPTY_HOLIDAY_FORM)
  const [holidayError, setHolidayError]         = useState<string | null>(null)
  const { mounted: holidayMounted, closing: holidayClosing } = useModalTransition(holidayModalOpen)

  // Confirmaciones
  const [deleteRecordTarget, setDeleteRecordTarget]     = useState<AttendanceDay | null>(null)
  const [deleteScheduleTarget, setDeleteScheduleTarget] = useState<WorkSchedule | null>(null)
  const [deleteHolidayTarget, setDeleteHolidayTarget]   = useState<Holiday | null>(null)

  // Detalle del marcaje del día
  const [detailTarget, setDetailTarget] = useState<AttendanceDay | null>(null)
  const { mounted: detailMounted, closing: detailClosing } = useModalTransition(!!detailTarget)

  const loadAll = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true)
    try {
      const [dayRes, sumRes, schRes, holRes, empRes] = await Promise.all([
        attendanceApi.day(date),
        attendanceApi.summary(sumYear, sumMonth),
        attendanceApi.schedules(),
        attendanceApi.holidays(),
        employeesApi.list(),
      ])
      if (dayRes.ok) setDayRows(await dayRes.json())
      if (sumRes.ok) setSummary(await sumRes.json())
      if (schRes.ok) setSchedules(await schRes.json())
      if (holRes.ok) setHolidays(await holRes.json())
      if (empRes.ok) setEmployees(await empRes.json())
    } finally {
      silent ? setRefreshing(false) : setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  // Recarga el día al cambiar la fecha consultada
  useEffect(() => {
    if (loading) return
    attendanceApi.day(date).then(async res => { if (res.ok) setDayRows(await res.json()) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  // Recarga el resumen al cambiar el mes consultado
  useEffect(() => {
    if (loading) return
    attendanceApi.summary(sumYear, sumMonth).then(async res => { if (res.ok) setSummary(await res.json()) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sumYear, sumMonth])

  const changeTab = (t: Tab) => { setTab(t); setSearch(''); setPage(1) }
  const handleSearch = (value: string) => { setSearch(value); setPage(1) }

  const prevMonth = () => {
    if (sumMonth === 1) { setSumMonth(12); setSumYear(y => y - 1) } else setSumMonth(m => m - 1)
    setPage(1)
  }
  const nextMonth = () => {
    if (sumMonth === 12) { setSumMonth(1); setSumYear(y => y + 1) } else setSumMonth(m => m + 1)
    setPage(1)
  }

  // ── Filtros ─────────────────────────────────────────────────────────────────

  const term = search.toLowerCase()

  const filteredDay = dayRows.filter(r =>
    r.employeeName.toLowerCase().includes(term) ||
    r.employeeCode.toLowerCase().includes(term) ||
    r.departmentName.toLowerCase().includes(term)
  )

  const filteredSummary = summary.filter(r =>
    r.employeeName.toLowerCase().includes(term) ||
    r.employeeCode.toLowerCase().includes(term) ||
    r.departmentName.toLowerCase().includes(term)
  )

  const filteredHolidays = holidays.filter(h => h.name.toLowerCase().includes(term))
  const filteredSchedules = schedules.filter(s => s.name.toLowerCase().includes(term))

  const paginatedDay     = usePagination(filteredDay, page, pageSize)
  const paginatedSummary = usePagination(filteredSummary, page, pageSize)

  const activeEmployeeOptions = employees
    .filter(e => e.isActive)
    .map(e => ({ value: e.id, label: `${e.firstName} ${e.lastName} (${e.code})` }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const scheduleOptions = schedules
    .filter(s => s.isActive)
    .map(s => ({ value: s.id, label: `${s.name}${s.isDefault ? ' (predeterminado)' : ''}` }))

  // ── Indicadores del día consultado ──────────────────────────────────────────

  const kpis = {
    present:   dayRows.filter(r => r.status === 'Present').length,
    late:      dayRows.filter(r => r.status === 'Late').length,
    absent:    dayRows.filter(r => r.status === 'Absent').length,
    pending:   dayRows.filter(r => r.status === 'Pending').length,
    justified: dayRows.filter(r => r.status === 'Vacation' || r.status === 'Leave').length,
  }

  const kpiCards = [
    { label: 'Presentes',    value: kpis.present,   icon: UserCheck,    color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
    { label: 'Tardanzas',    value: kpis.late,      icon: AlarmClock,   color: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
    { label: 'Ausentes',     value: kpis.absent,    icon: UserX,        color: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' },
    { label: 'Sin marcar',   value: kpis.pending,   icon: Clock,        color: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400' },
    { label: 'Justificados', value: kpis.justified, icon: ShieldCheck,  color: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400' },
  ]

  const tabs: { key: Tab; label: string; icon: typeof ClipboardCheck; count: number }[] = [
    { key: 'marcajes', label: 'Marcajes', icon: ClipboardCheck, count: dayRows.length },
    { key: 'resumen',  label: 'Resumen',  icon: CheckCircle2,   count: summary.length },
    { key: 'horarios', label: 'Horarios', icon: CalendarClock,  count: schedules.length },
    { key: 'feriados', label: 'Feriados', icon: CalendarDays,   count: holidays.length },
  ]

  // ── Marcajes ────────────────────────────────────────────────────────────────

  const openRecordCreate = () => {
    setRecordTarget(null); setRecordForm(EMPTY_RECORD_FORM); setRecordError(null); setRecordModalOpen(true)
  }

  const openRecordEdit = (r: AttendanceDay) => {
    setRecordTarget(r)
    setRecordForm({
      employeeId: r.employeeId,
      checkIn: formatTime(r.checkIn),
      checkOut: formatTime(r.checkOut),
      notes: r.notes ?? '',
    })
    setRecordError(null)
    setRecordModalOpen(true)
  }

  const closeRecordModal = () => { setRecordModalOpen(false); setRecordTarget(null); setRecordError(null) }

  const handleSaveRecord = async () => {
    if (!recordTarget && !recordForm.employeeId) { setRecordError('Selecciona un empleado.'); return }
    if (!recordForm.checkIn) { setRecordError('Indica la hora de entrada.'); return }
    if (recordForm.checkOut && recordForm.checkOut <= recordForm.checkIn) {
      setRecordError('La hora de salida debe ser posterior a la hora de entrada.'); return
    }
    setSaving(true); setRecordError(null)
    try {
      const res = await attendanceApi.upsertRecord({
        employeeId: recordTarget?.employeeId ?? recordForm.employeeId,
        workDate: date,
        checkIn: recordForm.checkIn,
        checkOut: recordForm.checkOut || undefined,
        notes: recordForm.notes.trim() || undefined,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar el marcaje.' }))
        setRecordError(err.message); toast.error(err.message); return
      }
      toast.success('Marcaje guardado correctamente.')
      closeRecordModal(); await loadAll(true)
    } finally { setSaving(false) }
  }

  const handleDeleteRecord = async () => {
    if (!deleteRecordTarget?.recordId) return
    try {
      const res = await attendanceApi.removeRecord(deleteRecordTarget.recordId)
      if (res.ok) { toast.success('Marcaje eliminado correctamente.'); await loadAll(true) }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar el marcaje.' }))
        toast.error(err.message)
      }
    } finally { setDeleteRecordTarget(null) }
  }

  // ── Horarios ────────────────────────────────────────────────────────────────

  const openScheduleCreate = () => {
    setEditingSchedule(null); setScheduleForm({ ...EMPTY_SCHEDULE_FORM, workDays: new Set([1, 2, 3, 4, 5]) })
    setScheduleError(null); setScheduleModalOpen(true)
  }

  const openScheduleEdit = (s: WorkSchedule) => {
    setEditingSchedule(s)
    setScheduleForm({
      name: s.name,
      startTime: formatTime(s.startTime),
      endTime: formatTime(s.endTime),
      toleranceMinutes: String(s.toleranceMinutes),
      workDays: new Set(s.workDays.split(',').filter(Boolean).map(Number)),
      isDefault: s.isDefault,
    })
    setScheduleError(null)
    setScheduleModalOpen(true)
  }

  const toggleWorkDay = (d: number) =>
    setScheduleForm(f => {
      const days = new Set(f.workDays)
      days.has(d) ? days.delete(d) : days.add(d)
      return { ...f, workDays: days }
    })

  const handleSaveSchedule = async () => {
    if (!scheduleForm.name.trim()) { setScheduleError('El nombre es requerido.'); return }
    if (!scheduleForm.startTime || !scheduleForm.endTime) { setScheduleError('Indica las horas de entrada y salida.'); return }
    if (scheduleForm.endTime <= scheduleForm.startTime) { setScheduleError('La hora de salida debe ser posterior a la de entrada.'); return }
    if (scheduleForm.workDays.size === 0) { setScheduleError('Selecciona al menos un día laborable.'); return }
    const tolerance = Number(scheduleForm.toleranceMinutes)
    if (!Number.isInteger(tolerance) || tolerance < 0 || tolerance > 120) {
      setScheduleError('La tolerancia debe ser un entero entre 0 y 120 minutos.'); return
    }
    setSaving(true); setScheduleError(null)
    try {
      const payload = {
        name: scheduleForm.name.trim(),
        startTime: scheduleForm.startTime,
        endTime: scheduleForm.endTime,
        toleranceMinutes: tolerance,
        workDays: [...scheduleForm.workDays].sort((a, b) => a - b).join(','),
        isDefault: scheduleForm.isDefault,
      }
      const res = editingSchedule
        ? await attendanceApi.updateSchedule(editingSchedule.id, payload)
        : await attendanceApi.createSchedule(payload)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar el horario.' }))
        setScheduleError(err.message); toast.error(err.message); return
      }
      toast.success(editingSchedule ? 'Horario actualizado correctamente.' : 'Horario creado correctamente.')
      setScheduleModalOpen(false); await loadAll(true)
    } finally { setSaving(false) }
  }

  const handleDeleteSchedule = async () => {
    if (!deleteScheduleTarget) return
    try {
      const res = await attendanceApi.removeSchedule(deleteScheduleTarget.id)
      if (res.ok) { toast.success('Horario eliminado correctamente.'); await loadAll(true) }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar el horario.' }))
        toast.error(err.message)
      }
    } finally { setDeleteScheduleTarget(null) }
  }

  const openAssignModal = () => {
    setAssignEmployeeId(''); setAssignScheduleId(''); setAssignEffectiveFrom(todayISO())
    setAssignHistory([]); setAssignError(null); setAssignModalOpen(true)
  }

  const handleAssign = async () => {
    if (!assignEmployeeId) { setAssignError('Selecciona un empleado.'); return }
    if (!assignEffectiveFrom) { setAssignError('Indica desde cuándo aplica el turno.'); return }
    setSaving(true); setAssignError(null)
    try {
      const res = await attendanceApi.assignSchedule(assignEmployeeId, assignScheduleId || null, assignEffectiveFrom)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al asignar el turno.' }))
        setAssignError(err.message); toast.error(err.message); return
      }
      toast.success('Turno asignado correctamente.')
      setAssignModalOpen(false); await loadAll(true)
    } finally { setSaving(false) }
  }

  // ── Feriados ────────────────────────────────────────────────────────────────

  const openHolidayCreate = () => {
    setEditingHoliday(null); setHolidayForm(EMPTY_HOLIDAY_FORM); setHolidayError(null); setHolidayModalOpen(true)
  }

  const openHolidayEdit = (h: Holiday) => {
    setEditingHoliday(h)
    setHolidayForm({ name: h.name, holidayDate: h.holidayDate.slice(0, 10), isRecurring: h.isRecurring })
    setHolidayError(null)
    setHolidayModalOpen(true)
  }

  const handleSaveHoliday = async () => {
    if (!holidayForm.name.trim()) { setHolidayError('El nombre es requerido.'); return }
    if (!holidayForm.holidayDate) { setHolidayError('La fecha es requerida.'); return }
    setSaving(true); setHolidayError(null)
    try {
      const payload = { name: holidayForm.name.trim(), holidayDate: holidayForm.holidayDate, isRecurring: holidayForm.isRecurring }
      const res = editingHoliday
        ? await attendanceApi.updateHoliday(editingHoliday.id, payload)
        : await attendanceApi.createHoliday(payload)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar el feriado.' }))
        setHolidayError(err.message); toast.error(err.message); return
      }
      toast.success(editingHoliday ? 'Feriado actualizado correctamente.' : 'Feriado creado correctamente.')
      setHolidayModalOpen(false); await loadAll(true)
    } finally { setSaving(false) }
  }

  const handleDeleteHoliday = async () => {
    if (!deleteHolidayTarget) return
    try {
      const res = await attendanceApi.removeHoliday(deleteHolidayTarget.id)
      if (res.ok) { toast.success('Feriado eliminado correctamente.'); await loadAll(true) }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar el feriado.' }))
        toast.error(err.message)
      }
    } finally { setDeleteHolidayTarget(null) }
  }

  const globalIndex = (i: number) =>
    pageSize === 'all' ? i + 1 : (page - 1) * (pageSize as number) + i + 1

  /** Empleados a los que se les puede registrar marcaje hoy (día laborable sin justificación). */
  const canMark = (r: AttendanceDay) => !['Vacation', 'Leave', 'Holiday', 'Scheduled'].includes(r.status)

  const headerAction = {
    marcajes: { label: 'Registrar Marcaje', onClick: openRecordCreate },
    resumen:  null,
    horarios: { label: 'Nuevo Horario', onClick: openScheduleCreate },
    feriados: { label: 'Nuevo Feriado', onClick: openHolidayCreate },
  }[tab]

  const currentTotal =
    tab === 'marcajes' ? filteredDay.length :
    tab === 'resumen'  ? filteredSummary.length :
    tab === 'horarios' ? filteredSchedules.length :
    filteredHolidays.length

  return (
    <div className="p-6 space-y-4">

      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Asistencia</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : 'Marcajes diarios, horarios de trabajo y feriados del personal'}
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
          {tab === 'horarios' && canScheduleAssign && (
            <button
              onClick={openAssignModal}
              disabled={activeEmployeeOptions.length === 0}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              <Link2 className="w-4 h-4" />
              Asignar Horario
            </button>
          )}
          {headerAction && (
            (tab === 'marcajes' && canRecordCreate) ||
            (tab === 'horarios' && canScheduleCreate) ||
            (tab === 'feriados' && canHolidayCreate)
          ) && (
            <button
              onClick={headerAction.onClick}
              disabled={tab === 'marcajes' && activeEmployeeOptions.length === 0}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              {headerAction.label}
            </button>
          )}
        </div>
      </div>

      {/* Indicadores del día consultado */}
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

      {/* Búsqueda + filtros por tab */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 min-w-0 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder={tab === 'marcajes' || tab === 'resumen' ? 'Buscar por empleado, código o departamento…' : 'Buscar por nombre…'}
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
          />
        </div>

        {tab === 'marcajes' && (
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-sm text-slate-500 dark:text-slate-400">Fecha</label>
            <div className="w-44">
              <DatePicker value={date} onChange={d => { if (d) { setDate(d); setPage(1) } }} />
            </div>
          </div>
        )}

        {tab === 'resumen' && (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={prevMonth} title="Mes anterior"
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 text-sm font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap w-36 text-center">
              {MONTH_NAMES[sumMonth - 1]} {sumYear}
            </span>
            <button onClick={nextMonth} title="Mes siguiente"
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
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
                {tab === 'marcajes' && (<>
                  <th className={`${thCls} text-left`}>Empleado</th>
                  <th className={`${thCls} text-left hidden lg:table-cell`}>Departamento</th>
                  <th className={`${thCls} text-left hidden md:table-cell`}>Horario</th>
                  <th className={`${thCls} text-center`}>Entrada</th>
                  <th className={`${thCls} text-center`}>Salida</th>
                  <th className={`${thCls} text-center`}>Estado</th>
                  <th className={`${thCls} text-center`}>Acciones</th>
                </>)}
                {tab === 'resumen' && (<>
                  <th className={`${thCls} text-left`}>Empleado</th>
                  <th className={`${thCls} text-left hidden md:table-cell`}>Departamento</th>
                  <th className={`${thCls} text-center`}>Presentes</th>
                  <th className={`${thCls} text-center`}>Tardanzas</th>
                  <th className={`${thCls} text-center`}>Ausencias</th>
                  <th className={`${thCls} text-center`}>Justificados</th>
                </>)}
                {tab === 'horarios' && (<>
                  <th className={`${thCls} text-left`}>Nombre</th>
                  <th className={`${thCls} text-center`}>Entrada</th>
                  <th className={`${thCls} text-center`}>Salida</th>
                  <th className={`${thCls} text-center hidden sm:table-cell`}>Tolerancia</th>
                  <th className={`${thCls} text-center hidden md:table-cell`}>Días</th>
                  <th className={`${thCls} text-center hidden sm:table-cell`}>Asignados</th>
                  <th className={`${thCls} text-center`}>Acciones</th>
                </>)}
                {tab === 'feriados' && (<>
                  <th className={`${thCls} text-left`}>Nombre</th>
                  <th className={`${thCls} text-center`}>Fecha</th>
                  <th className={`${thCls} text-center`}>Recurrencia</th>
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
                      {search
                        ? 'Sin resultados para la búsqueda.'
                        : tab === 'marcajes'
                          ? 'No hay empleados activos contratados a esta fecha.'
                          : tab === 'resumen'
                            ? 'No hay datos de asistencia para el mes.'
                            : tab === 'horarios'
                              ? 'No hay horarios registrados.'
                              : 'No hay feriados registrados.'}
                    </p>
                  </td>
                </tr>
              ) : tab === 'marcajes' ? (
                paginatedDay.map((r, i) => {
                  const meta = STATUS_META[r.status] ?? { label: r.status, badge: 'bg-slate-100 text-slate-400' }
                  return (
                    <tr key={r.employeeId} className="border-b border-slate-50 dark:border-slate-700/40 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition-colors">
                      <td className="px-5 py-2 text-xs text-slate-400 dark:text-slate-500 font-medium text-center align-middle">{globalIndex(i)}</td>
                      <td className="px-5 py-2 text-left align-middle">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">{r.employeeName}</p>
                        <p className="text-xs text-slate-400">{r.employeeCode}</p>
                      </td>
                      <td className="px-5 py-2 text-left align-middle hidden lg:table-cell text-slate-500 dark:text-slate-400">{r.departmentName}</td>
                      <td className="px-5 py-2 text-left align-middle hidden md:table-cell text-slate-500 dark:text-slate-400">
                        {formatTime12(r.startTime)}–{formatTime12(r.endTime)}
                      </td>
                      <td className="px-5 py-2 text-center align-middle font-medium text-slate-700 dark:text-slate-200" title={r.checkInIp ? `IP: ${r.checkInIp}` : undefined}>
                        {formatTime12(r.checkIn) || <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                      <td className="px-5 py-2 text-center align-middle font-medium text-slate-700 dark:text-slate-200" title={r.checkOutIp ? `IP: ${r.checkOutIp}` : undefined}>
                        {formatTime12(r.checkOut) || <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                      <td className="px-5 py-2 text-center align-middle">
                        <span
                          title={r.status === 'Leave' ? r.leaveTypeName : r.status === 'Holiday' ? r.holidayName : r.status === 'Late' ? `${formatLate(r.lateMinutes)} de retraso` : undefined}
                          className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${meta.badge}`}
                        >
                          {meta.label}
                          {r.status === 'Late' && ` (+${formatLate(r.lateMinutes)})`}
                        </span>
                      </td>
                      <td className="px-5 py-2 align-middle">
                        <div className="flex items-center justify-center gap-0.5">
                          {r.recordId && (
                            <button
                              onClick={() => setDetailTarget(r)}
                              title="Ver detalle"
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canMark(r) && canRecordCreate && (
                            <button
                              onClick={() => openRecordEdit(r)}
                              title={r.recordId ? 'Corregir marcaje' : 'Registrar marcaje'}
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                            >
                              {r.recordId ? <Pencil className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          {r.recordId && canRecordDelete && (
                            <button
                              onClick={() => setDeleteRecordTarget(r)}
                              title="Eliminar marcaje"
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
              ) : tab === 'resumen' ? (
                paginatedSummary.map((r, i) => (
                  <tr key={r.employeeId} className="border-b border-slate-50 dark:border-slate-700/40 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition-colors">
                    <td className="px-5 py-2 text-xs text-slate-400 dark:text-slate-500 font-medium text-center align-middle">{globalIndex(i)}</td>
                    <td className="px-5 py-2 text-left align-middle">
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{r.employeeName}</p>
                      <p className="text-xs text-slate-400">{r.employeeCode}</p>
                    </td>
                    <td className="px-5 py-2 text-left align-middle hidden md:table-cell text-slate-500 dark:text-slate-400">{r.departmentName}</td>
                    <td className="px-5 py-2 text-center align-middle font-medium text-emerald-600 dark:text-emerald-400">{r.presentDays}</td>
                    <td className="px-5 py-2 text-center align-middle font-medium text-amber-600 dark:text-amber-400">{r.lateDays}</td>
                    <td className="px-5 py-2 text-center align-middle font-medium text-red-600 dark:text-red-400">{r.absentDays}</td>
                    <td className="px-5 py-2 text-center align-middle font-medium text-sky-600 dark:text-sky-400">{r.justifiedDays}</td>
                  </tr>
                ))
              ) : tab === 'horarios' ? (
                filteredSchedules.map((s, i) => (
                  <tr key={s.id} className="border-b border-slate-50 dark:border-slate-700/40 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition-colors">
                    <td className="px-5 py-2 text-xs text-slate-400 dark:text-slate-500 font-medium text-center align-middle">{i + 1}</td>
                    <td className="px-5 py-2 text-left align-middle">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">{s.name}</p>
                        {s.isDefault && (
                          <span title="Horario predeterminado" className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                            <Star className="w-3 h-3" />
                            Predeterminado
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-2 text-center align-middle text-slate-700 dark:text-slate-200">{formatTime12(s.startTime)}</td>
                    <td className="px-5 py-2 text-center align-middle text-slate-700 dark:text-slate-200">{formatTime12(s.endTime)}</td>
                    <td className="px-5 py-2 text-center align-middle hidden sm:table-cell text-slate-500 dark:text-slate-400">{s.toleranceMinutes} min</td>
                    <td className="px-5 py-2 text-center align-middle hidden md:table-cell text-slate-500 dark:text-slate-400">{workDaysLabel(s.workDays)}</td>
                    <td className="px-5 py-2 text-center align-middle hidden sm:table-cell text-slate-500 dark:text-slate-400">{s.assignedCount}</td>
                    <td className="px-5 py-2 align-middle">
                      <div className="flex items-center justify-center gap-0.5">
                        {canScheduleUpdate && (
                          <button
                            onClick={() => openScheduleEdit(s)}
                            title="Editar"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {!s.isDefault && canScheduleDelete && (
                          <button
                            onClick={() => setDeleteScheduleTarget(s)}
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
              ) : (
                filteredHolidays.map((h, i) => (
                  <tr key={h.id} className="border-b border-slate-50 dark:border-slate-700/40 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition-colors">
                    <td className="px-5 py-2 text-xs text-slate-400 dark:text-slate-500 font-medium text-center align-middle">{i + 1}</td>
                    <td className="px-5 py-2 text-left align-middle font-semibold text-slate-800 dark:text-slate-200">{h.name}</td>
                    <td className="px-5 py-2 text-center align-middle text-slate-500 dark:text-slate-400">{formatDateShort(h.holidayDate)}</td>
                    <td className="px-5 py-2 text-center align-middle">
                      <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${
                        h.isRecurring
                          ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                      }`}>
                        {h.isRecurring ? 'Cada año' : 'Solo esa fecha'}
                      </span>
                    </td>
                    <td className="px-5 py-2 align-middle">
                      <div className="flex items-center justify-center gap-0.5">
                        {canHolidayUpdate && (
                          <button
                            onClick={() => openHolidayEdit(h)}
                            title="Editar"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canHolidayDelete && (
                          <button
                            onClick={() => setDeleteHolidayTarget(h)}
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

        {!loading && (tab === 'marcajes' || tab === 'resumen') && currentTotal > 0 && (
          <Pagination
            total={currentTotal}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}
      </div>

      {/* Modal registrar / corregir marcaje */}
      {recordMounted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${recordClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md p-6 ${recordClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">
              {recordTarget?.recordId ? 'Corregir Marcaje' : 'Registrar Marcaje'}
            </h2>
            <p className="text-xs text-slate-400 mb-5">Fecha: {formatDateShort(date + 'T00:00:00')}</p>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Empleado <span className="text-red-500">*</span></label>
                {recordTarget ? (
                  <p className="px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200">
                    {recordTarget.employeeName} ({recordTarget.employeeCode})
                  </p>
                ) : (
                  <SearchSelect
                    options={activeEmployeeOptions}
                    value={recordForm.employeeId}
                    onChange={v => setRecordForm(f => ({ ...f, employeeId: v }))}
                    placeholder="Selecciona un empleado…"
                    searchPlaceholder="Buscar empleado…"
                    emptyLabel="Sin empleados activos."
                  />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Hora de entrada <span className="text-red-500">*</span></label>
                  <TimePicker value={recordForm.checkIn} clearable={false}
                    onChange={v => setRecordForm(f => ({ ...f, checkIn: v }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Hora de salida</label>
                  <TimePicker value={recordForm.checkOut}
                    onChange={v => setRecordForm(f => ({ ...f, checkOut: v }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Notas</label>
                <textarea rows={2} maxLength={300} placeholder="Observaciones del marcaje…" value={recordForm.notes}
                  onChange={e => setRecordForm(f => ({ ...f, notes: e.target.value }))}
                  className={`${inputCls} resize-none`} />
              </div>
              {recordError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {recordError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={closeRecordModal} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveRecord} disabled={saving}
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

      {/* Modal crear / editar horario */}
      {scheduleMounted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${scheduleClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md p-6 ${scheduleClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-5">
              {editingSchedule ? 'Editar Horario' : 'Nuevo Horario'}
            </h2>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre <span className="text-red-500">*</span></label>
                <input type="text" maxLength={100} placeholder="Ej: Turno matutino" value={scheduleForm.name}
                  onChange={e => setScheduleForm(f => ({ ...f, name: e.target.value }))}
                  className={inputCls} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Entrada <span className="text-red-500">*</span></label>
                  <TimePicker value={scheduleForm.startTime} clearable={false}
                    onChange={v => setScheduleForm(f => ({ ...f, startTime: v }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Salida <span className="text-red-500">*</span></label>
                  <TimePicker value={scheduleForm.endTime} clearable={false}
                    onChange={v => setScheduleForm(f => ({ ...f, endTime: v }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Tolerancia (min)</label>
                  <input type="number" min={0} max={120} value={scheduleForm.toleranceMinutes}
                    onChange={e => setScheduleForm(f => ({ ...f, toleranceMinutes: e.target.value }))}
                    className={inputCls} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Días laborables <span className="text-red-500">*</span></label>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7].map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleWorkDay(d)}
                      className={`w-9 h-9 rounded-lg text-sm font-semibold transition-colors ${
                        scheduleForm.workDays.has(d)
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {DAY_LABELS[d]}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={scheduleForm.isDefault}
                  onChange={e => setScheduleForm(f => ({ ...f, isDefault: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 accent-indigo-600" />
                <span className="text-sm text-slate-700 dark:text-slate-300">Horario predeterminado (aplica a empleados sin asignación)</span>
              </label>
              {scheduleError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {scheduleError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setScheduleModalOpen(false)} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveSchedule} disabled={saving}
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

      {/* Modal asignar horario a empleado */}
      {assignMounted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${assignClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md p-6 ${assignClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">Asignar Turno</h2>
            <p className="text-xs text-slate-400 mb-5">La asignación aplica desde la fecha indicada (turnos rotativos); los empleados sin asignación usan el horario predeterminado.</p>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Empleado <span className="text-red-500">*</span></label>
                <SearchSelect
                  options={activeEmployeeOptions}
                  value={assignEmployeeId}
                  onChange={setAssignEmployeeId}
                  placeholder="Selecciona un empleado…"
                  searchPlaceholder="Buscar empleado…"
                  emptyLabel="Sin empleados activos."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Horario</label>
                  <SearchSelect
                    options={[{ value: '', label: 'Horario predeterminado' }, ...scheduleOptions]}
                    value={assignScheduleId}
                    onChange={setAssignScheduleId}
                    placeholder="Horario predeterminado"
                    searchPlaceholder="Buscar horario…"
                    emptyLabel="No se encontraron horarios."
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Vigente desde <span className="text-red-500">*</span></label>
                  <DatePicker value={assignEffectiveFrom} onChange={d => { if (d) setAssignEffectiveFrom(d) }} />
                </div>
              </div>
              {assignHistory.length > 0 && (
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Historial de turnos</label>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700/60 max-h-40 overflow-y-auto">
                    {assignHistory.map(a => (
                      <div key={a.id} className="flex items-center justify-between gap-3 px-3.5 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-700 dark:text-slate-200 truncate">{a.scheduleName}</p>
                          <p className="text-xs text-slate-400">
                            {formatDateShort(a.effectiveFrom)} — {a.effectiveTo ? formatDateShort(a.effectiveTo) : 'vigencia abierta'}
                          </p>
                        </div>
                        {a.isCurrent && (
                          <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                            Vigente
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {assignError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {assignError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setAssignModalOpen(false)} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleAssign} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {saving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Check className="w-3.5 h-3.5" />}
                {saving ? 'Asignando…' : 'Asignar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal crear / editar feriado */}
      {holidayMounted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${holidayClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md p-6 ${holidayClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-5">
              {editingHoliday ? 'Editar Feriado' : 'Nuevo Feriado'}
            </h2>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre <span className="text-red-500">*</span></label>
                <input type="text" maxLength={100} placeholder="Ej: Día de la Independencia" value={holidayForm.name}
                  onChange={e => setHolidayForm(f => ({ ...f, name: e.target.value }))}
                  className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Fecha <span className="text-red-500">*</span></label>
                <DatePicker value={holidayForm.holidayDate}
                  onChange={holidayDate => setHolidayForm(f => ({ ...f, holidayDate }))} />
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={holidayForm.isRecurring}
                  onChange={e => setHolidayForm(f => ({ ...f, isRecurring: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 accent-indigo-600" />
                <span className="text-sm text-slate-700 dark:text-slate-300">Se repite cada año en la misma fecha</span>
              </label>
              {holidayError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {holidayError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setHolidayModalOpen(false)} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveHoliday} disabled={saving}
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

      {/* Modal detalle del marcaje del día — solo lectura */}
      {detailMounted && detailTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${detailClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} onClick={() => setDetailTarget(null)} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden ${detailClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            {/* Encabezado fijo */}
            <div className="shrink-0 flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="leading-tight space-y-1">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{detailTarget.employeeName}</h2>
                <p className="text-xs text-slate-400">{detailTarget.employeeCode} · {detailTarget.departmentName}</p>
              </div>
              <button
                onClick={() => setDetailTarget(null)}
                title="Cerrar"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Cuerpo con scroll propio */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Fecha</p>
                <p className="text-sm text-slate-700 dark:text-slate-200">{formatDateShort(date + 'T00:00:00')}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Entrada</p>
                  <p className="text-sm text-slate-700 dark:text-slate-200">
                    {formatTime12(detailTarget.checkIn) || <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                    <MapPin className="w-3 h-3 shrink-0" />
                    {detailTarget.checkInIp ?? 'Sin IP registrada'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Salida</p>
                  <p className="text-sm text-slate-700 dark:text-slate-200">
                    {formatTime12(detailTarget.checkOut) || <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                    <MapPin className="w-3 h-3 shrink-0" />
                    {detailTarget.checkOutIp ?? 'Sin IP registrada'}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Horario asignado</p>
                <p className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200">
                  <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  {detailTarget.scheduleName} · {formatTime12(detailTarget.startTime)}–{formatTime12(detailTarget.endTime)}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Estado</p>
                {(() => {
                  const meta = STATUS_META[detailTarget.status] ?? { label: detailTarget.status, badge: 'bg-slate-100 text-slate-400' }
                  return (
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${meta.badge}`}>
                      {meta.label}
                      {detailTarget.status === 'Late' && ` (+${formatLate(detailTarget.lateMinutes)})`}
                    </span>
                  )
                })()}
              </div>

              {detailTarget.notes && (
                <div>
                  <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Notas</p>
                  <p className="flex items-start gap-1.5 text-sm text-slate-700 dark:text-slate-200 text-justify">
                    <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    {detailTarget.notes}
                  </p>
                </div>
              )}
            </div>

            {/* Pie fijo */}
            <div className="shrink-0 flex items-center justify-end px-6 py-4 border-t border-slate-100 dark:border-slate-800">
              <button onClick={() => setDetailTarget(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteRecordTarget}
        title="¿Eliminar marcaje?"
        message={`El marcaje de "${deleteRecordTarget?.employeeName}" del ${formatDateShort(date + 'T00:00:00')} se eliminará permanentemente.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDeleteRecord}
        onCancel={() => setDeleteRecordTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteScheduleTarget}
        title="¿Eliminar horario?"
        message={`El horario "${deleteScheduleTarget?.name}" se eliminará permanentemente. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDeleteSchedule}
        onCancel={() => setDeleteScheduleTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteHolidayTarget}
        title="¿Eliminar feriado?"
        message={`El feriado "${deleteHolidayTarget?.name}" se eliminará permanentemente y volverá a contar como día laborable.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDeleteHoliday}
        onCancel={() => setDeleteHolidayTarget(null)}
      />
    </div>
  )
}
