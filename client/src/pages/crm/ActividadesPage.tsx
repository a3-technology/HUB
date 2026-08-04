import { useEffect, useState } from 'react'
import { Plus, Search, Pencil, ToggleLeft, ToggleRight, RefreshCw, ClipboardList, Trash2, Save, Phone, Users, Mail, StickyNote } from 'lucide-react'
import { activitiesApi, contactsApi, opportunitiesApi, employeeDirectoryApi } from '../../lib/api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Pagination, usePagination, type PageSize } from '../../components/Pagination'
import { SearchSelect, type SearchSelectOption } from '../../components/SearchSelect'
import { DatePicker } from '../../components/DatePicker'
import { useToast } from '../../context/ToastContext'
import { useModalTransition } from '../../hooks/useModalTransition'
import { usePermission } from '../../hooks/usePermission'

interface Activity {
  id: string
  clientId: string
  clientName: string
  contactId?: string
  contactName?: string
  opportunityId?: string
  opportunityName?: string
  type: string
  subject: string
  description?: string
  activityDate: string
  ownerId?: string
  ownerName?: string
  ownerPhotoUrl?: string
  isActive: boolean
  createdAt: string
}

interface ActivityForm {
  clientId: string
  contactId: string
  opportunityId: string
  type: string
  subject: string
  description: string
  activityDate: string
  ownerId: string
}

const todayISO = () => new Date().toISOString().slice(0, 10)

const EMPTY_FORM: ActivityForm = {
  clientId: '', contactId: '', opportunityId: '', type: 'Call', subject: '', description: '',
  activityDate: todayISO(), ownerId: '',
}

const TYPE_OPTIONS: SearchSelectOption[] = [
  { value: 'Call',    label: 'Llamada' },
  { value: 'Meeting', label: 'Reunión' },
  { value: 'Email',   label: 'Correo'  },
  { value: 'Note',    label: 'Nota'    },
]

const TYPE_ICONS: Record<string, typeof Phone> = {
  Call: Phone, Meeting: Users, Email: Mail, Note: StickyNote,
}

function optionLabel(options: SearchSelectOption[], value: string) {
  return options.find(o => o.value === value)?.label ?? value
}

