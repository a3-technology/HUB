import { useEffect, useState } from 'react'
import { Plus, Search, Pencil, ToggleLeft, ToggleRight, RefreshCw, Building2, TrendingUp, DollarSign, Star, Trash2, Save } from 'lucide-react'
import { clientsApi, employeeDirectoryApi } from '../../lib/api'
import { fmtMoneyRounded } from '../../lib/format'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Pagination, usePagination, type PageSize } from '../../components/Pagination'
import { SearchSelect, type SearchSelectOption } from '../../components/SearchSelect'
import { PhoneInput } from '../../components/PhoneInput'
import { useToast } from '../../context/ToastContext'
import { useModalTransition } from '../../hooks/useModalTransition'
import { usePermission } from '../../hooks/usePermission'

interface Client {
  id: string
  name: string
  sector?: string
  email?: string
  phone?: string
  website?: string
  address?: string
  status: string
  estimatedValue?: number
  ownerId?: string
  ownerName?: string
  ownerPhotoUrl?: string
  primaryContactName?: string
  notes?: string
  isActive: boolean
  createdAt: string
}

interface ClientForm {
  name: string
  sector: string
  email: string
  phone: string
  website: string
  address: string
  status: string
  estimatedValue: string
  ownerId: string
  notes: string
}

const EMPTY_FORM: ClientForm = {
  name: '', sector: '', email: '', phone: '', website: '', address: '',
  status: 'Prospect', estimatedValue: '', ownerId: '', notes: '',
}

const STATUS_OPTIONS: SearchSelectOption[] = [
  { value: 'Prospect', label: 'Prospecto' },
  { value: 'Active',   label: 'Activo'    },
  { value: 'Inactive', label: 'Inactivo'  },
]

const STATUS_STYLES: Record<string, string> = {
  Prospect: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-500/20',
  Active:   'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20',
  Inactive: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600',
}

function optionLabel(options: SearchSelectOption[], value: string) {
  return options.find(o => o.value === value)?.label ?? value
}

