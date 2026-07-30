import { useEffect, useState } from 'react'
import { Plus, Pencil, ToggleLeft, ToggleRight, RefreshCw, Waypoints, Trash2, Save, ArrowUpDown } from 'lucide-react'
import { ticketStatusesApi } from '../../lib/api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useToast } from '../../context/ToastContext'
import { useModalTransition } from '../../hooks/useModalTransition'
import { usePermission } from '../../hooks/usePermission'

interface TicketStatus {
  id: string
  name: string
  colorHex: string
  sortOrder: number
  isInitial: boolean
  isFinal: boolean
  requiresResolution: boolean
  isActive: boolean
  createdAt: string
}

interface Transition {
  fromStatusId: string
  toStatusId: string
}

interface StatusForm {
  name: string
  sortOrder: string
  colorHex: string
  isInitial: boolean
  isFinal: boolean
  requiresResolution: boolean
  allowedTransitionIds: string[]
}

const EMPTY_FORM: StatusForm = {
  name: '', sortOrder: '1', colorHex: '#64748B',
  isInitial: false, isFinal: false, requiresResolution: false, allowedTransitionIds: [],
}

const SWATCHES = ['#64748B', '#0EA5E9', '#F59E0B', '#EF4444', '#10B981', '#8B5CF6', '#EC4899']

