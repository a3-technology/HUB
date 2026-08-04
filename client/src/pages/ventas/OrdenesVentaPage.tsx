import { useEffect, useState } from 'react'
import { Plus, Search, Pencil, ToggleLeft, ToggleRight, RefreshCw, ShoppingCart, TrendingUp, DollarSign, CheckCircle2, Trash2, Save, ArrowRightCircle } from 'lucide-react'
import { salesOrdersApi, contactsApi, employeeDirectoryApi, currenciesApi, productsApi } from '../../lib/api'
import { fmtMoneyWithSymbol } from '../../lib/format'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Pagination, usePagination, type PageSize } from '../../components/Pagination'
import { SearchSelect, type SearchSelectOption } from '../../components/SearchSelect'
import { DatePicker } from '../../components/DatePicker'
import { LineItemsEditor, EMPTY_LINE, type LineItem, type ProductCatalogEntry } from '../../components/LineItemsEditor'
import { useToast } from '../../context/ToastContext'
import { useModalTransition } from '../../hooks/useModalTransition'
import { usePermission } from '../../hooks/usePermission'

interface SalesOrder {
  id: string
  code: string
  clientId: string
  clientName: string
  contactId?: string
  contactName?: string
  sourceQuoteId?: string
  sourceQuoteCode?: string
  orderDate: string
  deliveryDate?: string
  status: string
  currencyId: string
  currencyCode: string
  currencySymbol: string
  subtotal: number
  taxTotal: number
  total: number
  ownerId?: string
  ownerName?: string
  notes?: string
  isActive: boolean
  createdAt: string
}

interface OrderForm {
  clientId: string
  contactId: string
  orderDate: string
  deliveryDate: string
  currencyId: string
  ownerId: string
  notes: string
}

const EMPTY_FORM: OrderForm = { clientId: '', contactId: '', orderDate: '', deliveryDate: '', currencyId: '', ownerId: '', notes: '' }

const STATUS_OPTIONS: SearchSelectOption[] = [
  { value: 'Pending',   label: 'Pendiente' },
  { value: 'Confirmed', label: 'Confirmada' },
  { value: 'Delivered', label: 'Entregada' },
  { value: 'Invoiced',  label: 'Facturada' },
  { value: 'Cancelled', label: 'Cancelada' },
]

const STATUS_STYLES: Record<string, string> = {
  Pending:   'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600',
  Confirmed: 'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-100 dark:border-sky-500/20',
  Delivered: 'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-100 dark:border-violet-500/20',
  Invoiced:  'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20',
  Cancelled: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-100 dark:border-red-500/20',
}

