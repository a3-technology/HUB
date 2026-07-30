import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Pencil, ToggleLeft, ToggleRight, RefreshCw, FolderOpen, Save, List, LayoutGrid, Trash2, Users } from 'lucide-react'
import { departmentsApi } from '../../lib/api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Pagination, usePagination, type PageSize } from '../../components/Pagination'
import { useToast } from '../../context/ToastContext'
import { useModalTransition } from '../../hooks/useModalTransition'
import { usePermission } from '../../hooks/usePermission'

interface Department {
  id: string
  name: string
  description?: string
  isActive: boolean
  employeeCount: number
  createdAt: string
  updatedAt?: string
}

interface DeptForm {
  name: string
  description: string
}

const EMPTY_FORM: DeptForm = { name: '', description: '' }
const VIEW_MODE_KEY = 'hr_departamentos_view_mode'

function loadViewMode(): 'list' | 'card' {
  const stored = localStorage.getItem(VIEW_MODE_KEY)
  return stored === 'card' ? 'card' : 'list'
}

export function DepartamentosPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const goToEmployees = (departmentId: string) => navigate(`/hr/empleados?departmentId=${departmentId}`)

  const canCreate = usePermission('hr.departments.create')
  const canUpdate = usePermission('hr.departments.update')
  const canToggle = usePermission('hr.departments.toggle')
  const canDelete = usePermission('hr.departments.delete')

  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading]         = useState(true)
  const [refreshing, setRefreshing]   = useState(false)
  const [search, setSearch]           = useState('')
  const [page, setPage]               = useState(1)
  const [pageSize, setPageSize]       = useState<PageSize>(10)
  const [viewMode, setViewModeState]  = useState<'list' | 'card'>(loadViewMode)
  const setViewMode = (mode: 'list' | 'card') => { setViewModeState(mode); localStorage.setItem(VIEW_MODE_KEY, mode) }

  const [modalOpen, setModalOpen]       = useState(false)
  const [editing, setEditing]           = useState<Department | null>(null)
  const [form, setForm]                 = useState<DeptForm>(EMPTY_FORM)
  const [formError, setFormError]       = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)
  const [toggleTarget, setToggleTarget] = useState<Department | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null)
  const { mounted: modalMounted, closing: modalClosing } = useModalTransition(modalOpen)

  const load = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true)
    try {
      const res = await departmentsApi.list()
      if (res.ok) setDepartments(await res.json())
    } finally {
      silent ? setRefreshing(false) : setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSearch = (value: string) => { setSearch(value); setPage(1) }

  const filtered = departments
    .filter(d => d.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))
  const paginated = usePagination(filtered, page, pageSize)

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setFormError(null); setModalOpen(true) }
  const openEdit   = (d: Department) => { setEditing(d); setForm({ name: d.name, description: d.description ?? '' }); setFormError(null); setModalOpen(true) }
  const closeModal = () => { setModalOpen(false); setEditing(null); setFormError(null) }

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('El nombre es requerido.'); return }
    setSaving(true); setFormError(null)
    try {
      const payload = { name: form.name.trim(), description: form.description.trim() || undefined }
      const res = editing
        ? await departmentsApi.update(editing.id, payload)
        : await departmentsApi.create(payload)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar.' }))
        setFormError(err.message); toast.error(err.message); return
      }
      toast.success(editing ? 'Departamento actualizado correctamente.' : 'Departamento creado correctamente.')
      closeModal(); await load()
    } finally { setSaving(false) }
  }

  const handleToggle = async () => {
    if (!toggleTarget) return
    const wasActive = toggleTarget.isActive
    try {
      const res = await departmentsApi.toggle(toggleTarget.id)
      if (res.ok) { toast.success(wasActive ? 'Departamento desactivado.' : 'Departamento activado.'); await load() }
      else toast.error('No se pudo cambiar el estado del departamento.')
    } finally { setToggleTarget(null) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await departmentsApi.remove(deleteTarget.id)
      if (res.ok) { toast.success('Departamento eliminado correctamente.'); await load() }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar el departamento.' }))
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
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Departamentos</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : `${departments.length} departamento(s) registrado(s)`}
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
              Nuevo Departamento
            </button>
          )}
        </div>
      </div>

      {/* Búsqueda + selector de vista */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 min-w-0 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por nombre…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 p-1 shrink-0">
          <button
            onClick={() => setViewMode('list')}
            title="Vista de lista"
            className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
              viewMode === 'list'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('card')}
            title="Vista de tarjetas"
            className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
              viewMode === 'card'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Vista de lista */}
      {viewMode === 'list' && (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">

            {/* Cabecera */}
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider w-12">#</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Departamento</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Descripción</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Empleados</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Estado</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>

            {/* Cuerpo */}
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50 dark:border-slate-700/40">
                    {[8, 48, 64, 12, 16, 20].map((w, j) => (
                      <td key={j} className="px-5 py-2">
                        <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" style={{ width: `${w * 4}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center">
                    <FolderOpen className="w-9 h-9 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">
                      {search ? 'Sin resultados para la búsqueda.' : 'No hay departamentos registrados.'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginated.map((dept, i) => (
                  <tr
                    key={dept.id}
                    className="border-b border-slate-50 dark:border-slate-700/40 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition-colors"
                  >
                    {/* # */}
                    <td className="px-5 py-2 text-xs text-slate-400 dark:text-slate-500 font-medium text-center align-middle">
                      {globalIndex(i)}
                    </td>

                    {/* Departamento */}
                    <td className="px-5 py-2 text-left align-middle">
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{dept.name}</p>
                    </td>

                    {/* Descripción */}
                    <td className="px-5 py-2 text-slate-500 dark:text-slate-400 max-w-xs truncate text-left align-middle">
                      {dept.description ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </td>

                    {/* Empleados */}
                    <td className="px-5 py-2 text-center align-middle">
                      <button
                        onClick={() => goToEmployees(dept.id)}
                        title="Ver empleados de este departamento"
                        className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                          dept.employeeCount > 0
                            ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20'
                            : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600'
                        }`}
                      >
                        <Users className="w-3.5 h-3.5" />
                        {dept.employeeCount > 0 ? `${dept.employeeCount} empleado${dept.employeeCount === 1 ? '' : 's'}` : 'Sin empleados'}
                      </button>
                    </td>

                    {/* Estado */}
                    <td className="px-5 py-2 text-center align-middle">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                        dept.isActive
                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                          : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500'
                      }`}>
                        {dept.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>

                    {/* Acciones */}
                    <td className="px-5 py-2 align-middle">
                      <div className="flex items-center justify-center gap-0.5">
                        {canUpdate && (
                          <button
                            onClick={() => openEdit(dept)}
                            title="Editar"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canToggle && (
                          <button
                            onClick={() => setToggleTarget(dept)}
                            title={dept.isActive ? 'Desactivar' : 'Activar'}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                              dept.isActive
                                ? 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
                                : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                            }`}
                          >
                            {dept.isActive
                              ? <ToggleRight className="w-4 h-4" />
                              : <ToggleLeft  className="w-4 h-4" />
                            }
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setDeleteTarget(dept)}
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

        {/* Paginación */}
        {!loading && filtered.length > 0 && (
          <Pagination
            total={filtered.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}
      </div>
      )}

      {/* Vista de tarjetas */}
      {viewMode === 'card' && (
      <div className="space-y-4">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-3">
                <div className="h-4 w-2/3 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" />
                <div className="h-3 w-1/3 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" />
                <div className="h-3 w-full bg-slate-100 dark:bg-slate-700 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-5 py-16 text-center">
            <FolderOpen className="w-9 h-9 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400">
              {search ? 'Sin resultados para la búsqueda.' : 'No hay departamentos registrados.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(dept => (
              <div
                key={dept.id}
                className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-800 dark:text-slate-200 truncate min-w-0">{dept.name}</p>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${
                    dept.isActive
                      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                      : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500'
                  }`}>
                    {dept.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                </div>

                <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 min-h-[2.5rem]">
                  {dept.description ?? <span className="text-slate-300 dark:text-slate-600">Sin descripción.</span>}
                </p>

                <div className="flex items-center justify-between gap-2 mt-auto pt-3 border-t border-slate-100 dark:border-slate-700">
                  <button
                    onClick={() => goToEmployees(dept.id)}
                    title="Ver empleados de este departamento"
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                      dept.employeeCount > 0
                        ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20'
                        : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    {dept.employeeCount > 0 ? `${dept.employeeCount} empleado${dept.employeeCount === 1 ? '' : 's'}` : 'Sin empleados'}
                  </button>
                  <div className="flex items-center gap-0.5">
                    {canUpdate && (
                      <button
                        onClick={() => openEdit(dept)}
                        title="Editar"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canToggle && (
                      <button
                        onClick={() => setToggleTarget(dept)}
                        title={dept.isActive ? 'Desactivar' : 'Activar'}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                          dept.isActive
                            ? 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
                            : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                        }`}
                      >
                        {dept.isActive
                          ? <ToggleRight className="w-4 h-4" />
                          : <ToggleLeft  className="w-4 h-4" />
                        }
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => setDeleteTarget(dept)}
                        title="Eliminar"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Modal crear / editar */}
      {modalMounted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${modalClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md p-6 ${modalClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-5">
              {editing ? 'Editar Departamento' : 'Nuevo Departamento'}
            </h2>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre <span className="text-red-500">*</span></label>
                <input type="text" maxLength={100} placeholder="Ej: Tecnología de la Información" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Descripción</label>
                <textarea rows={3} maxLength={500} placeholder="Función o responsabilidades del departamento…" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none" />
              </div>
              {formError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {formError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
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
        title={toggleTarget?.isActive ? '¿Desactivar departamento?' : '¿Activar departamento?'}
        message={
          toggleTarget?.isActive
            ? `El departamento "${toggleTarget.name}" será desactivado y no estará disponible para asignaciones.`
            : `El departamento "${toggleTarget?.name}" volverá a estar disponible.`
        }
        confirmLabel={toggleTarget?.isActive ? 'Sí, desactivar' : 'Sí, activar'}
        cancelLabel="Cancelar"
        onConfirm={handleToggle}
        onCancel={() => setToggleTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar departamento?"
        message={`El departamento "${deleteTarget?.name}" se eliminará permanentemente. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
