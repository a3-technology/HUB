import { ChevronLeft, ChevronRight } from 'lucide-react'

export type PageSize = 10 | 20 | 'all'

interface PaginationProps {
  total:            number
  page:             number
  pageSize:         PageSize
  onPageChange:     (page: number) => void
  onPageSizeChange: (size: PageSize) => void
  /** Borde superior divisorio; desactívalo cuando el componente ya vive en su propia tarjeta. */
  bordered?:        boolean
}

export function Pagination({ total, page, pageSize, onPageChange, onPageSizeChange, bordered = true }: PaginationProps) {
  const totalPages = pageSize === 'all' ? 1 : Math.ceil(total / (pageSize as number))
  const from       = total === 0 ? 0 : pageSize === 'all' ? 1 : (page - 1) * (pageSize as number) + 1
  const to         = pageSize === 'all' ? total : Math.min(page * (pageSize as number), total)

  const getPages = (): (number | '…')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    if (page <= 4)       return [1, 2, 3, 4, 5, '…', totalPages]
    if (page >= totalPages - 3) return [1, '…', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
    return [1, '…', page - 1, page, page + 1, '…', totalPages]
  }

  const handleSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    onPageSizeChange(val === 'all' ? 'all' : (Number(val) as PageSize))
    onPageChange(1)
  }

  return (
    <div className={`flex items-center justify-between px-4 py-3 flex-wrap gap-3 bg-slate-50 dark:bg-slate-900/40 ${bordered ? 'border-t border-slate-100 dark:border-slate-700/60' : ''}`}>

      {/* Izquierda — contador */}
      <p className="text-sm text-slate-400 dark:text-slate-500">
        Mostrando{' '}
        <span className="font-semibold text-slate-700 dark:text-slate-300">{from} - {to}</span>
        {' '}de{' '}
        <span className="font-semibold text-slate-700 dark:text-slate-300">{total}</span>
        {' '}registros
      </p>

      {/* Derecha — controles */}
      <div className="flex items-center gap-1.5">

        {/* Selector tamaño de página */}
        <select
          value={pageSize}
          onChange={handleSizeChange}
          className="h-8 pl-2.5 pr-6 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat:   'no-repeat',
            backgroundPosition: 'right 6px center',
            appearance: 'none',
          }}
        >
          <option value={10}>10 / pág</option>
          <option value={20}>20 / pág</option>
          <option value="all">Todos</option>
        </select>

        {/* Navegación — siempre visible */}
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {getPages().map((p, i) =>
          p === '…' ? (
            <span key={`e${i}`} className="w-7 flex items-center justify-center text-slate-400 text-sm">…</span>
          ) : (
            <button
              key={p}
              onClick={() => pageSize !== 'all' && onPageChange(p as number)}
              disabled={pageSize === 'all'}
              className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                p === page
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-default'
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export function usePagination<T>(items: T[], page: number, pageSize: PageSize): T[] {
  if (pageSize === 'all') return items
  return items.slice((page - 1) * (pageSize as number), page * (pageSize as number))
}
