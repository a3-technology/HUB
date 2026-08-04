import { useEffect, useState } from 'react'
import { Plus, Search, Pencil, ToggleLeft, ToggleRight, RefreshCw, Building2, Trash2, Save, Users, X, StickyNote, Mail, Phone, Globe, GitBranch, Eye, User } from 'lucide-react'
import { companiesApi, employeeDirectoryApi, industriesApi, countriesApi, contactsApi, companyNotesApi } from '../../lib/api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Pagination, usePagination, type PageSize } from '../../components/Pagination'
import { SearchSelect, type SearchSelectOption } from '../../components/SearchSelect'
import { PhoneInput } from '../../components/PhoneInput'
import { PhonesListInput } from '../../components/PhonesListInput'
import { TabsScroller } from '../../components/TabsScroller'
import { ThSortFilter } from '../../components/ThSortFilter'
import { CompanyNotes, type PendingCompanyNote } from '../../components/CompanyNotes'
import { CompanyBranchesModal } from '../../components/CompanyBranchesModal'
import { CompanyDetailOffcanvas } from '../../components/CompanyDetailOffcanvas'
import { useToast } from '../../context/ToastContext'
import { useModalTransition } from '../../hooks/useModalTransition'
import { usePermission } from '../../hooks/usePermission'

interface Company {
  id: string
  name: string
  taxId?: string
  industryId?: string
  industryName?: string
  countryId?: string
  countryName?: string
  email?: string
  phone?: string
  address?: string
  ownerId?: string
  ownerName?: string
  ownerPhotoUrl?: string
  branchCount: number
  isActive: boolean
  createdAt: string
}

interface CompanyForm {
  name: string
  taxId: string
  industryId: string
  countryId: string
  email: string
  phone: string
  address: string
  ownerId: string
}

const EMPTY_FORM: CompanyForm = {
  name: '', taxId: '', industryId: '', countryId: '', email: '', phone: '', address: '',
  ownerId: '',
}

interface CompanyContact {
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

/** Columnas de la tabla que admiten ordenamiento y filtrado. */
type SortKey = 'name' | 'contact' | 'industry' | 'country' | 'branches' | 'owner' | 'status'

/** Valor textual de una empresa para la columna indicada (base para ordenar y filtrar). */
const colValue = (c: Company, key: SortKey): string => {
  switch (key) {
    case 'name':     return c.name
    case 'contact':  return [c.email, c.phone].filter(Boolean).join(' · ')
    case 'industry': return c.industryName ?? ''
    case 'country':  return c.countryName ?? ''
    case 'branches': return String(c.branchCount)
    case 'owner':    return c.ownerName ?? ''
    case 'status':   return c.isActive ? 'Activo' : 'Inactivo'
  }
}

export function EmpresasPage() {
  const toast = useToast()

  const canCreate = usePermission('crm.companies.create')
  const canUpdate = usePermission('crm.companies.update')
  const canToggle = usePermission('crm.companies.toggle')
  const canDelete = usePermission('crm.companies.delete')

  const [companies, setCompanies] = useState<Company[]>([])
  const [employees, setEmployees] = useState<SearchSelectOption[]>([])
  const [industries, setIndustries] = useState<SearchSelectOption[]>([])
  const [countries, setCountries] = useState<SearchSelectOption[]>([])
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch]       = useState('')
  const [page, setPage]           = useState(1)
  const [pageSize, setPageSize]   = useState<PageSize>(10)
  const [sortKey, setSortKey]             = useState<SortKey>('name')
  const [sortDir, setSortDir]             = useState<'asc' | 'desc'>('asc')
  const [columnFilters, setColumnFilters] = useState<Partial<Record<SortKey, string[]>>>({})

