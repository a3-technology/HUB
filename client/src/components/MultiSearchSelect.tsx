import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search, Check, X } from 'lucide-react'
import type { SearchSelectOption } from './SearchSelect'

interface MultiSearchSelectProps {
  options: SearchSelectOption[]
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyLabel?: string
  /** Antepone un avatar circular (foto de `option.photoUrl` o iniciales del label)
      a cada opción y a cada chip seleccionado. Pensado para selects de personas. */
  showAvatar?: boolean
}

/** Iniciales a partir de un nombre completo (p. ej. "Lester Díaz" → "LD"). */
function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
}

function OptionAvatar({ label, photoUrl, size = 'sm' }: { label: string; photoUrl?: string; size?: 'sm' | 'xs' }) {
  const cls = size === 'sm' ? 'w-5 h-5 text-[9px]' : 'w-4 h-4 text-[8px]'
  return photoUrl ? (
    <img
      src={photoUrl}
      alt={label}
      className={`${cls} rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700`}
    />
  ) : (
    <div className={`${cls} rounded-full bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold shrink-0`}>
      {initials(label)}
    </div>
  )
}

/**
 * Variante multi-selección de SearchSelect: los elementos elegidos se muestran
 * como chips removibles dentro del control y el panel permanece abierto para
 * poder marcar varios seguidos. Comparte el diseño y el posicionamiento por
 * portal del SearchSelect original.
 */
export function MultiSearchSelect({
  options,
  values,
  onChange,
  placeholder = 'Selecciona una o más opciones…',
  searchPlaceholder = 'Buscar…',
  emptyLabel = 'Sin resultados.',
  showAvatar = false,
}: MultiSearchSelectProps) {
  const [open, setOpen]     = useState(false)
  const [search, setSearch] = useState('')
  const [coords, setCoords] = useState({ top: 0, bottom: 0, left: 0, width: 0, openUp: false, maxH: 260 })
  const triggerRef = useRef<HTMLDivElement>(null)
  const panelRef   = useRef<HTMLDivElement>(null)
  const searchRef  = useRef<HTMLInputElement>(null)

  const selected = options.filter(o => values.includes(o.value))
  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))

  // Posiciona el panel bajo el control; si el espacio inferior no alcanza y
  // arriba hay más sitio, lo abre hacia arriba. maxH limita la altura del panel
  // al espacio libre real para que nunca se corte con el borde de la pantalla.
  const updateCoords = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
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

  // Cierra al hacer click afuera del control y del panel (el panel vive en un
  // portal, así que su ref se revisa por separado).
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Reposiciona el panel si la ventana o cualquier contenedor con scroll se
  // desplaza o cambia de tamaño, para que nunca quede recortado.
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

  // Al agregar o quitar chips cambia la altura del control: recalcular la
  // posición del panel para que siga pegado al borde inferior.
  useEffect(() => { if (open) updateCoords() }, [values, open])

  const toggle = (opt: SearchSelectOption) =>
    onChange(values.includes(opt.value) ? values.filter(v => v !== opt.value) : [...values, opt.value])

  const remove = (value: string) => onChange(values.filter(v => v !== value))

  return (
    <div className="relative">
      {/* Se usa un div con role="button" porque los chips llevan su propio
          control de quitar y HTML no permite botones anidados. */}
      <div
        ref={triggerRef}
        role="button"
        tabIndex={0}
        onClick={() => setOpen(v => !v)}
        onKeyDown={e => {
          if (e.key === 'Escape') setOpen(false)
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(v => !v) }
        }}
        className="w-full min-h-[42px] flex items-center justify-between gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
      >
        {selected.length === 0 ? (
          <span className="text-slate-400 truncate">{placeholder}</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {selected.map(o => (
              <span
                key={o.value}
                className="inline-flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-medium pl-1.5 pr-1 py-0.5 rounded-md"
              >
                {showAvatar && <OptionAvatar label={o.label} photoUrl={o.photoUrl} size="xs" />}
                {o.label}
                <span
                  role="button"
                  tabIndex={0}
                  title="Quitar"
                  onClick={e => { e.stopPropagation(); remove(o.value) }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); remove(o.value) } }}
                  className="p-0.5 rounded hover:bg-indigo-100 dark:hover:bg-indigo-500/20 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </span>
              </span>
            ))}
          </div>
        )}
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>

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
              <div className="px-3.5 py-3 text-center">
                <p className="text-sm text-slate-400">{emptyLabel}</p>
              </div>
            ) : (
              filtered.map(opt => {
                const isSelected = values.includes(opt.value)
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggle(opt)}
                    className={`w-full flex items-center justify-between gap-2 px-3.5 py-2 text-sm text-left transition-colors ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-medium'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0 truncate">
                      {showAvatar && <OptionAvatar label={opt.label} photoUrl={opt.photoUrl} />}
                      <span className="truncate">{opt.label}</span>
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                )
              })
            )}
          </div>

          {values.length > 0 && (
            <div className="shrink-0 px-3.5 py-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400">
              {values.length === 1 ? '1 seleccionado' : `${values.length} seleccionados`}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
