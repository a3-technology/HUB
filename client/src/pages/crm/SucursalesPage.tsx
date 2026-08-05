import { useEffect, useState } from 'react'
import { Plus, Search, Pencil, ToggleLeft, ToggleRight, RefreshCw, MapPinned, Trash2, Save, Star, Building2, Users, Mail, Phone, User, X, Eye } from 'lucide-react'
import { branchesApi, companiesApi, contactsApi } from '../../lib/api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Pagination, usePagination, type PageSize } from '../../components/Pagination'
import { SearchSelect, type SearchSelectOption } from '../../components/SearchSelect'
import { PhoneInput } from '../../components/PhoneInput'
import { PhonesListInput } from '../../components/PhonesListInput'
import { TabsScroller } from '../../components/TabsScroller'
import { ThSortFilter } from '../../components/ThSortFilter'
import { BranchDetailOffcanvas } from '../../components/BranchDetailOffcanvas'
import { useToast } from '../../context/ToastContext'
import { useModalTransition } from '../../hooks/useModalTransition'
import { usePermission } from '../../hooks/usePermission'

interface Branch {
  id: string
  companyId: string
  companyName: string
  name: string
  taxId?: string
  address?: string
  phone?: string
  email?: string
  isMain: boolean
  isActive: boolean
  createdAt: string
}

/** Columnas de la tabla que admiten ordenamiento y filtrado. */
type SortKey = 'name' | 'company' | 'address' | 'phone' | 'status'

/** Valor textual de una sucursal para la columna indicada (base para ordenar y filtrar). */
const colValue = (b: Branch, key: SortKey): string => {
  switch (key) {
    case 'name':    return b.name
    case 'company': return b.companyName
    case 'address': return b.address ?? ''
    case 'phone':   return b.phone ?? ''
    case 'status':  return b.isActive ? 'Activa' : 'Inactiva'
  }
}

interface BranchForm {
  companyId: string
  name: string
  taxId: string
  address: string
  phone: string
  email: string
  isMain: boolean
}

const EMPTY_FORM: BranchForm = {
  companyId: '', name: '', taxId: '', address: '', phone: '', email: '', isMain: false,
}

interface BranchContact {
  id: string
  name: string
  position?: string
  email?: string
  phones: string[]
  isPrimary: boolean
  isActive: boolean
}

interface ContactDraft {
  name: string
  position: string
  email: string
  phones: string[]
}

const EMPTY_CONTACT_DRAFT: ContactDraft = { name: '', position: '', email: '', phones: [] }

