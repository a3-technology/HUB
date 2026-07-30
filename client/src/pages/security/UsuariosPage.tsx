import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, Pencil, ToggleLeft, ToggleRight, RefreshCw, UserCog, Save, Trash2, KeyRound, Link2, Eye, EyeOff, X } from 'lucide-react'
import { usersApi, rolesApi, employeeDirectoryApi, modulesApi, permissionsApi } from '../../lib/api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Pagination, usePagination, type PageSize } from '../../components/Pagination'
import { SearchSelect } from '../../components/SearchSelect'
import { TabsScroller } from '../../components/TabsScroller'
import { useToast } from '../../context/ToastContext'
import { useAuth } from '../../context/AuthContext'
import { useModalTransition } from '../../hooks/useModalTransition'
import { usePermission } from '../../hooks/usePermission'

interface User {
  id: string
  names: string
  email: string
  roleId: string
  roleName: string
  employeeId?: string
  employeeName?: string
  isActive: boolean
  createdAt: string
}

interface RoleOption {
  id: string
  name: string
  isActive: boolean
}

interface EmployeeOption {
  id: string
  firstName: string
  lastName: string
  email: string
}

interface ModuleOption {
  id: string
  code: string
  name: string
}

interface PermissionOption {
  id: string
  code: string
  moduleCode: string
  name: string
}

interface RoleQuickForm {
  name: string
  description: string
  moduleIds: string[]
  permissionIds: string[]
}

const EMPTY_ROLE_FORM: RoleQuickForm = { name: '', description: '', moduleIds: [], permissionIds: [] }

interface UserForm {
  names: string
  email: string
  password: string
  roleId: string
  employeeId: string
}

const EMPTY_FORM: UserForm = { names: '', email: '', password: '', roleId: '', employeeId: '' }

const initials = (names: string) =>
  names.split(' ').slice(0, 2).map(n => n[0] ?? '').join('').toUpperCase()

