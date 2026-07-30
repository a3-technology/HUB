import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const DIAS_SEMANA = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']

/** Ancho fijo del panel del calendario (px). */
const PANEL_W = 244
/** Alto aproximado del panel, usado solo para decidir si abre hacia arriba. */
const PANEL_H = 300

interface DatePickerProps {
  /** Fecha en formato ISO 'aaaa-mm-dd', o '' si no hay fecha. */
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Primer año ofrecido en el selector de año (por defecto 1940). */
  minYear?: number
  /** Último año ofrecido en el selector de año (por defecto año actual + 10). */
  maxYear?: number
  /** Fecha mínima seleccionable en formato ISO 'aaaa-mm-dd'; los días anteriores quedan deshabilitados. */
  minDate?: string
  /** Fecha máxima seleccionable en formato ISO 'aaaa-mm-dd'; los días posteriores quedan deshabilitados. */
  maxDate?: string
}

function cmpParts(a: { y: number; m: number; d: number }, b: { y: number; m: number; d: number }): number {
  if (a.y !== b.y) return a.y - b.y
  if (a.m !== b.m) return a.m - b.m
  return a.d - b.d
}

/** Convierte 'aaaa-mm-dd' a sus partes numéricas sin pasar por Date (evita
 *  desfaces de zona horaria). Devuelve null si el texto no es una fecha válida. */
function parseISO(v: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  if (!m) return null
  return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) }
}

