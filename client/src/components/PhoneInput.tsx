import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search, Check } from 'lucide-react'
import { usePhoneInput, defaultCountries, parseCountry, FlagImage } from 'react-international-phone'
import { validatePhoneNumberLength, isValidPhoneNumber, type CountryCode } from 'libphonenumber-js'

interface PhoneInputProps {
  /** Número en formato E.164 (+18095551234) o '' si no hay valor. */
  value:           string
  /** Recibe el número en E.164, o '' cuando el campo queda vacío. */
  onChange:        (phone: string) => void
  /** País inicial del selector (código ISO 3166-1 alfa-2 en minúsculas). */
  defaultCountry?: string
  disabled?:       boolean
}

/**
 * Catálogo de países del selector, con el nombre traducido al español por
 * Intl.DisplayNames (si el navegador no conoce el código, p. ej. Kosovo,
 * se conserva el nombre en inglés de la librería). Se construye una sola vez.
 */
const regionNamesEs = new Intl.DisplayNames(['es'], { type: 'region' })
const countryOptions = defaultCountries
  .map(c => {
    const parsed = parseCountry(c)
    const nameEs = regionNamesEs.of(parsed.iso2.toUpperCase())
    return {
      iso2:     parsed.iso2,
      dialCode: parsed.dialCode,
      name:     nameEs && nameEs !== parsed.iso2.toUpperCase() ? nameEs : parsed.name,
    }
  })
  .sort((a, b) => a.name.localeCompare(b.name, 'es'))

/**
 * Cantidad máxima de dígitos nacionales de un país según los metadatos de
 * libphonenumber. react-international-phone solo limita la escritura con la
 * máscara de formato del país, y a los países sin máscara propia (p. ej.
 * Nicaragua) les aplica una genérica de 12 dígitos que acepta números
 * imposibles; este límite real cubre ese vacío. Se resuelve probando largos
 * de mayor a menor hasta que la validación deje de responder TOO_LONG.
 * Retorna null si libphonenumber no conoce el país (no se limita).
 */
const maxDigitsCache = new Map<string, number | null>()
function maxNationalDigits(iso2: string): number | null {
  if (maxDigitsCache.has(iso2)) return maxDigitsCache.get(iso2)!
  let max: number | null = null
  for (let n = 15; n >= 1; n--) {
    const result = validatePhoneNumberLength('5'.repeat(n), iso2.toUpperCase() as CountryCode)
    if (result === 'INVALID_COUNTRY') break
    if (result !== 'TOO_LONG') { max = n; break }
  }
  maxDigitsCache.set(iso2, max)
  return max
}

/**
 * Campo de teléfono internacional: selector de país con bandera + código de
 * marcación y formato automático del número mientras se escribe (hook
 * usePhoneInput de react-international-phone).
 *
 * El valor entra y sale en formato E.164; cuando el usuario borra el número
 * y solo queda el código de marcación, se emite '' para que los campos
 * opcionales se guarden como nulos. La escritura se limita al largo máximo
 * válido del país seleccionado y, al salir del campo, se muestra un aviso
 * si el número no es válido.
 *
 * La lista de países se renderiza en un portal sobre document.body con
 * posición fija (mismo patrón que SearchSelect), para que sobresalga de los
 * modales en lugar de recortarse contra su borde con scroll.
 */
export function PhoneInput({ value, onChange, defaultCountry = 'do', disabled = false }: PhoneInputProps) {
  const [open, setOpen]       = useState(false)
  const [search, setSearch]   = useState('')
  const [touched, setTouched] = useState(false)
  const [coords, setCoords]   = useState({ top: 0, bottom: 0, left: 0, width: 0, openUp: false, maxH: 260 })
  const fieldRef  = useRef<HTMLDivElement>(null)
  const panelRef  = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const { inputValue, country, setCountry, handlePhoneValueChange, inputRef } = usePhoneInput({
    defaultCountry,
    value,
    onChange: ({ phone, country }) => {
      // Sin dígitos más allá del código de país no hay número que guardar
      onChange(phone === `+${country.dialCode}` ? '' : phone)
    },
  })

  // Largo máximo del texto del input: "+" + código de país + espacio + parte
  // nacional (el largo de la máscara si el país tiene una, que ya incluye
  // sus separadores; si no, el máximo de dígitos según libphonenumber)
  const maxLength = useMemo(() => {
    const format = typeof country.format === 'object' ? country.format.default : country.format
    const nationalChars = format?.length ?? maxNationalDigits(country.iso2)
    return nationalChars ? 1 + country.dialCode.length + 1 + nationalChars : undefined
  }, [country])

  const invalid  = touched && value !== '' && !isValidPhoneNumber(value)
  const filtered = countryOptions.filter(c => {
    const q = search.trim().toLowerCase()
    return !q || c.name.toLowerCase().includes(q) || c.dialCode.includes(q.replace('+', ''))
  })

  // Posiciona el panel bajo el campo; si el espacio inferior no alcanza y
  // arriba hay más sitio, lo abre hacia arriba (mismo cálculo que SearchSelect)
  const updateCoords = () => {
    const rect = fieldRef.current?.getBoundingClientRect()
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

  // Cierra al hacer click afuera del campo y del panel (el panel vive en un
  // portal, así que su ref se revisa por separado)
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (fieldRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Reposiciona el panel si la ventana o cualquier contenedor con scroll
  // (p. ej. un modal) se desplaza o cambia de tamaño.
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

  const selectCountry = (iso2: string) => {
    setCountry(iso2)
    setOpen(false)
  }

  return (
    <div>
      <div ref={fieldRef} className="flex">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(v => !v)}
          onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
          className="shrink-0 flex items-center gap-1.5 px-2.5 rounded-l-lg border border-r-0 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <FlagImage iso2={country.iso2} size="20px" />
          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <input
          ref={inputRef}
          type="tel"
          value={inputValue}
          onChange={handlePhoneValueChange}
          onBlur={() => setTouched(true)}
          maxLength={maxLength}
          disabled={disabled}
          className="w-full px-3.5 py-2.5 rounded-r-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </div>

      {invalid && (
        <p className="mt-1 text-xs text-red-500">Número inválido para este país</p>
      )}

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
              placeholder="Buscar país o código…"
              className="w-full pl-7 pr-2 py-1.5 rounded-md bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 outline-none"
            />
          </div>

          <div className="max-h-52 min-h-0 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3.5 py-3 text-center text-sm text-slate-400">Sin resultados.</p>
            ) : (
              filtered.map(c => (
                <button
                  key={c.iso2}
                  type="button"
                  onClick={() => selectCountry(c.iso2)}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left transition-colors ${
                    c.iso2 === country.iso2
                      ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-medium'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <FlagImage iso2={c.iso2} size="18px" className="shrink-0" />
                  <span className="truncate">{c.name}</span>
                  <span className="ml-auto flex items-center gap-2 shrink-0 text-slate-400">
                    +{c.dialCode}
                    {c.iso2 === country.iso2 && <Check className="w-3.5 h-3.5" />}
                  </span>
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
