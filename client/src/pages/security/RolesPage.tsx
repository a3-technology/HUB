import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Pencil, ToggleLeft, ToggleRight, RefreshCw, KeyRound, Save, Trash2, Users } from 'lucide-react'
import { rolesApi, modulesApi, permissionsApi } from '../../lib/api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Pagination, usePagination, type PageSize } from '../../components/Pagination'
import { useToast } from '../../context/ToastContext'
import { useModalTransition } from '../../hooks/useModalTransition'
import { usePermission } from '../../hooks/usePermission'
import { TabsScroller } from '../../components/TabsScroller'

interface Role {
  id: string
  name: string
  description?: string
  isActive: boolean
  userCount: number
  moduleNames: string
  moduleIds: string
  permissionIds: string
  createdAt: string
  updatedAt?: string
}

interface Module {
  id: string
  code: string
  name: string
}

interface Permission {
  id: string
  code: string
  moduleCode: string
  name: string
}

interface RoleForm {
  name: string
  description: string
  moduleIds: string[]
  permissionIds: string[]
}

const EMPTY_FORM: RoleForm = { name: '', description: '', moduleIds: [], permissionIds: [] }

export function RolesPage() {
  const toast = useToast()
  const navigate = useNavigate()

  const canCreate = usePermission('security.roles.create')
  const canUpdate = usePermission('security.roles.update')
  const canToggle = usePermission('security.roles.toggle')
  const canDelete = usePermission('security.roles.delete')

  const [roles, setRoles]           = useState<Role[]>([])
  const [modules, setModules]       = useState<Module[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch]         = useState('')
  const [page, setPage]             = useState(1)
  const [pageSize, setPageSize]     = useState<PageSize>(10)

  const [modalOpen, setModalOpen]       = useState(false)
  const [editing, setEditing]           = useState<Role | null>(null)
  const [form, setForm]                 = useState<RoleForm>(EMPTY_FORM)
  const [formTab, setFormTab]           = useState<'modules' | 'permissions'>('modules')
  const [formError, setFormError]       = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)
  const [toggleTarget, setToggleTarget] = useState<Role | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null)
  const { mounted: modalMounted, closing: modalClosing } = useModalTransition(modalOpen)

  const load = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true)
    try {
      const res = await rolesApi.list()
      if (res.ok) setRoles(await res.json())
    } finally {
      silent ? setRefreshing(false) : setLoading(false)
    }
  }

  const loadModules = async () => {
    const res = await modulesApi.list()
    if (res.ok) setModules(await res.json())
  }

  const loadPermissions = async () => {
    const res = await permissionsApi.list()
    if (res.ok) setPermissions(await res.json())
  }

  useEffect(() => { load(); loadModules(); loadPermissions() }, [])

  const handleSearch = (value: string) => { setSearch(value); setPage(1) }

  const filtered = roles
    .filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))
  const paginated = usePagination(filtered, page, pageSize)

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setFormTab('modules'); setFormError(null); setModalOpen(true) }
  const openEdit   = (r: Role) => {
    setEditing(r)
    setForm({
      name: r.name,
      description: r.description ?? '',
      moduleIds: r.moduleIds ? r.moduleIds.split(',').map(id => id.trim().toLowerCase()) : [],
      permissionIds: r.permissionIds ? r.permissionIds.split(',').map(id => id.trim().toLowerCase()) : [],
    })
    setFormTab('modules')
    setFormError(null)
    setModalOpen(true)
  }
  const closeModal = () => { setModalOpen(false); setEditing(null); setFormError(null) }

  const toggleModule = (id: string) =>
    setForm(f => {
      const removing = f.moduleIds.includes(id)
      const moduleCode = modules.find(m => m.id.toLowerCase() === id)?.code
      return {
        ...f,
        moduleIds: removing ? f.moduleIds.filter(m => m !== id) : [...f.moduleIds, id],
        // Al quitar un módulo, se quitan también los permisos que dependían de él.
        permissionIds: removing
          ? f.permissionIds.filter(pid => permissions.find(p => p.id.toLowerCase() === pid)?.moduleCode !== moduleCode)
          : f.permissionIds,
      }
    })

  const togglePermission = (id: string) =>
    setForm(f => ({
      ...f,
      permissionIds: f.permissionIds.includes(id)
        ? f.permissionIds.filter(p => p !== id)
        : [...f.permissionIds, id],
    }))

  const toggleAllModulePermissions = (moduleCode: string, allChecked: boolean) =>
    setForm(f => {
      const idsInModule = permissions.filter(p => p.moduleCode === moduleCode).map(p => p.id.toLowerCase())
      return {
        ...f,
        permissionIds: allChecked
          ? f.permissionIds.filter(pid => !idsInModule.includes(pid))
          : [...new Set([...f.permissionIds, ...idsInModule])],
      }
    })

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('El nombre es requerido.'); return }
    if (form.moduleIds.length === 0) { setFormError('Selecciona al menos un módulo.'); return }
    if (form.permissionIds.length === 0) { setFormError('Selecciona al menos un permiso.'); return }
    setSaving(true); setFormError(null)
    try {
      const payload = { name: form.name.trim(), description: form.description.trim() || undefined, moduleIds: form.moduleIds, permissionIds: form.permissionIds }
      const res = editing
        ? await rolesApi.update(editing.id, payload)
        : await rolesApi.create(payload)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar.' }))
        setFormError(err.message); toast.error(err.message); return
      }
      toast.success(editing ? 'Rol actualizado correctamente.' : 'Rol creado correctamente.')
      closeModal(); await load()
    } finally { setSaving(false) }
  }

  const handleToggle = async () => {
    if (!toggleTarget) return
    const wasActive = toggleTarget.isActive
    try {
      const res = await rolesApi.toggle(toggleTarget.id)
      if (res.ok) { toast.success(wasActive ? 'Rol desactivado.' : 'Rol activado.'); await load() }
      else toast.error('No se pudo cambiar el estado del rol.')
    } finally { setToggleTarget(null) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await rolesApi.remove(deleteTarget.id)
      if (res.ok) { toast.success('Rol eliminado correctamente.'); await load() }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar el rol.' }))
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
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Roles</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : `${roles.length} rol(es) registrado(s)`}
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
              Nuevo Rol
            </button>
          )}
        </div>
      </div>

      {/* Búsqueda */}
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

      {/* Tabla */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">

            {/* Cabecera */}
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider w-12">#</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Rol</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider hidden md:table-cell">Descripción</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Módulos</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Usuarios</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Estado</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>

            {/* Cuerpo */}
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50 dark:border-slate-700/40">
                    {[8, 40, 56, 40, 12, 16, 20].map((w, j) => (
                      <td key={j} className="px-5 py-2">
                        <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" style={{ width: `${w * 4}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center">
                    <KeyRound className="w-9 h-9 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">
                      {search ? 'Sin resultados para la búsqueda.' : 'No hay roles registrados.'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginated.map((role, i) => (
                  <tr
                    key={role.id}
                    className="border-b border-slate-50 dark:border-slate-700/40 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition-colors"
                  >
                    {/* # */}
                    <td className="px-5 py-2 text-xs text-slate-400 dark:text-slate-500 font-medium text-center align-middle">
                      {globalIndex(i)}
                    </td>

                    {/* Rol */}
                    <td className="px-5 py-2 text-left align-middle">
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{role.name}</p>
                    </td>

                    {/* Descripción */}
                    <td className="px-5 py-2 text-slate-500 dark:text-slate-400 max-w-xs truncate text-left align-middle hidden md:table-cell">
                      {role.description ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </td>

                    {/* Módulos */}
                    <td className="px-5 py-2 text-left align-middle">
                      {role.moduleNames ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {role.moduleNames.split(', ').map(m => (
                            <span key={m} className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                              {m}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600 text-xs">Sin módulos</span>
                      )}
                    </td>

                    {/* Usuarios */}
                    <td className="px-5 py-2 text-center align-middle">
                      <button
                        onClick={() => navigate(`/security/usuarios?roleId=${role.id}`)}
                        title="Ver usuarios con este rol"
                        className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                          role.userCount > 0
                            ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20'
                            : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600'
                        }`}
                      >
                        <Users className="w-3.5 h-3.5" />
                        {role.userCount}
                      </button>
                    </td>

                    {/* Estado */}
                    <td className="px-5 py-2 text-center align-middle">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                        role.isActive
                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                          : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500'
                      }`}>
                        {role.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>

                    {/* Acciones */}
                    <td className="px-5 py-2 align-middle">
                      <div className="flex items-center justify-center gap-0.5">
                        {canUpdate && (
                          <button
                            onClick={() => openEdit(role)}
                            title="Editar"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canToggle && (
                          <button
                            onClick={() => setToggleTarget(role)}
                            title={role.isActive ? 'Desactivar' : 'Activar'}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                              role.isActive
                                ? 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
                                : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                            }`}
                          >
                            {role.isActive
                              ? <ToggleRight className="w-4 h-4" />
                              : <ToggleLeft  className="w-4 h-4" />
                            }
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setDeleteTarget(role)}
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

      {/* Modal crear / editar */}
      {modalMounted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${modalClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-lg max-h-[85vh] flex flex-col ${modalClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            {/* Header fijo */}
            <div className="px-6 pt-6 pb-4 shrink-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {editing ? 'Editar Rol' : 'Nuevo Rol'}
              </h2>
            </div>

            {/* Body con scroll interno */}
            <div className="px-6 overflow-y-auto flex-1 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre <span className="text-red-500">*</span></label>
                <input type="text" maxLength={100} placeholder="Ej: Recursos Humanos" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Descripción</label>
                <textarea rows={2} maxLength={500} placeholder="Qué puede hacer este rol…" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none" />
              </div>
              <div className="space-y-3">
                <TabsScroller tone="modal">
                  <button
                    type="button"
                    onClick={() => setFormTab('modules')}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                      formTab === 'modules'
                        ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    Módulos <span className="text-red-500">*</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormTab('permissions')}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                      formTab === 'permissions'
                        ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    Permisos
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                      formTab === 'permissions'
                        ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400'
                        : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                    }`}>
                      {form.permissionIds.length}
                    </span>
                  </button>
                </TabsScroller>

                {formTab === 'modules' ? (
                  <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                    {modules.map(m => (
                      <label key={m.id} className="flex items-center gap-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={form.moduleIds.includes(m.id.toLowerCase())}
                          onChange={() => toggleModule(m.id.toLowerCase())}
                          className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-300">{m.name}</span>
                      </label>
                    ))}
                    {modules.length === 0 && (
                      <p className="text-xs text-slate-400">No hay módulos disponibles.</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {modules.filter(m => form.moduleIds.includes(m.id.toLowerCase())).length === 0 && (
                      <p className="text-xs text-slate-400">Selecciona al menos un módulo para ver sus permisos.</p>
                    )}
                    {/* Permisos granulares, solo de los módulos seleccionados */}
                    {modules
                      .filter(m => form.moduleIds.includes(m.id.toLowerCase()))
                      .map(m => {
                        const modulePermissions = permissions.filter(p => p.moduleCode === m.code)
                        if (modulePermissions.length === 0) return null
                        const idsInModule = modulePermissions.map(p => p.id.toLowerCase())
                        const allChecked = idsInModule.every(id => form.permissionIds.includes(id))
                        return (
                          <div key={m.id} className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                {m.name}
                              </label>
                              <button
                                type="button"
                                onClick={() => toggleAllModulePermissions(m.code, allChecked)}
                                className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                              >
                                {allChecked ? 'Ninguno' : 'Todos'}
                              </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                              {modulePermissions.map(p => (
                                <label key={p.id} className="flex items-center gap-3 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={form.permissionIds.includes(p.id.toLowerCase())}
                                    onChange={() => togglePermission(p.id.toLowerCase())}
                                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                                  />
                                  <span className="text-sm text-slate-700 dark:text-slate-300">{p.name}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                  </div>
                )}
              </div>

              {formError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {formError}
                </div>
              )}
            </div>

            {/* Footer fijo */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 shrink-0">
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
        title={toggleTarget?.isActive ? '¿Desactivar rol?' : '¿Activar rol?'}
        message={
          toggleTarget?.isActive
            ? `El rol "${toggleTarget.name}" será desactivado; sus usuarios quedarán sin acceso a los módulos.`
            : `El rol "${toggleTarget?.name}" volverá a estar activo.`
        }
        confirmLabel={toggleTarget?.isActive ? 'Sí, desactivar' : 'Sí, activar'}
        cancelLabel="Cancelar"
        onConfirm={handleToggle}
        onCancel={() => setToggleTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar rol?"
        message={`El rol "${deleteTarget?.name}" se eliminará permanentemente. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
