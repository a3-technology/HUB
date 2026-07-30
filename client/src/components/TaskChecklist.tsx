import { useEffect, useState } from 'react'
import { Plus, Trash2, ListChecks } from 'lucide-react'
import { taskChecklistApi } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { usePermission } from '../hooks/usePermission'

interface ChecklistItem {
  id: string
  taskId: string
  text: string
  isChecked: boolean
  createdAt: string
}

interface TaskChecklistProps {
  taskId: string
}

/** Lista simple de pendientes dentro de una tarea: solo texto + check, sin fecha ni responsable propios. */
export function TaskChecklist({ taskId }: TaskChecklistProps) {
  const toast = useToast()
  const canCreate = usePermission('projects.tasks.checklist-item-create')
  const canToggle = usePermission('projects.tasks.checklist-item-toggle')
  const canDelete = usePermission('projects.tasks.checklist-item-delete')
  const [items, setItems]   = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText]     = useState('')
  const [adding, setAdding] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await taskChecklistApi.list(taskId)
      if (res.ok) setItems(await res.json())
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [taskId])

  const handleAdd = async () => {
    if (!text.trim()) return
    setAdding(true)
    try {
      const res = await taskChecklistApi.create(taskId, text.trim())
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'No se pudo agregar el ítem.' }))
        toast.error(err.message); return
      }
      setText('')
      await load()
    } finally { setAdding(false) }
  }

  const handleToggle = async (item: ChecklistItem) => {
    setItems(prev => prev.map(i => (i.id === item.id ? { ...i, isChecked: !i.isChecked } : i)))
    const res = await taskChecklistApi.toggle(item.id)
    if (!res.ok) {
      setItems(prev => prev.map(i => (i.id === item.id ? { ...i, isChecked: item.isChecked } : i)))
      toast.error('No se pudo actualizar el ítem.')
    }
  }

  const handleDelete = async (id: string) => {
    const res = await taskChecklistApi.remove(id)
    if (res.ok) await load()
    else toast.error('No se pudo eliminar el ítem.')
  }

  const doneCount = items.filter(i => i.isChecked).length

  return (
    <div className="space-y-2.5">
      {loading ? (
        <div className="h-8 bg-slate-100 dark:bg-slate-700 rounded-lg animate-pulse" />
      ) : items.length === 0 ? (
        <p className="text-xs text-slate-400 flex items-center gap-1.5">
          <ListChecks className="w-3.5 h-3.5" />
          Sin pendientes en esta tarea.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${(doneCount / items.length) * 100}%` }} />
            </div>
            <span className="text-[11px] text-slate-400 shrink-0">{doneCount}/{items.length}</span>
          </div>
          <div className="space-y-1">
            {items.map(item => (
              <div key={item.id} className="group flex items-center gap-2 px-1 py-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60">
                <input
                  type="checkbox"
                  checked={item.isChecked}
                  onChange={() => handleToggle(item)}
                  disabled={!canToggle}
                  className="w-4 h-4 shrink-0 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                />
                <span className={`flex-1 text-sm ${item.isChecked ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200'}`}>
                  {item.text}
                </span>
                {canDelete && (
                  <button
                    onClick={() => handleDelete(item.id)}
                    title="Eliminar ítem"
                    className="w-6 h-6 shrink-0 flex items-center justify-center rounded text-slate-300 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {canCreate && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            maxLength={500}
            placeholder="Agregar pendiente…"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
            className="flex-1 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !text.trim()}
            title="Agregar"
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          >
            {adding
              ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : <Plus className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  )
}
