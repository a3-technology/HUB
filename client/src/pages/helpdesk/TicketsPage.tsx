import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, Pencil, RefreshCw, LifeBuoy, TrendingUp, CheckCircle2, Clock, Trash2, Save, MessageSquare, UserPlus, UserCheck, Printer } from 'lucide-react'
import { ticketsApi, ticketCategoriesApi, prioritiesApi, ticketStatusesApi, employeeDirectoryApi } from '../../lib/api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Pagination, usePagination, type PageSize } from '../../components/Pagination'
import { SearchSelect, type SearchSelectOption } from '../../components/SearchSelect'
import { TicketComments } from '../../components/TicketComments'
import { TicketAttachments } from '../../components/TicketAttachments'
import { useToast } from '../../context/ToastContext'
import { useAuth } from '../../context/AuthContext'
import { useModalTransition } from '../../hooks/useModalTransition'
import { usePermission } from '../../hooks/usePermission'
import { SlaBadge } from '../../components/SlaBadge'
import { getSlaInfo } from '../../lib/sla'
import { ThSortFilter } from '../../components/ThSortFilter'
import { DateRangePicker } from '../../components/DateRangePicker'

interface Ticket {
  id: string
  code: string
  subject: string
  description?: string
  requesterId: string
  requesterName: string
  requesterPhotoUrl?: string
  assignedToId?: string
  assignedToName?: string
  assignedToPhotoUrl?: string
  categoryId: string
  categoryName: string
  priorityId: string
  priorityName: string
  priorityLevel: number
  priorityColor: string
  statusId: string
  status: string
  statusColorHex: string
  statusIsFinal: boolean
  statusRequiresResolution: boolean
  allowedNextStatusIds?: string
  resolution?: string
  resolvedAt?: string
  closedAt?: string
  firstResponseDueAt?: string
  resolutionDueAt?: string
  firstRespondedAt?: string
  isActive: boolean
  createdAt: string
}

interface TicketForm {
  subject: string
  description: string
  requesterId: string
  categoryId: string
  priorityId: string
  assignedToId: string
}

const EMPTY_FORM: TicketForm = { subject: '', description: '', requesterId: '', categoryId: '', priorityId: '', assignedToId: '' }

// Mismo intervalo que NotificationsBell — no hay push en tiempo real (SignalR/WS),
// así que la tabla se mantiene fresca por sondeo periódico.
const POLL_INTERVAL_MS = 30_000

interface TicketStatusOption {
  id: string
  name: string
  colorHex: string
  isFinal: boolean
  requiresResolution: boolean
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
}

/** Columnas de la tabla que admiten ordenamiento y filtrado. */
type TicketSortKey = 'code' | 'subject' | 'requester' | 'assignee' | 'priority' | 'status'

/** Valor textual de un ticket para la columna indicada (base para ordenar y filtrar). */
const colValue = (t: Ticket, key: TicketSortKey): string => {
  switch (key) {
    case 'code':      return t.code
    case 'subject':   return t.subject
    case 'requester': return t.requesterName
    case 'assignee':  return t.assignedToName ?? 'Sin asignar'
    case 'priority':  return t.priorityName
    case 'status':    return t.status
  }
}


