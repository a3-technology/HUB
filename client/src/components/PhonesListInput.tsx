import { Plus, X } from 'lucide-react'
import { PhoneInput } from './PhoneInput'

interface PhonesListInputProps {
  /** Lista de números en formato E.164. */
  value:    string[]
  onChange: (phones: string[]) => void
}

/**
 * Lista de teléfonos internacionales con alta/baja de filas: cada fila es un
 * <see cref="PhoneInput" />; la última siempre ofrece "+" para agregar una
 * fila nueva, y cualquier fila salvo la única muestra "×" para quitarla.
 */
export function PhonesListInput({ value, onChange }: PhonesListInputProps) {
  const phones = value.length > 0 ? value : ['']

  const update = (i: number, phone: string) => {
    const next = [...phones]; next[i] = phone; onChange(next)
  }
  const add = () => onChange([...phones, ''])
  const remove = (i: number) => onChange(phones.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-2">
      {phones.map((phone, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <PhoneInput value={phone} onChange={v => update(i, v)} />
          </div>
          {phones.length > 1 && (
            <button
              type="button"
              onClick={() => remove(i)}
              title="Quitar teléfono"
              className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          {i === phones.length - 1 && (
            <button
              type="button"
              onClick={add}
              title="Agregar teléfono"
              className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
