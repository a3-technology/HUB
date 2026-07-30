import { useEffect, useState } from 'react'

const EXIT_DURATION = 150

/** Mantiene el modal montado durante la animación de salida antes de desaparecer. */
export function useModalTransition(open: boolean, duration = EXIT_DURATION) {
  const [mounted, setMounted] = useState(open)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      setClosing(false)
      return
    }
    if (!mounted) return
    setClosing(true)
    const timer = setTimeout(() => { setMounted(false); setClosing(false) }, duration)
    return () => clearTimeout(timer)
  }, [open, mounted, duration])

  return { mounted, closing }
}
