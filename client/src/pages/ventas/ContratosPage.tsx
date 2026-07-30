import { useEffect, useRef, useState } from 'react'
import { Plus, Search, Pencil, ToggleLeft, ToggleRight, RefreshCw, FileSignature, TrendingUp, DollarSign, CheckCircle2, Trash2, Save, Upload, FileDown, X } from 'lucide-react'
import { contractsApi, clientsApi, employeeDirectoryApi, currenciesApi } from '../../lib/api'
import { fmtMoneyWithSymbol } from '../../lib/format'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Pagination, usePagination, type PageSize } from '../../components/Pagination'
import { SearchSelect, type SearchSelectOption } from '../../components/SearchSelect'
import { DatePicker } from '../../components/DatePicker'
import { useToast } from '../../context/ToastContext'
import { useModalTransition } from '../../hooks/useModalTransition'
import { usePermission } from '../../hooks/usePermission'

interface Contract {
  id: string
  code: string
  clientId: string
  clientName: string
  sourceOrderId?: string
  sourceOrderCode?: string
  title: string
  startDate: string
  endDate?: string
  status: string
  value: number
  currencyId: string
  currencyCode: string
  currencySymbol: string
  ownerId?: string
  ownerName?: string
  notes?: string
  documentUrl?: string
  documentName?: string
  isActive: boolean
  createdAt: string
}

interface ContractForm {
  clientId: string
  title: string
  startDate: string
  endDate: string
  value: string
  currencyId: string
  ownerId: string
  notes: string
}

const EMPTY_FORM: ContractForm = { clientId: '', title: '', startDate: '', endDate: '', value: '', currencyId: '', ownerId: '', notes: '' }

const STATUS_OPTIONS: SearchSelectOption[] = [
  { value: 'Draft',      label: 'Borrador' },
  { value: 'Active',     label: 'Activo' },
  { value: 'Expired',    label: 'Vencido' },
  { value: 'Terminated', label: 'Terminado' },
]

const STATUS_STYLES: Record<string, string> = {
  Draft:      'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600',
  Active:     'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20',
  Expired:    'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-500/20',
  Terminated: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-100 dark:border-red-500/20',
}

