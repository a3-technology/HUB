import { useRef, useState } from 'react'
import { ArrowUp, ArrowDown, ChevronsUpDown, ListFilter, Search } from 'lucide-react'

/**
 * Cabecera de columna con ordenamiento (clic en el título alterna asc/desc)
 * y filtro por valores únicos en un popover con checkboxes. Genérica sobre
 * las claves de columna de la tabla que la use (ver EmpleadosPage/TicketsPage).
 */
export function ThSortFilter<K extends string>({ label, colKey, align = 'left', activeSortKey, sortDir, onSort, options, selected, onFilterChange }: {
  label: string
  colKey: K
  align?: 'left' | 'center'
  activeSortKey: K
  sortDir: 'asc' | 'desc'
  onSort: (key: K) => void
  options: string[]
  selected: string[]
  onFilterChange: (key: K, values: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [optSearch, setOptSearch] = useState('')
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const isSorted = activeSortKey === colKey
  const hasFilter = selected.length > 0
  const visibleOptions = options.filter(o => o.toLowerCase().includes(optSearch.toLowerCase()))

  const toggleValue = (value: string) =>
    onFilterChange(colKey, selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value])

  // Posiciona el popover con coordenadas fijas para que no lo recorte el overflow del contenedor de la tabla
  const openPopover = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left - 100, window.innerWidth - 232)) })
    }
    setOptSearch('')
    setOpen(true)
  }

  return (
    <th className={`px-5 py-3.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap ${align === 'center' ? 'text-center' : 'text-left'}`}>
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => onSort(colKey)}
          className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          title={`Ordenar por ${label}`}
        >
          {label}
          {isSorted
            ? sortDir === 'asc'
              ? <ArrowUp className="w-3.5 h-3.5 text-indigo-500" />
              : <ArrowDown className="w-3.5 h-3.5 text-indigo-500" />
            : <ChevronsUpDown className="w-3.5 h-3.5 opacity-40" />}
        </button>
        <button
          type="button"
          ref={btnRef}
          onClick={() => (open ? setOpen(false) : openPopover())}
          className={`p-0.5 rounded hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors ${hasFilter ? 'text-indigo-500' : ''}`}
          title={`Filtrar ${label}`}
        >
          <ListFilter className="w-3.5 h-3.5" />
        </button>
      </span>

      {open && (
        <>
          {/* Capa invisible para cerrar el popover al hacer clic fuera */}
          <div className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-2 normal-case tracking-normal font-normal text-left"
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                value={optSearch}
                onChange={e => setOptSearch(e.target.value)}
                placeholder="Buscar…"
                autoFocus
                className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>
            <div className="max-h-52 overflow-y-auto">
              {visibleOptions.length === 0 ? (
                <p className="px-2 py-3 text-xs text-slate-400 text-center">Sin opciones</p>
              ) : (
                visibleOptions.map(opt => (
                  <label key={opt} className="flex items-center gap-2 px-2 py-1.5 text-xs text-slate-600 dark:text-slate-300 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.includes(opt)}
                      onChange={() => toggleValue(opt)}
                      className="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500/40"
                    />
                    <span className="truncate">{opt}</span>
                  </label>
                ))
              )}
            </div>
            {hasFilter && (
              <button
                type="button"
                onClick={() => onFilterChange(colKey, [])}
                className="w-full mt-2 px-2 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-md transition-colors"
              >
                Limpiar filtro
              </button>
            )}
          </div>
        </>
      )}
    </th>
  )
}
