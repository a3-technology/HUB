import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Pencil, ToggleLeft, ToggleRight, RefreshCw, Target, List, Kanban, Trash2, Save, TrendingUp, DollarSign, CheckCircle2 } from 'lucide-react'
import { opportunitiesApi, clientsApi, contactsApi, employeeDirectoryApi } from '../../lib/api'
import { fmtMoneyRounded } from '../../lib/format'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Pagination, usePagination, type PageSize } from '../../components/Pagination'
import { SearchSelect, type SearchSelectOption } from '../../components/SearchSelect'
import { DatePicker } from '../../components/DatePicker'
import { useToast } from '../../context/ToastContext'
import { useModalTransition } from '../../hooks/useModalTransition'
import { usePermission } from '../../hooks/usePermission'

interface Opportunity {
  id: string
  clientId: string
  clientName: string
  contactId?: string
  contactName?: string
  name: string
  stage: string
  value?: number
  probability: number
  expectedCloseDate?: string
  ownerId?: string
  ownerName?: string
  ownerPhotoUrl?: string
  notes?: string
  isActive: boolean
  createdAt: string
  updatedAt?: string
}

interface OpportunityForm {
  clientId: string
  contactId: string
  name: string
  stage: string
  value: string
  probability: string
  expectedCloseDate: string
  ownerId: string
  notes: string
}

const EMPTY_FORM: OpportunityForm = {
  clientId: '', contactId: '', name: '', stage: 'Prospecting', value: '', probability: '0',
  expectedCloseDate: '', ownerId: '', notes: '',
}

const VIEW_MODE_KEY = 'crm_oportunidades_view_mode'
function loadViewMode(): 'list' | 'kanban' {
  return localStorage.getItem(VIEW_MODE_KEY) === 'list' ? 'list' : 'kanban'
}

const STAGE_OPTIONS: SearchSelectOption[] = [
  { value: 'Prospecting',  label: 'Prospección'  },
  { value: 'Qualification', label: 'Calificación' },
  { value: 'Proposal',     label: 'Propuesta'    },
  { value: 'Negotiation',  label: 'Negociación'  },
  { value: 'Won',          label: 'Ganada'       },
  { value: 'Lost',         label: 'Perdida'      },
]

const STAGE_STYLES: Record<string, string> = {
  Prospecting:  'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600',
  Qualification: 'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-100 dark:border-sky-500/20',
  Proposal:     'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-500/20',
  Negotiation:  'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-100 dark:border-violet-500/20',
  Won:          'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20',
  Lost:         'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-100 dark:border-red-500/20',
}

/** Fondo de cada columna del Kanban, un tono muy tenue del color de su etapa. */
const STAGE_COLUMN_BG: Record<string, string> = {
  Prospecting:  'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700',
  Qualification: 'bg-sky-50/60 dark:bg-sky-500/[0.06] border-sky-100 dark:border-sky-500/20',
  Proposal:     'bg-amber-50/60 dark:bg-amber-500/[0.06] border-amber-100 dark:border-amber-500/20',
  Negotiation:  'bg-violet-50/60 dark:bg-violet-500/[0.06] border-violet-100 dark:border-violet-500/20',
  Won:          'bg-emerald-50/60 dark:bg-emerald-500/[0.06] border-emerald-100 dark:border-emerald-500/20',
  Lost:         'bg-red-50/60 dark:bg-red-500/[0.06] border-red-100 dark:border-red-500/20',
}

function optionLabel(options: SearchSelectOption[], value: string) {
  return options.find(o => o.value === value)?.label ?? value
}

/** Iniciales a partir de un nombre completo (p. ej. "Lester Díaz" → "LD"). */
function initials(name?: string) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
}

/** Avatar del ejecutivo asignado: muestra su foto si existe; si no, sus iniciales. */
function OwnerAvatar({ name, photoUrl }: { name?: string; photoUrl?: string }) {
  return photoUrl ? (
    <img
      src={photoUrl}
      alt={name}
      className="w-5 h-5 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700"
    />
  ) : (
    <div className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[9px] font-bold shrink-0">
      {initials(name)}
    </div>
  )
}