export function EstadosPage() {
  const toast = useToast()

  const canCreate = usePermission('helpdesk.statuses.create')
  const canUpdate = usePermission('helpdesk.statuses.update')
  const canToggle = usePermission('helpdesk.statuses.toggle')
  const canDelete = usePermission('helpdesk.statuses.delete')

  const [statuses, setStatuses]     = useState<TicketStatus[]>([])
  const [transitions, setTransitions] = useState<Transition[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [modalOpen, setModalOpen]       = useState(false)
  const [editing, setEditing]           = useState<TicketStatus | null>(null)
  const [form, setForm]                 = useState<StatusForm>(EMPTY_FORM)
  const [formError, setFormError]       = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)
  const [toggleTarget, setToggleTarget] = useState<TicketStatus | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TicketStatus | null>(null)
  const { mounted: modalMounted, closing: modalClosing } = useModalTransition(modalOpen)

  const load = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true)
    try {
      const [statusesRes, transitionsRes] = await Promise.all([
        ticketStatusesApi.list(),
        ticketStatusesApi.transitions(),
      ])
      if (statusesRes.ok) setStatuses(await statusesRes.json())
      if (transitionsRes.ok) setTransitions(await transitionsRes.json())
    } finally {
      silent ? setRefreshing(false) : setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const sorted = [...statuses].sort((a, b) => a.sortOrder - b.sortOrder)

  const openCreate = () => {
    const nextOrder = statuses.length > 0 ? Math.max(...statuses.map(s => s.sortOrder)) + 1 : 1
    setEditing(null); setForm({ ...EMPTY_FORM, sortOrder: String(nextOrder) }); setFormError(null); setModalOpen(true)
  }
  const openEdit = (s: TicketStatus) => {
    setEditing(s)
    setForm({
      name: s.name, sortOrder: String(s.sortOrder), colorHex: s.colorHex,
      isInitial: s.isInitial, isFinal: s.isFinal, requiresResolution: s.requiresResolution,
      allowedTransitionIds: transitions.filter(t => t.fromStatusId === s.id).map(t => t.toStatusId),
    })
    setFormError(null); setModalOpen(true)
  }
  const closeModal = () => { setModalOpen(false); setEditing(null); setFormError(null) }

  const toggleTransition = (toStatusId: string) => {
    setForm(f => ({
      ...f,
      allowedTransitionIds: f.allowedTransitionIds.includes(toStatusId)
        ? f.allowedTransitionIds.filter(id => id !== toStatusId)
        : [...f.allowedTransitionIds, toStatusId],
    }))
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('El nombre es requerido.'); return }
    if (!form.sortOrder.trim() || Number.isNaN(Number(form.sortOrder))) { setFormError('El orden debe ser un número.'); return }
    setSaving(true); setFormError(null)
    try {
      const payload = {
        name: form.name.trim(),
        colorHex: form.colorHex,
        sortOrder: Number(form.sortOrder),
        isInitial: form.isInitial,
        isFinal: form.isFinal,
        requiresResolution: form.requiresResolution,
        allowedTransitionIds: form.allowedTransitionIds,
      }
      const res = editing
        ? await ticketStatusesApi.update(editing.id, payload)
        : await ticketStatusesApi.create(payload)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar.' }))
        setFormError(err.message); toast.error(err.message); return
      }
      toast.success(editing ? 'Estado actualizado correctamente.' : 'Estado creado correctamente.')
      closeModal(); await load()
    } finally { setSaving(false) }
  }

  const handleToggle = async () => {
    if (!toggleTarget) return
    const wasActive = toggleTarget.isActive
    try {
      const res = await ticketStatusesApi.toggle(toggleTarget.id)
      if (res.ok) { toast.success(wasActive ? 'Estado desactivado.' : 'Estado activado.'); await load() }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo cambiar la disponibilidad del estado.' }))
        toast.error(err.message)
      }
    } finally { setToggleTarget(null) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await ticketStatusesApi.remove(deleteTarget.id)
      if (res.ok) { toast.success('Estado eliminado correctamente.'); await load() }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar el estado.' }))
        toast.error(err.message)
      }
    } finally { setDeleteTarget(null) }
  }

  return (
    <div className="p-6 space-y-4">

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Estados de ticket</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : `${statuses.length} estado(s) registrado(s), de menor a mayor orden`}
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
              Nuevo estado
            </button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider w-16">
                  <ArrowUpDown className="w-3.5 h-3.5 inline" /> Orden
                </th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Estado</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Ciclo de vida</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Disponibilidad</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50 dark:border-slate-700/40">
                    {[16, 32, 32, 20, 20].map((w, j) => (
                      <td key={j} className="px-5 py-2">
                        <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" style={{ width: `${w * 4}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-16 text-center">
                    <Waypoints className="w-9 h-9 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">No hay estados registrados.</p>
                  </td>
                </tr>
              ) : (
                sorted.map(s => (
                  <tr
                    key={s.id}
                    className="border-b border-slate-50 dark:border-slate-700/40 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition-colors"
                  >
                    <td className="px-5 py-2 text-sm text-slate-500 dark:text-slate-400 font-medium text-center align-middle">{s.sortOrder}</td>
                    <td className="px-5 py-2 text-left align-middle">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.colorHex }} />
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{s.name}</span>
                      </span>
                    </td>
                    <td className="px-5 py-2 text-left align-middle">
                      <div className="flex flex-wrap gap-1">
                        {s.isInitial && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-100 dark:border-sky-500/20">Inicial</span>}
                        {s.requiresResolution && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-500/20">Requiere solución</span>}
                        {s.isFinal && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">Final</span>}
                        {!s.isInitial && !s.requiresResolution && !s.isFinal && <span className="text-xs text-slate-400">—</span>}
                      </div>
                    </td>
                    <td className="px-5 py-2 text-center align-middle">
                      <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${
                        s.isActive
                          ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600'
                      }`}>
                        {s.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-5 py-2 align-middle">
                      <div className="flex items-center justify-center gap-0.5">
                        {canUpdate && (
                          <button
                            onClick={() => openEdit(s)}
                            title="Editar"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canToggle && (
                          <button
                            onClick={() => setToggleTarget(s)}
                            title={s.isActive ? 'Desactivar' : 'Activar'}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                              s.isActive
                                ? 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
                                : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                            }`}
                          >
                            {s.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setDeleteTarget(s)}
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
      </div>

      {modalMounted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${modalClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden ${modalClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <div className="px-6 pt-6 shrink-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
                {editing ? 'Editar Estado' : 'Nuevo Estado'}
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre <span className="text-red-500">*</span></label>
                    <input type="text" maxLength={50} placeholder="Ej: Esperando cliente" value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Orden</label>
                    <input type="number" min={1} step="1" value={form.sortOrder}
                      onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Color</label>
                  <div className="flex items-center gap-2">
                    {SWATCHES.map(color => (
                      <button key={color} type="button" onClick={() => setForm(f => ({ ...f, colorHex: color }))}
                        className={`w-7 h-7 rounded-full transition-transform ${form.colorHex.toLowerCase() === color.toLowerCase() ? 'ring-2 ring-offset-2 ring-indigo-500 dark:ring-offset-slate-900 scale-110' : 'hover:scale-105'}`}
                        style={{ backgroundColor: color }} title={color} />
                    ))}
                    <input type="color" value={form.colorHex} onChange={e => setForm(f => ({ ...f, colorHex: e.target.value }))}
                      className="w-7 h-7 rounded-full border border-slate-200 dark:border-slate-700 cursor-pointer bg-transparent" title="Color personalizado" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Ciclo de vida</label>
                  <div className="grid grid-cols-1 gap-2">
                    <label className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <input type="checkbox" checked={form.isInitial}
                        onChange={e => setForm(f => ({ ...f, isInitial: e.target.checked }))}
                        className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                      <span>Es inicial <span className="text-slate-400">— los tickets nuevos se crean en este estado.</span></span>
                    </label>
                    <label className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <input type="checkbox" checked={form.requiresResolution}
                        onChange={e => setForm(f => ({ ...f, requiresResolution: e.target.checked }))}
                        className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                      <span>Requiere solución <span className="text-slate-400">— exige indicar la solución para poder pasar a este estado.</span></span>
                    </label>
                    <label className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <input type="checkbox" checked={form.isFinal}
                        onChange={e => setForm(f => ({ ...f, isFinal: e.target.checked }))}
                        className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                      <span>Es final <span className="text-slate-400">— el ticket queda bloqueado (no se puede editar, comentar ni adjuntar).</span></span>
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Transiciones permitidas desde este estado</label>
                  {statuses.filter(s => !editing || s.id !== editing.id).length === 0 ? (
                    <p className="text-xs text-slate-400">Creá otro estado primero para poder habilitar transiciones.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                      {statuses.filter(s => !editing || s.id !== editing.id).map(s => (
                        <label key={s.id} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                          <input type="checkbox" checked={form.allowedTransitionIds.includes(s.id)}
                            onChange={() => toggleTransition(s.id)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.colorHex }} />
                          {s.name}
                        </label>
                      ))}
                    </div>
                  )}
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
        title={toggleTarget?.isActive ? '¿Desactivar estado?' : '¿Activar estado?'}
        message={
          toggleTarget?.isActive
            ? `El estado "${toggleTarget.name}" será desactivado. Si hay tickets en este estado, quedarán tal cual — solo dejará de ofrecerse para tickets nuevos.`
            : `El estado "${toggleTarget?.name}" volverá a estar disponible.`
        }
        confirmLabel={toggleTarget?.isActive ? 'Sí, desactivar' : 'Sí, activar'}
        cancelLabel="Cancelar"
        onConfirm={handleToggle}
        onCancel={() => setToggleTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar estado?"
        message={`El estado "${deleteTarget?.name}" se eliminará permanentemente. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
