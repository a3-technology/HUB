import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'

export function ScrollToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollUp = () => window.scrollTo({ top: 0, behavior: 'smooth' })

  return (
    <button
      onClick={scrollUp}
      aria-label="Volver arriba"
      className={`
        fixed bottom-6 right-6 z-50
        w-10 h-10 rounded-full bg-indigo-600 hover:bg-indigo-700
        text-white shadow-lg shadow-indigo-500/30
        flex items-center justify-center
        transition-all duration-300
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}
      `}
    >
      <ArrowUp className="w-4 h-4" />
    </button>
  )
}
