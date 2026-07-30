import { useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useModalTransition } from '../hooks/useModalTransition'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const { mounted, closing } = useModalTransition(open)

  // Conserva el último contenido válido mientras se anima la salida, para que
  // no se muestre en blanco/"undefined" si el padre limpia sus props al cerrar.
  const [content, setContent] = useState({ title, message, confirmLabel, cancelLabel })
  useEffect(() => {
    if (open) setContent({ title, message, confirmLabel, cancelLabel })
  }, [open, title, message, confirmLabel, cancelLabel])

  // Foco en cancelar al abrir + cerrar con Escape
  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!mounted) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      {/* Overlay — no cierra al hacer click: el cierre es solo con los botones o Escape */}
      <div
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${closing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`}
      />

      {/* Dialog */}
      <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-sm p-6 space-y-5 ${closing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
        {/* Icono + título */}
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{content.title}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{content.message}</p>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex gap-3 justify-end">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            {content.cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-500 hover:bg-red-600 transition-colors"
          >
            {content.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
