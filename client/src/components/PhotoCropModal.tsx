import { useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { Check, ZoomIn, ZoomOut } from 'lucide-react'
import { useModalTransition } from '../hooks/useModalTransition'

/** Lado máximo (px) de la foto resultante: suficiente para avatares y ficha. */
const OUTPUT_SIZE = 512

interface PhotoCropModalProps {
  open: boolean
  /** Object URL de la imagen recién elegida por el usuario. */
  imageSrc: string
  onCancel: () => void
  /** Recibe la foto ya recortada en cuadrado, como JPEG. */
  onCropped: (file: File) => void
}

/**
 * Recorte cuadrado obligatorio de la foto antes de subirla: el usuario encuadra
 * y hace zoom, y el resultado se normaliza a un JPEG de máximo 512×512. Así
 * todas las fotos de empleados guardan la misma proporción sin importar el
 * tamaño original.
 */
export function PhotoCropModal({ open, imageSrc, onCancel, onCropped }: PhotoCropModalProps) {
  const [crop, setCrop]   = useState({ x: 0, y: 0 })
  const [zoom, setZoom]   = useState(1)
  const [area, setArea]   = useState<Area | null>(null)
  const [saving, setSaving] = useState(false)
  const { mounted, closing } = useModalTransition(open)

  const handleConfirm = async () => {
    if (!area) return
    setSaving(true)
    try {
      const img = new Image()
      img.src = imageSrc
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject })

      const size = Math.min(OUTPUT_SIZE, Math.round(area.width))
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff' // fondo para PNG/WEBP con transparencia
      ctx.fillRect(0, 0, size, size)
      ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, size, size)

      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
      if (blob) onCropped(new File([blob], 'foto.jpg', { type: 'image/jpeg' }))
    } finally {
      setSaving(false)
      setCrop({ x: 0, y: 0 }); setZoom(1); setArea(null)
    }
  }

  const handleCancel = () => {
    setCrop({ x: 0, y: 0 }); setZoom(1); setArea(null)
    onCancel()
  }

  if (!mounted) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
      <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${closing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
      <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-md p-6 ${closing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">Recortar foto</h2>
        <p className="text-xs text-slate-400 mb-4">Encuadra la foto: se guardará en formato cuadrado.</p>

        <div className="relative h-72 rounded-xl overflow-hidden bg-slate-900">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, areaPixels) => setArea(areaPixels)}
          />
        </div>

        <div className="flex items-center gap-3 mt-4">
          <ZoomOut className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            className="flex-1 accent-indigo-600"
          />
          <ZoomIn className="w-4 h-4 text-slate-400 shrink-0" />
        </div>

        <div className="flex items-center justify-end gap-3 mt-5">
          <button onClick={handleCancel} disabled={saving}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            Cancelar
          </button>
          <button onClick={handleConfirm} disabled={saving || !area}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
            {saving
              ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : <Check className="w-3.5 h-3.5" />}
            Aplicar recorte
          </button>
        </div>
      </div>
    </div>
  )
}