export function OportunidadesPage() {
  const toast = useToast()

  const canCreate = usePermission('crm.opportunities.create')
  const canUpdate = usePermission('crm.opportunities.update')
  const canToggle = usePermission('crm.opportunities.toggle')
  const canDelete = usePermission('crm.opportunities.delete')

  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [clientList, setClientList] = useState<SearchSelectOption[]>([])
  const [employees, setEmployees]   = useState<SearchSelectOption[]>([])
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch]       = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [page, setPage]           = useState(1)
  const [pageSize, setPageSize]   = useState<PageSize>(10)
  const [viewMode, setViewModeState] = useState<'list' | 'kanban'>(loadViewMode)
  const setViewMode = (mode: 'list' | 'kanban') => { setViewModeState(mode); localStorage.setItem(VIEW_MODE_KEY, mode) }
  const [draggedId, setDraggedId] = useState<string | null>(null)

  const [modalOpen, setModalOpen]       = useState(false)
  const [editing, setEditing]           = useState<Opportunity | null>(null)
  const [form, setForm]                 = useState<OpportunityForm>(EMPTY_FORM)
  const [formError, setFormError]       = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)
  const [toggleTarget, setToggleTarget] = useState<Opportunity | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Opportunity | null>(null)
  const { mounted: modalMounted, closing: modalClosing } = useModalTransition(modalOpen)

  const load = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true)
    try {
      const res = await opportunitiesApi.list()
      if (res.ok) setOpportunities(await res.json())
    } finally {
      silent ? setRefreshing(false) : setLoading(false)
    }
  }

  const loadOptions = async () => {
    const [clRes, empRes] = await Promise.all([clientsApi.list(), employeeDirectoryApi.list()])
    if (clRes.ok) {
      const data = await clRes.json()
      setClientList(data.map((c: { id: string; name: string }) => ({ value: c.id, label: c.name })))
    }
    if (empRes.ok) {
      const data = await empRes.json()
      setEmployees(data.map((e: { id: string; firstName: string; lastName: string; photoUrl?: string }) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, photoUrl: e.photoUrl })))
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => { loadOptions() }, [])

  // Solo los contactos del cliente elegido pueden asociarse a la oportunidad.
  const [clientContacts, setClientContacts] = useState<SearchSelectOption[]>([])
  useEffect(() => {
    if (!form.clientId) { setClientContacts([]); return }
    let cancelled = false
    contactsApi.list({ clientId: form.clientId, active: true }).then(async res => {
      if (!res.ok || cancelled) return
      const data: { id: string; firstName: string; lastName: string }[] = await res.json()
      setClientContacts(data.map(c => ({ value: c.id, label: `${c.firstName} ${c.lastName}` })))
    })
    return () => { cancelled = true }
  }, [form.clientId])

  const handleSearch = (value: string) => { setSearch(value); setPage(1) }

  const filtered = opportunities
    .filter(o => o.name.toLowerCase().includes(search.toLowerCase()))
    .filter(o => !clientFilter || o.clientId === clientFilter)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const paginated = usePagination(filtered, page, pageSize)

  const now = new Date()
  const openOpportunities = opportunities.filter(o => o.stage !== 'Won' && o.stage !== 'Lost')
  const stats = [
    { label: 'Total oportunidades', value: String(opportunities.length), icon: Target, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-500/10' },
    { label: 'Abiertas', value: String(openOpportunities.length), icon: TrendingUp, color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-500/10' },
    { label: 'Ganadas este mes', value: String(opportunities.filter(o => { if (o.stage !== 'Won') return false; const d = new Date(o.updatedAt ?? o.createdAt); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() }).length), icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
    { label: 'Valor en pipeline', value: fmtMoneyRounded(openOpportunities.reduce((sum, o) => sum + (o.value ?? 0), 0)), icon: DollarSign, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-500/10' },
  ]

  const toFormDate = (d?: string) => d ? d.slice(0, 10) : ''

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY_FORM, clientId: clientFilter }); setFormError(null); setModalOpen(true) }
  const openEdit   = (o: Opportunity) => {
    setEditing(o)
    setForm({
      clientId: o.clientId, contactId: o.contactId ?? '', name: o.name, stage: o.stage,
      value: o.value != null ? String(o.value) : '', probability: String(o.probability),
      expectedCloseDate: toFormDate(o.expectedCloseDate), ownerId: o.ownerId ?? '', notes: o.notes ?? '',
    })
    setFormError(null); setModalOpen(true)
  }
  const closeModal = () => { setModalOpen(false); setEditing(null); setFormError(null) }

  const handleSave = async () => {
    if (!form.clientId) { setFormError('El cliente es requerido.'); return }
    if (!form.name.trim()) { setFormError('El nombre es requerido.'); return }
    setSaving(true); setFormError(null)
    try {
      const payload = {
        clientId: form.clientId,
        contactId: form.contactId || undefined,
        name: form.name.trim(),
        stage: form.stage,
        value: form.value ? Number(form.value) : undefined,
        probability: Number(form.probability) || 0,
        expectedCloseDate: form.expectedCloseDate || undefined,
        ownerId: form.ownerId || undefined,
        notes: form.notes.trim() || undefined,
      }
      const res = editing
        ? await opportunitiesApi.update(editing.id, payload)
        : await opportunitiesApi.create(payload)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar.' }))
        setFormError(err.message); toast.error(err.message); return
      }
      toast.success(editing ? 'Oportunidad actualizada correctamente.' : 'Oportunidad creada correctamente.')
      closeModal(); await load()
    } finally { setSaving(false) }
  }

  const handleToggle = async () => {
    if (!toggleTarget) return
    const wasActive = toggleTarget.isActive
    try {
      const res = await opportunitiesApi.toggle(toggleTarget.id)
      if (res.ok) { toast.success(wasActive ? 'Oportunidad desactivada.' : 'Oportunidad activada.'); await load() }
      else toast.error('No se pudo cambiar el estado de la oportunidad.')
    } finally { setToggleTarget(null) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await opportunitiesApi.remove(deleteTarget.id)
      if (res.ok) { toast.success('Oportunidad eliminada correctamente.'); await load() }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar la oportunidad.' }))
        toast.error(err.message)
      }
    } finally { setDeleteTarget(null) }
  }

  const globalIndex = (i: number) =>
    pageSize === 'all' ? i + 1 : (page - 1) * (pageSize as number) + i + 1

  /** Suelta una tarjeta en una columna del Kanban: cambia la etapa, con reversión si falla. */
  const handleDrop = async (stage: string) => {
    const oppId = draggedId
    setDraggedId(null)
    if (!oppId) return
    const opp = opportunities.find(o => o.id === oppId)
    if (!opp || opp.stage === stage) return
    const prevStage = opp.stage
    setOpportunities(os => os.map(o => (o.id === oppId ? { ...o, stage } : o)))
    const payload = {
      clientId: opp.clientId, contactId: opp.contactId, name: opp.name, stage,
      value: opp.value, probability: opp.probability, expectedCloseDate: opp.expectedCloseDate,
      ownerId: opp.ownerId, notes: opp.notes,
    }
    const res = await opportunitiesApi.update(oppId, payload)
    if (!res.ok) {
      setOpportunities(os => os.map(o => (o.id === oppId ? { ...o, stage: prevStage } : o)))
      const err = await res.json().catch(() => ({ message: 'No se pudo mover la oportunidad.' }))
      toast.error(err.message)
    }
  }

  const kanbanGroups = useMemo(() => STAGE_OPTIONS.map(s => ({ ...s, items: filtered.filter(o => o.stage === s.value) })), [filtered])

  return (
    <div className="p-6 space-y-4">

      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Oportunidades</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : `${opportunities.length} oportunidad(es) registrada(s)`}
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
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 p-1 shrink-0">
            <button
              onClick={() => setViewMode('kanban')}
              title="Vista Kanban"
              className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
                viewMode === 'kanban' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <Kanban className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              title="Vista de lista"
              className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
                viewMode === 'list' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
          {canCreate && (
            <button
              onClick={openCreate}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nueva oportunidad
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

      {/* Búsqueda + filtro de cliente */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1 min-w-0 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por nombre de oportunidad…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
          />
        </div>
        <div className="sm:w-64 shrink-0">
          <SearchSelect options={clientList} value={clientFilter} onChange={v => { setClientFilter(v); setPage(1) }} placeholder="Todos los clientes" searchPlaceholder="Buscar cliente…" />
        </div>
      </div>

      {/* Kanban */}
      {viewMode === 'kanban' && (
        loading ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-16 text-center">
            <div className="w-6 h-6 border-2 border-slate-200 dark:border-slate-700 border-t-indigo-600 rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2 items-start">
            {kanbanGroups.map(col => (
              <div
                key={col.value}
                onDragOver={e => e.preventDefault()}
                onDrop={() => handleDrop(col.value)}
                className={`w-72 shrink-0 rounded-xl border flex flex-col ${STAGE_COLUMN_BG[col.value] ?? 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700'}`}
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700 shrink-0">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{col.label}</span>
                  <span className="text-xs font-medium text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-2 py-0.5">{col.items.length}</span>
                </div>
                <div className="p-2.5 space-y-2.5 min-h-[80px]">
                  {col.items.length === 0 ? (
                    <p className="text-xs text-slate-300 dark:text-slate-600 text-center py-6">Sin oportunidades</p>
                  ) : col.items.map(o => (
                    <div
                      key={o.id}
                      draggable
                      onDragStart={() => setDraggedId(o.id)}
                      onDragEnd={() => setDraggedId(null)}
                      onClick={() => openEdit(o)}
                      className={`bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow transition-shadow ${draggedId === o.id ? 'opacity-40' : ''}`}
                    >
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 line-clamp-2 mb-1.5">{o.name}</p>
                      <p className="text-[11px] text-slate-400 truncate mb-2">{o.clientName}</p>
                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                        <span className="flex items-center gap-1.5 min-w-0 truncate">
                          {o.ownerName
                            ? <OwnerAvatar name={o.ownerName} photoUrl={o.ownerPhotoUrl} />
                            : <span className="text-slate-300 dark:text-slate-600">Sin asignar</span>}
                        </span>
                        <span className="font-medium text-slate-600 dark:text-slate-300 shrink-0">{fmtMoneyRounded(o.value)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 h-1 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                          <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${o.probability}%` }} />
                        </div>
                        <span className="text-[11px] text-slate-400 shrink-0">{o.probability}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Tabla */}
      {viewMode === 'list' && (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider w-12">#</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Oportunidad</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Cliente</th>
                <th className="text-right px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Valor</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Prob.</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Ejecutivo</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Etapa</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50 dark:border-slate-700/40">
                    {[8, 40, 32, 20, 16, 28, 20, 20].map((w, j) => (
                      <td key={j} className="px-5 py-2">
                        <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" style={{ width: `${w * 4}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center">
                    <Target className="w-9 h-9 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">
                      {search || clientFilter ? 'Sin resultados para el filtro aplicado.' : 'No hay oportunidades registradas.'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginated.map((o, i) => (
                  <tr
                    key={o.id}
                    className="border-b border-slate-50 dark:border-slate-700/40 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition-colors"
                  >
                    <td className="px-5 py-2 text-xs text-slate-400 dark:text-slate-500 font-medium text-center align-middle">
                      {globalIndex(i)}
                    </td>
                    <td className="px-5 py-2 text-left align-middle">
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{o.name}</p>
                    </td>
                    <td className="px-5 py-2 text-slate-600 dark:text-slate-300 text-left align-middle">{o.clientName}</td>
                    <td className="px-5 py-2 font-medium text-slate-800 dark:text-slate-200 text-right align-middle">{fmtMoneyRounded(o.value)}</td>
                    <td className="px-5 py-2 text-slate-500 dark:text-slate-400 text-center align-middle">{o.probability}%</td>
                    <td className="px-5 py-2 text-slate-600 dark:text-slate-300 text-left align-middle">{o.ownerName ?? <span className="text-slate-300 dark:text-slate-600">Sin asignar</span>}</td>
                    <td className="px-5 py-2 text-center align-middle">
                      <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${STAGE_STYLES[o.stage] ?? ''}`}>
                        {optionLabel(STAGE_OPTIONS, o.stage)}
                      </span>
                    </td>
                    <td className="px-5 py-2 align-middle">
                      <div className="flex items-center justify-center gap-0.5">
                        {canUpdate && (
                          <button
                            onClick={() => openEdit(o)}
                            title="Editar"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canToggle && (
                          <button
                            onClick={() => setToggleTarget(o)}
                            title={o.isActive ? 'Desactivar' : 'Activar'}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                              o.isActive
                                ? 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
                                : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                            }`}
                          >
                            {o.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setDeleteTarget(o)}
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
      )}

      {/* Modal crear / editar */}
      {modalMounted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${modalClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden ${modalClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <div className="px-6 pt-6 shrink-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
                {editing ? 'Editar Oportunidad' : 'Nueva Oportunidad'}
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Cliente <span className="text-red-500">*</span></label>
                  <SearchSelect options={clientList} value={form.clientId} onChange={v => setForm(f => ({ ...f, clientId: v, contactId: v === f.clientId ? f.contactId : '' }))} placeholder="Selecciona un cliente…" searchPlaceholder="Buscar cliente…" />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre <span className="text-red-500">*</span></label>
                    <input type="text" maxLength={200} placeholder="Ej: Renovación de contrato anual" value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Etapa</label>
                    <SearchSelect options={STAGE_OPTIONS} value={form.stage} onChange={v => setForm(f => ({ ...f, stage: v }))} placeholder="Selecciona…" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Contacto</label>
                  <SearchSelect options={clientContacts} value={form.contactId} onChange={v => setForm(f => ({ ...f, contactId: v }))} placeholder={form.clientId ? 'Selecciona un contacto…' : 'Primero selecciona un cliente…'} searchPlaceholder="Buscar contacto…" emptyLabel="Este cliente no tiene contactos activos." />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Valor</label>
                    <input type="number" min={0} step="0.01" placeholder="0.00" value={form.value}
                      onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Cierre esperado</label>
                    <DatePicker value={form.expectedCloseDate} onChange={v => setForm(f => ({ ...f, expectedCloseDate: v }))} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Probabilidad ({form.probability}%)</label>
                  <input type="range" min={0} max={100} step={5} value={form.probability}
                    onChange={e => setForm(f => ({ ...f, probability: e.target.value }))}
                    className="w-full accent-indigo-600" />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Ejecutivo asignado</label>
                  <SearchSelect options={employees} value={form.ownerId} onChange={v => setForm(f => ({ ...f, ownerId: v }))} placeholder="Selecciona un empleado…" searchPlaceholder="Buscar empleado…" showAvatar />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Notas</label>
                  <textarea rows={3} maxLength={1000} placeholder="Notas sobre esta oportunidad…" value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none" />
                </div>

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

      <ConfirmDialog
        open={!!toggleTarget}
        title={toggleTarget?.isActive ? '¿Desactivar oportunidad?' : '¿Activar oportunidad?'}
        message={
          toggleTarget?.isActive
            ? `La oportunidad "${toggleTarget.name}" será desactivada.`
            : `La oportunidad "${toggleTarget?.name}" volverá a estar disponible.`
        }
        confirmLabel={toggleTarget?.isActive ? 'Sí, desactivar' : 'Sí, activar'}
        cancelLabel="Cancelar"
        onConfirm={handleToggle}
        onCancel={() => setToggleTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar oportunidad?"
        message={`La oportunidad "${deleteTarget?.name}" se eliminará permanentemente. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
