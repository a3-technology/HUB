import { useEffect, useRef, useState } from 'react'
import { Paperclip, Download, Trash2, Upload, FileText } from 'lucide-react'
import { ticketAttachmentsApi } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { usePermission } from '../hooks/usePermission'

interface Attachment {
  id: string
  ticketId: string
  fileName: string
  blobPath: string
  fileSize?: number
  uploadedByUserId: string
  uploadedByName: string
  createdAt: string
}

interface TicketAttachmentsProps {
  ticketId: string
  /** Solo el solicitante del ticket puede agregarle adjuntos; el resto solo puede verlos/descargarlos. */
  canUpload: boolean
  /** Ticket ya Cerrado: no se admiten adjuntos nuevos ni borrar los existentes, solo verlos/descargarlos. */
  locked?: boolean
}

function fmtSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Lista y gestiona los archivos adjuntos de un ticket existente (Azure Blob Storage). */
export function TicketAttachments({ ticketId, canUpload: canUploadTicket, locked = false }: TicketAttachmentsProps) {
  const { user } = useAuth()
  const toast = useToast()
  const canUpload = usePermission('helpdesk.tickets.attachment-upload') && canUploadTicket && !locked
  const canDelete = usePermission('helpdesk.tickets.attachment-delete') && !locked
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await ticketAttachmentsApi.list(ticketId)
      if (res.ok) setAttachments(await res.json())
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [ticketId])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { toast.error('El archivo no puede superar 10 MB.'); return }
    setUploading(true)
    try {
      const res = await ticketAttachmentsApi.upload(ticketId, file)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'No se pudo adjuntar el archivo.' }))
        toast.error(err.message); return
      }
      await load()
    } finally { setUploading(false) }
  }

  const handleOpen = async (att: Attachment) => {
    const win = window.open('', '_blank')
    try {
      const res = await ticketAttachmentsApi.getUrl(att.id)
      if (!res.ok) {
        win?.close()
        const err = await res.json().catch(() => ({ message: 'No se pudo abrir el archivo.' }))
        toast.error(err.message); return
      }
      const { url } = await res.json()
      if (win) win.location.href = url
      else window.open(url, '_blank', 'noopener')
    } catch {
      win?.close()
      toast.error('No se pudo abrir el archivo.')
    }
  }

  const handleDelete = async (att: Attachment) => {
    const res = await ticketAttachmentsApi.remove(att.id)
    if (res.ok) await load()
    else toast.error('No se pudo eliminar el adjunto.')
  }

  return (
    <div className="space-y-2.5">
      {loading ? (
        <div className="h-8 bg-slate-100 dark:bg-slate-700 rounded-lg animate-pulse" />
      ) : attachments.length === 0 ? (
        <p className="text-xs text-slate-400 flex items-center gap-1.5">
          <Paperclip className="w-3.5 h-3.5" />
          Sin archivos adjuntos.
        </p>
      ) : (
        <div className="space-y-1.5">
          {attachments.map(att => (
            <div key={att.id} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-lg px-3 py-2">
              <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-700 dark:text-slate-200 truncate" title={att.fileName}>{att.fileName}</p>
                <p className="text-[11px] text-slate-400">
                  {fmtSize(att.fileSize)} · {att.uploadedByName}
                </p>
              </div>
              <button onClick={() => handleOpen(att)} title="Abrir / descargar"
                className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors">
                <Download className="w-3.5 h-3.5" />
              </button>
              {canDelete && att.uploadedByUserId === user?.userId && (
                <button onClick={() => handleDelete(att)} title="Eliminar adjunto"
                  className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canUpload && (
        <>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400 hover:border-indigo-300 hover:text-indigo-600 dark:hover:border-indigo-500/40 dark:hover:text-indigo-400 transition-colors disabled:opacity-50"
          >
            {uploading
              ? <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-indigo-600 rounded-full animate-spin" />
              : <Upload className="w-3.5 h-3.5" />}
            {uploading ? 'Subiendo…' : 'Adjuntar archivo (máx. 10 MB)'}
          </button>
        </>
      )}
    </div>
  )
}
