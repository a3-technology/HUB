import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, X } from 'lucide-react'
import { notificationsApi } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useSupportPanel } from '../context/SupportPanelContext'

interface Notification {
  id: string
  type: string
  title: string
  message?: string
  entityType?: string
  entityId?: string
  isRead: boolean
  createdAt: string
}

const POLL_INTERVAL_MS = 30_000

function fmtWhen(iso: string): string {
  const d = new Date(iso)
  const day   = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year  = d.getFullYear()
  const ampm  = d.getHours() >= 12 ? 'p.m.' : 'a.m.'
  const hours12 = String(d.getHours() % 12 || 12).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours12}:${minutes} ${ampm}`
}

/**
 * Notificaciones del usuario en sesión. Genérico para cualquier módulo: hoy solo
 * Helpdesk las emite (ticket nuevo, comentario, asignación, cambio de estado),
 * identificadas por `entityType`/`entityId`. Al "ver" una de Helpdesk, navega a
 * la app completa si el usuario tiene el módulo (agente), o abre el panel de
 * autoservicio en ese ticket si no (solicitante) — ver SupportPanelContext.
 */
export function NotificationsBell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { requestOpenTicket } = useSupportPanel()

  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Ids descartados con el DELETE aún en vuelo: si el dropdown se reabre antes de
  // que el servidor confirme el borrado, un GET recargaría la lista y "resucitaría"
  // la notificación por un instante. Se filtran localmente hasta que el DELETE resuelve.
  const dismissingIdsRef = useRef<Set<string>>(new Set())

  const loadUnreadCount = async () => {
    const res = await notificationsApi.unreadCount()
    if (res.ok) setUnreadCount((await res.json()).unreadCount)
  }

  const loadNotifications = async () => {
    setLoading(true)
    try {
      const res = await notificationsApi.list()
      if (res.ok) {
        const data: Notification[] = await res.json()
        setNotifications(data.filter(n => !dismissingIdsRef.current.has(n.id)))
      }
    } finally { setLoading(false) }
  }

  useEffect(() => {
    loadUnreadCount()
    const interval = setInterval(loadUnreadCount, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => { if (open) loadNotifications() }, [open])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Descarta la notificación (usado tanto al "ver" como al hacer clic en la X).
  const dismiss = async (n: Notification) => {
    dismissingIdsRef.current.add(n.id)
    setNotifications(prev => prev.filter(x => x.id !== n.id))
    if (!n.isRead) setUnreadCount(c => Math.max(0, c - 1))
    try {
      await notificationsApi.remove(n.id)
    } finally {
      dismissingIdsRef.current.delete(n.id)
    }
  }

  const handleView = (n: Notification) => {
    setOpen(false)
    dismiss(n)
    if (n.entityType === 'helpdesk-ticket' && n.entityId) {
      if (user?.modules.includes('helpdesk')) navigate(`/helpdesk/tickets?ticketId=${n.entityId}`)
      else requestOpenTicket(n.entityId)
    }
  }

  const handleDismiss = (n: Notification, e: React.MouseEvent) => {
    e.stopPropagation()
    dismiss(n)
  }

  const handleMarkAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
    setUnreadCount(0)
    await notificationsApi.markAllRead()
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        title="Notificaciones"
        aria-label="Notificaciones"
        className="relative w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[90vw] bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shadow-lg shadow-slate-200/60 dark:shadow-slate-950/60 z-50 flex flex-col max-h-[70vh]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-50 dark:border-slate-800 shrink-0">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Notificaciones</p>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400">
                Marcar todas leídas
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">Sin notificaciones.</p>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleView(n)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-50 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors flex items-start gap-2.5 cursor-pointer ${!n.isRead ? 'bg-indigo-50/40 dark:bg-indigo-500/5' : ''}`}
                >
                  {!n.isRead && <span className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${!n.isRead ? 'font-semibold text-slate-800 dark:text-slate-200' : 'text-slate-600 dark:text-slate-300'}`}>
                      {n.title}
                    </p>
                    {n.message && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{n.message}</p>
                    )}
                    <p className="text-[11px] text-slate-400 mt-1">{fmtWhen(n.createdAt)}</p>
                  </div>
                  <button onClick={e => handleDismiss(n, e)} title="Descartar"
                    className="w-6 h-6 shrink-0 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