export function SucursalesPage() {
  const toast = useToast()

  const canCreate = usePermission('crm.branches.create')
  const canUpdate = usePermission('crm.branches.update')
  const canToggle = usePermission('crm.branches.toggle')
  const canDelete = usePermission('crm.branches.delete')

  const [branches, setBranches]   = useState<Branch[]>([])
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
  const [editing, setEditing]           = useState<Branch | null>(null)
  const [form, setForm]                 = useState<BranchForm>(EMPTY_FORM)
  const [formError, setFormError]       = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)
  const [toggleTarget, setToggleTarget] = useState<Branch | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null)
  const { mounted: modalMounted, closing: modalClosing } = useModalTransition(modalOpen)

  const [detailOpen, setDetailOpen]     = useState(false)
  const [detailBranch, setDetailBranch] = useState<Branch | null>(null)

  const [formTab, setFormTab] = useState<'general' | 'contactos'>('general')
  const [branchContacts, setBranchContacts] = useState<BranchContact[]>([])
  const [pendingContacts, setPendingContacts] = useState<(ContactDraft & { tempId: string })[]>([])
  const [contactDraft, setContactDraft]       = useState<ContactDraft>(EMPTY_CONTACT_DRAFT)
  const [contactDraftError, setContactDraftError] = useState<string | null>(null)
  const [savingContact, setSavingContact]     = useState(false)
  const [contactDeleteTarget, setContactDeleteTarget] = useState<BranchContact | null>(null)

  const load = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true)
    try {
      const res = await branchesApi.list()
      if (res.ok) setBranches(await res.json())
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
  /** Valores únicos de una columna (sobre todas las sucursales) para el popover de filtro. */
  const filterOptions = (key: SortKey) =>
    Array.from(new Set(branches.map(b => colValue(b, key)))).sort((a, b) => a.localeCompare(b, 'es'))

  const filtered = branches
    .filter(b => b.name.toLowerCase().includes(search.toLowerCase()))
    .filter(b => !companyFilter || b.companyId === companyFilter)
    .filter(b =>
      (Object.entries(columnFilters) as [SortKey, string[]][])
        .every(([key, values]) => values.length === 0 || values.includes(colValue(b, key)))
    )
    .sort((a, b) => {
      const cmp = colValue(a, sortKey).localeCompare(colValue(b, sortKey), 'es', { numeric: true, sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
  const paginated = usePagination(filtered, page, pageSize)

  const loadBranchContacts = async (branchId: string) => {
    const res = await contactsApi.list({ branchId })
    setBranchContacts(res.ok ? await res.json() : [])
  }

  const openCreate = () => {
    setEditing(null); setForm({ ...EMPTY_FORM, companyId: companyFilter }); setFormError(null)
    setFormTab('general'); setBranchContacts([]); setPendingContacts([]); setContactDraft(EMPTY_CONTACT_DRAFT); setContactDraftError(null)
    setModalOpen(true)
  }
  const openEdit   = (b: Branch) => {
    setEditing(b)
    setForm({
      companyId: b.companyId, name: b.name, taxId: b.taxId ?? '', address: b.address ?? '',
      phone: b.phone ?? '', email: b.email ?? '', isMain: b.isMain,
    })
    setFormError(null)
    setFormTab('general'); setBranchContacts([]); setPendingContacts([]); setContactDraft(EMPTY_CONTACT_DRAFT); setContactDraftError(null)
    loadBranchContacts(b.id)
    setModalOpen(true)
  }
  const closeModal = () => { setModalOpen(false); setEditing(null); setFormError(null) }

  const openDetail = (b: Branch) => { setDetailBranch(b); setDetailOpen(true) }
  const handleEditFromDetail = () => {
    if (!detailBranch) return
    const branch = detailBranch
    setDetailOpen(false)
    setTimeout(() => openEdit(branch), 160)
  }

  const handleAddContact = async () => {
    if (!contactDraft.name.trim()) { setContactDraftError('El nombre es requerido.'); return }
    setContactDraftError(null)

    if (editing) {
      setSavingContact(true)
      try {
        const res = await contactsApi.create({
          companyId: editing.companyId,
          branchId: editing.id,
          name: contactDraft.name.trim(),
          position: contactDraft.position.trim() || undefined,
          email: contactDraft.email.trim() || undefined,
          phones: contactDraft.phones.filter(p => p.trim()),
          isPrimary: false,
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: 'Error al agregar el contacto.' }))
          toast.error(err.message); return
        }
        toast.success('Contacto agregado.')
        setContactDraft(EMPTY_CONTACT_DRAFT)
        await loadBranchContacts(editing.id)
      } finally { setSavingContact(false) }
    } else {
      setPendingContacts(list => [...list, { ...contactDraft, tempId: crypto.randomUUID() }])
      setContactDraft(EMPTY_CONTACT_DRAFT)
    }
  }

  const removePendingContact = (tempId: string) => setPendingContacts(list => list.filter(c => c.tempId !== tempId))

  const handleDeleteContact = async () => {
    if (!contactDeleteTarget) return
    try {
      const res = await contactsApi.remove(contactDeleteTarget.id)
      if (res.ok) { toast.success('Contacto eliminado correctamente.'); if (editing) await loadBranchContacts(editing.id) }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar el contacto.' }))
        toast.error(err.message)
      }
    } finally { setContactDeleteTarget(null) }
  }

  const handleSave = async () => {
    if (!form.companyId) { setFormError('La empresa es requerida.'); return }
    if (!form.name.trim()) { setFormError('El nombre es requerido.'); return }
    setSaving(true); setFormError(null)
    try {
      const payload = {
        companyId: form.companyId,
        name: form.name.trim(),
        taxId: form.taxId.trim() || undefined,
        address: form.address.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        isMain: form.isMain,
      }
      const res = editing
        ? await branchesApi.update(editing.id, payload)
        : await branchesApi.create(payload)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar.' }))
        setFormError(err.message); toast.error(err.message); return
      }

      // Contactos en cola (solo en creación): se guardan con el Id de la nueva sucursal
      if (!editing && pendingContacts.length > 0) {
        const result = await res.json().catch(() => null)
        const branchId = result?.id
        if (branchId) {
          for (const pc of pendingContacts) {
            const cRes = await contactsApi.create({
              companyId: form.companyId,
              branchId,
              name: pc.name.trim(),
              position: pc.position.trim() || undefined,
              email: pc.email.trim() || undefined,
              phones: pc.phones.filter(p => p.trim()),
              isPrimary: false,
            })
            if (!cRes.ok) {
              const err = await cRes.json().catch(() => ({ message: 'Error al guardar.' }))
              toast.error(`No se pudo guardar el contacto "${pc.name}": ${err.message}`)
            }
          }
        }
      }

      toast.success(editing ? 'Sucursal actualizada correctamente.' : 'Sucursal creada correctamente.')
      closeModal(); await load()
    } finally { setSaving(false) }
  }

  const handleToggle = async () => {
    if (!toggleTarget) return
    const wasActive = toggleTarget.isActive
    try {
      const res = await branchesApi.toggle(toggleTarget.id)
      if (res.ok) { toast.success(wasActive ? 'Sucursal desactivada.' : 'Sucursal activada.'); await load() }
      else toast.error('No se pudo cambiar el estado de la sucursal.')
    } finally { setToggleTarget(null) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await branchesApi.remove(deleteTarget.id)
      if (res.ok) { toast.success('Sucursal eliminada correctamente.'); await load() }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar la sucursal.' }))
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
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Sucursales</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : `${branches.length} sucursal(es) registrada(s)`}
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
              Nueva sucursal
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
                  { label: 'Sucursal',   colKey: 'name'    as SortKey, align: 'left'   as const },
                  { label: 'Empresa',    colKey: 'company' as SortKey, align: 'left'   as const },
                  { label: 'Dirección',  colKey: 'address' as SortKey, align: 'left'   as const },
                  { label: 'Teléfono',   colKey: 'phone'   as SortKey, align: 'left'   as const },
                  { label: 'Estado',     colKey: 'status'  as SortKey, align: 'center' as const },
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
                    {[8, 40, 32, 32, 24, 20, 20].map((w, j) => (
                      <td key={j} className="px-5 py-2">
                        <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" style={{ width: `${w * 4}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center">
                    <MapPinned className="w-9 h-9 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">
                      {search || companyFilter ? 'Sin resultados para el filtro aplicado.' : 'No hay sucursales registradas.'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginated.map((b, i) => (
                  <tr
                    key={b.id}
                    className="border-b border-slate-50 dark:border-slate-700/40 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition-colors"
                  >
                    <td className="px-5 py-2 text-xs text-slate-400 dark:text-slate-500 font-medium text-center align-middle">
                      {globalIndex(i)}
                    </td>
                    <td className="px-5 py-2 text-left align-middle">
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => openDetail(b)}
                          className="font-semibold text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                          {b.name}
                        </button>
                        {b.isMain && (
                          <span title="Sucursal principal">
                            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-2 text-slate-600 dark:text-slate-300 text-left align-middle">{b.companyName}</td>
                    <td className="px-5 py-2 text-slate-600 dark:text-slate-300 text-left align-middle">{b.address || '—'}</td>
                    <td className="px-5 py-2 text-slate-600 dark:text-slate-300 text-left align-middle">{b.phone || '—'}</td>
                    <td className="px-5 py-2 text-center align-middle">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                        b.isActive
                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                          : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500'
                      }`}>
                        {b.isActive ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="px-5 py-2 align-middle">
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          onClick={() => openDetail(b)}
                          title="Ver información"
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {canUpdate && (
                          <button
                            onClick={() => openEdit(b)}
                            title="Editar"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canToggle && (
                          <button
                            onClick={() => setToggleTarget(b)}
                            title={b.isActive ? 'Desactivar' : 'Activar'}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                              b.isActive
                                ? 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
                                : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                            }`}
                          >
                            {b.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setDeleteTarget(b)}
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
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden ${modalClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <div className="px-6 pt-6 shrink-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
                {editing ? 'Editar Sucursal' : 'Nueva Sucursal'}
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-5 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
              <TabsScroller tone="modal" className="mb-4">
                <button type="button" onClick={() => setFormTab('general')}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                    formTab === 'general'
                      ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  Datos generales
                </button>
                <button type="button" onClick={() => setFormTab('contactos')}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                    formTab === 'contactos'
                      ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  Contactos
                  {(editing ? branchContacts.length : pendingContacts.length) > 0 && (
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                      formTab === 'contactos'
                        ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400'
                        : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                    }`}>
                      {editing ? branchContacts.length : pendingContacts.length}
                    </span>
                  )}
                </button>
              </TabsScroller>

              {formTab === 'general' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Empresa <span className="text-red-500">*</span></label>
                  <SearchSelect options={companyList} value={form.companyId} onChange={v => setForm(f => ({ ...f, companyId: v }))} placeholder="Selecciona una empresa…" searchPlaceholder="Buscar empresa…" />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre <span className="text-red-500">*</span></label>
                    <input type="text" maxLength={150} placeholder="Ej: Sucursal Central" value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">N° Identificación</label>
                    <input type="text" maxLength={50} placeholder="Ej: 3-101-123456" value={form.taxId}
                      onChange={e => setForm(f => ({ ...f, taxId: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
                    <input type="email" maxLength={200} placeholder="sucursal@empresa.com" value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Teléfono</label>
                    <PhoneInput value={form.phone} onChange={phone => setForm(f => ({ ...f, phone }))} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Dirección</label>
                  <input type="text" maxLength={300} placeholder="Dirección de la sucursal" value={form.address}
                    onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input type="checkbox" checked={form.isMain}
                    onChange={e => setForm(f => ({ ...f, isMain: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Sucursal principal de la empresa</span>
                </label>

                {formError && (
                  <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                    {formError}
                  </div>
                )}
              </div>
              )}

              {formTab === 'contactos' && (
              <div className="space-y-4">
                {!editing && (
                  <p className="text-xs text-slate-400">Los contactos se guardarán automáticamente al crear la sucursal.</p>
                )}

                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre <span className="text-red-500">*</span></label>
                      <input type="text" maxLength={200} placeholder="Nombre del contacto" value={contactDraft.name}
                        onChange={e => setContactDraft(d => ({ ...d, name: e.target.value }))}
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Puesto</label>
                      <input type="text" maxLength={100} placeholder="Ej: Encargado de sucursal" value={contactDraft.position}
                        onChange={e => setContactDraft(d => ({ ...d, position: e.target.value }))}
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Correo electrónico</label>
                      <input type="email" maxLength={200} placeholder="contacto@empresa.com" value={contactDraft.email}
                        onChange={e => setContactDraft(d => ({ ...d, email: e.target.value }))}
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Teléfonos</label>
                      <PhonesListInput value={contactDraft.phones} onChange={phones => setContactDraft(d => ({ ...d, phones }))} />
                    </div>
                  </div>

                  {contactDraftError && (
                    <p className="text-xs text-red-500">{contactDraftError}</p>
                  )}

                  <div className="flex justify-end">
                    <button type="button" onClick={handleAddContact} disabled={savingContact}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                      {savingContact
                        ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        : <Plus className="w-3.5 h-3.5" />}
                      Agregar contacto
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700/60 overflow-hidden">
                  {editing ? (
                    branchContacts.length === 0 ? (
                      <div className="px-4 py-10 text-center">
                        <Users className="w-8 h-8 text-slate-200 dark:text-slate-600 mx-auto mb-2" />
                        <p className="text-sm text-slate-400">Aún no hay contactos agregados.</p>
                      </div>
                    ) : (
                      branchContacts.map(c => (
                        <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="flex items-center gap-1 min-w-0 text-sm font-medium text-slate-700 dark:text-slate-200">
                                <User className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="truncate">{c.name}</span>
                              </span>
                              {c.position && (
                                <span className="min-w-0 truncate text-xs text-slate-400">· {c.position}</span>
                              )}
                            </div>
                            {c.email || c.phones.length > 0 ? (
                              <div className="flex items-center gap-3 text-xs text-slate-400">
                                {c.email && (
                                  <a href={`mailto:${c.email}`} onClick={e => e.stopPropagation()}
                                    className="flex items-center gap-1 min-w-0 truncate hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                                    <Mail className="w-3 h-3 shrink-0" />
                                    {c.email}
                                  </a>
                                )}
                                {c.phones.length > 0 && (
                                  <span className="flex items-center gap-1 min-w-0 truncate">
                                    <Phone className="w-3 h-3 shrink-0" />
                                    {c.phones.map((p, i) => (
                                      <span key={i}>
                                        <a href={`tel:${p}`} onClick={e => e.stopPropagation()}
                                          className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                                          {p}
                                        </a>
                                        {i < c.phones.length - 1 && ', '}
                                      </span>
                                    ))}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-400">Sin datos de contacto</p>
                            )}
                          </div>
                          <button type="button" onClick={() => setContactDeleteTarget(c)} title="Eliminar contacto"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors shrink-0">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )
                  ) : (
                    pendingContacts.length === 0 ? (
                      <div className="px-4 py-10 text-center">
                        <Users className="w-8 h-8 text-slate-200 dark:text-slate-600 mx-auto mb-2" />
                        <p className="text-sm text-slate-400">Aún no hay contactos agregados.</p>
                      </div>
                    ) : (
                      pendingContacts.map(c => (
                        <div key={c.tempId} className="flex items-center gap-3 px-4 py-2.5">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="flex items-center gap-1 min-w-0 text-sm font-medium text-slate-700 dark:text-slate-200">
                                <User className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="truncate">{c.name}</span>
                              </span>
                              {c.position && (
                                <span className="min-w-0 truncate text-xs text-slate-400">· {c.position}</span>
                              )}
                            </div>
                            {(() => {
                              const phones = c.phones.filter(p => p.trim())
                              return c.email || phones.length > 0 ? (
                                <div className="flex items-center gap-3 text-xs text-slate-400">
                                  {c.email && (
                                    <a href={`mailto:${c.email}`} onClick={e => e.stopPropagation()}
                                      className="flex items-center gap-1 min-w-0 truncate hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                                      <Mail className="w-3 h-3 shrink-0" />
                                      {c.email}
                                    </a>
                                  )}
                                  {phones.length > 0 && (
                                    <span className="flex items-center gap-1 min-w-0 truncate">
                                      <Phone className="w-3 h-3 shrink-0" />
                                      {phones.map((p, i) => (
                                        <span key={i}>
                                          <a href={`tel:${p}`} onClick={e => e.stopPropagation()}
                                            className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                                            {p}
                                          </a>
                                          {i < phones.length - 1 && ', '}
                                        </span>
                                      ))}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <p className="text-xs text-slate-400">Sin datos de contacto</p>
                              )
                            })()}
                          </div>
                          <button type="button" onClick={() => removePendingContact(c.tempId)} title="Quitar de la lista"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors shrink-0">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )
                  )}
                </div>
              </div>
              )}
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
        title={toggleTarget?.isActive ? '¿Desactivar sucursal?' : '¿Activar sucursal?'}
        message={
          toggleTarget?.isActive
            ? `La sucursal "${toggleTarget.name}" será desactivada.`
            : `La sucursal "${toggleTarget?.name}" volverá a estar disponible.`
        }
        confirmLabel={toggleTarget?.isActive ? 'Sí, desactivar' : 'Sí, activar'}
        cancelLabel="Cancelar"
        onConfirm={handleToggle}
        onCancel={() => setToggleTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar sucursal?"
        message={`La sucursal "${deleteTarget?.name}" se eliminará permanentemente. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={!!contactDeleteTarget}
        title="¿Eliminar contacto?"
        message={`El contacto "${contactDeleteTarget?.name}" se eliminará permanentemente. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDeleteContact}
        onCancel={() => setContactDeleteTarget(null)}
      />

      <BranchDetailOffcanvas
        open={detailOpen}
        branch={detailBranch}
        onClose={() => setDetailOpen(false)}
        onEdit={handleEditFromDetail}
      />
    </div>
  )
}
