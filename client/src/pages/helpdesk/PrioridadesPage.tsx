import { useEffect, useState } from 'react'
import { Plus, Pencil, ToggleLeft, ToggleRight, RefreshCw, Flag, Trash2, Save, ArrowUpDown } from 'lucide-react'
import { prioritiesApi } from '../../lib/api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useToast } from '../../context/ToastContext'
import { useModalTransition } from '../../hooks/useModalTransition'
import { usePermission } from '../../hooks/usePermission'
import { fmtDurationMs } from '../../lib/sla'
import { DurationInput } from '../../components/DurationInput'

interface Priority {
  id: string
  name: string
  level: number
  colorHex: string
  responseTargetMinutes?: number
  resolutionTargetMinutes?: number
  isActive: boolean
  createdAt: string
}

interface PriorityForm {
  name: string
  level: string
  colorHex: string
  responseTargetMinutes?: number
  resolutionTargetMinutes?: number
}

const EMPTY_FORM: PriorityForm = {
  name: '', level: '1', colorHex: '#64748B',
  responseTargetMinutes: undefined, resolutionTargetMinutes: undefined,
}

/** Formatea minutos como "Xhrs Ymin" (o "—" si no hay objetivo configurado). */
function fmtSlaTarget(minutes?: number): string {
  return minutes ? fmtDurationMs(minutes * 60_000) : '—'
}

const SWATCHES = ['#64748B', '#0EA5E9', '#F59E0B', '#EF4444', '#10B981', '#8B5CF6', '#EC4899']