export function OrdenesVentaPage() {
  const toast = useToast()

  const canCreate       = usePermission('ventas.orders.create')
  const canUpdate       = usePermission('ventas.orders.update')
  const canChangeStatus = usePermission('ventas.orders.change-status')
  const canToggle       = usePermission('ventas.orders.toggle')
  const canDelete       = usePermission('ventas.orders.delete')
  const canConvert      = usePermission('ventas.orders.convert')

  const [orders, setOrders]       = useState<SalesOrder[]>([])
  const [employees, setEmployees] = useState<SearchSelectOption[]>([])
  const [currencies, setCurrencies] = useState<SearchSelectOption[]>([])
  const [currencySymbols, setCurrencySymbols] = useState<Record<string, string>>({})
  const [productOptions, setProductOptions] = useState<SearchSelectOption[]>([])
  const [productCatalog, setProductCatalog] = useState<ProductCatalogEntry[]>([])
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage]           = useState(1)
  const [pageSize, setPageSize]   = useState<PageSize>(10)

  const [modalOpen, setModalOpen]       = useState(false)
  const [editing, setEditing]           = useState<SalesOrder | null>(null)
  const [form, setForm]                 = useState<OrderForm>(EMPTY_FORM)
  const [lines, setLines]               = useState<LineItem[]>([{ ...EMPTY_LINE }])
  const [formError, setFormError]       = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)
  const [toggleTarget, setToggleTarget] = useState<SalesOrder | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SalesOrder | null>(null)
  const [convertTarget, setConvertTarget] = useState<SalesOrder | null>(null)
  const [convertTitle, setConvertTitle] = useState('')
  const [convertStartDate, setConvertStartDate] = useState('')
  const [convertEndDate, setConvertEndDate] = useState('')
  const [converting, setConverting] = useState(false)
  const { mounted: modalMounted, closing: modalClosing } = useModalTransition(modalOpen)
  const { mounted: convertMounted, closing: convertClosing } = useModalTransition(!!convertTarget)

  const load = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true)
    try {
      const res = await salesOrdersApi.list()
      if (res.ok) setOrders(await res.json())
    } finally {
      silent ? setRefreshing(false) : setLoading(false)
    }
  }

  const loadOptions = async () => {
    const [empRes, curRes, prodRes] = await Promise.all([
      employeeDirectoryApi.list(), currenciesApi.list(), productsApi.list({ active: true }),
    ])
    if (empRes.ok) {
      const data = await empRes.json()
      setEmployees(data.map((e: { id: string; firstName: string; lastName: string; photoUrl?: string }) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, photoUrl: e.photoUrl })))
    }
    if (curRes.ok) {
      const data: { id: string; code: string; name: string; symbol: string }[] = await curRes.json()
      setCurrencies(data.map(c => ({ value: c.id, label: `${c.code} — ${c.name}` })))
      setCurrencySymbols(Object.fromEntries(data.map(c => [c.id, c.symbol])))
    }
    if (prodRes.ok) {
      const data: { id: string; name: string; code: string; price: number; taxRate: number }[] = await prodRes.json()
      setProductOptions(data.map(p => ({ value: p.id, label: `${p.code} — ${p.name}` })))
      setProductCatalog(data.map(p => ({ id: p.id, name: p.name, price: p.price, taxRate: p.taxRate })))
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => { loadOptions() }, [])

  const [clientContacts, setClientContacts] = useState<SearchSelectOption[]>([])
  useEffect(() => {
    if (!form.clientId) { setClientContacts([]); return }
    let cancelled = false
    contactsApi.list({ companyId: form.clientId, active: true }).then(async res => {
      if (!res.ok || cancelled) return
      const data: { id: string; name: string }[] = await res.json()
      setClientContacts(data.map(c => ({ value: c.id, label: c.name })))
    })
    return () => { cancelled = true }
  }, [form.clientId])

  const handleSearch = (value: string) => { setSearch(value); setPage(1) }

  const filtered = orders
    .filter(o => o.code.toLowerCase().includes(search.toLowerCase()) || o.clientName.toLowerCase().includes(search.toLowerCase()))
    .filter(o => !statusFilter || o.status === statusFilter)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const paginated = usePagination(filtered, page, pageSize)

  const now = new Date()
  const stats = [
    { label: 'Total órdenes',   value: String(orders.length), icon: ShoppingCart, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-500/10' },
    { label: 'Creadas este mes', value: String(orders.filter(o => { const d = new Date(o.createdAt); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() }).length), icon: TrendingUp, color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-500/10' },
    { label: 'Facturadas',      value: String(orders.filter(o => o.status === 'Invoiced').length), icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
    { label: 'Valor total',     value: fmtMoneyWithSymbol(orders.reduce((sum, o) => sum + o.total, 0), orders[0]?.currencySymbol ?? '$'), icon: DollarSign, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-500/10' },
  ]

  const toFormDate = (d?: string) => d ? d.slice(0, 10) : ''
  const todayDate = () => new Date().toISOString().slice(0, 10)

  const openCreate = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM, orderDate: todayDate(), currencyId: currencies[0]?.value ?? '' })
    setLines([{ ...EMPTY_LINE }])
    setFormError(null); setModalOpen(true)
  }

  const openEdit = async (o: SalesOrder) => {
    setEditing(o)
    setForm({
      clientId: o.clientId, contactId: o.contactId ?? '',
      orderDate: toFormDate(o.orderDate), deliveryDate: toFormDate(o.deliveryDate),
      currencyId: o.currencyId, ownerId: o.ownerId ?? '', notes: o.notes ?? '',
    })
    setFormError(null); setModalOpen(true)
    const res = await salesOrdersApi.getLines(o.id)
    if (res.ok) {
      const data: { productId: string; description?: string; quantity: number; unitPrice: number; taxRate: number }[] = await res.json()
      setLines(data.length > 0 ? data.map(l => ({
        productId: l.productId, description: l.description ?? '', quantity: String(l.quantity), unitPrice: String(l.unitPrice), taxRate: String(l.taxRate),
      })) : [{ ...EMPTY_LINE }])
    }
  }

  const closeModal = () => { setModalOpen(false); setEditing(null); setFormError(null) }

  const handleSave = async () => {
    if (!form.clientId) { setFormError('El cliente es requerido.'); return }
    if (!form.orderDate) { setFormError('La fecha de la orden es requerida.'); return }
    if (!form.currencyId) { setFormError('La moneda es requerida.'); return }
    if (lines.some(l => !l.productId)) { setFormError('Todas las líneas deben tener un producto seleccionado.'); return }
    setSaving(true); setFormError(null)
    try {
      const payload = {
        clientId: form.clientId,
        contactId: form.contactId || undefined,
        orderDate: form.orderDate,
        deliveryDate: form.deliveryDate || undefined,
        currencyId: form.currencyId,
        ownerId: form.ownerId || undefined,
        notes: form.notes.trim() || undefined,
        lines: lines.map(l => ({
          productId: l.productId, description: l.description.trim() || undefined,
          quantity: Number(l.quantity) || 0, unitPrice: Number(l.unitPrice) || 0, taxRate: Number(l.taxRate) || 0,
        })),
      }
      const res = editing
        ? await salesOrdersApi.update(editing.id, payload)
        : await salesOrdersApi.create(payload)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar.' }))
        setFormError(err.message); toast.error(err.message); return
      }
      toast.success(editing ? 'Orden de venta actualizada correctamente.' : 'Orden de venta creada correctamente.')
      closeModal(); await load()
    } finally { setSaving(false) }
  }

  const handleChangeStatus = async (o: SalesOrder, status: string) => {
    const res = await salesOrdersApi.changeStatus(o.id, status)
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
      const res = await salesOrdersApi.toggle(toggleTarget.id)
      if (res.ok) { toast.success(wasActive ? 'Orden desactivada.' : 'Orden activada.'); await load() }
      else toast.error('No se pudo cambiar el estado de la orden.')
    } finally { setToggleTarget(null) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await salesOrdersApi.remove(deleteTarget.id)
      if (res.ok) { toast.success('Orden de venta eliminada correctamente.'); await load() }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar la orden.' }))
        toast.error(err.message)
      }
    } finally { setDeleteTarget(null) }
  }

  const openConvert = (o: SalesOrder) => {
    setConvertTarget(o)
    setConvertTitle(`Contrato — ${o.clientName}`)
    setConvertStartDate(todayDate())
    setConvertEndDate('')
  }

  const handleConvert = async () => {
    if (!convertTarget || !convertTitle.trim() || !convertStartDate) return
    setConverting(true)
    try {
      const res = await salesOrdersApi.convert(convertTarget.id, { title: convertTitle.trim(), startDate: convertStartDate, endDate: convertEndDate || undefined })
      const body = await res.json().catch(() => null)
      if (res.ok) {
        toast.success(body?.message ?? 'Orden convertida a contrato.')
        setConvertTarget(null); await load()
      } else {
        toast.error(body?.message ?? 'No se pudo convertir la orden.')
      }
    } finally { setConverting(false) }
  }

  const globalIndex = (i: number) =>
    pageSize === 'all' ? i + 1 : (page - 1) * (pageSize as number) + i + 1

  return (
    <div className="p-6 space-y-4">

      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Órdenes de Venta</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : `${orders.length} orden(es) registrada(s)`}
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
              disabled
              title="Deshabilitado temporalmente: el módulo de Clientes está siendo rediseñado como Empresas/Sucursales."
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg opacity-50 cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              Nueva orden
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
            placeholder="Buscar por código o cliente…"
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
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Cliente</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Fecha</th>
                <th className="text-right px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Total</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Ejecutivo</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Estado</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50 dark:border-slate-700/40">
                    {[8, 20, 32, 20, 20, 24, 20, 24].map((w, j) => (
                      <td key={j} className="px-5 py-2">
                        <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" style={{ width: `${w * 4}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center">
                    <ShoppingCart className="w-9 h-9 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">
                      {search || statusFilter ? 'Sin resultados para el filtro aplicado.' : 'No hay órdenes de venta registradas.'}
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
                    <td className="px-5 py-2 text-slate-500 dark:text-slate-400 text-left align-middle font-mono text-xs">{o.code}</td>
                    <td className="px-5 py-2 text-left align-middle">
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{o.clientName}</p>
                      {o.sourceQuoteCode && <p className="text-xs text-slate-400 truncate">de {o.sourceQuoteCode}</p>}
                    </td>
                    <td className="px-5 py-2 text-slate-600 dark:text-slate-300 text-left align-middle">{new Date(o.orderDate).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                    <td className="px-5 py-2 font-medium text-slate-800 dark:text-slate-200 text-right align-middle">{fmtMoneyWithSymbol(o.total, o.currencySymbol)}</td>
                    <td className="px-5 py-2 text-slate-600 dark:text-slate-300 text-left align-middle">{o.ownerName ?? <span className="text-slate-300 dark:text-slate-600">Sin asignar</span>}</td>
                    <td className="px-5 py-2 text-center align-middle">
                      {canChangeStatus ? (
                        <select
                          value={o.status}
                          onChange={e => handleChangeStatus(o, e.target.value)}
                          className={`text-xs font-medium px-2.5 py-1 rounded-full border cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 ${STATUS_STYLES[o.status] ?? ''}`}
                        >
                          {STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                      ) : (
                        <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_STYLES[o.status] ?? ''}`}>
                          {STATUS_OPTIONS.find(opt => opt.value === o.status)?.label ?? o.status}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2 align-middle">
                      <div className="flex items-center justify-center gap-0.5">
                        {['Confirmed', 'Delivered', 'Invoiced'].includes(o.status) && canConvert && (
                          <button
                            onClick={() => openConvert(o)}
                            title="Convertir a contrato"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                          >
                            <ArrowRightCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {!['Invoiced', 'Cancelled'].includes(o.status) && canUpdate && (
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

      {/* Modal crear / editar */}
      {modalMounted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${modalClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden ${modalClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <div className="px-6 pt-6 shrink-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
                {editing ? `Editar Orden ${editing.code}` : 'Nueva Orden de Venta'}
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Contacto</label>
                  <SearchSelect options={clientContacts} value={form.contactId} onChange={v => setForm(f => ({ ...f, contactId: v }))} placeholder={form.clientId ? 'Selecciona…' : 'Primero un cliente…'} searchPlaceholder="Buscar contacto…" />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Fecha de orden <span className="text-red-500">*</span></label>
                    <DatePicker value={form.orderDate} onChange={v => setForm(f => ({ ...f, orderDate: v }))} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Fecha de entrega</label>
                    <DatePicker value={form.deliveryDate} onChange={v => setForm(f => ({ ...f, deliveryDate: v }))} />
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

                <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 pt-2">Líneas de detalle <span className="text-red-500">*</span></label>
                  <LineItemsEditor
                    lines={lines}
                    onChange={setLines}
                    productOptions={productOptions}
                    productCatalog={productCatalog}
                    currencySymbol={currencySymbols[form.currencyId] ?? '$'}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Notas</label>
                  <textarea rows={2} maxLength={1000} placeholder="Notas internas sobre esta orden…" value={form.notes}
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

      {/* Modal convertir a contrato */}
      {convertMounted && convertTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${convertClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden ${convertClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <div className="px-6 pt-6 shrink-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">Convertir a Contrato</h2>
              <p className="text-sm text-slate-500 mb-4">La orden {convertTarget.code} generará un nuevo contrato con el cliente.</p>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-1 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Título del contrato <span className="text-red-500">*</span></label>
                <input type="text" maxLength={200} value={convertTitle} onChange={e => setConvertTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Inicio <span className="text-red-500">*</span></label>
                  <DatePicker value={convertStartDate} onChange={setConvertStartDate} />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Fin</label>
                  <DatePicker value={convertEndDate} onChange={setConvertEndDate} />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button onClick={() => setConvertTarget(null)} disabled={converting}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleConvert} disabled={converting || !convertTitle.trim() || !convertStartDate}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {converting
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <ArrowRightCircle className="w-3.5 h-3.5" />}
                {converting ? 'Convirtiendo…' : 'Convertir'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!toggleTarget}
        title={toggleTarget?.isActive ? '¿Desactivar orden?' : '¿Activar orden?'}
        message={
          toggleTarget?.isActive
            ? `La orden "${toggleTarget.code}" será desactivada.`
            : `La orden "${toggleTarget?.code}" volverá a estar disponible.`
        }
        confirmLabel={toggleTarget?.isActive ? 'Sí, desactivar' : 'Sí, activar'}
        cancelLabel="Cancelar"
        onConfirm={handleToggle}
        onCancel={() => setToggleTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar orden de venta?"
        message={`La orden "${deleteTarget?.code}" se eliminará permanentemente. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
