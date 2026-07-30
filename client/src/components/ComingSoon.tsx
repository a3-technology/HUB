import { Construction } from 'lucide-react'

interface ComingSoonProps {
  module: string
}

export function ComingSoon({ module }: ComingSoonProps) {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center">
          <Construction className="w-8 h-8 text-indigo-500" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{module}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
            Este módulo está en desarrollo. Pronto estará disponible.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          Próximamente
        </span>
      </div>
    </div>
  )
}