function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * Selector de fecha con calendario desplegable, en reemplazo del input
 * type="date" nativo. Comparte el diseño y el posicionamiento por portal de
 * SearchSelect: se abre hacia arriba cuando no hay espacio debajo y se
 * reposiciona con el scroll para no quedar recortado.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = 'Selecciona una fecha…',
  minYear = 1940,
  maxYear = new Date().getFullYear() + 10,
  minDate,
  maxDate,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  // Vista activa del panel: rejilla de días, de meses o de años. Las de meses
  // y años reemplazan a los <select> nativos, cuyo desplegable no se puede
  // estilizar y rompía el diseño del calendario.
  const [view, setView] = useState<'days' | 'months' | 'years'>('days')
  const [coords, setCoords] = useState({ top: 0, bottom: 0, left: 0, openUp: false })
  const hoy = new Date()
  const sel = parseISO(value)
  const minParsed = minDate ? parseISO(minDate) : null
  const maxParsed = maxDate ? parseISO(maxDate) : null
  const isDayDisabled = (y: number, m: number, d: number) =>
    (minParsed !== null && cmpParts({ y, m, d }, minParsed) < 0) ||
    (maxParsed !== null && cmpParts({ y, m, d }, maxParsed) > 0)
  const [viewYear, setViewYear]   = useState(sel ? sel.y : hoy.getFullYear())
  const [viewMonth, setViewMonth] = useState(sel ? sel.m : hoy.getMonth())
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef  = useRef<HTMLDivElement>(null)

  // Posiciona el panel bajo el botón; si el espacio inferior no alcanza y
  // arriba hay más sitio, lo abre hacia arriba. El borde izquierdo se ajusta
  // para que el panel (de ancho fijo) no se salga por la derecha.
  const updateCoords = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const gap = 6, margin = 8
    const spaceBelow = window.innerHeight - rect.bottom - gap - margin
    const spaceAbove = rect.top - gap - margin
    const openUp = spaceBelow < PANEL_H && spaceAbove > spaceBelow
    setCoords({
      top: rect.bottom + gap,
      bottom: window.innerHeight - rect.top + gap,
      left: Math.max(margin, Math.min(rect.left, window.innerWidth - PANEL_W - margin)),
      openUp,
    })
  }

  // Cierra al hacer click afuera del botón y del panel (el panel vive en un
  // portal, así que su ref se revisa por separado).
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Al abrir: coloca la vista en el mes de la fecha elegida (o el actual) y
  // reposiciona el panel si la ventana o un contenedor con scroll se mueve.
  // useLayoutEffect calcula la posición antes del pintado; con useEffect el
  // panel aparecía un frame en la esquina superior izquierda antes de saltar
  // a su sitio.
  useLayoutEffect(() => {
    if (!open) return
    const s = parseISO(value)
    setViewYear(s ? s.y : new Date().getFullYear())
    setViewMonth(s ? s.m : new Date().getMonth())
    setView('days')
    updateCoords()

    window.addEventListener('scroll', updateCoords, true)
    window.addEventListener('resize', updateCoords)
    return () => {
      window.removeEventListener('scroll', updateCoords, true)
      window.removeEventListener('resize', updateCoords)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  // Página de 12 años a la que pertenece el año visible, con inicio alineado
  // a minYear para que las páginas sean estables al navegar.
  const yearPageStart = viewYear - ((((viewYear - minYear) % 12) + 12) % 12)
  const yearPage = Array.from({ length: 12 }, (_, i) => yearPageStart + i)

  // Las flechas de la cabecera navegan según la vista: mes a mes en días,
  // año a año en meses y de 12 en 12 en años.
  const goPrev = () => {
    if (view === 'days') prevMonth()
    else if (view === 'months') setViewYear(y => Math.max(minYear, y - 1))
    else setViewYear(y => Math.max(minYear, y - 12))
  }
  const goNext = () => {
    if (view === 'days') nextMonth()
    else if (view === 'months') setViewYear(y => Math.min(maxYear, y + 1))
    else setViewYear(y => Math.min(maxYear, y + 12))
  }

  const pick = (d: number) => { onChange(toISO(viewYear, viewMonth, d)); setOpen(false) }

  // Celdas del mes visible: huecos iniciales (semana empieza en lunes) + días.
  const firstWeekday = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7
  const daysInMonth  = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const isToday = (d: number) =>
    d === hoy.getDate() && viewMonth === hoy.getMonth() && viewYear === hoy.getFullYear()
  const isSelected = (d: number) =>
    sel !== null && d === sel.d && viewMonth === sel.m && viewYear === sel.y

  const headerLabel =
    view === 'days'   ? `${MESES[viewMonth]} ${viewYear}` :
    view === 'months' ? String(viewYear) :
    `${Math.max(yearPageStart, minYear)} – ${Math.min(yearPageStart + 11, maxYear)}`

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
      >
        <span className={`truncate ${sel ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'}`}>
          {sel ? `${String(sel.d).padStart(2, '0')}/${String(sel.m + 1).padStart(2, '0')}/${sel.y}` : placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {sel && (
            <span
              role="button"
              tabIndex={0}
              title="Quitar fecha"
              onClick={e => { e.stopPropagation(); onChange('') }}
              onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onChange('') } }}
              className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
            >
              <X className="w-3.5 h-3.5 text-slate-400" />
            </span>
          )}
          <CalendarDays className="w-4 h-4 text-slate-400" />
        </span>
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            ...(coords.openUp ? { bottom: coords.bottom } : { top: coords.top }),
            left: coords.left,
            width: PANEL_W,
          }}
          className="z-[200] bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden"
        >
          {/* Cabecera: etiqueta que alterna la vista (días → años) y flechas
              cuyo salto depende de la vista activa */}
          <div className="flex items-center justify-between gap-1 px-1.5 py-1.5 border-b border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={goPrev}
              title="Anterior"
              className="p-1 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setView(v => (v === 'days' ? 'years' : 'days'))}
              className="px-2 py-0.5 rounded-md text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {headerLabel}
            </button>
            <button
              type="button"
              onClick={goNext}
              title="Siguiente"
              className="p-1 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Rejilla de años: elegir uno pasa a la vista de meses */}
          {view === 'years' && (
            <div className="grid grid-cols-3 gap-1 p-1.5">
              {yearPage.map(y => (
                <button
                  key={y}
                  type="button"
                  disabled={y < minYear || y > maxYear}
                  onClick={() => { setViewYear(y); setView('months') }}
                  className={`h-8 rounded-md text-xs transition-colors disabled:opacity-30 disabled:pointer-events-none ${
                    y === (sel ? sel.y : -1)
                      ? 'bg-indigo-600 text-white font-semibold'
                      : y === hoy.getFullYear()
                        ? 'text-indigo-600 dark:text-indigo-400 font-semibold ring-1 ring-inset ring-indigo-300 dark:ring-indigo-500/40 hover:bg-indigo-50 dark:hover:bg-indigo-500/10'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          )}

          {/* Rejilla de meses: elegir uno vuelve a la vista de días */}
          {view === 'months' && (
            <div className="grid grid-cols-3 gap-1 p-1.5">
              {MESES.map((m, i) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setViewMonth(i); setView('days') }}
                  className={`h-8 rounded-md text-xs transition-colors ${
                    sel && i === sel.m && viewYear === sel.y
                      ? 'bg-indigo-600 text-white font-semibold'
                      : i === hoy.getMonth() && viewYear === hoy.getFullYear()
                        ? 'text-indigo-600 dark:text-indigo-400 font-semibold ring-1 ring-inset ring-indigo-300 dark:ring-indigo-500/40 hover:bg-indigo-50 dark:hover:bg-indigo-500/10'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {m.slice(0, 3)}
                </button>
              ))}
            </div>
          )}

          {/* Rejilla del calendario */}
          {view === 'days' && (
          <div className="p-1.5">
            <div className="grid grid-cols-7">
              {DIAS_SEMANA.map(d => (
                <div key={d} className="h-6 flex items-center justify-center text-[10px] font-medium text-slate-400 uppercase">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((d, i) =>
                d === null ? (
                  <div key={`v-${i}`} className="h-7" />
                ) : (
                  <button
                    key={d}
                    type="button"
                    disabled={isDayDisabled(viewYear, viewMonth, d)}
                    onClick={() => pick(d)}
                    className={`h-7 rounded-md text-xs transition-colors disabled:opacity-30 disabled:pointer-events-none disabled:hover:bg-transparent ${
                      isSelected(d)
                        ? 'bg-indigo-600 text-white font-semibold'
                        : isToday(d)
                          ? 'text-indigo-600 dark:text-indigo-400 font-semibold ring-1 ring-inset ring-indigo-300 dark:ring-indigo-500/40 hover:bg-indigo-50 dark:hover:bg-indigo-500/10'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {d}
                  </button>
                )
              )}
            </div>
          </div>
          )}

          {/* Pie: acceso rápido a hoy y a limpiar la fecha */}
          <div className="flex items-center justify-between px-2.5 py-1.5 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              disabled={isDayDisabled(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())}
              onClick={() => { const h = new Date(); onChange(toISO(h.getFullYear(), h.getMonth(), h.getDate())); setOpen(false) }}
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-30 disabled:pointer-events-none disabled:no-underline"
            >
              Hoy
            </button>
            {sel && (
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false) }}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:underline"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
