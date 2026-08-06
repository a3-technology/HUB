import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Pencil, ToggleLeft, ToggleRight, RefreshCw, FolderKanban, Save, Trash2, ListTodo } from 'lucide-react'
import { projectsApi, employeeDirectoryApi, resourcesApi } from '../../lib/api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Pagination, usePagination, type PageSize } from '../../components/Pagination'
import { SearchSelect, type SearchSelectOption } from '../../components/SearchSelect'
import { MultiSearchSelect } from '../../components/MultiSearchSelect'
import { DatePicker } from '../../components/DatePicker'
import { useToast } from '../../context/ToastContext'
import { useModalTransition } from '../../hooks/useModalTransition'
import { usePermission } from '../../hooks/usePermission'

interface Project {
  id: string
  code: string
  name: string
  description?: string
  managerId?: string
  managerName?: string
  startDate: string
  endDate?: string
  status: string
  budget?: number
  isActive: boolean
  taskCount: number
  createdAt: string
  updatedAt?: string
}

interface ProjectForm {
  code: string
  name: string
  description: string
  managerId: string
  startDate: string
  endDate: string
  status: string
  budget: string
  memberIds: string[]
}

const EMPTY_FORM: ProjectForm = { code: '', name: '', description: '', managerId: '', startDate: '', endDate: '', status: 'Planned', budget: '', memberIds: [] }

const STATUS_OPTIONS: SearchSelectOption[] = [
  { value: 'Planned',    label: 'Planificado'  },
  { value: 'InProgress', label: 'En progreso'  },
  { value: 'OnHold',     label: 'En pausa'     },
  { value: 'Completed',  label: 'Completado'   },
  { value: 'Cancelled',  label: 'Cancelado'    },
]

const STATUS_STYLES: Record<string, string> = {
  Planned:    'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-100 dark:border-sky-500/20',
  InProgress: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-500/20',
  OnHold:     'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600',
  Completed:  'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20',
  Cancelled:  'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-100 dark:border-red-500/20',
}

function statusLabel(status: string) {
  return STATUS_OPTIONS.find(o => o.value === status)?.label ?? status
}

