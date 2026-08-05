import { useEffect, useState } from 'react'
import { Plus, Search, Pencil, ToggleLeft, ToggleRight, RefreshCw, Users, Trash2, Save, Star, GitBranch } from 'lucide-react'
import { contactsApi, companiesApi, branchesApi } from '../../lib/api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Pagination, usePagination, type PageSize } from '../../components/Pagination'
import { SearchSelect, type SearchSelectOption } from '../../components/SearchSelect'
import { PhonesListInput } from '../../components/PhonesListInput'
import { ThSortFilter } from '../../components/ThSortFilter'
import { useToast } from '../../context/ToastContext'
import { useModalTransition } from '../../hooks/useModalTransition'
import { usePermission } from '../../hooks/usePermission'

interface Contact {
  id: string
  companyId: string
  companyName: string
  branchId?: string
  branchName?: string
  name: string
  position?: string
  email?: string
  phones: string[]
  isPrimary: boolean
  notes?: string
  isActive: boolean
  createdAt: string
}

/** Columnas de la tabla que admiten ordenamiento y filtrado. */
type SortKey = 'name' | 'company' | 'branch' | 'position' | 'email' | 'phone' | 'status'

/** Valor textual de un contacto para la columna indicada (base para ordenar y filtrar). */
const colValue = (c: Contact, key: SortKey): string => {
  switch (key) {
    case 'name':     return c.name
    case 'company':  return c.companyName
    case 'branch':   return c.branchName ?? ''
    case 'position': return c.position ?? ''
    case 'email':    return c.email ?? ''
    case 'phone':    return c.phones.join(', ')
    case 'status':   return c.isActive ? 'Activo' : 'Inactivo'
  }
}

interface ContactForm {
  companyId: string
  branchId: string
  name: string
  position: string
  email: string
  phones: string[]
  isPrimary: boolean
  notes: string
}

const EMPTY_FORM: ContactForm = {
  companyId: '', branchId: '', name: '', position: '', email: '', phones: [], isPrimary: false, notes: '',
}

