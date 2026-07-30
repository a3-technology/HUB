import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface TabsScrollerProps {
  children: ReactNode
  /** Fondo sobre el que viven los tabs, para que el degradado de los bordes
   *  combine: 'page' (slate-50/950) o 'modal' (white/slate-900). */
  tone?: 'page' | 'modal'
  className?: string
}

/**
 * Barra de tabs con scroll horizontal sin barra visible: cuando hay tabs
 * ocultos aparece una flecha con degradado en el borde correspondiente que
 * desplaza la barra al hacer clic. Los hijos son los botones de tab.
 */
export function TabsScroller({ children, tone = 'page', className = '' }: TabsScrollerProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState({ left: false, right: false })

  const update = () => {
    const el = scrollRef.current
    if (!el) return
    setOverflow({
      left: el.scrollLeft > 2,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
    })
  }

  // Recalcula al montar y cuando cambia el tamaño de la barra o de la ventana
  // (p. ej. al cargar los contadores de los tabs o al redimensionar).
  useEffect(() => {
    update()
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver(update)
    observer.observe(el)
    window.addEventListener('resize', update)
    return () => { observer.disconnect(); window.removeEventListener('resize', update) }
  }, [])

  const gradiente = tone === 'modal'
    ? 'from-white via-white/80 dark:from-slate-900 dark:via-slate-900/80'
    : 'from-slate-50 via-slate-50/80 dark:from-slate-950 dark:via-slate-950/80'

  return (
    <div className={`relative ${className}`}>
      {/* Indicador: hay tabs ocultos hacia la izquierda */}
      {overflow.left && (
        <button
          type="button"
          onClick={() => scrollRef.current?.scrollBy({ left: -160, behavior: 'smooth' })}
          title="Ver tabs anteriores"
          className={`absolute left-0 top-0 bottom-0 z-10 flex items-center pr-8 bg-gradient-to-r to-transparent ${gradiente}`}
        >
          <ChevronLeft className="w-4 h-4 text-slate-500 dark:text-slate-400" />
        </button>
      )}
      {/* Indicador: hay tabs ocultos hacia la derecha */}
      {overflow.right && (
        <button
          type="button"
          onClick={() => scrollRef.current?.scrollBy({ left: 160, behavior: 'smooth' })}
          title="Ver más tabs"
          className={`absolute right-0 top-0 bottom-0 z-10 flex items-center justify-end pl-8 bg-gradient-to-l to-transparent ${gradiente}`}
        >
          <ChevronRight className="w-4 h-4 text-slate-500 dark:text-slate-400" />
        </button>
      )}
      <div
        ref={scrollRef}
        onScroll={update}
        className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
    </div>
  )
}