export function ProyectosPage() {
  const toast = useToast()
  const navigate = useNavigate()

  const canCreate = usePermission('projects.projects.create')
  const canUpdate = usePermission('projects.projects.update')
  const canToggle = usePermission('projects.projects.toggle')
  const canDelete = usePermission('projects.projects.delete')

  const [projects, setProjects]   = useState<Project[]>([])
  const [employees, setEmployees] = useState<SearchSelectOption[]>([])
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch]       = useState('')
  const [page, setPage]           = useState(1)
  const [pageSize, setPageSize]   = useState<PageSize>(10)

  const [modalOpen, setModalOpen]       = useState(false)
  const [editing, setEditing]           = useState<Project | null>(null)
  const [form, setForm]                 = useState<ProjectForm>(EMPTY_FORM)
  const [formError, setFormError]       = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)
  const [toggleTarget, setToggleTarget] = useState<Project | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)
  const { mounted: modalMounted, closing: modalClosing } = useModalTransition(modalOpen)

  const load = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true)
    try {
      const res = await projectsApi.list()
      if (res.ok) setProjects(await res.json())
    } finally {
      silent ? setRefreshing(false) : setLoading(false)
    }
  }

  const loadEmployees = async () => {
    const res = await employeeDirectoryApi.list()
    if (res.ok) {
      const data = await res.json()
      setEmployees(data.map((e: { id: string; firstName: string; lastName: string; photoUrl?: string }) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, photoUrl: e.photoUrl })))
    }
  }

  useEffect(() => { load(); loadEmployees() }, [])

  const handleSearch = (value: string) => { setSearch(value); setPage(1) }

  const filtered = projects
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const paginated = usePagination(filtered, page, pageSize)

  const toFormDate = (d?: string) => d ? d.slice(0, 10) : ''

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setFormError(null); setModalOpen(true) }
  const openEdit   = async (p: Project) => {
    setEditing(p)
    setForm({
      code: p.code, name: p.name, description: p.description ?? '', managerId: p.managerId ?? '',
      startDate: toFormDate(p.startDate), endDate: toFormDate(p.endDate), status: p.status,
      budget: p.budget !== undefined && p.budget !== null ? String(p.budget) : '',
      memberIds: [],
    })
    setFormError(null); setModalOpen(true)
    const res = await resourcesApi.list({ projectId: p.id, active: true })
    if (res.ok) {
      const data: { employeeId: string }[] = await res.json()
      setForm(f => ({ ...f, memberIds: data.map(r => r.employeeId) }))
    }
  }
  const closeModal = () => { setModalOpen(false); setEditing(null); setFormError(null) }

  /** Reconcilia pm.Resources con los miembros elegidos en el formulario del proyecto. */
  const syncMembers = async (projectId: string, memberIds: string[]) => {
    const res = await resourcesApi.list({ projectId, active: true })
    const current: { id: string; employeeId: string }[] = res.ok ? await res.json() : []
    const currentIds = current.map(r => r.employeeId)
    const toAdd = memberIds.filter(id => !currentIds.includes(id))
    const toRemove = current.filter(r => !memberIds.includes(r.employeeId))
    await Promise.all([
      ...toAdd.map(employeeId => resourcesApi.create({ projectId, employeeId })),
      ...toRemove.map(r => resourcesApi.remove(r.id)),
    ])
  }

  const handleSave = async () => {
    if (!form.code.trim())     { setFormError('El código es requerido.'); return }
    if (!form.name.trim())     { setFormError('El nombre es requerido.'); return }
    if (!form.startDate)       { setFormError('La fecha de inicio es requerida.'); return }
    if (form.endDate && form.endDate < form.startDate) { setFormError('La fecha fin no puede ser anterior a la fecha de inicio.'); return }
    setSaving(true); setFormError(null)
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        managerId: form.managerId || undefined,
        startDate: form.startDate,
        endDate: form.endDate || undefined,
        status: form.status,
        budget: form.budget ? Number(form.budget) : undefined,
      }
      const res = editing
        ? await projectsApi.update(editing.id, payload)
        : await projectsApi.create(payload)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar.' }))
        setFormError(err.message); toast.error(err.message); return
      }
      const result: { id?: string } = await res.json()
      const projectId = editing ? editing.id : result.id
      if (projectId) await syncMembers(projectId, form.memberIds)
      toast.success(editing ? 'Proyecto actualizado correctamente.' : 'Proyecto creado correctamente.')
      closeModal(); await load()
    } finally { setSaving(false) }
  }

  const handleToggle = async () => {
    if (!toggleTarget) return
    const wasActive = toggleTarget.isActive
    try {
      const res = await projectsApi.toggle(toggleTarget.id)
      if (res.ok) { toast.success(wasActive ? 'Proyecto desactivado.' : 'Proyecto activado.'); await load() }
      else toast.error('No se pudo cambiar el estado del proyecto.')
    } finally { setToggleTarget(null) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await projectsApi.remove(deleteTarget.id)
      if (res.ok) { toast.success('Proyecto eliminado correctamente.'); await load() }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar el proyecto.' }))
        toast.error(err.message)
      }
    } finally { setDeleteTarget(null) }
  }

  const globalIndex = (i: number) =>
    pageSize === 'all' ? i + 1 : (page - 1) * (pageSize as number) + i + 1

  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
  const fmtMoney = (n?: number) => n === undefined || n === null ? '—' : n.toLocaleString('es-CR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

  return (
    <div className="p-6 space-y-4">

      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Proyectos</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : `${projects.length} proyecto(s) registrado(s)`}
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
              Nuevo Proyecto
            </button>
          )}
        </div>
      </div>

      {/* Búsqueda */}
      <div className="relative flex-1 min-w-0 sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar por código o nombre…"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
        />
      </div>

      {/* Tabla */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider w-12">#</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Proyecto</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Líder</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Fechas</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Tareas</th>
                <th className="text-right px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Presupuesto</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Estado</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50 dark:border-slate-700/40">
                    {[8, 48, 32, 32, 16, 20, 16, 20].map((w, j) => (
                      <td key={j} className="px-5 py-2">
                        <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" style={{ width: `${w * 4}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center">
                    <FolderKanban className="w-9 h-9 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">
                      {search ? 'Sin resultados para la búsqueda.' : 'No hay proyectos registrados.'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginated.map((p, i) => (
                  <tr
                    key={p.id}
                    className="border-b border-slate-50 dark:border-slate-700/40 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition-colors"
                  >
                    <td className="px-5 py-2 text-xs text-slate-400 dark:text-slate-500 font-medium text-center align-middle">
                      {globalIndex(i)}
                    </td>
                    <td className="px-5 py-2 text-left align-middle">
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{p.name}</p>
                      <p className="text-xs text-slate-400">{p.code}</p>
                    </td>
                    <td className="px-5 py-2 text-slate-600 dark:text-slate-300 text-left align-middle">
                      {p.managerName ?? <span className="text-slate-300 dark:text-slate-600">Sin asignar</span>}
                    </td>
                    <td className="px-5 py-2 text-slate-500 dark:text-slate-400 text-left align-middle text-xs">
                      {fmtDate(p.startDate)} — {fmtDate(p.endDate)}
                    </td>
                    <td className="px-5 py-2 text-center align-middle">
                      <button
                        onClick={() => navigate(`/projects/tareas?projectId=${p.id}`)}
                        title="Ver tareas del proyecto"
                        className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors cursor-pointer"
                      >
                        <ListTodo className="w-3.5 h-3.5" />
                        {p.taskCount}
                      </button>
                    </td>
                    <td className="px-5 py-2 text-right align-middle text-slate-600 dark:text-slate-300">
                      {fmtMoney(p.budget)}
                    </td>
                    <td className="px-5 py-2 text-center align-middle">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_STYLES[p.status] ?? ''}`}>
                        {statusLabel(p.status)}
                      </span>
                    </td>
                    <td className="px-5 py-2 align-middle">
                      <div className="flex items-center justify-center gap-0.5">
                        {canUpdate && (
                          <button
                            onClick={() => openEdit(p)}
                            title="Editar"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canToggle && (
                          <button
                            onClick={() => setToggleTarget(p)}
                            title={p.isActive ? 'Desactivar' : 'Activar'}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                              p.isActive
                                ? 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
                                : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                            }`}
                          >
                            {p.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setDeleteTarget(p)}
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
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden ${modalClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <div className="px-6 pt-6 shrink-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-5">
                {editing ? 'Editar Proyecto' : 'Nuevo Proyecto'}
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-5 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Código <span className="text-red-500">*</span></label>
                    <input type="text" maxLength={20} placeholder="PRY-0001" value={form.code}
                      onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Estado</label>
                    <SearchSelect options={STATUS_OPTIONS} value={form.status} onChange={v => setForm(f => ({ ...f, status: v }))} placeholder="Selecciona…" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre <span className="text-red-500">*</span></label>
                  <input type="text" maxLength={200} placeholder="Ej: Implementación ERP" value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Descripción</label>
                  <textarea rows={3} maxLength={1000} placeholder="Alcance u objetivo del proyecto…" value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none" />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Líder de proyecto</label>
                  <SearchSelect options={employees} value={form.managerId} onChange={v => setForm(f => ({ ...f, managerId: v }))} placeholder="Selecciona un empleado…" searchPlaceholder="Buscar empleado…" />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Miembros del proyecto</label>
                  <MultiSearchSelect options={employees} values={form.memberIds} onChange={v => setForm(f => ({ ...f, memberIds: v }))} placeholder="Selecciona los empleados del equipo…" searchPlaceholder="Buscar empleado…" showAvatar />
                  <p className="text-xs text-slate-400">Solo estos empleados podrán asignarse como responsables de las tareas del proyecto.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Fecha inicio <span className="text-red-500">*</span></label>
                    <DatePicker value={form.startDate} onChange={v => setForm(f => ({ ...f, startDate: v }))} maxDate={form.endDate || undefined} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Fecha fin</label>
                    <DatePicker value={form.endDate} onChange={v => setForm(f => ({ ...f, endDate: v }))} minDate={form.startDate || undefined} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Presupuesto</label>
                  <input type="number" min={0} step="0.01" placeholder="0.00" value={form.budget}
                    onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
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
              {(editing ? canUpdate : canCreate) && (
                <button onClick={handleSave} disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                  {saving
                    ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    : <Save className="w-3.5 h-3.5" />}
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!toggleTarget}
        title={toggleTarget?.isActive ? '¿Desactivar proyecto?' : '¿Activar proyecto?'}
        message={
          toggleTarget?.isActive
            ? `El proyecto "${toggleTarget.name}" será desactivado.`
            : `El proyecto "${toggleTarget?.name}" volverá a estar disponible.`
        }
        confirmLabel={toggleTarget?.isActive ? 'Sí, desactivar' : 'Sí, activar'}
        cancelLabel="Cancelar"
        onConfirm={handleToggle}
        onCancel={() => setToggleTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar proyecto?"
        message={`El proyecto "${deleteTarget?.name}" y todas sus tareas y recursos asociados se eliminarán permanentemente. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