export function ContactosPage() {
  const toast = useToast()

  const canCreate = usePermission('crm.contacts.create')
  const canUpdate = usePermission('crm.contacts.update')
  const canToggle = usePermission('crm.contacts.toggle')
  const canDelete = usePermission('crm.contacts.delete')

  const [contacts, setContacts]   = useState<Contact[]>([])
  const [companyList, setCompanyList] = useState<SearchSelectOption[]>([])
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch]       = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [page, setPage]           = useState(1)
  const [pageSize, setPageSize]   = useState<PageSize>(10)
  const [sortKey, setSortKey]             = useState<SortKey>('name')
  const [sortDir, setSortDir]             = useState<'asc' | 'desc'>('asc')
  const [columnFilters, setColumnFilters] = useState<Partial<Record<SortKey, string[]>>>({})

  const [modalOpen, setModalOpen]       = useState(false)
  const [editing, setEditing]           = useState<Contact | null>(null)
  const [form, setForm]                 = useState<ContactForm>(EMPTY_FORM)
  const [branchOptions, setBranchOptions] = useState<SearchSelectOption[]>([])
  const [formError, setFormError]       = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)
  const [toggleTarget, setToggleTarget] = useState<Contact | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null)
  const { mounted: modalMounted, closing: modalClosing } = useModalTransition(modalOpen)

  const load = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true)
    try {
      const res = await contactsApi.list()
      if (res.ok) setContacts(await res.json())
    } finally {
      silent ? setRefreshing(false) : setLoading(false)
    }
  }

  const loadOptions = async () => {
    const res = await companiesApi.list()
    if (res.ok) {
      const data = await res.json()
      setCompanyList(data.map((c: { id: string; name: string }) => ({ value: c.id, label: c.name })))
    }
  }

  useEffect(() => { load() }, [])

  // Sucursales de la empresa seleccionada en el form (para escoger a cuál pertenece el contacto).
  useEffect(() => {
    if (!form.companyId) { setBranchOptions([]); return }
    branchesApi.list({ companyId: form.companyId }).then(async res => {
      if (!res.ok) { setBranchOptions([]); return }
      const data = await res.json()
      setBranchOptions(data.map((b: { id: string; name: string }) => ({ value: b.id, label: b.name })))
    })
  }, [form.companyId])
  useEffect(() => { loadOptions() }, [])

  const handleSearch = (value: string) => { setSearch(value); setPage(1) }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
    setPage(1)
  }
  const setColumnFilter = (key: SortKey, values: string[]) => {
    setColumnFilters(prev => ({ ...prev, [key]: values }))
    setPage(1)
  }
  /** Valores únicos de una columna (sobre todos los contactos) para el popover de filtro. */
  const filterOptions = (key: SortKey) =>
    Array.from(new Set(contacts.map(c => colValue(c, key)))).sort((a, b) => a.localeCompare(b, 'es'))

  const filtered = contacts
    .filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    .filter(c => !companyFilter || c.companyId === companyFilter)
    .filter(c =>
      (Object.entries(columnFilters) as [SortKey, string[]][])
        .every(([key, values]) => values.length === 0 || values.includes(colValue(c, key)))
    )
    .sort((a, b) => {
      const cmp = colValue(a, sortKey).localeCompare(colValue(b, sortKey), 'es', { numeric: true, sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
  const paginated = usePagination(filtered, page, pageSize)

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY_FORM, companyId: companyFilter }); setFormError(null); setModalOpen(true) }
  const openEdit   = (c: Contact) => {
    setEditing(c)
    setForm({
      companyId: c.companyId, branchId: c.branchId ?? '', name: c.name, position: c.position ?? '',
      email: c.email ?? '', phones: c.phones, isPrimary: c.isPrimary, notes: c.notes ?? '',
    })
    setFormError(null); setModalOpen(true)
  }
  const closeModal = () => { setModalOpen(false); setEditing(null); setFormError(null) }

  const handleSave = async () => {
    if (!form.companyId) { setFormError('La empresa es requerida.'); return }
    if (!form.name.trim()) { setFormError('El nombre es requerido.'); return }
    setSaving(true); setFormError(null)
    try {
      const payload = {
        companyId: form.companyId,
        branchId: form.branchId || undefined,
        name: form.name.trim(),
        position: form.position.trim() || undefined,
        email: form.email.trim() || undefined,
        phones: form.phones.filter(p => p.trim()),
        isPrimary: form.isPrimary,
        notes: form.notes.trim() || undefined,
      }
      const res = editing
        ? await contactsApi.update(editing.id, payload)
        : await contactsApi.create(payload)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar.' }))
        setFormError(err.message); toast.error(err.message); return
      }
      toast.success(editing ? 'Contacto actualizado correctamente.' : 'Contacto creado correctamente.')
      closeModal(); await load()
    } finally { setSaving(false) }
  }

  const handleToggle = async () => {
    if (!toggleTarget) return
    const wasActive = toggleTarget.isActive
    try {
      const res = await contactsApi.toggle(toggleTarget.id)
      if (res.ok) { toast.success(wasActive ? 'Contacto desactivado.' : 'Contacto activado.'); await load() }
      else toast.error('No se pudo cambiar el estado del contacto.')
    } finally { setToggleTarget(null) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await contactsApi.remove(deleteTarget.id)
      if (res.ok) { toast.success('Contacto eliminado correctamente.'); await load() }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar el contacto.' }))
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
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Contactos</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : `${contacts.length} contacto(s) registrado(s)`}
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
              Nuevo contacto
            </button>
          )}
        </div>
      </div>

      {/* Búsqueda + filtro de empresa */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
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
        <div className="sm:w-64 shrink-0">
          <SearchSelect options={companyList} value={companyFilter} onChange={v => { setCompanyFilter(v); setPage(1) }} placeholder="Todas las empresas" searchPlaceholder="Buscar empresa…" />
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider w-12">#</th>
                {([
                  { label: 'Contacto', colKey: 'name'     as SortKey, align: 'left'   as const },
                  { label: 'Empresa',  colKey: 'company'  as SortKey, align: 'left'   as const },
                  { label: 'Sucursal', colKey: 'branch'   as SortKey, align: 'left'   as const },
                  { label: 'Cargo',    colKey: 'position' as SortKey, align: 'left'   as const },
                  { label: 'Email',    colKey: 'email'    as SortKey, align: 'left'   as const },
                  { label: 'Teléfono(s)', colKey: 'phone' as SortKey, align: 'left'   as const },
                  { label: 'Estado',   colKey: 'status'   as SortKey, align: 'center' as const },
                ]).map(col => (
                  <ThSortFilter
                    key={col.colKey}
                    label={col.label}
                    colKey={col.colKey}
                    align={col.align}
                    activeSortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                    options={filterOptions(col.colKey)}
                    selected={columnFilters[col.colKey] ?? []}
                    onFilterChange={setColumnFilter}
                  />
                ))}
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50 dark:border-slate-700/40">
                    {[8, 40, 32, 24, 24, 32, 24, 20, 20].map((w, j) => (
                      <td key={j} className="px-5 py-2">
                        <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" style={{ width: `${w * 4}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-16 text-center">
                    <Users className="w-9 h-9 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">
                      {search || companyFilter ? 'Sin resultados para el filtro aplicado.' : 'No hay contactos registrados.'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginated.map((c, i) => (
                  <tr
                    key={c.id}
                    className="border-b border-slate-50 dark:border-slate-700/40 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition-colors"
                  >
                    <td className="px-5 py-2 text-xs text-slate-400 dark:text-slate-500 font-medium text-center align-middle">
                      {globalIndex(i)}
                    </td>
                    <td className="px-5 py-2 text-left align-middle">
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">{c.name}</p>
                        {c.isPrimary && (
                          <span title="Contacto principal">
                            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-2 text-slate-600 dark:text-slate-300 text-left align-middle">{c.companyName}</td>
                    <td className="px-5 py-2 text-left align-middle">
                      {c.branchName ? (
                        <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                          <GitBranch className="w-3.5 h-3.5 text-slate-400" />
                          {c.branchName}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-5 py-2 text-slate-600 dark:text-slate-300 text-left align-middle">{c.position || '—'}</td>
                    <td className="px-5 py-2 text-slate-600 dark:text-slate-300 text-left align-middle">{c.email || '—'}</td>
                    <td className="px-5 py-2 text-slate-600 dark:text-slate-300 text-left align-middle">{c.phones.length > 0 ? c.phones.join(', ') : '—'}</td>
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
                        {canUpdate && (
                          <button
                            onClick={() => openEdit(c)}
                            title="Editar"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canToggle && (
                          <button
                            onClick={() => setToggleTarget(c)}
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
                        {canDelete && (
                          <button
                            onClick={() => setDeleteTarget(c)}
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
                {editing ? 'Editar Contacto' : 'Nuevo Contacto'}
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Empresa <span className="text-red-500">*</span></label>
                    <SearchSelect options={companyList} value={form.companyId} onChange={v => setForm(f => ({ ...f, companyId: v, branchId: '' }))} placeholder="Selecciona una empresa…" searchPlaceholder="Buscar empresa…" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Sucursal</label>
                    <SearchSelect options={branchOptions} value={form.branchId} onChange={v => setForm(f => ({ ...f, branchId: v }))}
                      placeholder={form.companyId ? 'Ninguna (contacto de la empresa)' : 'Selecciona primero una empresa'} searchPlaceholder="Buscar sucursal…" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre <span className="text-red-500">*</span></label>
                    <input type="text" maxLength={200} placeholder="Nombre del contacto" value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Puesto</label>
                    <input type="text" maxLength={100} placeholder="Ej: Gerente de compras" value={form.position}
                      onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Correo electrónico</label>
                  <input type="email" maxLength={200} placeholder="contacto@empresa.com" value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Teléfonos</label>
                  <PhonesListInput value={form.phones} onChange={phones => setForm(f => ({ ...f, phones }))} />
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input type="checkbox" checked={form.isPrimary}
                    onChange={e => setForm(f => ({ ...f, isPrimary: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Contacto principal de la empresa</span>
                </label>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Notas</label>
                  <textarea rows={3} maxLength={500} placeholder="Notas sobre este contacto…" value={form.notes}
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
        title={toggleTarget?.isActive ? '¿Desactivar contacto?' : '¿Activar contacto?'}
        message={
          toggleTarget?.isActive
            ? `El contacto "${toggleTarget.name}" será desactivado.`
            : `El contacto "${toggleTarget?.name}" volverá a estar disponible.`
        }
        confirmLabel={toggleTarget?.isActive ? 'Sí, desactivar' : 'Sí, activar'}
        cancelLabel="Cancelar"
        onConfirm={handleToggle}
        onCancel={() => setToggleTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar contacto?"
        message={`El contacto "${deleteTarget?.name}" se eliminará permanentemente. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