  const [modalOpen, setModalOpen]       = useState(false)
  const [editing, setEditing]           = useState<Company | null>(null)
  const [form, setForm]                 = useState<CompanyForm>(EMPTY_FORM)
  const [formError, setFormError]       = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)
  const [toggleTarget, setToggleTarget] = useState<Company | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null)
  const { mounted: modalMounted, closing: modalClosing } = useModalTransition(modalOpen)

  const [formTab, setFormTab] = useState<'general' | 'contactos' | 'notas'>('general')
  const [companyContacts, setCompanyContacts] = useState<CompanyContact[]>([])
  const [pendingContacts, setPendingContacts] = useState<(ContactDraft & { tempId: string })[]>([])
  const [contactDraft, setContactDraft]       = useState<ContactDraft>(EMPTY_CONTACT_DRAFT)
  const [contactDraftError, setContactDraftError] = useState<string | null>(null)
  const [savingContact, setSavingContact]     = useState(false)
  const [contactDeleteTarget, setContactDeleteTarget] = useState<CompanyContact | null>(null)
  const [pendingNotes, setPendingNotes] = useState<PendingCompanyNote[]>([])
  const [notesCount, setNotesCount] = useState(0)
  const [branchesModalOpen, setBranchesModalOpen]       = useState(false)
  const [branchesModalCompany, setBranchesModalCompany] = useState<Company | null>(null)
  const [detailOpen, setDetailOpen]       = useState(false)
  const [detailCompany, setDetailCompany] = useState<Company | null>(null)

  const load = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true)
    try {
      const res = await companiesApi.list()
      if (res.ok) setCompanies(await res.json())
    } finally {
      silent ? setRefreshing(false) : setLoading(false)
    }
  }

  const loadOptions = async () => {
    const [empRes, indRes, couRes] = await Promise.all([
      employeeDirectoryApi.list(), industriesApi.list(), countriesApi.list(),
    ])
    if (empRes.ok) {
      const data = await empRes.json()
      setEmployees(data.map((e: { id: string; firstName: string; lastName: string; photoUrl?: string }) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, photoUrl: e.photoUrl })))
    }
    if (indRes.ok) {
      const data = await indRes.json()
      setIndustries(data.map((i: { id: string; name: string }) => ({ value: i.id, label: i.name })))
    }
    if (couRes.ok) {
      const data = await couRes.json()
      setCountries(data.map((c: { id: string; name: string }) => ({ value: c.id, label: c.name })))
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
  /** Valores únicos de una columna (sobre todas las empresas) para el popover de filtro. */
  const filterOptions = (key: SortKey) =>
    Array.from(new Set(companies.map(c => colValue(c, key)))).sort((a, b) => a.localeCompare(b, 'es'))

  const filtered = companies
    .filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || (c.taxId ?? '').toLowerCase().includes(search.toLowerCase()))
    .filter(c =>
      (Object.entries(columnFilters) as [SortKey, string[]][])
        .every(([key, values]) => values.length === 0 || values.includes(colValue(c, key)))
    )
    .sort((a, b) => {
      const cmp = colValue(a, sortKey).localeCompare(colValue(b, sortKey), 'es', { numeric: true, sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
  const paginated = usePagination(filtered, page, pageSize)

  const loadCompanyContacts = async (companyId: string) => {
    const res = await contactsApi.list({ companyId })
    setCompanyContacts(res.ok ? await res.json() : [])
  }

  const openCreate = () => {
    setEditing(null); setForm(EMPTY_FORM); setFormError(null)
    setFormTab('general'); setCompanyContacts([]); setPendingContacts([]); setContactDraft(EMPTY_CONTACT_DRAFT); setContactDraftError(null)
    setPendingNotes([]); setNotesCount(0)
    setModalOpen(true)
  }
  const openEdit   = (c: Company) => {
    setEditing(c)
    setForm({
      name: c.name, taxId: c.taxId ?? '', industryId: c.industryId ?? '', countryId: c.countryId ?? '',
      email: c.email ?? '', phone: c.phone ?? '', address: c.address ?? '',
      ownerId: c.ownerId ?? '',
    })
    setFormError(null)
    setFormTab('general'); setCompanyContacts([]); setPendingContacts([]); setContactDraft(EMPTY_CONTACT_DRAFT); setContactDraftError(null)
    setPendingNotes([]); setNotesCount(0)
    loadCompanyContacts(c.id)
    setModalOpen(true)
  }
  const closeModal = () => { setModalOpen(false); setEditing(null); setFormError(null) }

  const openDetail = (c: Company) => { setDetailCompany(c); setDetailOpen(true) }
  const handleEditFromDetail = () => {
    if (!detailCompany) return
    const company = detailCompany
    setDetailOpen(false)
    setTimeout(() => openEdit(company), 160)
  }

  const handleAddContact = async () => {
    if (!contactDraft.name.trim()) { setContactDraftError('El nombre es requerido.'); return }
    setContactDraftError(null)

    if (editing) {
      setSavingContact(true)
      try {
        const res = await contactsApi.create({
          companyId: editing.id,
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
        await loadCompanyContacts(editing.id)
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
      if (res.ok) { toast.success('Contacto eliminado correctamente.'); if (editing) await loadCompanyContacts(editing.id) }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar el contacto.' }))
        toast.error(err.message)
      }
    } finally { setContactDeleteTarget(null) }
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('El nombre es requerido.'); return }
    setSaving(true); setFormError(null)
    try {
      const payload = {
        name: form.name.trim(),
        taxId: form.taxId.trim() || undefined,
        industryId: form.industryId || undefined,
        countryId: form.countryId || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
        ownerId: form.ownerId || undefined,
      }
      const res = editing
        ? await companiesApi.update(editing.id, payload)
        : await companiesApi.create(payload)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar.' }))
        setFormError(err.message); toast.error(err.message); return
      }

      // Contactos y notas en cola (solo en creación): se guardan con el Id de la nueva empresa
      if (!editing && (pendingContacts.length > 0 || pendingNotes.length > 0)) {
        const result = await res.json().catch(() => null)
        const companyId = result?.id
        if (companyId) {
          for (const pc of pendingContacts) {
            const cRes = await contactsApi.create({
              companyId,
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
          for (const pn of pendingNotes) {
            const nRes = await companyNotesApi.create(companyId, pn.text, pn.file ?? undefined)
            if (!nRes.ok) {
              const err = await nRes.json().catch(() => ({ message: 'Error al guardar.' }))
              toast.error(`No se pudo guardar la nota: ${err.message}`)
            }
          }
        }
      }

      toast.success(editing ? 'Empresa actualizada correctamente.' : 'Empresa creada correctamente.')
      closeModal(); await load()
    } finally { setSaving(false) }
  }

  const handleToggle = async () => {
    if (!toggleTarget) return
    const wasActive = toggleTarget.isActive
    try {
      const res = await companiesApi.toggle(toggleTarget.id)
      if (res.ok) { toast.success(wasActive ? 'Empresa desactivada.' : 'Empresa activada.'); await load() }
      else toast.error('No se pudo cambiar el estado de la empresa.')
    } finally { setToggleTarget(null) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await companiesApi.remove(deleteTarget.id)
      if (res.ok) { toast.success('Empresa eliminada correctamente.'); await load() }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar la empresa.' }))
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
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Empresas</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : `${companies.length} empresa(s) registrada(s)`}
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
              Nueva empresa
            </button>
          )}
        </div>
      </div>

      {/* Búsqueda */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar por nombre o N° de identificación…"
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
                {([
                  { label: 'Empresa',    colKey: 'name'     as SortKey, align: 'left'   as const },
                  { label: 'Contacto',   colKey: 'contact'  as SortKey, align: 'left'   as const },
                  { label: 'Industria',  colKey: 'industry' as SortKey, align: 'left'   as const },
                  { label: 'País',       colKey: 'country'  as SortKey, align: 'left'   as const },
                  { label: 'Sucursales', colKey: 'branches' as SortKey, align: 'center' as const },
                  { label: 'Ejecutivo',  colKey: 'owner'    as SortKey, align: 'left'   as const },
                  { label: 'Estado',     colKey: 'status'   as SortKey, align: 'center' as const },
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
                    {[8, 40, 32, 24, 20, 20, 28, 20, 20].map((w, j) => (
                      <td key={j} className="px-5 py-2">
                        <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" style={{ width: `${w * 4}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-16 text-center">
                    <Building2 className="w-9 h-9 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">
                      {search ? 'Sin resultados para el filtro aplicado.' : 'No hay empresas registradas.'}
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
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <button type="button" onClick={() => openDetail(c)}
                            className="font-semibold text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 truncate text-left transition-colors">
                            {c.name}
                          </button>
                          <p className="text-xs text-slate-400 truncate">{c.taxId || 'Sin N° de identificación'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-2 text-left align-middle">
                      {c.email || c.phone ? (
                        <div className="space-y-0.5">
                          {c.email && (
                            <a href={`mailto:${c.email}`} onClick={e => e.stopPropagation()}
                              className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                              <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate">{c.email}</span>
                            </a>
                          )}
                          {c.phone && (
                            <a href={`tel:${c.phone}`} onClick={e => e.stopPropagation()}
                              className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                              <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{c.phone}</span>
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-5 py-2 text-slate-600 dark:text-slate-300 text-left align-middle">{c.industryName || '—'}</td>
                    <td className="px-5 py-2 text-left align-middle">
                      {c.countryName ? (
                        <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                          <Globe className="w-3.5 h-3.5 text-slate-400" />
                          {c.countryName}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-5 py-2 text-center align-middle">
                      <button
                        type="button"
                        onClick={() => { setBranchesModalCompany(c); setBranchesModalOpen(true) }}
                        title="Ver sucursales"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors"
                      >
                        <GitBranch className="w-3.5 h-3.5" />
                        {c.branchCount}
                      </button>
                    </td>
                    <td className="px-5 py-2 text-left align-middle">
                      {c.ownerName ? (
                        <span className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300">
                          <OwnerAvatar name={c.ownerName} photoUrl={c.ownerPhotoUrl} />
                          {c.ownerName}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">Sin asignar</span>
                      )}
                    </td>
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
                        <button
                          onClick={() => openDetail(c)}
                          title="Ver información"
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
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
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden ${modalClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <div className="px-6 pt-6 shrink-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
                {editing ? 'Editar Empresa' : 'Nueva Empresa'}
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
                  {(editing ? companyContacts.length : pendingContacts.length) > 0 && (
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                      formTab === 'contactos'
                        ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400'
                        : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                    }`}>
                      {editing ? companyContacts.length : pendingContacts.length}
                    </span>
                  )}
                </button>
                <button type="button" onClick={() => setFormTab('notas')}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                    formTab === 'notas'
                      ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <StickyNote className="w-4 h-4" />
                  Notas y adjuntos
                  {(editing ? notesCount : pendingNotes.length) > 0 && (
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                      formTab === 'notas'
                        ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400'
                        : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                    }`}>
                      {editing ? notesCount : pendingNotes.length}
                    </span>
                  )}
                </button>
              </TabsScroller>

              {formTab === 'general' && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre <span className="text-red-500">*</span></label>
                    <input type="text" maxLength={200} placeholder="Ej: Grupo Industrial Norte" value={form.name}
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
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Industria</label>
                    <SearchSelect options={industries} value={form.industryId} onChange={v => setForm(f => ({ ...f, industryId: v }))} placeholder="Selecciona…" searchPlaceholder="Buscar industria…" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">País</label>
                    <SearchSelect options={countries} value={form.countryId} onChange={v => setForm(f => ({ ...f, countryId: v }))} placeholder="Selecciona…" searchPlaceholder="Buscar país…" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
                    <input type="email" maxLength={200} placeholder="contacto@empresa.com" value={form.email}
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
                  <input type="text" maxLength={300} placeholder="Dirección de la empresa" value={form.address}
                    onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Ejecutivo asignado</label>
                  <SearchSelect options={employees} value={form.ownerId} onChange={v => setForm(f => ({ ...f, ownerId: v }))} placeholder="Selecciona…" searchPlaceholder="Buscar empleado…" showAvatar />
                </div>

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
                  <p className="text-xs text-slate-400">Los contactos se guardarán automáticamente al crear el registro.</p>
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
                      <input type="text" maxLength={100} placeholder="Ej: Gerente de compras" value={contactDraft.position}
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
                    companyContacts.length === 0 ? (
                      <div className="px-4 py-10 text-center">
                        <Users className="w-8 h-8 text-slate-200 dark:text-slate-600 mx-auto mb-2" />
                        <p className="text-sm text-slate-400">Aún no hay contactos agregados.</p>
                      </div>
                    ) : (
                      companyContacts.map(c => (
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

              {/* Montado siempre (oculto por CSS) para no perder/recargar el estado al cambiar de tab */}
              <div className={formTab === 'notas' ? '' : 'hidden'}>
                <CompanyNotes companyId={editing?.id} pendingNotes={pendingNotes} onPendingNotesChange={setPendingNotes} onCountChange={setNotesCount} />
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
        title={toggleTarget?.isActive ? '¿Desactivar empresa?' : '¿Activar empresa?'}
        message={
          toggleTarget?.isActive
            ? `La empresa "${toggleTarget.name}" será desactivada.`
            : `La empresa "${toggleTarget?.name}" volverá a estar disponible.`
        }
        confirmLabel={toggleTarget?.isActive ? 'Sí, desactivar' : 'Sí, activar'}
        cancelLabel="Cancelar"
        onConfirm={handleToggle}
        onCancel={() => setToggleTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar empresa?"
        message={`La empresa "${deleteTarget?.name}" y todas sus sucursales se eliminarán permanentemente. Esta acción no se puede deshacer.`}
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

      <CompanyBranchesModal
        open={branchesModalOpen}
        company={branchesModalCompany}
        onClose={() => setBranchesModalOpen(false)}
        onChanged={() => load(true)}
      />

      <CompanyDetailOffcanvas
        open={detailOpen}
        company={detailCompany}
        onClose={() => setDetailOpen(false)}
        onEdit={handleEditFromDetail}
      />
    </div>
  )
}
