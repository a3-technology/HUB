import { useEffect, useRef, useState } from 'react'
import { Paperclip, Send, Trash2, FileText, Download, X } from 'lucide-react'
import { companyNotesApi } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { usePermission } from '../hooks/usePermission'

interface CompanyNote {
  id: string
  companyId: string
  userId: string
  authorName: string
  text?: string
  fileName?: string
  blobPath?: string
  fileSize?: number
  createdAt: string
}

/** Nota aún no guardada (modo creación de empresa): vive solo en memoria hasta que la empresa se crea. */
export interface PendingCompanyNote {
  tempId: string
  text: string
  file: File | null
}

interface CompanyNotesProps {
  /** Empresa ya existente: la lista se guarda contra la API. Si es undefined, se usa el modo borrador (pendingNotes). */
  companyId?: string
  pendingNotes?: PendingCompanyNote[]
  onPendingNotesChange?: (notes: PendingCompanyNote[]) => void
  /** Oculta el composer y solo muestra el listado de notas existentes (vista informativa). */
  readOnly?: boolean
  onCountChange?: (count: number) => void
}

function fmtWhen(iso: string): string {
  const d = new Date(iso)
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000)
  if (diffMin < 1) return 'ahora'
  if (diffMin < 60) return `hace ${diffMin} min`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `hace ${diffH} h`
  return d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Bitácora de notas de una empresa: composer (texto + adjunto opcional) + feed.
 * Con `companyId`, guarda cada nota de inmediato contra la API (empresa ya existe).
 * Sin `companyId` (empresa aún no creada), las notas quedan en `pendingNotes` —
 * el padre las persiste después de crear la empresa, igual que con Contactos.
 */
export function CompanyNotes({ companyId, pendingNotes, onPendingNotesChange, readOnly, onCountChange }: CompanyNotesProps) {
  const { user } = useAuth()
  const toast = useToast()
  const canCreate = usePermission('crm.companies.note-create')
  const canDelete = usePermission('crm.companies.note-delete')
  const isDraft = !companyId

  const [notes, setNotes]     = useState<CompanyNote[]>([])
  const [loading, setLoading] = useState(!isDraft)
  const [text, setText]       = useState('')
  const [file, setFile]       = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const res = await companyNotesApi.list(companyId)
      if (res.ok) {
        const data = await res.json()
        setNotes(data)
        onCountChange?.(data.length)
      }
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [companyId])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0]
    e.target.value = ''
    if (!picked) return
    if (picked.size > 10 * 1024 * 1024) { toast.error('El archivo no puede superar 10 MB.'); return }
    setFile(picked)
  }

  const handleSend = async () => {
    if (!text.trim() && !file) return

    if (!companyId) {
      onPendingNotesChange?.([...(pendingNotes ?? []), { tempId: crypto.randomUUID(), text: text.trim(), file }])
      setText(''); setFile(null)
      return
    }

    setSending(true)
    try {
      const res = await companyNotesApi.create(companyId, text.trim(), file ?? undefined)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'No se pudo agregar la nota.' }))
        toast.error(err.message); return
      }
      setText(''); setFile(null)
      await load()
    } finally { setSending(false) }
  }

  const removePendingNote = (tempId: string) =>
    onPendingNotesChange?.((pendingNotes ?? []).filter(n => n.tempId !== tempId))

  const handleOpen = async (note: CompanyNote) => {
    const win = window.open('', '_blank')
    try {
      const res = await companyNotesApi.getUrl(note.id)
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

  const handleDelete = async (note: CompanyNote) => {
    const res = await companyNotesApi.remove(note.id)
    if (res.ok) await load()
    else toast.error('No se pudo eliminar la nota.')
  }

  return (
    <div className="space-y-4">
      {isDraft && !readOnly && (
        <p className="text-xs text-slate-400">Las notas se guardarán automáticamente al crear el registro.</p>
      )}

      {canCreate && !readOnly && (
        <div className="space-y-2.5">
          <textarea
            rows={3}
            maxLength={2000}
            placeholder="Escribe una nota…"
            value={text}
            onChange={e => setText(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none"
          />

          {file && (
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-lg px-3 py-1.5 w-fit max-w-full">
              <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-xs text-slate-600 dark:text-slate-300 truncate">{file.name}</span>
              <button type="button" onClick={() => setFile(null)} title="Quitar archivo"
                className="w-5 h-5 shrink-0 flex items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <Paperclip className="w-3.5 h-3.5" />
              Adjuntar
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || (!text.trim() && !file)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {sending
                ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <Send className="w-3.5 h-3.5" />}
              Agregar nota
            </button>
          </div>
        </div>
      )}

      {isDraft ? (
        (pendingNotes ?? []).length === 0 ? (
          <div className="px-4 py-10 text-center">
            <FileText className="w-8 h-8 text-slate-200 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-400">Sin notas registradas.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(pendingNotes ?? []).map(p => (
              <div key={p.tempId} className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-lg px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{user?.names ?? 'Tú'}</span>
                  <button onClick={() => removePendingNote(p.tempId)} title="Quitar de la lista"
                    className="w-6 h-6 shrink-0 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </div>
                {p.text && (
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-wrap break-words">{p.text}</p>
                )}
                {p.file && (
                  <div className="mt-2 flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 w-fit max-w-full">
                    <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-xs text-slate-600 dark:text-slate-300 truncate">{p.file.name}</span>
                    <span className="text-[11px] text-slate-400 shrink-0">{fmtSize(p.file.size)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : loading ? (
        <div className="h-8 bg-slate-100 dark:bg-slate-700 rounded-lg animate-pulse" />
      ) : notes.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <FileText className="w-8 h-8 text-slate-200 dark:text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-400">Sin notas registradas.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map(n => (
            <div key={n.id} className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-lg px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{n.authorName}</span>
                  <span className="text-[11px] text-slate-400 shrink-0">· {fmtWhen(n.createdAt)}</span>
                </div>
                {!readOnly && n.userId === user?.userId && canDelete && (
                  <button onClick={() => handleDelete(n)} title="Eliminar nota"
                    className="w-6 h-6 shrink-0 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
              {n.text && (
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-wrap break-words">{n.text}</p>
              )}
              {n.blobPath && (
                <button type="button" onClick={() => handleOpen(n)}
                  className="mt-2 flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 hover:border-indigo-300 dark:hover:border-indigo-500/40 transition-colors w-fit max-w-full">
                  <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-xs text-slate-600 dark:text-slate-300 truncate">{n.fileName}</span>
                  <span className="text-[11px] text-slate-400 shrink-0">{fmtSize(n.fileSize)}</span>
                  <Download className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