export function UsuariosPage() {
  const toast = useToast()
  const { user: currentUser } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const roleFilterId = searchParams.get('roleId')

  const canCreate       = usePermission('security.users.create')
  const canUpdate       = usePermission('security.users.update')
  const canToggle       = usePermission('security.users.toggle')
  const canResetPassword = usePermission('security.users.reset-password')
  const canDelete       = usePermission('security.users.delete')
  const canCreateRole   = usePermission('security.roles.create')

  const [users, setUsers]           = useState<User[]>([])
  const [roles, setRoles]           = useState<RoleOption[]>([])
  const [employees, setEmployees]   = useState<EmployeeOption[]>([])
  const [modules, setModules]       = useState<ModuleOption[]>([])
  const [permissions, setPermissions] = useState<PermissionOption[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch]         = useState('')
  const [page, setPage]             = useState(1)
  const [pageSize, setPageSize]     = useState<PageSize>(10)

  const [modalOpen, setModalOpen]       = useState(false)
  const [editing, setEditing]           = useState<User | null>(null)
  const [form, setForm]                 = useState<UserForm>(EMPTY_FORM)
  const [formError, setFormError]       = useState<string | null>(null)
  // Visibilidad de la contraseña en el formulario de creación
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving]             = useState(false)
  const [toggleTarget, setToggleTarget] = useState<User | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const { mounted: modalMounted, closing: modalClosing } = useModalTransition(modalOpen)

  // Creación rápida de rol — acceso directo desde el select de rol, sin salir
  // del formulario de usuario (misma idea que los "Crear…" del módulo hr).
  const [roleModalOpen, setRoleModalOpen] = useState(false)
  const [roleForm, setRoleForm]           = useState<RoleQuickForm>(EMPTY_ROLE_FORM)
  const [roleFormTab, setRoleFormTab]     = useState<'modules' | 'permissions'>('modules')
  const [roleError, setRoleError]         = useState<string | null>(null)
  const [roleSaving, setRoleSaving]       = useState(false)
  const { mounted: roleModalMounted, closing: roleModalClosing } = useModalTransition(roleModalOpen)

  // Restablecimiento de contraseña
  const [resetTarget, setResetTarget]     = useState<User | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirm, setResetConfirm]   = useState('')
  const [resetError, setResetError]       = useState<string | null>(null)
  const [resetSaving, setResetSaving]     = useState(false)
  const { mounted: resetMounted, closing: resetClosing } = useModalTransition(!!resetTarget)

  const load = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true)
    try {
      const res = await usersApi.list(roleFilterId ?? undefined)
      if (res.ok) setUsers(await res.json())
    } finally {
      silent ? setRefreshing(false) : setLoading(false)
    }
  }

  const loadRoles = async () => {
    const res = await rolesApi.list()
    if (res.ok) setRoles(await res.json())
  }

  // Requiere el módulo hr; si el usuario no lo tiene, el vínculo con empleado
  // simplemente no estará disponible en el formulario.
  const loadEmployees = async () => {
    const res = await employeeDirectoryApi.list()
    if (res.ok) setEmployees(await res.json())
  }

  const loadModules = async () => {
    const res = await modulesApi.list()
    if (res.ok) setModules(await res.json())
  }

  const loadPermissions = async () => {
    const res = await permissionsApi.list()
    if (res.ok) setPermissions(await res.json())
  }

  useEffect(() => { loadRoles(); loadEmployees() }, [])
  useEffect(() => { load(); setPage(1) }, [roleFilterId]) // eslint-disable-line react-hooks/exhaustive-deps

  const roleFilter = roles.find(r => r.id === roleFilterId)
  const clearRoleFilter = () => setSearchParams(prev => { prev.delete('roleId'); return prev })

  const handleSearch = (value: string) => { setSearch(value); setPage(1) }

  // Creación rápida de rol desde el select del formulario de usuario.
  const openRoleModal = (initialName: string) => {
    if (modules.length === 0) loadModules()
    if (permissions.length === 0) loadPermissions()
    setRoleForm({ ...EMPTY_ROLE_FORM, name: initialName })
    setRoleFormTab('modules')
    setRoleError(null)
    setRoleModalOpen(true)
  }
  const closeRoleModal = () => setRoleModalOpen(false)

  const toggleRoleModule = (id: string) =>
    setRoleForm(f => {
      const removing = f.moduleIds.includes(id)
      const moduleCode = modules.find(m => m.id === id)?.code
      return {
        ...f,
        moduleIds: removing ? f.moduleIds.filter(m => m !== id) : [...f.moduleIds, id],
        // Al quitar un módulo, se quitan también los permisos que dependían de él.
        permissionIds: removing
          ? f.permissionIds.filter(pid => permissions.find(p => p.id === pid)?.moduleCode !== moduleCode)
          : f.permissionIds,
      }
    })

  const toggleRolePermission = (id: string) =>
    setRoleForm(f => ({
      ...f,
      permissionIds: f.permissionIds.includes(id) ? f.permissionIds.filter(p => p !== id) : [...f.permissionIds, id],
    }))

  const toggleAllRoleModulePermissions = (moduleCode: string, allChecked: boolean) =>
    setRoleForm(f => {
      const idsInModule = permissions.filter(p => p.moduleCode === moduleCode).map(p => p.id)
      return {
        ...f,
        permissionIds: allChecked
          ? f.permissionIds.filter(pid => !idsInModule.includes(pid))
          : [...new Set([...f.permissionIds, ...idsInModule])],
      }
    })

  const handleSaveRole = async () => {
    if (!roleForm.name.trim()) { setRoleError('El nombre es requerido.'); return }
    if (roleForm.moduleIds.length === 0) { setRoleError('Selecciona al menos un módulo.'); return }
    if (roleForm.permissionIds.length === 0) { setRoleError('Selecciona al menos un permiso.'); return }
    setRoleSaving(true); setRoleError(null)
    try {
      const res = await rolesApi.create({
        name: roleForm.name.trim(),
        description: roleForm.description.trim() || undefined,
        moduleIds: roleForm.moduleIds,
        permissionIds: roleForm.permissionIds,
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok) { setRoleError(result.message ?? 'Error al crear el rol.'); return }

      await loadRoles()
      if (result.id) setForm(f => ({ ...f, roleId: result.id }))
      toast.success('Rol creado correctamente.')
      setRoleModalOpen(false)
    } finally {
      setRoleSaving(false)
    }
  }

  const filtered = users
    .filter(u => {
      const q = search.toLowerCase()
      return (
        u.names.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.roleName.toLowerCase().includes(q) ||
        (u.employeeName ?? '').toLowerCase().includes(q)
      )
    })
    .sort((a, b) => a.names.localeCompare(b.names))
  const paginated = usePagination(filtered, page, pageSize)

  // Empleados disponibles para vincular: sin usuario, o el ya vinculado al usuario en edición
  const availableEmployees = employees.filter(e =>
    !users.some(u => u.employeeId === e.id && u.id !== editing?.id)
  )

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setFormError(null); setShowPassword(false); setModalOpen(true) }
  const openEdit   = (u: User) => {
    setEditing(u)
    setForm({ names: u.names, email: u.email, password: '', roleId: u.roleId, employeeId: u.employeeId ?? '' })
    setFormError(null)
    setModalOpen(true)
  }
  const closeModal = () => { setModalOpen(false); setEditing(null); setFormError(null) }

  // Al vincular un empleado se autocompletan nombre y correo (editables)
  const handleEmployeeChange = (employeeId: string) => {
    const emp = employees.find(e => e.id === employeeId)
    setForm(f => ({
      ...f,
      employeeId,
      names: emp ? `${emp.firstName} ${emp.lastName}` : f.names,
      email: emp ? emp.email : f.email,
    }))
  }

  const handleSave = async () => {
    if (!form.names.trim() || !form.email.trim() || !form.roleId) {
      setFormError('Completa todos los campos requeridos.'); return
    }
    if (!editing) {
      if (!form.password) { setFormError('La contraseña es requerida.'); return }
      if (form.password.length < 6) { setFormError('La contraseña debe tener al menos 6 caracteres.'); return }
    }
    setSaving(true); setFormError(null)
    try {
      const res = editing
        ? await usersApi.update(editing.id, {
            names: form.names.trim(), email: form.email.trim(),
            roleId: form.roleId, employeeId: form.employeeId || undefined,
          })
        : await usersApi.create({
            names: form.names.trim(), email: form.email.trim(), password: form.password,
            roleId: form.roleId, employeeId: form.employeeId || undefined,
          })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar.' }))
        setFormError(err.message); toast.error(err.message); return
      }
      toast.success(editing ? 'Usuario actualizado correctamente.' : 'Usuario creado correctamente.')
      closeModal(); await load()
    } finally { setSaving(false) }
  }

  const handleToggle = async () => {
    if (!toggleTarget) return
    const wasActive = toggleTarget.isActive
    try {
      const res = await usersApi.toggle(toggleTarget.id)
      if (res.ok) { toast.success(wasActive ? 'Usuario desactivado.' : 'Usuario activado.'); await load() }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo cambiar el estado del usuario.' }))
        toast.error(err.message)
      }
    } finally { setToggleTarget(null) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await usersApi.remove(deleteTarget.id)
      if (res.ok) { toast.success('Usuario eliminado correctamente.'); await load() }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar el usuario.' }))
        toast.error(err.message)
      }
    } finally { setDeleteTarget(null) }
  }

  const openReset = (u: User) => { setResetTarget(u); setResetPassword(''); setResetConfirm(''); setResetError(null) }
  const closeReset = () => setResetTarget(null)

  const handleReset = async () => {
    if (!resetTarget) return
    if (!resetPassword) { setResetError('La nueva contraseña es requerida.'); return }
    if (resetPassword.length < 6) { setResetError('La contraseña debe tener al menos 6 caracteres.'); return }
    if (resetPassword !== resetConfirm) { setResetError('Las contraseñas no coinciden.'); return }
    setResetSaving(true); setResetError(null)
    try {
      const res = await usersApi.resetPassword(resetTarget.id, resetPassword)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al restablecer la contraseña.' }))
        setResetError(err.message); toast.error(err.message); return
      }
      toast.success('Contraseña restablecida correctamente.')
      closeReset()
    } finally { setResetSaving(false) }
  }

  const globalIndex = (i: number) =>
    pageSize === 'all' ? i + 1 : (page - 1) * (pageSize as number) + i + 1

  return (
    <div className="p-6 space-y-4">

      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Usuarios</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : `${users.length} usuario(s) registrado(s)`}
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
              Nuevo Usuario
            </button>
          )}
        </div>
      </div>

      {/* Búsqueda + filtro activo por rol */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-0 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por nombre, correo o rol…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
          />
        </div>

        {roleFilterId && (
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 text-sm text-indigo-700 dark:text-indigo-400 w-fit shrink-0">
            <KeyRound className="w-4 h-4 shrink-0" />
            <span>
              Filtrando por rol: <span className="font-semibold">{roleFilter?.name ?? '…'}</span>
            </span>
            <button onClick={clearRoleFilter} title="Quitar filtro" className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">

            {/* Cabecera */}
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider w-12">#</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Usuario</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Rol</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider hidden md:table-cell">Empleado vinculado</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Estado</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>

            {/* Cuerpo */}
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50 dark:border-slate-700/40">
                    {[8, 48, 24, 40, 16, 24].map((w, j) => (
                      <td key={j} className="px-5 py-2">
                        <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" style={{ width: `${w * 4}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center">
                    <UserCog className="w-9 h-9 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">
                      {search ? 'Sin resultados para la búsqueda.' : 'No hay usuarios registrados.'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginated.map((u, i) => (
                  <tr
                    key={u.id}
                    className="border-b border-slate-50 dark:border-slate-700/40 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition-colors"
                  >
                    {/* # */}
                    <td className="px-5 py-2 text-xs text-slate-400 dark:text-slate-500 font-medium text-center align-middle">
                      {globalIndex(i)}
                    </td>

                    {/* Usuario — avatar + nombre + correo */}
                    <td className="px-5 py-2 align-middle">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold shrink-0">
                          {initials(u.names)}
                        </div>
                        <div className="leading-tight">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">
                            {u.names}
                            {u.id === currentUser?.userId && (
                              <span className="ml-2 text-xs font-medium text-indigo-500">(tú)</span>
                            )}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">{u.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Rol */}
                    <td className="px-5 py-2 text-center align-middle">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                        {u.roleName}
                      </span>
                    </td>

                    {/* Empleado vinculado */}
                    <td className="px-5 py-2 text-slate-500 dark:text-slate-400 align-middle hidden md:table-cell">
                      {u.employeeName ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Link2 className="w-3.5 h-3.5 text-slate-400" />
                          {u.employeeName}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>

                    {/* Estado */}
                    <td className="px-5 py-2 text-center align-middle">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                        u.isActive
                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                          : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500'
                      }`}>
                        {u.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>

                    {/* Acciones */}
                    <td className="px-5 py-2 align-middle">
                      <div className="flex items-center justify-center gap-0.5">
                        {canUpdate && (
                          <button
                            onClick={() => openEdit(u)}
                            title="Editar"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canResetPassword && (
                          <button
                            onClick={() => openReset(u)}
                            title="Restablecer contraseña"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canToggle && (
                          <button
                            onClick={() => setToggleTarget(u)}
                            disabled={u.id === currentUser?.userId}
                            title={u.id === currentUser?.userId ? 'No puedes desactivar tu propio usuario' : (u.isActive ? 'Desactivar' : 'Activar')}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                              u.isActive
                                ? 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
                                : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                            }`}
                          >
                            {u.isActive
                              ? <ToggleRight className="w-4 h-4" />
                              : <ToggleLeft  className="w-4 h-4" />
                            }
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setDeleteTarget(u)}
                            disabled={u.id === currentUser?.userId}
                            title={u.id === currentUser?.userId ? 'No puedes eliminar tu propio usuario' : 'Eliminar'}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden ${modalClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            {/* Encabezado fijo */}
            <div className="px-6 pt-6 shrink-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-5">
                {editing ? 'Editar Usuario' : 'Nuevo Usuario'}
              </h2>
            </div>
            {/* Cuerpo con scroll propio */}
            <div className="flex-1 overflow-y-auto px-6 pb-5 space-y-4 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Empleado vinculado</label>
                <SearchSelect
                  value={form.employeeId}
                  onChange={handleEmployeeChange}
                  options={[
                    { value: '', label: 'Sin vincular (usuario externo)' },
                    ...availableEmployees
                      .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
                      .map(e => ({ value: e.id, label: `${e.firstName} ${e.lastName}` })),
                  ]}
                  placeholder="Sin vincular (usuario externo)"
                  searchPlaceholder="Buscar empleado…"
                  emptyLabel="No hay empleados disponibles."
                />
                <p className="text-xs text-slate-400">Al vincular un empleado se copian su nombre y correo.</p>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre <span className="text-red-500">*</span></label>
                <input type="text" maxLength={150} placeholder="Ej: María García" value={form.names}
                  onChange={e => setForm(f => ({ ...f, names: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
              </div>
              <div className={editing ? 'space-y-1.5' : 'grid grid-cols-2 gap-4'}>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Correo <span className="text-red-500">*</span></label>
                  <input type="email" maxLength={150} placeholder="nombre@empresa.com" value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                </div>
                {!editing && (
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Contraseña <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <input type={showPassword ? 'text' : 'password'} maxLength={200} placeholder="Mínimo 6 caracteres" value={form.password}
                        onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                        className="w-full pl-3.5 pr-10 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Rol <span className="text-red-500">*</span></label>
                <SearchSelect
                  value={form.roleId}
                  onChange={roleId => setForm(f => ({ ...f, roleId }))}
                  options={roles
                    .filter(r => r.isActive || r.id === form.roleId)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(r => ({ value: r.id, label: r.name }))}
                  placeholder="Selecciona un rol…"
                  searchPlaceholder="Buscar rol…"
                  emptyLabel="No se encontraron roles."
                  onCreateNew={canCreateRole ? openRoleModal : undefined}
                />
              </div>
              {formError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {formError}
                </div>
              )}
            </div>
            {/* Pie fijo: acciones */}
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

      {/* Modal crear rol — acceso rápido desde el select de rol del formulario de usuario */}
      {roleModalMounted && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${roleModalClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden ${roleModalClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            {/* Encabezado fijo */}
            <div className="px-6 pt-6 shrink-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-5">
                Nuevo Rol
              </h2>
            </div>
            {/* Cuerpo con scroll propio */}
            <div className="flex-1 overflow-y-auto px-6 pb-5 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre <span className="text-red-500">*</span></label>
                <input type="text" maxLength={100} placeholder="Ej: Soporte" value={roleForm.name} autoFocus
                  onChange={e => setRoleForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Descripción</label>
                <textarea rows={2} maxLength={500} placeholder="Para qué se usa este rol…" value={roleForm.description}
                  onChange={e => setRoleForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none" />
              </div>

              <div className="space-y-3">
                <TabsScroller tone="modal">
                  <button
                    type="button"
                    onClick={() => setRoleFormTab('modules')}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                      roleFormTab === 'modules'
                        ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    Módulos <span className="text-red-500">*</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoleFormTab('permissions')}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                      roleFormTab === 'permissions'
                        ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    Permisos <span className="text-red-500">*</span>
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                      roleFormTab === 'permissions'
                        ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400'
                        : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                    }`}>
                      {roleForm.permissionIds.length}
                    </span>
                  </button>
                </TabsScroller>

                {roleFormTab === 'modules' ? (
                  <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                    {modules.map(m => (
                      <label key={m.id} className="flex items-center gap-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={roleForm.moduleIds.includes(m.id)}
                          onChange={() => toggleRoleModule(m.id)}
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
                    {modules.filter(m => roleForm.moduleIds.includes(m.id)).length === 0 && (
                      <p className="text-xs text-slate-400">Selecciona al menos un módulo para ver sus permisos.</p>
                    )}
                    {modules
                      .filter(m => roleForm.moduleIds.includes(m.id))
                      .map(m => {
                        const modulePermissions = permissions.filter(p => p.moduleCode === m.code)
                        if (modulePermissions.length === 0) return null
                        const idsInModule = modulePermissions.map(p => p.id)
                        const allChecked = idsInModule.every(id => roleForm.permissionIds.includes(id))
                        return (
                          <div key={m.id} className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                {m.name}
                              </label>
                              <button
                                type="button"
                                onClick={() => toggleAllRoleModulePermissions(m.code, allChecked)}
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
                                    checked={roleForm.permissionIds.includes(p.id)}
                                    onChange={() => toggleRolePermission(p.id)}
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

              {roleError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {roleError}
                </div>
              )}
            </div>
            {/* Pie fijo */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button onClick={closeRoleModal} disabled={roleSaving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveRole} disabled={roleSaving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {roleSaving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Save className="w-3.5 h-3.5" />}
                {roleSaving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal restablecer contraseña */}
      {resetMounted && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${resetClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md p-6 ${resetClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">
              Restablecer contraseña
            </h2>
            <p className="text-sm text-slate-500 mb-5">
              Usuario: <span className="font-medium text-slate-700 dark:text-slate-300">{resetTarget?.names}</span>.
              Se cerrarán sus sesiones activas.
            </p>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nueva contraseña <span className="text-red-500">*</span></label>
                <input type="password" maxLength={200} placeholder="Mínimo 6 caracteres" value={resetPassword}
                  onChange={e => setResetPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Confirmar contraseña <span className="text-red-500">*</span></label>
                <input type="password" maxLength={200} placeholder="Repite la contraseña" value={resetConfirm}
                  onChange={e => setResetConfirm(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
              </div>
              {resetError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {resetError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={closeReset} disabled={resetSaving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleReset} disabled={resetSaving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {resetSaving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <KeyRound className="w-3.5 h-3.5" />}
                {resetSaving ? 'Guardando…' : 'Restablecer'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!toggleTarget}
        title={toggleTarget?.isActive ? '¿Desactivar usuario?' : '¿Activar usuario?'}
        message={
          toggleTarget?.isActive
            ? `El usuario "${toggleTarget.names}" será desactivado y se cerrarán sus sesiones activas.`
            : `El usuario "${toggleTarget?.names}" podrá volver a iniciar sesión.`
        }
        confirmLabel={toggleTarget?.isActive ? 'Sí, desactivar' : 'Sí, activar'}
        cancelLabel="Cancelar"
        onConfirm={handleToggle}
        onCancel={() => setToggleTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar usuario?"
        message={`El usuario "${deleteTarget?.names}" se eliminará permanentemente junto con sus sesiones. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
