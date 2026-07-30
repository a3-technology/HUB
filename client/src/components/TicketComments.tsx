import { useEffect, useRef, useState } from 'react'
import { Send, MessageSquare } from 'lucide-react'
import { ticketCommentsApi } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { usePermission } from '../hooks/usePermission'

interface Comment {
  id: string
  ticketId: string
  userId: string
  authorName: string
  text: string
  createdAt: string
}

interface TicketCommentsProps {
  ticketId: string
  /** Ticket ya Cerrado: no se admiten comentarios nuevos, solo lectura del historial. */
  locked?: boolean
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

/** Hilo de comentarios de un ticket existente: lista + composer. */
export function TicketComments({ ticketId, locked = false }: TicketCommentsProps) {
  const toast = useToast()
  const canCreate = usePermission('helpdesk.tickets.comment-create')
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading]   = useState(true)
  const [text, setText]         = useState('')
  const [sending, setSending]   = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await ticketCommentsApi.list(ticketId)
      if (res.ok) setComments(await res.json())
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [ticketId])

  const handleSend = async () => {
    if (!text.trim()) return
    setSending(true)
    try {
      const res = await ticketCommentsApi.create(ticketId, text.trim())
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'No se pudo agregar el comentario.' }))
        toast.error(err.message); return
      }
      setText('')
      await load()
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }))
    } finally { setSending(false) }
  }

  return (
    <div className="space-y-2.5">
      {loading ? (
        <div className="h-8 bg-slate-100 dark:bg-slate-700 rounded-lg animate-pulse" />
      ) : comments.length === 0 ? (
        <p className="text-xs text-slate-400 flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5" />
          Aún no hay comentarios en este ticket.
        </p>
      ) : (
        <div ref={listRef} className="max-h-56 overflow-y-auto space-y-2 pr-1 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent]">
          {comments.map(c => (
            <div key={c.id} className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{c.authorName}</span>
                  <span className="text-[11px] text-slate-400 shrink-0">· {fmtWhen(c.createdAt)}</span>
                </div>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-wrap break-words">{c.text}</p>
            </div>
          ))}
        </div>
      )}

      {canCreate && !locked && (
        <div className="flex items-start gap-2">
          <textarea
            rows={2}
            maxLength={2000}
            placeholder="Escribe un comentario…"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSend() } }}
            className="flex-1 px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none"
          />
          <button onClick={handleSend} disabled={sending || !text.trim()} title="Comentar (Ctrl+Enter)"
            className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors">
            {sending
              ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : <Send className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  )
}
