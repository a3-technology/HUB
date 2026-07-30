import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock, X } from 'lucide-react'

const PANEL_W = 200
const PANEL_H = 216

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1)
const MINUTES  = Array.from({ length: 60 }, (_, i) => i)

/** '08:30' → { h: 8, m: 30 }; null si no hay hora o el texto no es válido. */
function parseHM(v: string): { h: number; m: number } | null {
  const match = /^(\d{2}):(\d{2})/.exec(v)
  if (!match) return null
  return { h: Number(match[1]), m: Number(match[2]) }
}

/** Hora en 12h + período → 'HH:mm' 24h, formato que espera value/onChange. */
function to24(h12: number, m: number, period: 'AM' | 'PM'): string {
  const h = (h12 % 12) + (period === 'PM' ? 12 : 0)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

interface TimePickerProps {
  /** Hora en formato 'HH:mm' (24h), o '' si no hay hora seleccionada. */
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Muestra una X para limpiar la hora. Activo por defecto. */
  clearable?: boolean
}

/**
 * Selector de hora con panel desplegable (columnas de hora/minuto/período),
 * en reemplazo del input type="time" nativo — su desplegable no se puede
 * estilizar y rompía la consistencia visual del resto de los formularios.
 * Comparte diseño y posicionamiento por portal con DatePicker/SearchSelect.
 */
export function TimePicker({ value, onChange, placeholder = 'Selecciona una hora…', clearable = true }: TimePickerProps) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, bottom: 0, left: 0, openUp: false })
  const buttonRef  = useRef<HTMLButtonElement>(null)
  const panelRef   = useRef<HTMLDivElement>(null)
  const hourListRef   = useRef<HTMLDivElement>(null)
  const minuteListRef = useRef<HTMLDivElement>(null)

  const parsed = parseHM(value)
  const h12    = parsed ? (parsed.h % 12 === 0 ? 12 : parsed.h % 12) : null
  const minute = parsed ? parsed.m : null
  const period: 'AM' | 'PM' = parsed && parsed.h >= 12 ? 'PM' : 'AM'

  // Posiciona el panel bajo el botón; si el espacio inferior no alcanza y
  // arriba hay más sitio, lo abre hacia arriba (mismo criterio que DatePicker).
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

  // Al abrir: reposiciona el panel y centra el scroll de hora/minuto en el
  // valor actual (o en 12/00 si no hay hora), igual que el control nativo.
  useLayoutEffect(() => {
    if (!open) return
    updateCoords()
    requestAnimationFrame(() => {
      hourListRef.current?.children[(h12 ?? 12) - 1]?.scrollIntoView({ block: 'center' })
      minuteListRef.current?.children[minute ?? 0]?.scrollIntoView({ block: 'center' })
    })

    window.addEventListener('scroll', updateCoords, true)
    window.addEventListener('resize', updateCoords)
    return () => {
      window.removeEventListener('scroll', updateCoords, true)
      window.removeEventListener('resize', updateCoords)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const pickHour   = (h: number)               => onChange(to24(h, minute ?? 0, period))
  const pickMinute = (m: number)                => onChange(to24(h12 ?? 12, m, period))
  const pickPeriod = (p: 'AM' | 'PM')           => onChange(to24(h12 ?? 12, minute ?? 0, p))
  const pickNow = () => {
    const n = new Date()
    onChange(`${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`)
  }

  const optionCls = (active: boolean) =>
    `w-full h-8 text-sm text-center transition-colors ${
      active
        ? 'bg-indigo-600 text-white font-semibold'
        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
    }`

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
      >
        <span className={`truncate ${parsed ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'}`}>
          {parsed ? `${h12}:${String(minute).padStart(2, '0')} ${period}` : placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {clearable && parsed && (
            <span
              role="button"
              tabIndex={0}
              title="Quitar hora"
              onClick={e => { e.stopPropagation(); onChange('') }}
              onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onChange('') } }}
              className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
            >
              <X className="w-3.5 h-3.5 text-slate-400" />
            </span>
          )}
          <Clock className="w-4 h-4 text-slate-400" />
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
          className="z-[200] flex flex-col bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden"
        >
          <div className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-slate-800">
            <div ref={hourListRef} className="h-44 overflow-y-auto py-1">
              {HOURS_12.map(h => (
                <button key={h} type="button" onClick={() => pickHour(h)} className={optionCls(h12 === h)}>
                  {String(h).padStart(2, '0')}
                </button>
              ))}
            </div>
            <div ref={minuteListRef} className="h-44 overflow-y-auto py-1">
              {MINUTES.map(m => (
                <button key={m} type="button" onClick={() => pickMinute(m)} className={optionCls(minute === m)}>
                  {String(m).padStart(2, '0')}
                </button>
              ))}
            </div>
            <div className="h-44 overflow-y-auto py-1">
              {(['AM', 'PM'] as const).map(p => (
                <button key={p} type="button" onClick={() => pickPeriod(p)} className={optionCls(period === p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Pie: acceso rápido a la hora actual y cierre manual */}
          <div className="flex items-center justify-between px-2.5 py-1.5 border-t border-slate-100 dark:border-slate-800">
            <button type="button" onClick={pickNow} className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
              Ahora
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:underline">
              Listo
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
