import { useEffect, useState } from 'react'
import { Plus, Search, Pencil, ToggleLeft, ToggleRight, RefreshCw, Tag, Trash2, Save } from 'lucide-react'
import { ticketCategoriesApi } from '../../lib/api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Pagination, usePagination, type PageSize } from '../../components/Pagination'
import { useToast } from '../../context/ToastContext'
import { useModalTransition } from '../../hooks/useModalTransition'
import { usePermission } from '../../hooks/usePermission'

interface Category {
  id: string
  name: string
  description?: string
  isActive: boolean
  createdAt: string
}

interface CategoryForm {
  name: string
  description: string
}

const EMPTY_FORM: CategoryForm = { name: '', description: '' }

export function CategoriasPage() {
  const toast = useToast()

  const canCreate = usePermission('helpdesk.categories.create')
  const canUpdate = usePermission('helpdesk.categories.update')
  const canToggle = usePermission('helpdesk.categories.toggle')
  const canDelete = usePermission('helpdesk.categories.delete')

  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch]       = useState('')
  const [page, setPage]           = useState(1)
  const [pageSize, setPageSize]   = useState<PageSize>(10)

  const [modalOpen, setModalOpen]       = useState(false)
  const [editing, setEditing]           = useState<Category | null>(null)
  const [form, setForm]                 = useState<CategoryForm>(EMPTY_FORM)
  const [formError, setFormError]       = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)
  const [toggleTarget, setToggleTarget] = useState<Category | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)
  const { mounted: modalMounted, closing: modalClosing } = useModalTransition(modalOpen)

  const load = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true)
    try {
      const res = await ticketCategoriesApi.list()
      if (res.ok) setCategories(await res.json())
    } finally {
      silent ? setRefreshing(false) : setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSearch = (value: string) => { setSearch(value); setPage(1) }

  const filtered = categories
    .filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))
  const paginated = usePagination(filtered, page, pageSize)

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setFormError(null); setModalOpen(true) }
  const openEdit   = (c: Category) => {
    setEditing(c)
    setForm({ name: c.name, description: c.description ?? '' })
    setFormError(null); setModalOpen(true)
  }
  const closeModal = () => { setModalOpen(false); setEditing(null); setFormError(null) }

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('El nombre es requerido.'); return }
    setSaving(true); setFormError(null)
    try {
      const payload = { name: form.name.trim(), description: form.description.trim() || undefined }
      const res = editing
        ? await ticketCategoriesApi.update(editing.id, payload)
        : await ticketCategoriesApi.create(payload)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar.' }))
        setFormError(err.message); toast.error(err.message); return
      }
      toast.success(editing ? 'Categoría actualizada correctamente.' : 'Categoría creada correctamente.')
      closeModal(); await load()
    } finally { setSaving(false) }
  }

  const handleToggle = async () => {
    if (!toggleTarget) return
    const wasActive = toggleTarget.isActive
    try {
      const res = await ticketCategoriesApi.toggle(toggleTarget.id)
      if (res.ok) { toast.success(wasActive ? 'Categoría desactivada.' : 'Categoría activada.'); await load() }
      else toast.error('No se pudo cambiar el estado de la categoría.')
    } finally { setToggleTarget(null) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await ticketCategoriesApi.remove(deleteTarget.id)
      if (res.ok) { toast.success('Categoría eliminada correctamente.'); await load() }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar la categoría.' }))
        toast.error(err.message)
      }
    } finally { setDeleteTarget(null) }
  }

  const globalIndex = (i: number) =>
    pageSize === 'all' ? i + 1 : (page - 1) * (pageSize as number) + i + 1

  return (
    <div className="p-6 space-y-4">

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Categorías de Tickets</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : `${categories.length} categoría(s) registrada(s)`}
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
              Nueva categoría
            </button>
          )}
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar categoría…"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
        />
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider w-12">#</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Nombre</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Descripción</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Estado</th>
                <th className="text-center px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50 dark:border-slate-700/40">
                    {[8, 32, 48, 20, 20].map((w, j) => (
                      <td key={j} className="px-5 py-2">
                        <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" style={{ width: `${w * 4}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-16 text-center">
                    <Tag className="w-9 h-9 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">
                      {search ? 'Sin resultados para el filtro aplicado.' : 'No hay categorías registradas.'}
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
                    <td className="px-5 py-2 font-semibold text-slate-800 dark:text-slate-200 text-left align-middle">{c.name}</td>
                    <td className="px-5 py-2 text-slate-600 dark:text-slate-300 text-left align-middle">{c.description || '—'}</td>
                    <td className="px-5 py-2 text-center align-middle">
                      <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${
                        c.isActive
                          ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600'
                      }`}>
                        {c.isActive ? 'Activa' : 'Inactiva'}
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

      {modalMounted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${modalClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
          <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden ${modalClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <div className="px-6 pt-6 shrink-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
                {editing ? 'Editar Categoría' : 'Nueva Categoría'}
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre <span className="text-red-500">*</span></label>
                  <input type="text" maxLength={100} placeholder="Ej: Hardware" value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Descripción</label>
                  <textarea rows={3} maxLength={500} placeholder="Descripción de la categoría…" value={form.description}
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
        title={toggleTarget?.isActive ? '¿Desactivar categoría?' : '¿Activar categoría?'}
        message={
          toggleTarget?.isActive
            ? `La categoría "${toggleTarget.name}" será desactivada.`
            : `La categoría "${toggleTarget?.name}" volverá a estar disponible.`
        }
        confirmLabel={toggleTarget?.isActive ? 'Sí, desactivar' : 'Sí, activar'}
        cancelLabel="Cancelar"
        onConfirm={handleToggle}
        onCancel={() => setToggleTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar categoría?"
        message={`La categoría "${deleteTarget?.name}" se eliminará permanentemente. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