export function ActividadesPage() {
  const toast = useToast()

  const canCreate = usePermission('crm.activities.create')
  const canUpdate = usePermission('crm.activities.update')
  const canToggle = usePermission('crm.activities.toggle')
  const canDelete = usePermission('crm.activities.delete')

  const [activities, setActivities] = useState<Activity[]>([])
  const [employees, setEmployees]   = useState<SearchSelectOption[]>([])
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch]       = useState('')
  const [page, setPage]           = useState(1)
  const [pageSize, setPageSize]   = useState<PageSize>(10)

  const [modalOpen, setModalOpen]       = useState(false)
  const [editing, setEditing]           = useState<Activity | null>(null)
  const [form, setForm]                 = useState<ActivityForm>(EMPTY_FORM)
  const [formError, setFormError]       = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)
  const [toggleTarget, setToggleTarget] = useState<Activity | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Activity | null>(null)
  const { mounted: modalMounted, closing: modalClosing } = useModalTransition(modalOpen)

  const load = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true)
    try {
      const res = await activitiesApi.list()
      if (res.ok) setActivities(await res.json())
    } finally {
      silent ? setRefreshing(false) : setLoading(false)
    }
  }

  const loadOptions = async () => {
    const empRes = await employeeDirectoryApi.list()
    if (empRes.ok) {
      const data = await empRes.json()
      setEmployees(data.map((e: { id: string; firstName: string; lastName: string; photoUrl?: string }) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, photoUrl: e.photoUrl })))
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => { loadOptions() }, [])

  // Solo los contactos y oportunidades del cliente elegido pueden asociarse a la actividad.
  const [clientContacts, setClientContacts] = useState<SearchSelectOption[]>([])
  const [clientOpportunities, setClientOpportunities] = useState<SearchSelectOption[]>([])
  useEffect(() => {
    if (!form.clientId) { setClientContacts([]); setClientOpportunities([]); return }
    let cancelled = false
    contactsApi.list({ companyId: form.clientId, active: true }).then(async res => {
      if (!res.ok || cancelled) return
      const data: { id: string; name: string }[] = await res.json()
      setClientContacts(data.map(c => ({ value: c.id, label: c.name })))
    })
    opportunitiesApi.list({ clientId: form.clientId, active: true }).then(async res => {
      if (!res.ok || cancelled) return
      const data: { id: string; name: string }[] = await res.json()
      setClientOpportunities(data.map(o => ({ value: o.id, label: o.name })))
    })
    return () => { cancelled = true }
  }, [form.clientId])

  const handleSearch = (value: string) => { setSearch(value); setPage(1) }

  const filtered = activities
    .filter(a => a.subject.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.activityDate.localeCompare(a.activityDate) || b.createdAt.localeCompare(a.createdAt))
  const paginated = usePagination(filtered, page, pageSize)

  const toFormDate = (d?: string) => d ? d.slice(0, 10) : ''
  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setFormError(null); setModalOpen(true) }
  const openEdit   = (a: Activity) => {
    setEditing(a)
    setForm({
      clientId: a.clientId, contactId: a.contactId ?? '', opportunityId: a.opportunityId ?? '', type: a.type,
      subject: a.subject, description: a.description ?? '', activityDate: toFormDate(a.activityDate), ownerId: a.ownerId ?? '',
    })
    setFormError(null); setModalOpen(true)
  }
  const closeModal = () => { setModalOpen(false); setEditing(null); setFormError(null) }

  const handleSave = async () => {
    if (!form.clientId) { setFormError('El cliente es requerido.'); return }
    if (!form.subject.trim()) { setFormError('El asunto es requerido.'); return }
    if (!form.activityDate) { setFormError('La fecha es requerida.'); return }
    setSaving(true); setFormError(null)
    try {
      const payload = {
        clientId: form.clientId,
        contactId: form.contactId || undefined,
        opportunityId: form.opportunityId || undefined,
        type: form.type,
        subject: form.subject.trim(),
        description: form.description.trim() || undefined,
        activityDate: form.activityDate,
        ownerId: form.ownerId || undefined,
      }
      const res = editing
        ? await activitiesApi.update(editing.id, payload)
        : await activitiesApi.create(payload)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar.' }))
        setFormError(err.message); toast.error(err.message); return
      }
      toast.success(editing ? 'Actividad actualizada correctamente.' : 'Actividad creada correctamente.')
      closeModal(); await load()
    } finally { setSaving(false) }
  }

  const handleToggle = async () => {
    if (!toggleTarget) return
    const wasActive = toggleTarget.isActive
    try {
      const res = await activitiesApi.toggle(toggleTarget.id)
      if (res.ok) { toast.success(wasActive ? 'Actividad desactivada.' : 'Actividad activada.'); await load() }
      else toast.error('No se pudo cambiar el estado de la actividad.')
    } finally { setToggleTarget(null) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await activitiesApi.remove(deleteTarget.id)
      if (res.ok) { toast.success('Actividad eliminada correctamente.'); await load() }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar la actividad.' }))
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
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Actividades</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : `${activities.length} actividad(es) registrada(s)`}
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
              Nueva actividad
            </button>
          )}
        </div>
      </div>

      {/* Búsqueda */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1 min-w-0 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por asunto…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
          />
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider w-12">#</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Fecha</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Tipo</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Asunto</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Cliente</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Contacto</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Ejecutivo</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50 dark:border-slate-700/40">
                    {[8, 20, 24, 40, 28, 24, 28, 20].map((w, j) => (
                      <td key={j} className="px-5 py-2">
                        <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" style={{ width: `${w * 4}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center">
                    <ClipboardList className="w-9 h-9 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">
                      {search ? 'Sin resultados para el filtro aplicado.' : 'No hay actividades registradas.'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginated.map((a, i) => {
                  const TypeIcon = TYPE_ICONS[a.type] ?? StickyNote
                  return (
                    <tr
                      key={a.id}
                      className="border-b border-slate-50 dark:border-slate-700/40 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition-colors"
                    >
                      <td className="px-5 py-2 text-xs text-slate-400 dark:text-slate-500 font-medium text-center align-middle">
                        {globalIndex(i)}
                      </td>
                      <td className="px-5 py-2 text-slate-500 dark:text-slate-400 text-left align-middle text-xs">{fmtDate(a.activityDate)}</td>
                      <td className="px-5 py-2 text-left align-middle">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                          <TypeIcon className="w-3.5 h-3.5 text-slate-400" />
                          {optionLabel(TYPE_OPTIONS, a.type)}
                        </span>
                      </td>
                      <td className="px-5 py-2 text-left align-middle">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">{a.subject}</p>
                      </td>
                      <td className="px-5 py-2 text-slate-600 dark:text-slate-300 text-left align-middle">{a.clientName}</td>
                      <td className="px-5 py-2 text-slate-600 dark:text-slate-300 text-left align-middle">{a.contactName || '—'}</td>
                      <td className="px-5 py-2 text-slate-600 dark:text-slate-300 text-left align-middle">{a.ownerName ?? <span className="text-slate-300 dark:text-slate-600">Sin asignar</span>}</td>
                      <td className="px-5 py-2 align-middle">
                        <div className="flex items-center justify-center gap-0.5">
                          {canUpdate && (
                            <button
                              onClick={() => openEdit(a)}
                              title="Editar"
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canToggle && (
                            <button
                              onClick={() => setToggleTarget(a)}
                              title={a.isActive ? 'Desactivar' : 'Activar'}
                              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                                a.isActive
                                  ? 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
                                  : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                              }`}
                            >
                              {a.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => setDeleteTarget(a)}
                              title="Eliminar"
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
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
                {editing ? 'Editar Actividad' : 'Nueva Actividad'}
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Contacto</label>
                    <SearchSelect options={clientContacts} value={form.contactId} onChange={v => setForm(f => ({ ...f, contactId: v }))} placeholder={form.clientId ? 'Selecciona…' : 'Primero un cliente…'} searchPlaceholder="Buscar contacto…" emptyLabel="Sin contactos activos." />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Oportunidad</label>
                    <SearchSelect options={clientOpportunities} value={form.opportunityId} onChange={v => setForm(f => ({ ...f, opportunityId: v }))} placeholder={form.clientId ? 'Selecciona…' : 'Primero un cliente…'} searchPlaceholder="Buscar oportunidad…" emptyLabel="Sin oportunidades activas." />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Asunto <span className="text-red-500">*</span></label>
                    <input type="text" maxLength={200} placeholder="Ej: Llamada de seguimiento" value={form.subject}
                      onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Tipo</label>
                    <SearchSelect options={TYPE_OPTIONS} value={form.type} onChange={v => setForm(f => ({ ...f, type: v }))} placeholder="Selecciona…" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Fecha <span className="text-red-500">*</span></label>
                    <DatePicker value={form.activityDate} onChange={v => setForm(f => ({ ...f, activityDate: v }))} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Ejecutivo</label>
                    <SearchSelect options={employees} value={form.ownerId} onChange={v => setForm(f => ({ ...f, ownerId: v }))} placeholder="Selecciona…" searchPlaceholder="Buscar empleado…" showAvatar />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Descripción</label>
                  <textarea rows={3} maxLength={1000} placeholder="Detalle de la interacción…" value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
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
        title={toggleTarget?.isActive ? '¿Desactivar actividad?' : '¿Activar actividad?'}
        message={
          toggleTarget?.isActive
            ? `La actividad "${toggleTarget.subject}" será desactivada.`
            : `La actividad "${toggleTarget?.subject}" volverá a estar disponible.`
        }
        confirmLabel={toggleTarget?.isActive ? 'Sí, desactivar' : 'Sí, activar'}
        cancelLabel="Cancelar"
        onConfirm={handleToggle}
        onCancel={() => setToggleTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar actividad?"
        message={`La actividad "${deleteTarget?.subject}" se eliminará permanentemente. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