export function ContratosPage() {
  const toast = useToast()

  const canCreate         = usePermission('ventas.contracts.create')
  const canUpdate         = usePermission('ventas.contracts.update')
  const canChangeStatus   = usePermission('ventas.contracts.change-status')
  const canToggle         = usePermission('ventas.contracts.toggle')
  const canDelete         = usePermission('ventas.contracts.delete')
  const canUploadDocument = usePermission('ventas.contracts.document-upload')
  const canDeleteDocument = usePermission('ventas.contracts.document-delete')

  const [contracts, setContracts] = useState<Contract[]>([])
  const [clientList, setClientList] = useState<SearchSelectOption[]>([])
  const [employees, setEmployees] = useState<SearchSelectOption[]>([])
  const [currencies, setCurrencies] = useState<SearchSelectOption[]>([])
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage]           = useState(1)
  const [pageSize, setPageSize]   = useState<PageSize>(10)

  const [modalOpen, setModalOpen]       = useState(false)
  const [editing, setEditing]           = useState<Contract | null>(null)
  const [form, setForm]                 = useState<ContractForm>(EMPTY_FORM)
  const [formError, setFormError]       = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)
  const [toggleTarget, setToggleTarget] = useState<Contract | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Contract | null>(null)
  const { mounted: modalMounted, closing: modalClosing } = useModalTransition(modalOpen)

  const documentInputRef = useRef<HTMLInputElement>(null)
  const [documentTarget, setDocumentTarget] = useState<Contract | null>(null)
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null)

  const load = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true)
    try {
      const res = await contractsApi.list()
      if (res.ok) setContracts(await res.json())
    } finally {
      silent ? setRefreshing(false) : setLoading(false)
    }
  }

  const loadOptions = async () => {
    const [clRes, empRes, curRes] = await Promise.all([clientsApi.list(), employeeDirectoryApi.list(), currenciesApi.list()])
    if (clRes.ok) {
      const data = await clRes.json()
      setClientList(data.map((c: { id: string; name: string }) => ({ value: c.id, label: c.name })))
    }
    if (empRes.ok) {
      const data = await empRes.json()
      setEmployees(data.map((e: { id: string; firstName: string; lastName: string; photoUrl?: string }) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, photoUrl: e.photoUrl })))
    }
    if (curRes.ok) {
      const data = await curRes.json()
      setCurrencies(data.map((c: { id: string; code: string; name: string }) => ({ value: c.id, label: `${c.code} — ${c.name}` })))
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => { loadOptions() }, [])

  const handleSearch = (value: string) => { setSearch(value); setPage(1) }

  const filtered = contracts
    .filter(c => c.code.toLowerCase().includes(search.toLowerCase()) || c.title.toLowerCase().includes(search.toLowerCase()) || c.clientName.toLowerCase().includes(search.toLowerCase()))
    .filter(c => !statusFilter || c.status === statusFilter)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const paginated = usePagination(filtered, page, pageSize)

  const now = new Date()
  const stats = [
    { label: 'Total contratos', value: String(contracts.length), icon: FileSignature, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-500/10' },
    { label: 'Activos',         value: String(contracts.filter(c => c.status === 'Active').length), icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
    { label: 'Nuevos este mes', value: String(contracts.filter(c => { const d = new Date(c.createdAt); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() }).length), icon: TrendingUp, color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-500/10' },
    { label: 'Valor total',     value: fmtMoneyWithSymbol(contracts.reduce((sum, c) => sum + c.value, 0), contracts[0]?.currencySymbol ?? '$'), icon: DollarSign, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-500/10' },
  ]

  const toFormDate = (d?: string) => d ? d.slice(0, 10) : ''

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY_FORM, currencyId: currencies[0]?.value ?? '' }); setFormError(null); setModalOpen(true) }
  const openEdit   = (c: Contract) => {
    setEditing(c)
    setForm({
      clientId: c.clientId, title: c.title, startDate: toFormDate(c.startDate), endDate: toFormDate(c.endDate),
      value: String(c.value), currencyId: c.currencyId, ownerId: c.ownerId ?? '', notes: c.notes ?? '',
    })
    setFormError(null); setModalOpen(true)
  }
  const closeModal = () => { setModalOpen(false); setEditing(null); setFormError(null) }

  const handleSave = async () => {
    if (!form.clientId) { setFormError('El cliente es requerido.'); return }
    if (!form.title.trim()) { setFormError('El título es requerido.'); return }
    if (!form.startDate) { setFormError('La fecha de inicio es requerida.'); return }
    if (!form.currencyId) { setFormError('La moneda es requerida.'); return }
    setSaving(true); setFormError(null)
    try {
      const payload = {
        clientId: form.clientId,
        title: form.title.trim(),
        startDate: form.startDate,
        endDate: form.endDate || undefined,
        value: Number(form.value) || 0,
        currencyId: form.currencyId,
        ownerId: form.ownerId || undefined,
        notes: form.notes.trim() || undefined,
      }
      const res = editing
        ? await contractsApi.update(editing.id, payload)
        : await contractsApi.create(payload)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar.' }))
        setFormError(err.message); toast.error(err.message); return
      }
      toast.success(editing ? 'Contrato actualizado correctamente.' : 'Contrato creado correctamente.')
      closeModal(); await load()
    } finally { setSaving(false) }
  }

  const handleChangeStatus = async (c: Contract, status: string) => {
    const res = await contractsApi.changeStatus(c.id, status)
    if (res.ok) { toast.success('Estado actualizado correctamente.'); await load(true) }
    else {
      const err = await res.json().catch(() => ({ message: 'No se pudo cambiar el estado.' }))
      toast.error(err.message)
    }
  }

  const handleToggle = async () => {
    if (!toggleTarget) return
    const wasActive = toggleTarget.isActive
    try {
      const res = await contractsApi.toggle(toggleTarget.id)
      if (res.ok) { toast.success(wasActive ? 'Contrato desactivado.' : 'Contrato activado.'); await load() }
      else toast.error('No se pudo cambiar el estado del contrato.')
    } finally { setToggleTarget(null) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await contractsApi.remove(deleteTarget.id)
      if (res.ok) { toast.success('Contrato eliminado correctamente.'); await load() }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar el contrato.' }))
        toast.error(err.message)
      }
    } finally { setDeleteTarget(null) }
  }

  // ── Documento firmado del contrato ──────────────────────────────────────────

  const openDocumentPicker = (c: Contract) => {
    setDocumentTarget(c)
    documentInputRef.current?.click()
  }

  const handleDocumentSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !documentTarget) return
    setUploadingDocId(documentTarget.id)
    try {
      const res = await contractsApi.uploadDocument(documentTarget.id, file)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al subir el documento.' }))
        toast.error(err.message); return
      }
      toast.success('Documento del contrato guardado.')
      await load(true)
    } finally {
      setUploadingDocId(null); setDocumentTarget(null)
    }
  }

  const handleOpenDocument = async (c: Contract) => {
    const res = await contractsApi.getDocumentUrl(c.id)
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'No se pudo obtener el documento.' }))
      toast.error(err.message); return
    }
    const { url } = await res.json()
    window.open(url, '_blank', 'noopener')
  }

  const handleRemoveDocument = async (c: Contract) => {
    const res = await contractsApi.removeDocument(c.id)
    if (res.ok) { toast.success('Documento eliminado.'); await load(true) }
    else {
      const err = await res.json().catch(() => ({ message: 'No se pudo eliminar el documento.' }))
      toast.error(err.message)
    }
  }

  const globalIndex = (i: number) =>
    pageSize === 'all' ? i + 1 : (page - 1) * (pageSize as number) + i + 1

  return (
    <div className="p-6 space-y-4">

      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Contratos</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : `${contracts.length} contrato(s) registrado(s)`}
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
              Nuevo contrato
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
            placeholder="Buscar por código, título o cliente…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
          />
        </div>
        <div className="sm:w-56 shrink-0">
          <SearchSelect options={STATUS_OPTIONS} value={statusFilter} onChange={v => { setStatusFilter(v); setPage(1) }} placeholder="Todos los estados" />
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider w-12">#</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Código</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Contrato</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Vigencia</th>
                <th className="text-right px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Valor</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Ejecutivo</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Estado</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50 dark:border-slate-700/40">
                    {[8, 20, 32, 24, 20, 24, 20, 28].map((w, j) => (
                      <td key={j} className="px-5 py-2">
                        <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" style={{ width: `${w * 4}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center">
                    <FileSignature className="w-9 h-9 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">
                      {search || statusFilter ? 'Sin resultados para el filtro aplicado.' : 'No hay contratos registrados.'}
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
                    <td className="px-5 py-2 text-slate-500 dark:text-slate-400 text-left align-middle font-mono text-xs">{c.code}</td>
                    <td className="px-5 py-2 text-left align-middle">
                      <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">{c.title}</p>
                      <p className="text-xs text-slate-400 truncate">{c.clientName}{c.sourceOrderCode ? ` · de ${c.sourceOrderCode}` : ''}</p>
                    </td>
                    <td className="px-5 py-2 text-slate-600 dark:text-slate-300 text-left align-middle">
                      {new Date(c.startDate).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' })}{c.endDate ? ` – ${new Date(c.endDate).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' })}` : ' – indefinido'}
                    </td>
                    <td className="px-5 py-2 font-medium text-slate-800 dark:text-slate-200 text-right align-middle">{fmtMoneyWithSymbol(c.value, c.currencySymbol)}</td>
                    <td className="px-5 py-2 text-slate-600 dark:text-slate-300 text-left align-middle">{c.ownerName ?? <span className="text-slate-300 dark:text-slate-600">Sin asignar</span>}</td>
                    <td className="px-5 py-2 text-center align-middle">
                      {canChangeStatus ? (
                        <select
                          value={c.status}
                          onChange={e => handleChangeStatus(c, e.target.value)}
                          className={`text-xs font-medium px-2.5 py-1 rounded-full border cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 ${STATUS_STYLES[c.status] ?? ''}`}
                        >
                          {STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                      ) : (
                        <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_STYLES[c.status] ?? ''}`}>
                          {STATUS_OPTIONS.find(o => o.value === c.status)?.label ?? c.status}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2 align-middle">
                      <div className="flex items-center justify-center gap-0.5">
                        {c.documentUrl && (
                          <button onClick={() => handleOpenDocument(c)} title={`Ver documento firmado (${c.documentName ?? 'archivo'})`}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-500/10 transition-colors">
                            <FileDown className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canUploadDocument && (
                          <button onClick={() => openDocumentPicker(c)} disabled={uploadingDocId === c.id}
                            title={c.documentUrl ? 'Reemplazar documento firmado' : 'Subir documento firmado (PDF)'}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors disabled:opacity-50">
                            {uploadingDocId === c.id
                              ? <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-indigo-600 rounded-full animate-spin" />
                              : <Upload className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        {c.documentUrl && canDeleteDocument && (
                          <button onClick={() => handleRemoveDocument(c)} title="Quitar documento"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
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

      <input ref={documentInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleDocumentSelected} />

      {/* Modal crear / editar */}
      {modalMounted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${modalClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden ${modalClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <div className="px-6 pt-6 shrink-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
                {editing ? `Editar Contrato ${editing.code}` : 'Nuevo Contrato'}
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Cliente <span className="text-red-500">*</span></label>
                  <SearchSelect options={clientList} value={form.clientId} onChange={v => setForm(f => ({ ...f, clientId: v }))} placeholder="Selecciona un cliente…" searchPlaceholder="Buscar cliente…" />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Título <span className="text-red-500">*</span></label>
                  <input type="text" maxLength={200} placeholder="Ej: Contrato de servicios anual" value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Inicio <span className="text-red-500">*</span></label>
                    <DatePicker value={form.startDate} onChange={v => setForm(f => ({ ...f, startDate: v }))} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Fin</label>
                    <DatePicker value={form.endDate} onChange={v => setForm(f => ({ ...f, endDate: v }))} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Valor</label>
                    <input type="number" min={0} step="0.01" placeholder="0.00" value={form.value}
                      onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Moneda <span className="text-red-500">*</span></label>
                    <SearchSelect options={currencies} value={form.currencyId} onChange={v => setForm(f => ({ ...f, currencyId: v }))} placeholder="Selecciona…" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Ejecutivo asignado</label>
                  <SearchSelect options={employees} value={form.ownerId} onChange={v => setForm(f => ({ ...f, ownerId: v }))} placeholder="Selecciona un empleado…" searchPlaceholder="Buscar empleado…" showAvatar />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Notas</label>
                  <textarea rows={3} maxLength={1000} placeholder="Notas internas sobre este contrato…" value={form.notes}
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
        title={toggleTarget?.isActive ? '¿Desactivar contrato?' : '¿Activar contrato?'}
        message={
          toggleTarget?.isActive
            ? `El contrato "${toggleTarget.code}" será desactivado.`
            : `El contrato "${toggleTarget?.code}" volverá a estar disponible.`
        }
        confirmLabel={toggleTarget?.isActive ? 'Sí, desactivar' : 'Sí, activar'}
        cancelLabel="Cancelar"
        onConfirm={handleToggle}
        onCancel={() => setToggleTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar contrato?"
        message={`El contrato "${deleteTarget?.code}" se eliminará permanentemente. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
