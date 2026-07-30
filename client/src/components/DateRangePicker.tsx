import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarRange, ChevronLeft, ChevronRight, X } from 'lucide-react'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const DIAS_SEMANA = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']

const PANEL_W = 244
const PANEL_H = 340

interface DateRangePickerProps {
  /** Fecha inicial en formato ISO 'aaaa-mm-dd', o '' si no hay. */
  from: string
  /** Fecha final en formato ISO 'aaaa-mm-dd', o '' si no hay. */
  to: string
  onChange: (from: string, to: string) => void
  placeholder?: string
}

function parseISO(v: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  if (!m) return null
  return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) }
}

function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function fmtShort(v: string): string {
  const p = parseISO(v)
  return p ? `${String(p.d).padStart(2, '0')}/${String(p.m + 1).padStart(2, '0')}/${p.y}` : ''
}

/** Un día como número ordinal (para comparar sin husos horarios). */
function ordinal(y: number, m: number, d: number): number {
  return y * 10000 + m * 100 + d
}

/**
 * Selector de RANGO de fechas en un único control: un botón que muestra
 * "dd/mm/aaaa - dd/mm/aaaa" y abre un calendario donde el primer clic marca
 * el inicio y el segundo el fin (si el segundo es anterior, se invierten
 * solos). Comparte diseño y posicionamiento por portal con DatePicker.
 */
export function DateRangePicker({
  from,
  to,
  onChange,
  placeholder = 'Todas las fechas',
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, bottom: 0, left: 0, openUp: false })
  const hoy = new Date()
  const fromSel = parseISO(from)
  const toSel = parseISO(to)
  // Mientras se está eligiendo el fin del rango (ya hay inicio, todavía no fin).
  const pickingEnd = fromSel !== null && toSel === null

  const [viewYear, setViewYear] = useState(fromSel ? fromSel.y : hoy.getFullYear())
  const [viewMonth, setViewMonth] = useState(fromSel ? fromSel.m : hoy.getMonth())
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    const s = parseISO(from)
    setViewYear(s ? s.y : new Date().getFullYear())
    setViewMonth(s ? s.m : new Date().getMonth())
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

  /** Un clic: si no hay rango o ya está completo, empieza uno nuevo; si falta el fin, lo cierra (invirtiendo si hace falta). */
  const pick = (d: number) => {
    const clicked = toISO(viewYear, viewMonth, d)
    if (!pickingEnd) {
      onChange(clicked, '')
      return
    }
    if (ordinal(viewYear, viewMonth, d) < ordinal(fromSel!.y, fromSel!.m, fromSel!.d)) {
      onChange(clicked, from)
    } else {
      onChange(from, clicked)
    }
    setOpen(false)
  }

  const applyPreset = (daysBack: number) => {
    const end = new Date()
    const start = new Date(); start.setDate(start.getDate() - daysBack)
    onChange(toISO(start.getFullYear(), start.getMonth(), start.getDate()), toISO(end.getFullYear(), end.getMonth(), end.getDate()))
    setOpen(false)
  }

  const applyThisMonth = () => {
    const now = new Date()
    onChange(toISO(now.getFullYear(), now.getMonth(), 1), toISO(now.getFullYear(), now.getMonth(), now.getDate()))
    setOpen(false)
  }

  const firstWeekday = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const isToday = (d: number) => d === hoy.getDate() && viewMonth === hoy.getMonth() && viewYear === hoy.getFullYear()
  const isFromDay = (d: number) => fromSel !== null && d === fromSel.d && viewMonth === fromSel.m && viewYear === fromSel.y
  const isToDay = (d: number) => toSel !== null && d === toSel.d && viewMonth === toSel.m && viewYear === toSel.y
  const isInRange = (d: number) => {
    if (fromSel === null || toSel === null) return false
    const o = ordinal(viewYear, viewMonth, d)
    return o > ordinal(fromSel.y, fromSel.m, fromSel.d) && o < ordinal(toSel.y, toSel.m, toSel.d)
  }

  const hasRange = fromSel !== null || toSel !== null

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
      >
        <span className={`truncate ${hasRange ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'}`}>
          {fromSel && toSel ? `${fmtShort(from)} – ${fmtShort(to)}` : fromSel ? `${fmtShort(from)} – …` : placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {hasRange && (
            <span
              role="button"
              tabIndex={0}
              title="Quitar rango"
              onClick={e => { e.stopPropagation(); onChange('', '') }}
              onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onChange('', '') } }}
              className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
            >
              <X className="w-3.5 h-3.5 text-slate-400" />
            </span>
          )}
          <CalendarRange className="w-4 h-4 text-slate-400" />
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
          <div className="px-2.5 pt-2 text-[11px] text-slate-400">
            {pickingEnd ? 'Elegí la fecha final…' : 'Elegí la fecha inicial…'}
          </div>

          <div className="flex items-center justify-between gap-1 px-1.5 py-1.5">
            <button type="button" onClick={prevMonth} title="Mes anterior"
              className="p-1 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
              {MESES[viewMonth]} {viewYear}
            </span>
            <button type="button" onClick={nextMonth} title="Mes siguiente"
              className="p-1 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

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
                    onClick={() => pick(d)}
                    className={`h-7 text-xs transition-colors ${
                      isFromDay(d) || isToDay(d)
                        ? 'bg-indigo-600 text-white font-semibold rounded-md'
                        : isInRange(d)
                          ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                          : isToday(d)
                            ? 'rounded-md text-indigo-600 dark:text-indigo-400 font-semibold ring-1 ring-inset ring-indigo-300 dark:ring-indigo-500/40 hover:bg-indigo-50 dark:hover:bg-indigo-500/10'
                            : 'rounded-md text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {d}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 px-2.5 py-1.5 border-t border-slate-100 dark:border-slate-800">
            <button type="button" onClick={() => applyPreset(6)}
              className="flex-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md py-1 transition-colors">
              7 días
            </button>
            <button type="button" onClick={() => applyPreset(29)}
              className="flex-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md py-1 transition-colors">
              30 días
            </button>
            <button type="button" onClick={applyThisMonth}
              className="flex-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md py-1 transition-colors">
              Este mes
            </button>
          </div>
          {hasRange && (
            <div className="flex justify-end px-2.5 pb-1.5">
              <button type="button" onClick={() => { onChange('', ''); setOpen(false) }}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:underline">
                Limpiar
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
