import { createContext, useCallback, useContext, useState } from 'react'
import { CheckCircle, XCircle, X } from 'lucide-react'

type ToastType = 'success' | 'error'

interface Toast {
  id: number
  type: ToastType
  message: string
}

interface ToastContextValue {
  success: (message: string) => void
  error:   (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let _nextId = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const add = useCallback((type: ToastType, message: string) => {
    const id = ++_nextId
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => remove(id), 4000)
  }, [remove])

  const success = useCallback((message: string) => add('success', message), [add])
  const error   = useCallback((message: string) => add('error',   message), [add])

  return (
    <ToastContext.Provider value={{ success, error }}>
      {children}

      {/* Contenedor de toasts — esquina inferior derecha */}
      <div className="fixed bottom-15 right-5 z-[200] flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`
              pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg border
              bg-white dark:bg-slate-900 min-w-[280px] max-w-sm
              toast-enter
              ${toast.type === 'success'
                ? 'border-emerald-200 dark:border-emerald-800'
                : 'border-red-200 dark:border-red-800'}
            `}
          >
            {/* Ícono */}
            {toast.type === 'success'
              ? <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
              : <XCircle    className="w-5 h-5 text-red-500    shrink-0 mt-0.5" />
            }

            {/* Mensaje */}
            <p className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">
              {toast.message}
            </p>

            {/* Cerrar */}
            <button
              onClick={() => remove(toast.id)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors shrink-0 mt-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider')
  return ctx
}