export function TicketsPage() {
  const toast = useToast()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const canCreate = usePermission('helpdesk.tickets.create')
  const canUpdate = usePermission('helpdesk.tickets.update')
  const canChangeStatus = usePermission('helpdesk.tickets.change-status')
  const canDelete = usePermission('helpdesk.tickets.delete')
  // Ver todos los tickets (no solo los propios/sin asignar) y reasignar entre agentes.
  const canManageAll = usePermission('helpdesk.tickets.manage-all')

  const [tickets, setTickets]     = useState<Ticket[]>([])
  const [categories, setCategories] = useState<SearchSelectOption[]>([])
  const [priorities, setPriorities] = useState<SearchSelectOption[]>([])
  const [statuses, setStatuses]   = useState<TicketStatusOption[]>([])
  const [employees, setEmployees] = useState<SearchSelectOption[]>([])
  // Agentes reales del helpdesk (usuarios con el módulo asignado) — para el combo
  // de responsable; distinto de `employees`, que trae a toda la empresa (usado
  // solo para el campo "Solicitante").
  const [agents, setAgents] = useState<SearchSelectOption[]>([])
  const [claiming, setClaiming]   = useState<string | null>(null)
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')
  const [page, setPage]           = useState(1)
  const [pageSize, setPageSize]   = useState<PageSize>(10)

  // Orden y filtro por columna del encabezado (mismo patrón que EmpleadosPage).
  // El código es correlativo (TCK-0001…), así que ordenar por código desc
  // reproduce el orden por defecto "más reciente primero".
  const [sortKey, setSortKey]         = useState<TicketSortKey>('code')
  const [sortDir, setSortDir]         = useState<'asc' | 'desc'>('desc')
  const [columnFilters, setColumnFilters] = useState<Partial<Record<TicketSortKey, string[]>>>({})

  const handleSort = (key: TicketSortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
    setPage(1)
  }

  const setColumnFilter = (key: TicketSortKey, values: string[]) => {
    setColumnFilters(prev => ({ ...prev, [key]: values }))
    setPage(1)
  }

  /** Valores únicos de una columna (sobre todos los tickets) para el popover de filtro. */
  const filterOptions = (key: TicketSortKey) =>
    Array.from(new Set(tickets.map(t => colValue(t, key)))).sort((a, b) => a.localeCompare(b, 'es'))

  const [modalOpen, setModalOpen]       = useState(false)
  const [editing, setEditing]           = useState<Ticket | null>(null)
  const [form, setForm]                 = useState<TicketForm>(EMPTY_FORM)
  const [formError, setFormError]       = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Ticket | null>(null)
  const [detailTarget, setDetailTarget] = useState<Ticket | null>(null)
  const [assignTarget, setAssignTarget] = useState<Ticket | null>(null)
  const [assignValue, setAssignValue]   = useState('')
  const [assignError, setAssignError]   = useState<string | null>(null)
  const [assigning, setAssigning]       = useState(false)
  const [statusTarget, setStatusTarget]     = useState<Ticket | null>(null)
  const [statusValue, setStatusValue]       = useState('')
  const [resolutionValue, setResolutionValue] = useState('')
  const [statusError, setStatusError]       = useState<string | null>(null)
  const [changingStatus, setChangingStatus] = useState(false)

  // "Mío" = soy el solicitante: solo así se puede editar el contenido, agregar
  // adjuntos, o se muestra el botón de editar en la tabla. Ser el responsable
  // asignado NO alcanza (a pedido explícito del usuario) — un agente asignado
  // que no generó el ticket puede verlo, comentarlo y trabajarlo, pero no
  // tocar su contenido ni sus adjuntos; si necesita corregir algo lo hace vía
  // comentario. Importante: si el usuario no tiene empleado vinculado (ej.
  // una cuenta de Administrador sin ficha de RR. HH.), nunca es "mío".
  const isMine = (t: Ticket) =>
    !!user?.employeeId && t.requesterId === user.employeeId
  const { mounted: modalMounted, closing: modalClosing } = useModalTransition(modalOpen)
  const { mounted: detailMounted, closing: detailClosing } = useModalTransition(!!detailTarget)
  const { mounted: assignMounted, closing: assignClosing } = useModalTransition(!!assignTarget)
  const { mounted: statusMounted, closing: statusClosing } = useModalTransition(!!statusTarget)

  const load = async (silent = false): Promise<Ticket[]> => {
    silent ? setRefreshing(true) : setLoading(true)
    try {
      const res = await ticketsApi.list()
      if (res.ok) {
        const data: Ticket[] = await res.json()
        setTickets(data)
        return data
      }
      return []
    } finally {
      silent ? setRefreshing(false) : setLoading(false)
    }
  }

  const loadOptions = async () => {
    const [catRes, prioRes, statusRes, empRes, agentsRes] = await Promise.all([
      ticketCategoriesApi.list({ active: true }), prioritiesApi.list({ active: true }), ticketStatusesApi.list({ active: true }),
      employeeDirectoryApi.list(), ticketsApi.agents(),
    ])
    if (catRes.ok) {
      const data = await catRes.json()
      setCategories(data.map((c: { id: string; name: string }) => ({ value: c.id, label: c.name })))
    }
    if (prioRes.ok) {
      const data = await prioRes.json()
      setPriorities(data.map((p: { id: string; name: string }) => ({ value: p.id, label: p.name })))
    }
    if (statusRes.ok) {
      const data = await statusRes.json()
      setStatuses(data.map((s: { id: string; name: string; colorHex: string; isFinal: boolean; requiresResolution: boolean }) =>
        ({ id: s.id, name: s.name, colorHex: s.colorHex, isFinal: s.isFinal, requiresResolution: s.requiresResolution })))
    }
    if (empRes.ok) {
      const data = await empRes.json()
      setEmployees(data.map((e: { id: string; firstName: string; lastName: string; photoUrl?: string }) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, photoUrl: e.photoUrl })))
    }
    if (agentsRes.ok) {
      const data = await agentsRes.json()
      setAgents(data.map((a: { id: string; firstName: string; lastName: string; photoUrl?: string }) => ({ value: a.id, label: `${a.firstName} ${a.lastName}`, photoUrl: a.photoUrl })))
    }
  }

  useEffect(() => { load() }, [])

  // Refresco silencioso periódico: si a este agente le revocan un ticket (u otro
  // agente/supervisor cambia algo) mientras tiene la pantalla abierta, la tabla
  // se pone al día sola —sin que tenga que hacer clic en la notificación ni en
  // "Actualizar"— evitando que siga viendo (y accionando sobre) un registro que
  // hd.SP_GetTickets ya no le devolvería. Mismo intervalo que NotificationsBell.
  useEffect(() => {
    const interval = setInterval(() => {
      load(true).then(data => {
        setDetailTarget(prev => prev ? (data.find(t => t.id === prev.id) ?? prev) : prev)
      })
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  const clearTicketParam = () => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('ticketId')
      return next
    }, { replace: true })
  }

  // Evita reintentar en loop la misma notificación mientras se refresca.
  const triedTicketRef = useRef<string | null>(null)

  // Llegó desde una notificación (?ticketId=...): refresca la tabla SIEMPRE antes
  // de abrir el detalle (no confiar en la lista local, que puede estar desactualizada
  // — ej. la notificación es justo el aviso de que este ticket cambió, como una
  // asignación, y el estado en memoria todavía tiene los datos viejos) y abre el
  // detalle ya con los datos frescos. Reacciona tanto a la carga inicial como a un
  // cambio de parámetro con la página ya montada (ej. dos notificaciones seguidas).
  useEffect(() => {
    const ticketId = searchParams.get('ticketId')
    if (!ticketId || loading) return
    if (triedTicketRef.current === ticketId) return
    triedTicketRef.current = ticketId

    load(true).then(data => {
      const found = data.find(t => t.id === ticketId)
      if (found) setDetailTarget(found)
      clearTicketParam()
      // Libera el guard: si se vuelve a hacer clic en la misma notificación más
      // tarde, debe poder refrescar y abrir de nuevo, no quedar ignorado.
      triedTicketRef.current = null
    })
  }, [searchParams, loading])
  useEffect(() => { loadOptions() }, [])

  const TICKET_PDF_WIDTH = 226 // 80mm: ancho estándar de ticket/factura, no una hoja completa

  /** Dibuja el contenido del ticket sobre un documento jsPDF ya creado (ancho
   *  fijo de 80mm, alto = el que tenga el documento) y devuelve el cursor Y
   *  final. Se llama dos veces: una para medir cuánto contenido hay (con un
   *  alto de sobra) y otra, ya con el alto real calculado, para el PDF final.
   *  IMPORTANTE: nunca redimensionar la página después de dibujar — jsPDF ya
   *  calculó las coordenadas absolutas contra el alto vigente en ese momento;
   *  achicarla después deja el texto fuera del área visible (página en blanco). */
  const drawTicketContent = (pdf: import('jspdf').jsPDF, t: Ticket, qrDataUrl: string) => {
    const marginX = 14
    const contentW = TICKET_PDF_WIDTH - marginX * 2
    let y = 28

    const dashedLine = () => {
      pdf.setDrawColor(180, 180, 180)
      pdf.setLineDashPattern([2, 2], 0)
      pdf.line(marginX, y, TICKET_PDF_WIDTH - marginX, y)
      pdf.setLineDashPattern([], 0)
      y += 16
    }

    const field = (label: string, value: string) => {
      pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(8); pdf.setTextColor(100, 116, 139)
      pdf.text(label.toUpperCase(), TICKET_PDF_WIDTH / 2, y, { align: 'center' })
      y += 11
      pdf.setFont('NotoSans', 'normal'); pdf.setFontSize(10); pdf.setTextColor(15, 23, 42)
      const lines: string[] = pdf.splitTextToSize(value || '—', contentW)
      pdf.text(lines, TICKET_PDF_WIDTH / 2, y, { align: 'center' })
      y += lines.length * 12 + 10
    }

    pdf.setFont('NotoSans', 'bold'); pdf.setFontSize(13); pdf.setTextColor(15, 23, 42)
    pdf.text('Ticket de Soporte', TICKET_PDF_WIDTH / 2, y, { align: 'center' })
    y += 20
    dashedLine()

    field('Ticket', t.code)
    field('Fecha', fmtDateTime(t.createdAt))
    field('Empleado', t.requesterName)
    field('Problema', t.description ? `${t.subject}\n${t.description}` : t.subject)
    if (t.resolution) field('Solución', t.resolution)

    dashedLine()
    field('Técnico', t.assignedToName ?? 'Sin asignar')
    field('Estado', t.status)

    dashedLine()
    const qrSize = 90
    pdf.addImage(qrDataUrl, 'PNG', (TICKET_PDF_WIDTH - qrSize) / 2, y, qrSize, qrSize)
    y += qrSize + 12

    return y
  }

  /** Construye el PDF del ticket en formato angosto de ticket de factura (80mm),
   *  con jsPDF (importado bajo demanda) — mismo patrón que la ficha de empleado.
   *  El QR codifica la URL del ticket dentro de la app (mismo deep-link que ya
   *  usan las notificaciones vía ?ticketId=). */
  const buildTicketPdf = async (t: Ticket) => {
    const { jsPDF } = await import('jspdf')
    // Fuente Noto Sans para cubrir tildes/ñ; ver EmpleadosPage.tsx para el detalle
    // de por qué las fuentes base de jsPDF no alcanzan.
    ;(window as unknown as { jspdf: { jsPDF: typeof jsPDF } }).jspdf = { jsPDF }
    await import('../../lib/fonts/NotoSans-jsPDF.js')

    const QRCode = await import('qrcode')
    const ticketUrl = `${window.location.origin}/helpdesk/tickets?ticketId=${t.id}`
    const qrDataUrl = await QRCode.toDataURL(ticketUrl, { margin: 0, width: 256 })

    // Pasada de medición: alto de sobra (hasta ~2000 caracteres en Problema y
    // Solución), se descarta y solo se usa el cursor Y final que devuelve.
    const measuring = new jsPDF({ unit: 'pt', format: [TICKET_PDF_WIDTH, 3000] })
    const contentHeight = drawTicketContent(measuring, t, qrDataUrl)

    // Pasada final: ya con el alto real, se dibuja de nuevo desde cero.
    const pdf = new jsPDF({ unit: 'pt', format: [TICKET_PDF_WIDTH, contentHeight] })
    drawTicketContent(pdf, t, qrDataUrl)

    return pdf
  }

  /** Imprime el ticket sin salir de la pantalla actual: en vez de abrir una
   *  pestaña nueva, carga el PDF en un iframe oculto y dispara el diálogo de
   *  impresión nativo del navegador sobre ese iframe. */
  const printTicket = async (t: Ticket) => {
    try {
      const pdf = await buildTicketPdf(t)
      const url = URL.createObjectURL(pdf.output('blob'))

      const iframe = document.createElement('iframe')
      iframe.style.position = 'fixed'
      iframe.style.width = '0'
      iframe.style.height = '0'
      iframe.style.border = 'none'
      iframe.src = url
      iframe.onload = () => {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
      }
      document.body.appendChild(iframe)

      // Limpieza diferida: le da tiempo al diálogo de impresión a abrirse antes
      // de quitar el iframe y liberar el blob.
      setTimeout(() => {
        document.body.removeChild(iframe)
        URL.revokeObjectURL(url)
      }, 60_000)
    } catch {
      toast.error('No se pudo generar el ticket para imprimir.')
    }
  }

  const handleSearch = (value: string) => { setSearch(value); setPage(1) }

  const filtered = tickets
    .filter(t => t.code.toLowerCase().includes(search.toLowerCase()) || t.subject.toLowerCase().includes(search.toLowerCase()))
    .filter(t => !statusFilter || t.statusId === statusFilter)
    .filter(t => !dateFrom || t.createdAt.slice(0, 10) >= dateFrom)
    .filter(t => !dateTo || t.createdAt.slice(0, 10) <= dateTo)
    .filter(t =>
      (Object.entries(columnFilters) as [TicketSortKey, string[]][])
        .every(([key, values]) => values.length === 0 || values.includes(colValue(t, key)))
    )
    .sort((a, b) => {
      const cmp = colValue(a, sortKey).localeCompare(colValue(b, sortKey), 'es', { numeric: true, sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
  const paginated = usePagination(filtered, page, pageSize)

  const statusFilterOptions: SearchSelectOption[] = statuses.map(s => ({ value: s.id, label: s.name }))
  const statusRequiresResolution = (statusId: string) => statuses.find(s => s.id === statusId)?.requiresResolution ?? false

  const now = new Date()
  const stats = [
    { label: 'Total tickets',   value: String(tickets.length), icon: LifeBuoy, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-500/10' },
    { label: 'Abiertos',        value: String(tickets.filter(t => !t.statusIsFinal).length), icon: Clock, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10' },
    { label: 'Resueltos este mes', value: String(tickets.filter(t => { if (!t.resolvedAt) return false; const d = new Date(t.resolvedAt); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() }).length), icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
    { label: 'Nuevos este mes', value: String(tickets.filter(t => { const d = new Date(t.createdAt); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() }).length), icon: TrendingUp, color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-500/10' },
  ]

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setFormError(null); setModalOpen(true) }
  const openEdit   = (t: Ticket) => {
    setEditing(t)
    setForm({
      subject: t.subject, description: t.description ?? '', requesterId: t.requesterId,
      categoryId: t.categoryId, priorityId: t.priorityId, assignedToId: '',
    })
    setFormError(null); setModalOpen(true)
  }
  const closeModal = () => { setModalOpen(false); setEditing(null); setFormError(null) }

  const handleSave = async () => {
    if (!form.subject.trim()) { setFormError('El asunto es requerido.'); return }
    if (!editing && !form.requesterId) { setFormError('El solicitante es requerido.'); return }
    if (!form.categoryId) { setFormError('La categoría es requerida.'); return }
    if (!form.priorityId) { setFormError('La prioridad es requerida.'); return }
    setSaving(true); setFormError(null)
    try {
      // La asignación ya no viaja en la edición de contenido (ver hd.SP_AssignTicket/
      // hd.SP_ClaimTicket) — al crear sí se puede asignar directamente si tenés manage-all.
      const res = editing
        ? await ticketsApi.update(editing.id, {
            subject: form.subject.trim(), description: form.description.trim() || undefined,
            categoryId: form.categoryId, priorityId: form.priorityId,
          })
        : await ticketsApi.create({
            subject: form.subject.trim(), description: form.description.trim() || undefined,
            requesterId: form.requesterId, categoryId: form.categoryId, priorityId: form.priorityId,
            assignedToId: form.assignedToId || undefined,
          })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar.' }))
        setFormError(err.message); toast.error(err.message); return
      }
      toast.success(editing ? 'Ticket actualizado correctamente.' : 'Ticket creado correctamente.')
      closeModal(); await load()
    } finally { setSaving(false) }
  }

  const handleChangeStatus = async (t: Ticket, statusId: string, resolution?: string): Promise<boolean> => {
    const res = await ticketsApi.changeStatus(t.id, statusId, resolution)
    if (res.ok) {
      toast.success('Estado actualizado correctamente.')
      const data = await load(true)
      setDetailTarget(prev => prev ? (data.find(x => x.id === prev.id) ?? prev) : prev)
      return true
    }
    const err = await res.json().catch(() => ({ message: 'No se pudo cambiar el estado.' }))
    toast.error(err.message)
    return false
  }

  const openAssign = (t: Ticket) => { setAssignTarget(t); setAssignValue(t.assignedToId ?? ''); setAssignError(null) }
  const closeAssign = () => { setAssignTarget(null); setAssignValue(''); setAssignError(null) }

  const openStatusChange = (t: Ticket) => {
    setStatusTarget(t); setStatusValue(t.statusId); setResolutionValue(t.resolution ?? ''); setStatusError(null)
  }
  const closeStatusChange = () => {
    setStatusTarget(null); setStatusValue(''); setResolutionValue(''); setStatusError(null)
  }

  const handleStatusSave = async () => {
    if (!statusTarget) return
    if (statusRequiresResolution(statusValue) && !resolutionValue.trim()) {
      setStatusError('Indicá la solución para marcar el ticket en este estado.')
      return
    }
    setChangingStatus(true); setStatusError(null)
    try {
      const ok = await handleChangeStatus(statusTarget, statusValue, statusRequiresResolution(statusValue) ? resolutionValue.trim() : undefined)
      if (ok) closeStatusChange()
    } finally { setChangingStatus(false) }
  }

  const handleAssignSave = async () => {
    if (!assignTarget) return
    // Un ticket nunca puede quedar sin responsable desde acá — reasignar es
    // pasarlo a OTRO agente, no soltarlo al aire; para eso no hay acción.
    if (!assignValue) { setAssignError('Elegí un agente para asignar este ticket.'); return }
    setAssigning(true); setAssignError(null)
    try {
      const res = await ticketsApi.assign(assignTarget.id, assignValue)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'No se pudo asignar el responsable.' }))
        setAssignError(err.message); toast.error(err.message); return
      }
      toast.success('Responsable asignado correctamente.')
      closeAssign()
      const data = await load()
      setDetailTarget(prev => prev ? (data.find(x => x.id === prev.id) ?? prev) : prev)
    } finally { setAssigning(false) }
  }

  // Tomar un ticket sin asignar — no requiere manage-all. Una vez tomado, el
  // propio agente no puede soltarlo: si hay que cambiar de responsable, lo
  // hace un supervisor con "Asignar" (nunca deja el ticket sin nadie).
  const handleTakeTicket = async (t: Ticket) => {
    setClaiming(t.id)
    try {
      const res = await ticketsApi.claim(t.id)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'No se pudo tomar el ticket.' }))
        toast.error(err.message); return
      }
      toast.success('Ticket tomado correctamente.')
      const data = await load(true)
      setDetailTarget(prev => prev ? (data.find(x => x.id === prev.id) ?? prev) : prev)
    } finally { setClaiming(null) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await ticketsApi.remove(deleteTarget.id)
      if (res.ok) { toast.success('Ticket eliminado correctamente.'); await load() }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar el ticket.' }))
        toast.error(err.message)
      }
    } finally { setDeleteTarget(null) }
  }

  const globalIndex = (i: number) =>
    pageSize === 'all' ? i + 1 : (page - 1) * (pageSize as number) + i + 1

  return (
    <div className="p-6 space-y-4">

      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Tickets</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : `${tickets.length} ticket(s) registrado(s)`}
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
          {canCreate && (
            <button
              onClick={openCreate}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nuevo ticket
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-4 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{loading ? '…' : s.value}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{s.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Búsqueda + filtro de estado */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1 min-w-0 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por código o asunto…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
          />
        </div>
        <div className="sm:w-64 shrink-0">
          <DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); setPage(1) }} />
        </div>
        <div className="sm:w-56 shrink-0">
          <SearchSelect options={statusFilterOptions} value={statusFilter} onChange={v => { setStatusFilter(v); setPage(1) }} placeholder="Todos los estados" />
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider w-12">#</th>
                <ThSortFilter label="Código" colKey="code" align="left"
                  activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort}
                  options={filterOptions('code')} selected={columnFilters.code ?? []} onFilterChange={setColumnFilter} />
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Fecha</th>
                <ThSortFilter label="Asunto" colKey="subject" align="left"
                  activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort}
                  options={filterOptions('subject')} selected={columnFilters.subject ?? []} onFilterChange={setColumnFilter} />
                <ThSortFilter label="Solicitante" colKey="requester" align="left"
                  activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort}
                  options={filterOptions('requester')} selected={columnFilters.requester ?? []} onFilterChange={setColumnFilter} />
                <ThSortFilter label="Responsable" colKey="assignee" align="left"
                  activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort}
                  options={filterOptions('assignee')} selected={columnFilters.assignee ?? []} onFilterChange={setColumnFilter} />
                <ThSortFilter label="Prioridad" colKey="priority" align="center"
                  activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort}
                  options={filterOptions('priority')} selected={columnFilters.priority ?? []} onFilterChange={setColumnFilter} />
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">SLA</th>
                <ThSortFilter label="Estado" colKey="status" align="center"
                  activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort}
                  options={filterOptions('status')} selected={columnFilters.status ?? []} onFilterChange={setColumnFilter} />
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50 dark:border-slate-700/40">
                    {[8, 20, 24, 32, 24, 24, 20, 20, 20, 24].map((w, j) => (
                      <td key={j} className="px-5 py-2">
                        <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" style={{ width: `${w * 4}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-5 py-16 text-center">
                    <LifeBuoy className="w-9 h-9 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">
                      {search || statusFilter || dateFrom || dateTo || Object.values(columnFilters).some(v => v && v.length > 0)
                        ? 'Sin resultados para el filtro aplicado.' : 'No hay tickets registrados.'}
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
                    <td className="px-5 py-2 text-slate-500 dark:text-slate-400 text-left align-middle font-mono text-xs">{t.code}</td>
                    <td className="px-5 py-2 text-slate-500 dark:text-slate-400 text-left align-middle text-xs">{fmtDateTime(t.createdAt)}</td>
                    <td className="px-5 py-2 text-left align-middle">
                      <button onClick={() => setDetailTarget(t)} className="font-semibold text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 text-left transition-colors">
                        {t.subject}
                      </button>
                      <p className="text-xs text-slate-400 truncate">{t.categoryName}</p>
                    </td>
                    <td className="px-5 py-2 text-slate-600 dark:text-slate-300 text-left align-middle">{t.requesterName}</td>
                    <td className="px-5 py-2 text-slate-600 dark:text-slate-300 text-left align-middle">{t.assignedToName ?? <span className="text-slate-300 dark:text-slate-600">Sin asignar</span>}</td>
                    <td className="px-5 py-2 text-center align-middle">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border" style={{ backgroundColor: `${t.priorityColor}1A`, borderColor: `${t.priorityColor}33`, color: t.priorityColor }}>
                        {t.priorityName}
                      </span>
                    </td>
                    <td className="px-5 py-2 text-center align-middle">
                      <SlaBadge ticket={t} />
                    </td>
                    <td className="px-5 py-2 text-center align-middle">
                      {canChangeStatus && !t.statusIsFinal ? (
                        <button
                          onClick={() => openStatusChange(t)}
                          className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border cursor-pointer hover:opacity-75 transition-opacity"
                          style={{ backgroundColor: `${t.statusColorHex}1A`, borderColor: `${t.statusColorHex}33`, color: t.statusColorHex }}
                        >
                          {t.status}
                        </button>
                      ) : (
                        <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border"
                          style={{ backgroundColor: `${t.statusColorHex}1A`, borderColor: `${t.statusColorHex}33`, color: t.statusColorHex }}>
                          {t.status}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2 align-middle">
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          onClick={() => setDetailTarget(t)}
                          title="Comentarios y adjuntos"
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                        {canUpdate && (isMine(t) || canManageAll) && !t.statusIsFinal && (
                          <button
                            onClick={() => openEdit(t)}
                            title="Editar"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canUpdate && !!user?.employeeId && user.employeeId !== t.requesterId && !t.assignedToId && !t.statusIsFinal && (
                          <button
                            onClick={() => handleTakeTicket(t)}
                            disabled={claiming === t.id}
                            title="Tomar ticket"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 disabled:opacity-50 transition-colors"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canManageAll && !t.statusIsFinal && (
                          <button
                            onClick={() => openAssign(t)}
                            title="Asignar responsable"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => printTicket(t)}
                          title="Imprimir"
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        {canDelete && !t.statusIsFinal && (
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

      {/* Modal crear / editar */}
      {modalMounted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${modalClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden ${modalClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <div className="px-6 pt-6 shrink-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
                {editing ? `Editar Ticket ${editing.code}` : 'Nuevo Ticket'}
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Asunto <span className="text-red-500">*</span></label>
                  <input type="text" maxLength={200} placeholder="Ej: No enciende el monitor" value={form.subject}
                    onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Descripción</label>
                  <textarea rows={3} maxLength={2000} placeholder="Detalle del problema o solicitud…" value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none" />
                </div>

                {!editing && (
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Solicitante <span className="text-red-500">*</span></label>
                    <SearchSelect options={employees} value={form.requesterId}
                      onChange={v => setForm(f => ({ ...f, requesterId: v, assignedToId: f.assignedToId === v ? '' : f.assignedToId }))}
                      placeholder="Selecciona un empleado…" searchPlaceholder="Buscar empleado…" showAvatar />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Categoría <span className="text-red-500">*</span></label>
                    <SearchSelect options={categories} value={form.categoryId} onChange={v => setForm(f => ({ ...f, categoryId: v }))} placeholder="Selecciona…" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Prioridad <span className="text-red-500">*</span></label>
                    <SearchSelect options={priorities} value={form.priorityId} onChange={v => setForm(f => ({ ...f, priorityId: v }))} placeholder="Selecciona…" />
                  </div>
                </div>

                {/* Asignar directamente al crear es una acción de supervisor (manage-all);
                    el resto crea el ticket sin asignar y luego lo toma con "Tomar ticket". */}
                {!editing && canManageAll && (
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Responsable asignado</label>
                    <SearchSelect options={agents.filter(a => a.value !== form.requesterId)} value={form.assignedToId} onChange={v => setForm(f => ({ ...f, assignedToId: v }))} placeholder="Sin asignar…" searchPlaceholder="Buscar agente…" showAvatar />
                  </div>
                )}

                {formError && (
                  <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                    {formError}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button onClick={closeModal} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
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

      {/* Modal de detalle: comentarios y adjuntos */}
      {detailMounted && detailTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${detailClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden ${detailClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <div className="px-6 pt-6 shrink-0">
              <div className="flex items-start justify-between gap-3 mb-1">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{detailTarget.subject}</h2>
                {canChangeStatus && !detailTarget.statusIsFinal ? (
                  <button
                    onClick={() => openStatusChange(detailTarget)}
                    className="shrink-0 inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border cursor-pointer hover:opacity-75 transition-opacity"
                    style={{ backgroundColor: `${detailTarget.statusColorHex}1A`, borderColor: `${detailTarget.statusColorHex}33`, color: detailTarget.statusColorHex }}
                  >
                    {detailTarget.status}
                  </button>
                ) : (
                  <span className="shrink-0 inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border"
                    style={{ backgroundColor: `${detailTarget.statusColorHex}1A`, borderColor: `${detailTarget.statusColorHex}33`, color: detailTarget.statusColorHex }}>
                    {detailTarget.status}
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500">{detailTarget.code} · {detailTarget.categoryName} · Solicita {detailTarget.requesterName}</p>
              <div className="flex items-center justify-between gap-3 mb-4 mt-1.5">
                <p className="text-sm text-slate-500 flex items-center gap-2">
                  Responsable: {detailTarget.assignedToName ?? <span className="text-slate-400">Sin asignar</span>}
                  {getSlaInfo(detailTarget) && <SlaBadge ticket={detailTarget} />}
                </p>
                <div className="shrink-0 flex items-center gap-3">
                  {canUpdate && !!user?.employeeId && user.employeeId !== detailTarget.requesterId && !detailTarget.assignedToId && !detailTarget.statusIsFinal && (
                    <button onClick={() => handleTakeTicket(detailTarget)} disabled={claiming === detailTarget.id}
                      className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 disabled:opacity-50 transition-colors">
                      <UserCheck className="w-3.5 h-3.5" />
                      Tomar
                    </button>
                  )}
                  {canManageAll && !detailTarget.statusIsFinal && (
                    <button onClick={() => openAssign(detailTarget)}
                      className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">
                      <UserPlus className="w-3.5 h-3.5" />
                      Asignar
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-1 space-y-5 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent]">
              {detailTarget.description && (
                <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-lg px-3 py-2.5">
                  {detailTarget.description}
                </p>
              )}

              {detailTarget.resolution && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Solución</label>
                  <p className="text-sm text-emerald-700 dark:text-emerald-400 whitespace-pre-wrap bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-lg px-3 py-2.5">
                    {detailTarget.resolution}
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Adjuntos</label>
                <TicketAttachments ticketId={detailTarget.id} canUpload={isMine(detailTarget)} locked={detailTarget.statusIsFinal} />
              </div>

              <div className="space-y-1.5 pb-4">
                <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Comentarios</label>
                <TicketComments ticketId={detailTarget.id} locked={detailTarget.statusIsFinal} />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button onClick={() => printTicket(detailTarget)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                <Printer className="w-3.5 h-3.5" />
                Imprimir
              </button>
              <button onClick={() => setDetailTarget(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de acciones: asignar responsable (solo manage-all) */}
      {assignMounted && assignTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${assignClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-sm max-h-[90vh] flex flex-col overflow-hidden ${assignClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <div className="px-6 pt-6 shrink-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">Asignar responsable</h2>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-1 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Responsable asignado <span className="text-red-500">*</span></label>
                <SearchSelect options={agents.filter(a => a.value !== assignTarget.requesterId)} value={assignValue} onChange={setAssignValue} placeholder="Selecciona un agente…" searchPlaceholder="Buscar agente…" showAvatar />
              </div>

              {assignError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {assignError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0 mt-4">
              <button onClick={closeAssign} disabled={assigning}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleAssignSave} disabled={assigning}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {assigning
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Save className="w-3.5 h-3.5" />}
                {assigning ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de cambio de estado */}
      {statusMounted && statusTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${statusClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-sm max-h-[90vh] flex flex-col overflow-hidden ${statusClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <div className="px-6 pt-6 shrink-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">Cambiar estado</h2>
              <p className="text-sm text-slate-500 mb-4">{statusTarget.code} · {statusTarget.subject}</p>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-1 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Estado</label>
                {/* Solo se ofrecen las transiciones permitidas desde el estado actual
                    (hd.TicketStatusTransitions), más el propio estado — evita ofrecer una
                    acción que el backend va a rechazar. */}
                <SearchSelect
                  options={statuses
                    .filter(s => {
                      // Comparación insensible a mayúsculas: SQL Server devuelve los Guid
                      // en MAYÚSCULAS al convertirlos a texto, mientras .NET los serializa
                      // en minúsculas — sin esto, el filtro nunca coincidía.
                      const allowed = (statusTarget.allowedNextStatusIds ?? '').toLowerCase().split(',')
                      return s.id === statusTarget.statusId || allowed.includes(s.id.toLowerCase())
                    })
                    .map(s => ({ value: s.id, label: s.name }))}
                  value={statusValue} onChange={setStatusValue} placeholder="Selecciona…"
                />
              </div>

              {statusRequiresResolution(statusValue) && (
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Solución <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={3} maxLength={2000} placeholder="Describí cómo se resolvió el ticket…"
                    value={resolutionValue}
                    onChange={e => setResolutionValue(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none"
                  />
                </div>
              )}

              {statusError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {statusError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0 mt-4">
              <button onClick={closeStatusChange} disabled={changingStatus}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleStatusSave} disabled={changingStatus || statusValue === statusTarget.statusId}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {changingStatus
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Save className="w-3.5 h-3.5" />}
                {changingStatus ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}


      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar ticket?"
        message={`El ticket "${deleteTarget?.code}" y sus comentarios/adjuntos se eliminarán permanentemente. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
