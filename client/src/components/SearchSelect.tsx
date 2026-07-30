import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search, Check, Plus, X } from 'lucide-react'

export interface SearchSelectOption {
  value: string
  label: string
  /** URL de foto, usada solo cuando el select se abre con `showAvatar`. */
  photoUrl?: string
}

interface SearchSelectProps {
  options: SearchSelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyLabel?: string
  /** Se ofrece solo cuando lo escrito no coincide con ninguna opción. Recibe el texto buscado. */
  onCreateNew?: (query: string) => void
  /** Muestra una X para limpiar la selección (emite ''). Activo por defecto;
      pásalo en false si el campo no debe poder quedar vacío desde el control. */
  clearable?: boolean
  /** Antepone un avatar circular (foto de `option.photoUrl` o iniciales del label)
      a cada opción y al valor seleccionado. Pensado para selects de personas. */
  showAvatar?: boolean
}

/** Iniciales a partir de un nombre completo (p. ej. "Lester Díaz" → "LD"). */
function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
}

function OptionAvatar({ label, photoUrl }: { label: string; photoUrl?: string }) {
  // Si la URL no carga (ej. una ruta de blob sin firmar en vez de una URL
  // usable), cae a las iniciales en vez de mostrar el ícono de imagen rota.
  const [failed, setFailed] = useState(false)
  return photoUrl && !failed ? (
    <img
      src={photoUrl}
      alt={label}
      onError={() => setFailed(true)}
      className="w-5 h-5 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700"
    />
  ) : (
    <div className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[9px] font-bold shrink-0">
      {initials(label)}
    </div>
  )
}

export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = 'Selecciona una opción…',
  searchPlaceholder = 'Buscar…',
  emptyLabel = 'Sin resultados.',
  onCreateNew,
  clearable = true,
  showAvatar = false,
}: SearchSelectProps) {
  const [open, setOpen]     = useState(false)
  const [search, setSearch] = useState('')
  const [coords, setCoords] = useState({ top: 0, bottom: 0, left: 0, width: 0, openUp: false, maxH: 260 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef  = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = options.find(o => o.value === value)
  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))

  // Posiciona el panel bajo el botón; si el espacio inferior no alcanza y arriba
  // hay más sitio, lo abre hacia arriba. maxH limita la altura del panel al
  // espacio libre real para que nunca se corte con el borde de la pantalla.
  const updateCoords = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const gap = 6, margin = 8
    const spaceBelow = window.innerHeight - rect.bottom - gap - margin
    const spaceAbove = rect.top - gap - margin
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow
    setCoords({
      top: rect.bottom + gap,
      bottom: window.innerHeight - rect.top + gap,
      left: rect.left,
      width: rect.width,
      openUp,
      maxH: Math.max(120, openUp ? spaceAbove : spaceBelow),
    })
  }

  // Cierra al hacer click afuera del botón y del panel (el panel vive en un portal,
  // así que su ref se revisa por separado).
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Reposiciona el panel si la ventana o cualquier contenedor con scroll (p. ej. un
  // modal) se desplaza o cambia de tamaño, para que nunca quede recortado.
  // useLayoutEffect posiciona el panel antes del pintado y evita que aparezca
  // un frame en la esquina superior izquierda.
  useLayoutEffect(() => {
    if (!open) return
    updateCoords()
    setSearch('')
    requestAnimationFrame(() => searchRef.current?.focus())

    window.addEventListener('scroll', updateCoords, true)
    window.addEventListener('resize', updateCoords)
    return () => {
      window.removeEventListener('scroll', updateCoords, true)
      window.removeEventListener('resize', updateCoords)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const select = (opt: SearchSelectOption) => { onChange(opt.value); setOpen(false) }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
      >
        <span className={`flex items-center gap-2 min-w-0 truncate ${selected ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'}`}>
          {showAvatar && selected && <OptionAvatar label={selected.label} photoUrl={selected.photoUrl} />}
          <span className="truncate">{selected ? selected.label : placeholder}</span>
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {/* X para limpiar; span con stopPropagation para no anidar botones ni abrir el panel */}
          {clearable && selected && (
            <span
              onClick={e => { e.stopPropagation(); onChange(''); setOpen(false) }}
              title="Quitar selección"
              className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            ...(coords.openUp ? { bottom: coords.bottom } : { top: coords.top }),
            left: coords.left,
            width: coords.width,
            maxHeight: coords.maxH,
          }}
          className="z-[200] flex flex-col bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden"
        >
          <div className="relative shrink-0 p-2 border-b border-slate-100 dark:border-slate-800">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
              placeholder={searchPlaceholder}
              className="w-full pl-7 pr-2 py-1.5 rounded-md bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 outline-none"
            />
          </div>

          <div className="max-h-52 min-h-0 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3.5 py-3 text-center space-y-2">
                <p className="text-sm text-slate-400">{emptyLabel}</p>
                {onCreateNew && (
                  <button
                    type="button"
                    onClick={() => { setOpen(false); onCreateNew(search.trim()) }}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {search.trim() ? `Crear "${search.trim()}"` : 'Crear nuevo'}
                  </button>
                )}
              </div>
            ) : (
              filtered.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => select(opt)}
                  className={`w-full flex items-center justify-between gap-2 px-3.5 py-2 text-sm text-left transition-colors ${
                    opt.value === value
                      ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-medium'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0 truncate">
                    {showAvatar && <OptionAvatar label={opt.label} photoUrl={opt.photoUrl} />}
                    <span className="truncate">{opt.label}</span>
                  </span>
                  {opt.value === value && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