export function PrioridadesPage() {
  const toast = useToast()

  const canCreate = usePermission('helpdesk.priorities.create')
  const canUpdate = usePermission('helpdesk.priorities.update')
  const canToggle = usePermission('helpdesk.priorities.toggle')
  const canDelete = usePermission('helpdesk.priorities.delete')

  const [priorities, setPriorities] = useState<Priority[]>([])
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [modalOpen, setModalOpen]       = useState(false)
  const [editing, setEditing]           = useState<Priority | null>(null)
  const [form, setForm]                 = useState<PriorityForm>(EMPTY_FORM)
  const [formError, setFormError]       = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)
  const [toggleTarget, setToggleTarget] = useState<Priority | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Priority | null>(null)
  const { mounted: modalMounted, closing: modalClosing } = useModalTransition(modalOpen)

  const load = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true)
    try {
      const res = await prioritiesApi.list()
      if (res.ok) setPriorities(await res.json())
    } finally {
      silent ? setRefreshing(false) : setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const sorted = [...priorities].sort((a, b) => a.level - b.level)

  const openCreate = () => {
    const nextLevel = priorities.length > 0 ? Math.max(...priorities.map(p => p.level)) + 1 : 1
    setEditing(null); setForm({ ...EMPTY_FORM, level: String(nextLevel) }); setFormError(null); setModalOpen(true)
  }
  const openEdit = (p: Priority) => {
    setEditing(p)
    setForm({
      name: p.name, level: String(p.level), colorHex: p.colorHex,
      responseTargetMinutes: p.responseTargetMinutes, resolutionTargetMinutes: p.resolutionTargetMinutes,
    })
    setFormError(null); setModalOpen(true)
  }
  const closeModal = () => { setModalOpen(false); setEditing(null); setFormError(null) }

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('El nombre es requerido.'); return }
    if (!form.level.trim() || Number.isNaN(Number(form.level))) { setFormError('El nivel debe ser un número.'); return }
    setSaving(true); setFormError(null)
    try {
      const payload = {
        name: form.name.trim(), level: Number(form.level), colorHex: form.colorHex,
        responseTargetMinutes: form.responseTargetMinutes,
        resolutionTargetMinutes: form.resolutionTargetMinutes,
      }
      const res = editing
        ? await prioritiesApi.update(editing.id, payload)
        : await prioritiesApi.create(payload)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar.' }))
        setFormError(err.message); toast.error(err.message); return
      }
      toast.success(editing ? 'Prioridad actualizada correctamente.' : 'Prioridad creada correctamente.')
      closeModal(); await load()
    } finally { setSaving(false) }
  }

  const handleToggle = async () => {
    if (!toggleTarget) return
    const wasActive = toggleTarget.isActive
    try {
      const res = await prioritiesApi.toggle(toggleTarget.id)
      if (res.ok) { toast.success(wasActive ? 'Prioridad desactivada.' : 'Prioridad activada.'); await load() }
      else toast.error('No se pudo cambiar el estado de la prioridad.')
    } finally { setToggleTarget(null) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await prioritiesApi.remove(deleteTarget.id)
      if (res.ok) { toast.success('Prioridad eliminada correctamente.'); await load() }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar la prioridad.' }))
        toast.error(err.message)
      }
    } finally { setDeleteTarget(null) }
  }

  return (
    <div className="p-6 space-y-4">

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Prioridades</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : `${priorities.length} prioridad(es) registrada(s), de menor a mayor nivel`}
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
              Nueva prioridad
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
                  <ArrowUpDown className="w-3.5 h-3.5 inline" /> Nivel
                </th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Prioridad</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">SLA respuesta</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">SLA resolución</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Estado</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50 dark:border-slate-700/40">
                    {[16, 32, 16, 16, 20, 20].map((w, j) => (
                      <td key={j} className="px-5 py-2">
                        <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" style={{ width: `${w * 4}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center">
                    <Flag className="w-9 h-9 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">No hay prioridades registradas.</p>
                  </td>
                </tr>
              ) : (
                sorted.map(p => (
                  <tr
                    key={p.id}
                    className="border-b border-slate-50 dark:border-slate-700/40 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition-colors"
                  >
                    <td className="px-5 py-2 text-sm text-slate-500 dark:text-slate-400 font-medium text-center align-middle">{p.level}</td>
                    <td className="px-5 py-2 text-left align-middle">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.colorHex }} />
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{p.name}</span>
                      </span>
                    </td>
                    <td className="px-5 py-2 text-center align-middle text-slate-500 dark:text-slate-400 text-xs">{fmtSlaTarget(p.responseTargetMinutes)}</td>
                    <td className="px-5 py-2 text-center align-middle text-slate-500 dark:text-slate-400 text-xs">{fmtSlaTarget(p.resolutionTargetMinutes)}</td>
                    <td className="px-5 py-2 text-center align-middle">
                      <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${
                        p.isActive
                          ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600'
                      }`}>
                        {p.isActive ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="px-5 py-2 align-middle">
                      <div className="flex items-center justify-center gap-0.5">
                        {canUpdate && (
                          <button
                            onClick={() => openEdit(p)}
                            title="Editar"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canToggle && (
                          <button
                            onClick={() => setToggleTarget(p)}
                            title={p.isActive ? 'Desactivar' : 'Activar'}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                              p.isActive
                                ? 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
                                : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                            }`}
                          >
                            {p.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setDeleteTarget(p)}
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
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden ${modalClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <div className="px-6 pt-6 shrink-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
                {editing ? 'Editar Prioridad' : 'Nueva Prioridad'}
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre <span className="text-red-500">*</span></label>
                    <input type="text" maxLength={50} placeholder="Ej: Urgente" value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nivel</label>
                    <input type="number" min={1} step="1" value={form.level}
                      onChange={e => setForm(f => ({ ...f, level: e.target.value }))}
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

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">SLA primera respuesta</label>
                    <DurationInput
                      minutes={form.responseTargetMinutes}
                      onChange={v => setForm(f => ({ ...f, responseTargetMinutes: v }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">SLA resolución</label>
                    <DurationInput
                      minutes={form.resolutionTargetMinutes}
                      onChange={v => setForm(f => ({ ...f, resolutionTargetMinutes: v }))}
                    />
                  </div>
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
        title={toggleTarget?.isActive ? '¿Desactivar prioridad?' : '¿Activar prioridad?'}
        message={
          toggleTarget?.isActive
            ? `La prioridad "${toggleTarget.name}" será desactivada.`
            : `La prioridad "${toggleTarget?.name}" volverá a estar disponible.`
        }
        confirmLabel={toggleTarget?.isActive ? 'Sí, desactivar' : 'Sí, activar'}
        cancelLabel="Cancelar"
        onConfirm={handleToggle}
        onCancel={() => setToggleTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar prioridad?"
        message={`La prioridad "${deleteTarget?.name}" se eliminará permanentemente. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