export function ClientesPage() {
  const toast = useToast()

  const canCreate = usePermission('crm.clients.create')
  const canUpdate = usePermission('crm.clients.update')
  const canToggle = usePermission('crm.clients.toggle')
  const canDelete = usePermission('crm.clients.delete')

  const [clients, setClients]     = useState<Client[]>([])
  const [employees, setEmployees] = useState<SearchSelectOption[]>([])
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch]       = useState('')
  const [page, setPage]           = useState(1)
  const [pageSize, setPageSize]   = useState<PageSize>(10)

  const [modalOpen, setModalOpen]       = useState(false)
  const [editing, setEditing]           = useState<Client | null>(null)
  const [form, setForm]                 = useState<ClientForm>(EMPTY_FORM)
  const [formError, setFormError]       = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)
  const [toggleTarget, setToggleTarget] = useState<Client | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null)
  const { mounted: modalMounted, closing: modalClosing } = useModalTransition(modalOpen)

  const load = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true)
    try {
      const res = await clientsApi.list()
      if (res.ok) setClients(await res.json())
    } finally {
      silent ? setRefreshing(false) : setLoading(false)
    }
  }

  const loadOptions = async () => {
    const res = await employeeDirectoryApi.list()
    if (res.ok) {
      const data = await res.json()
      setEmployees(data.map((e: { id: string; firstName: string; lastName: string; photoUrl?: string }) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, photoUrl: e.photoUrl })))
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => { loadOptions() }, [])

  const handleSearch = (value: string) => { setSearch(value); setPage(1) }

  const filtered = clients
    .filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const paginated = usePagination(filtered, page, pageSize)

  const now = new Date()
  const stats = [
    { label: 'Total clientes',   value: String(clients.length), icon: Building2,  color: 'text-indigo-600 dark:text-indigo-400',  bg: 'bg-indigo-50 dark:bg-indigo-500/10'  },
    { label: 'Clientes activos', value: String(clients.filter(c => c.status === 'Active').length), icon: Star, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
    { label: 'Nuevos este mes',  value: String(clients.filter(c => { const d = new Date(c.createdAt); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() }).length), icon: TrendingUp, color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-500/10' },
    { label: 'Valor total',      value: fmtMoneyRounded(clients.reduce((sum, c) => sum + (c.estimatedValue ?? 0), 0)), icon: DollarSign, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-500/10' },
  ]

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setFormError(null); setModalOpen(true) }
  const openEdit   = (c: Client) => {
    setEditing(c)
    setForm({
      name: c.name, sector: c.sector ?? '', email: c.email ?? '', phone: c.phone ?? '', website: c.website ?? '',
      address: c.address ?? '', status: c.status, estimatedValue: c.estimatedValue != null ? String(c.estimatedValue) : '',
      ownerId: c.ownerId ?? '', notes: c.notes ?? '',
    })
    setFormError(null); setModalOpen(true)
  }
  const closeModal = () => { setModalOpen(false); setEditing(null); setFormError(null) }

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('El nombre es requerido.'); return }
    setSaving(true); setFormError(null)
    try {
      const payload = {
        name: form.name.trim(),
        sector: form.sector.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        website: form.website.trim() || undefined,
        address: form.address.trim() || undefined,
        status: form.status,
        estimatedValue: form.estimatedValue ? Number(form.estimatedValue) : undefined,
        ownerId: form.ownerId || undefined,
        notes: form.notes.trim() || undefined,
      }
      const res = editing
        ? await clientsApi.update(editing.id, payload)
        : await clientsApi.create(payload)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar.' }))
        setFormError(err.message); toast.error(err.message); return
      }
      toast.success(editing ? 'Cliente actualizado correctamente.' : 'Cliente creado correctamente.')
      closeModal(); await load()
    } finally { setSaving(false) }
  }

  const handleToggle = async () => {
    if (!toggleTarget) return
    const wasActive = toggleTarget.isActive
    try {
      const res = await clientsApi.toggle(toggleTarget.id)
      if (res.ok) { toast.success(wasActive ? 'Cliente desactivado.' : 'Cliente activado.'); await load() }
      else toast.error('No se pudo cambiar el estado del cliente.')
    } finally { setToggleTarget(null) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await clientsApi.remove(deleteTarget.id)
      if (res.ok) { toast.success('Cliente eliminado correctamente.'); await load() }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar el cliente.' }))
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
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Clientes</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : `${clients.length} cliente(s) registrado(s)`}
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
              Nuevo cliente
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

      {/* Búsqueda */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar cliente…"
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
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Cliente</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Sector</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Email</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Ejecutivo</th>
                <th className="text-right px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Valor</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Estado</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50 dark:border-slate-700/40">
                    {[8, 40, 24, 32, 28, 20, 20, 20].map((w, j) => (
                      <td key={j} className="px-5 py-2">
                        <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" style={{ width: `${w * 4}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center">
                    <Building2 className="w-9 h-9 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">
                      {search ? 'Sin resultados para el filtro aplicado.' : 'No hay clientes registrados.'}
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
                          <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">{c.name}</p>
                          <p className="text-xs text-slate-400 truncate">{c.primaryContactName ?? 'Sin contacto principal'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-2 text-slate-600 dark:text-slate-300 text-left align-middle">{c.sector || '—'}</td>
                    <td className="px-5 py-2 text-slate-600 dark:text-slate-300 text-left align-middle">{c.email || '—'}</td>
                    <td className="px-5 py-2 text-slate-600 dark:text-slate-300 text-left align-middle">{c.ownerName ?? <span className="text-slate-300 dark:text-slate-600">Sin asignar</span>}</td>
                    <td className="px-5 py-2 font-medium text-slate-800 dark:text-slate-200 text-right align-middle">{fmtMoneyRounded(c.estimatedValue)}</td>
                    <td className="px-5 py-2 text-center align-middle">
                      <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_STYLES[c.status] ?? ''}`}>
                        {optionLabel(STATUS_OPTIONS, c.status)}
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
                {editing ? 'Editar Cliente' : 'Nuevo Cliente'}
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre <span className="text-red-500">*</span></label>
                    <input type="text" maxLength={200} placeholder="Ej: Grupo Industrial Norte" value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Estado</label>
                    <SearchSelect options={STATUS_OPTIONS} value={form.status} onChange={v => setForm(f => ({ ...f, status: v }))} placeholder="Selecciona…" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Sector</label>
                    <input type="text" maxLength={100} placeholder="Ej: Tecnología" value={form.sector}
                      onChange={e => setForm(f => ({ ...f, sector: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Valor estimado</label>
                    <input type="number" min={0} step="0.01" placeholder="0.00" value={form.estimatedValue}
                      onChange={e => setForm(f => ({ ...f, estimatedValue: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
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
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Sitio web</label>
                  <input type="text" maxLength={200} placeholder="https://www.empresa.com" value={form.website}
                    onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Dirección</label>
                  <input type="text" maxLength={300} placeholder="Dirección de la empresa" value={form.address}
                    onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Ejecutivo asignado</label>
                  <SearchSelect options={employees} value={form.ownerId} onChange={v => setForm(f => ({ ...f, ownerId: v }))} placeholder="Selecciona un empleado…" searchPlaceholder="Buscar empleado…" showAvatar />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Notas</label>
                  <textarea rows={3} maxLength={1000} placeholder="Notas internas sobre el cliente…" value={form.notes}
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
        title={toggleTarget?.isActive ? '¿Desactivar cliente?' : '¿Activar cliente?'}
        message={
          toggleTarget?.isActive
            ? `El cliente "${toggleTarget.name}" será desactivado.`
            : `El cliente "${toggleTarget?.name}" volverá a estar disponible.`
        }
        confirmLabel={toggleTarget?.isActive ? 'Sí, desactivar' : 'Sí, activar'}
        cancelLabel="Cancelar"
        onConfirm={handleToggle}
        onCancel={() => setToggleTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar cliente?"
        message={`El cliente "${deleteTarget?.name}" y todos sus contactos se eliminarán permanentemente. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
