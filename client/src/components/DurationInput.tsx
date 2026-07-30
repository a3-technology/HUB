import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock } from 'lucide-react'
import { fmtDurationMs } from '../lib/sla'

const PANEL_W = 220
const PANEL_H = 160

type Unit = 'minutes' | 'hours'

interface DurationInputProps {
  /** Valor en minutos, o undefined si no hay objetivo configurado. */
  minutes?: number
  onChange: (minutes: number | undefined) => void
  placeholder?: string
}

/** minutos guardados -> {valor, unidad} para precargar el panel (horas si es múltiplo exacto de 60, si no minutos). */
function minutesToUnit(minutes?: number): { value: string; unit: Unit } {
  if (!minutes) return { value: '', unit: 'hours' }
  if (minutes % 60 === 0) return { value: String(minutes / 60), unit: 'hours' }
  return { value: String(minutes), unit: 'minutes' }
}

/**
 * Campo de duración (minutos u horas) con un único input visible: al hacer
 * clic abre un panel flotante donde se define la cantidad y la unidad.
 * Comparte diseño y posicionamiento por portal con DatePicker.
 */
export function DurationInput({ minutes, onChange, placeholder = 'Sin objetivo' }: DurationInputProps) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState<Unit>('hours')
  const [coords, setCoords] = useState({ top: 0, bottom: 0, left: 0, openUp: false })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)

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
    const initial = minutesToUnit(minutes)
    setAmount(initial.value)
    setUnit(initial.unit)
    updateCoords()
    amountRef.current?.focus()

    window.addEventListener('scroll', updateCoords, true)
    window.addEventListener('resize', updateCoords)
    return () => {
      window.removeEventListener('scroll', updateCoords, true)
      window.removeEventListener('resize', updateCoords)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const apply = () => {
    if (!amount.trim()) { onChange(undefined); setOpen(false); return }
    const n = Number(amount)
    if (Number.isNaN(n) || n <= 0) return
    onChange(unit === 'hours' ? n * 60 : n)
    setOpen(false)
  }

  const clear = () => { onChange(undefined); setOpen(false) }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
      >
        <span className={`truncate ${minutes ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'}`}>
          {minutes ? fmtDurationMs(minutes * 60_000) : placeholder}
        </span>
        <Clock className="w-4 h-4 text-slate-400 shrink-0" />
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
          <div className="p-3 space-y-3">
            <input
              ref={amountRef}
              type="number"
              min={1}
              step="1"
              placeholder="Cantidad"
              value={amount}
              onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
              onKeyDown={e => {
                if (e.key === 'Enter') { apply(); return }
                // type="number" deja tipear "e"/"+"/"-"/"." por la notación científica
                // (ej. 1e5); acá solo se permiten enteros positivos.
                if (['e', 'E', '+', '-', '.', ','].includes(e.key)) e.preventDefault()
              }}
              onPaste={e => {
                const pasted = e.clipboardData.getData('text')
                if (!/^\d+$/.test(pasted)) e.preventDefault()
              }}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              {(['minutes', 'hours'] as Unit[]).map(u => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                    unit === u
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {u === 'minutes' ? 'Minutos' : 'Horas'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 dark:border-slate-800">
            <button type="button" onClick={clear} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:underline">
              Quitar objetivo
            </button>
            <button type="button" onClick={apply} className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors">
              Aplicar
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
