import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { useModalTransition } from '../hooks/useModalTransition'

interface QuickCreateModalProps {
  open: boolean
  /** Título del modal, p. ej. "Nuevo Banco". */
  title: string
  /** Texto de ejemplo del campo nombre, p. ej. "Ej: Banreservas". */
  placeholder?: string
  /** Nombre precargado (lo que el usuario escribió en el buscador del select). */
  initialName: string
  onClose: () => void
  /** Crea el registro; devuelve null si tuvo éxito o el mensaje de error a mostrar. */
  onSave: (name: string) => Promise<string | null>
}

/**
 * Modal genérico de creación rápida para catálogos simples (solo nombre),
 * pensado para abrirse desde el "Crear…" de un SearchSelect sin salir del
 * formulario en el que se está trabajando.
 */
export function QuickCreateModal({ open, title, placeholder, initialName, onClose, onSave }: QuickCreateModalProps) {
  const [name, setName]     = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const { mounted, closing } = useModalTransition(open)

  // Al abrir: precarga lo escrito en el buscador y limpia errores previos.
  useEffect(() => {
    if (open) { setName(initialName); setError(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleSave = async () => {
    if (!name.trim()) { setError('El nombre es requerido.'); return }
    setSaving(true); setError(null)
    try {
      const err = await onSave(name.trim())
      if (err) { setError(err); return }
      onClose()
    } finally { setSaving(false) }
  }

  if (!mounted) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${closing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
      <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md p-6 ${closing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-5">{title}</h2>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre <span className="text-red-500">*</span></label>
            <input type="text" maxLength={100} placeholder={placeholder} value={name} autoFocus
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
          </div>
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 mt-6">
          <button onClick={onClose} disabled={saving}
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
  )
}
