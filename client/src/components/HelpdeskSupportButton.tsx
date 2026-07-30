import { useEffect, useRef, useState } from 'react'
import { Headset, X, Send, Clock, Upload, FileText, Plus, ArrowLeft, Trash2, MessageSquare, UserCog, Search } from 'lucide-react'
import { helpdeskSelfApi } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useSupportPanel } from '../context/SupportPanelContext'
import { useModalTransition } from '../hooks/useModalTransition'
import { SearchSelect, type SearchSelectOption } from './SearchSelect'
import { TabsScroller } from './TabsScroller'
import { ConfirmDialog } from './ConfirmDialog'

interface Category { id: string; name: string }
interface Priority { id: string; name: string; colorHex: string }

interface MyTicket {
  id: string
  code: string
  subject: string
  description?: string
  status: string
  statusColorHex: string
  categoryName: string
  priorityName: string
  priorityColor: string
  assignedToId?: string
  assignedToName?: string
  createdAt: string
}

interface Comment {
  id: string
  userId: string
  authorName: string
  text: string
  createdAt: string
}

interface Attachment {
  id: string
  fileName: string
  fileSize?: number
  createdAt: string
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']
function isImageFile(fileName: string) {
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase()
  return IMAGE_EXTENSIONS.includes(ext)
}

interface TicketForm {
  subject: string
  description: string
  categoryId: string
  priorityId: string
}

const EMPTY_FORM: TicketForm = { subject: '', description: '', categoryId: '', priorityId: '' }

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const MAX_FILE_SIZE = 5 * 1024 * 1024
const MAX_FILES = 5
const ACCEPTED_EXTENSIONS = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.zip'

/**
 * Ícono de soporte en el header para reportar un ticket sin necesidad del
 * módulo Helpdesk — pensado para el resto de la organización (no agentes de
 * soporte). Solo se muestra a usuarios sin acceso al módulo.
 */
export function HelpdeskSupportButton() {
  const { user } = useAuth()
  const toast = useToast()
  const { pendingTicketId, clearPendingTicket } = useSupportPanel()

  const [open, setOpen] = useState(false)
  const { mounted, closing } = useModalTransition(open)
  const [tab, setTab] = useState<'new' | 'history'>('new')

  const [categories, setCategories] = useState<Category[]>([])
  const [priorities, setPriorities] = useState<Priority[]>([])
  const [myTickets, setMyTickets]   = useState<MyTicket[]>([])
  const [loadingLists, setLoadingLists] = useState(false)

  const [form, setForm]       = useState<TicketForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving]   = useState(false)

  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const subjectInputRef = useRef<HTMLInputElement>(null)

  const [historySearch, setHistorySearch] = useState('')
  const [selectedTicket, setSelectedTicket] = useState<MyTicket | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [loadingComments, setLoadingComments] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loadingAttachments, setLoadingAttachments] = useState(false)
  const [attachmentPreviews, setAttachmentPreviews] = useState<Record<string, string>>({})

  // Precarga la URL firmada de los adjuntos que son imágenes, para mostrarlas como thumbnail.
  useEffect(() => {
    const images = attachments.filter(a => isImageFile(a.fileName) && !attachmentPreviews[a.id])
    if (images.length === 0) return
    images.forEach(async a => {
      const res = await helpdeskSelfApi.getAttachmentUrl(a.id)
      if (res.ok) {
        const { url } = await res.json()
        setAttachmentPreviews(prev => ({ ...prev, [a.id]: url }))
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachments])

  // Foco en el primer campo (Asunto) al abrir el modal.
  useEffect(() => { if (mounted) subjectInputRef.current?.focus() }, [mounted])

  // Vistas previas (object URLs) de los adjuntos que son imágenes; se liberan al cambiar la lista.
  const [previews, setPreviews] = useState<Record<number, string>>({})
  useEffect(() => {
    const urls: Record<number, string> = {}
    pendingFiles.forEach((file, i) => {
      if (file.type.startsWith('image/')) urls[i] = URL.createObjectURL(file)
    })
    setPreviews(urls)
    return () => { Object.values(urls).forEach(u => URL.revokeObjectURL(u)) }
  }, [pendingFiles])

  const closeModal = () => {
    setOpen(false)
    setForm(EMPTY_FORM)
    setPendingFiles([])
    setFormError(null)
    setSelectedTicket(null)
    setComments([])
    setAttachments([])
    setAttachmentPreviews({})
    setHistorySearch('')
    clearPendingTicket()
  }

  const openHistoryTab = () => { setTab('history'); setSelectedTicket(null) }

  const loadComments = async (ticketId: string) => {
    setLoadingComments(true)
    try {
      const res = await helpdeskSelfApi.getComments(ticketId)
      if (res.ok) setComments(await res.json())
    } finally { setLoadingComments(false) }
  }

  const loadAttachments = async (ticketId: string) => {
    setLoadingAttachments(true)
    try {
      const res = await helpdeskSelfApi.getAttachments(ticketId)
      if (res.ok) setAttachments(await res.json())
    } finally { setLoadingAttachments(false) }
  }

  const openTicketDetail = (t: MyTicket) => {
    setSelectedTicket(t)
    setCommentText('')
    setAttachments([])
    setAttachmentPreviews({})
    loadComments(t.id)
    loadAttachments(t.id)
  }

  // Abre/descarga un adjunto con URL firmada; la pestaña se abre ANTES del
  // await para que el bloqueador de popups del navegador no la cancele.
  const handleOpenAttachment = async (att: Attachment) => {
    const win = window.open('', '_blank')
    try {
      const res = await helpdeskSelfApi.getAttachmentUrl(att.id)
      if (!res.ok) {
        win?.close()
        toast.error('No se pudo abrir el archivo.'); return
      }
      const { url } = await res.json()
      if (win) win.location.href = url
      else window.open(url, '_blank', 'noopener')
    } catch {
      win?.close()
      toast.error('No se pudo abrir el archivo.')
    }
  }

  const handleSendComment = async () => {
    if (!selectedTicket || !commentText.trim()) return
    setSendingComment(true)
    try {
      const res = await helpdeskSelfApi.createComment(selectedTicket.id, commentText.trim())
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'No se pudo agregar el comentario.' }))
        toast.error(err.message); return
      }
      setCommentText('')
      await loadComments(selectedTicket.id)
    } finally { setSendingComment(false) }
  }

  const canDeleteTicket = (t: MyTicket) => !t.assignedToId

  const handleDeleteTicket = async () => {
    if (!selectedTicket) return
    try {
      const res = await helpdeskSelfApi.removeTicket(selectedTicket.id)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar el ticket.' }))
        toast.error(err.message); return
      }
      toast.success('Ticket eliminado correctamente.')
      setSelectedTicket(null)
      await loadLists()
    } finally { setDeleteConfirmOpen(false) }
  }

  const loadLists = async (): Promise<MyTicket[]> => {
    setLoadingLists(true)
    try {
      const [catRes, prioRes, ticketsRes] = await Promise.all([
        helpdeskSelfApi.categories(),
        helpdeskSelfApi.priorities(),
        helpdeskSelfApi.myTickets(),
      ])
      if (catRes.ok) setCategories(await catRes.json())
      if (prioRes.ok) setPriorities(await prioRes.json())
      let tickets: MyTicket[] = []
      if (ticketsRes.ok) {
        tickets = await ticketsRes.json()
        // Del más nuevo al más viejo, para que el ticket más reciente aparezca primero.
        tickets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        setMyTickets(tickets)
      }
      return tickets
    } finally { setLoadingLists(false) }
  }

  // Una notificación pidió abrir un ticket propio: abre el panel automáticamente.
  useEffect(() => { if (pendingTicketId) setOpen(true) }, [pendingTicketId])

  useEffect(() => {
    if (!open) return
    const wantsTicketId = pendingTicketId
    setTab(wantsTicketId ? 'history' : 'new')
    loadLists().then(tickets => {
      if (!wantsTicketId) return
      const found = tickets.find(t => t.id === wantsTicketId)
      if (found) openTicketDetail(found)
      clearPendingTicket()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const categoryOptions: SearchSelectOption[] = categories.map(c => ({ value: c.id, label: c.name }))
  const priorityOptions: SearchSelectOption[] = priorities.map(p => ({ value: p.id, label: p.name }))

  const filteredTickets = myTickets.filter(t => {
    const q = historySearch.trim().toLowerCase()
    if (!q) return true
    return t.subject.toLowerCase().includes(q) || t.code.toLowerCase().includes(q)
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''

    const oversized = files.filter(f => f.size > MAX_FILE_SIZE)
    if (oversized.length > 0) toast.error('Cada archivo debe ser menor a 5 MB.')

    const valid = files.filter(f => f.size <= MAX_FILE_SIZE)
    const availableSlots = MAX_FILES - pendingFiles.length
    if (valid.length > availableSlots) toast.error(`Puedes adjuntar hasta ${MAX_FILES} archivos.`)

    setPendingFiles(prev => [...prev, ...valid.slice(0, availableSlots)])
  }

  const removeFile = (index: number) =>
    setPendingFiles(prev => prev.filter((_, i) => i !== index))

  const handleSubmit = async () => {
    if (!form.subject.trim() || !form.categoryId || !form.priorityId) {
      setFormError('Completa el asunto, la categoría y la prioridad.'); return
    }
    setSaving(true); setFormError(null)
    try {
      const res = await helpdeskSelfApi.createTicket({
        subject: form.subject.trim(),
        description: form.description.trim() || undefined,
        categoryId: form.categoryId,
        priorityId: form.priorityId,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'No se pudo crear el ticket.' }))
        setFormError(err.message); toast.error(err.message); return
      }
      const result = await res.json()

      if (pendingFiles.length > 0) {
        const failed: string[] = []
        for (const file of pendingFiles) {
          const upRes = await helpdeskSelfApi.uploadAttachment(result.id, file)
          if (!upRes.ok) failed.push(file.name)
        }
        if (failed.length > 0) {
          toast.error(`El ticket se creó, pero no se pudieron adjuntar: ${failed.join(', ')}`)
        }
      }

      toast.success(result.message ?? 'Ticket creado correctamente.')
      setForm(EMPTY_FORM)
      setPendingFiles([])
      await loadLists()
      setTab('history')
    } finally { setSaving(false) }
  }

  // Solo para usuarios SIN el módulo Helpdesk: quienes lo tienen usan la app completa.
  if (!user || user.modules.includes('helpdesk')) return null

  return (
    <>
      {/* Ícono de soporte en el header */}
      <button
        onClick={() => setOpen(true)}
        title="Soporte — reportar un problema"
        aria-label="Soporte"
        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
      >
        <Headset className="w-4 h-4" />
      </button>

      {mounted && (
        <div className="fixed inset-0 z-50">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${closing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} onClick={closeModal} />
          <div className={`absolute inset-y-0 right-0 bg-white dark:bg-slate-900 shadow-xl border-l border-slate-100 dark:border-slate-800 w-full max-w-md flex flex-col ${closing ? 'offcanvas-panel-exit' : 'offcanvas-panel-enter'}`}>
            {/* Header fijo */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <Headset className="w-4.5 h-4.5" />
                </div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Reportar un problema</h2>
              </div>
              <button onClick={closeModal} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Pestañas */}
            <div className="px-6 shrink-0">
              <TabsScroller tone="modal">
                <button
                  type="button"
                  onClick={() => setTab('new')}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                    tab === 'new'
                      ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  Nuevo ticket
                </button>
                <button
                  type="button"
                  onClick={openHistoryTab}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                    tab === 'history'
                      ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  Historial
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                    tab === 'history'
                      ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400'
                      : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                  }`}>
                    {myTickets.length}
                  </span>
                </button>
              </TabsScroller>
            </div>

            {/* Body con scroll interno */}
            <div className="px-6 pt-4 pb-6 overflow-y-auto flex-1 space-y-4">
              {tab === 'new' ? (
                <>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Asunto <span className="text-red-500">*</span></label>
                    <input ref={subjectInputRef} type="text" maxLength={200} placeholder="Ej: No puedo iniciar sesión en el sistema" value={form.subject}
                      onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Descripción</label>
                    <textarea rows={3} maxLength={2000} placeholder="Cuéntanos qué pasó, cuándo y cómo reproducirlo…" value={form.description}
                      onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Categoría <span className="text-red-500">*</span></label>
                      <SearchSelect
                        value={form.categoryId}
                        onChange={v => setForm(f => ({ ...f, categoryId: v }))}
                        options={categoryOptions}
                        placeholder={loadingLists ? 'Cargando…' : 'Selecciona…'}
                        searchPlaceholder="Buscar categoría…"
                        emptyLabel="No hay categorías disponibles."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Prioridad <span className="text-red-500">*</span></label>
                      <SearchSelect
                        value={form.priorityId}
                        onChange={v => setForm(f => ({ ...f, priorityId: v }))}
                        options={priorityOptions}
                        placeholder={loadingLists ? 'Cargando…' : 'Selecciona…'}
                        searchPlaceholder="Buscar prioridad…"
                        emptyLabel="No hay prioridades disponibles."
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Adjuntos <span className="text-slate-400 font-normal">(máx. {MAX_FILES}, 5 MB c/u)</span>
                    </label>
                    <input ref={fileInputRef} type="file" multiple accept={ACCEPTED_EXTENSIONS} className="hidden" onChange={handleFileChange} />
                    {pendingFiles.length === 0 ? (
                      <button type="button" onClick={() => fileInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-sm text-slate-500 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                        <Upload className="w-4 h-4" />
                        Adjuntar archivo
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 overflow-x-auto pb-2 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
                        {pendingFiles.map((file, i) => (
                          <div key={i} title={`${file.name} · ${formatSize(file.size)}`}
                            className="relative w-20 h-20 shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 overflow-hidden group">
                            {previews[i] ? (
                              <img src={previews[i]} alt={file.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center gap-1 px-1.5">
                                <FileText className="w-6 h-6 text-slate-400 shrink-0" />
                                <span className="w-full text-[9px] text-slate-500 dark:text-slate-400 text-center leading-tight line-clamp-2 break-all">{file.name}</span>
                              </div>
                            )}
                            <button onClick={() => removeFile(i)} title="Quitar archivo"
                              className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-opacity">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        {pendingFiles.length < MAX_FILES && (
                          <button type="button" onClick={() => fileInputRef.current?.click()} title="Adjuntar archivo"
                            className="w-20 h-20 shrink-0 flex items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-slate-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                            <Plus className="w-6 h-6" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {formError && (
                    <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                      {formError}
                    </div>
                  )}
                </>
              ) : selectedTicket ? (
                /* Detalle del ticket: descripción, categoría/prioridad, responsable y comentarios */
                <div className="space-y-4">
                  <button onClick={() => setSelectedTicket(null)} className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Volver al historial
                  </button>

                  <div className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-700 p-3.5">
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{selectedTicket.subject}</p>
                        <div className="shrink-0 flex items-center gap-1.5">
                          <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border"
                            style={{ backgroundColor: `${selectedTicket.statusColorHex}1A`, borderColor: `${selectedTicket.statusColorHex}33`, color: selectedTicket.statusColorHex }}>
                            {selectedTicket.status}
                          </span>
                          {canDeleteTicket(selectedTicket) && (
                            <button onClick={() => setDeleteConfirmOpen(true)} title="Eliminar ticket"
                              className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-400">{selectedTicket.code} · {formatDate(selectedTicket.createdAt)}</p>
                      {selectedTicket.description && (
                        <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words">{selectedTicket.description}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                        {selectedTicket.categoryName}
                      </span>
                      <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full" style={{ backgroundColor: `${selectedTicket.priorityColor}1a`, color: selectedTicket.priorityColor }}>
                        {selectedTicket.priorityName}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                        <UserCog className="w-3.5 h-3.5" />
                        {selectedTicket.assignedToName ?? 'Sin asignar'}
                      </span>
                    </div>

                    {/* Adjuntos */}
                    {(loadingAttachments || attachments.length > 0) && (
                      loadingAttachments ? (
                        <div className="h-20 bg-slate-100 dark:bg-slate-700 rounded-lg animate-pulse" />
                      ) : (
                        <div className="flex items-center gap-2 overflow-x-auto pb-2 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
                          {attachments.map(a => (
                            <button key={a.id} onClick={() => handleOpenAttachment(a)} title={`${a.fileName}${a.fileSize ? ` · ${formatSize(a.fileSize)}` : ''}`}
                              className="relative w-20 h-20 shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 overflow-hidden hover:border-indigo-300 dark:hover:border-indigo-500/40 transition-colors">
                              {attachmentPreviews[a.id] ? (
                                <img src={attachmentPreviews[a.id]} alt={a.fileName} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center gap-1 px-1.5">
                                  <FileText className="w-6 h-6 text-slate-400 shrink-0" />
                                  <span className="w-full text-[9px] text-slate-500 dark:text-slate-400 text-center leading-tight line-clamp-2 break-all">{a.fileName}</span>
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      )
                    )}
                  </div>

                  {/* Comentarios */}
                  <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 pt-3">Comentarios</label>
                    {loadingComments ? (
                      <div className="h-8 bg-slate-100 dark:bg-slate-700 rounded-lg animate-pulse" />
                    ) : comments.length === 0 ? (
                      <p className="text-xs text-slate-400 flex items-center gap-1.5 py-1">
                        <MessageSquare className="w-3.5 h-3.5" />
                        Aún no hay comentarios en este ticket.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
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
                    <div className="flex items-start gap-2 pt-1">
                      <textarea rows={2} maxLength={2000} placeholder="Escribe un comentario…" value={commentText}
                        onChange={e => setCommentText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSendComment() } }}
                        className="flex-1 px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none" />
                      <button onClick={handleSendComment} disabled={sendingComment || !commentText.trim()} title="Comentar (Ctrl+Enter)"
                        className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors">
                        {sendingComment
                          ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          : <Send className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Historial de tickets propios */
                <div className="space-y-3">
                  {myTickets.length > 0 && (
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Buscar por asunto o código…"
                        value={historySearch}
                        onChange={e => setHistorySearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                      />
                    </div>
                  )}

                  {myTickets.length === 0 ? (
                    <p className="text-xs text-slate-400 flex items-center gap-1.5 py-1">
                      <Clock className="w-3.5 h-3.5" />
                      {loadingLists ? 'Cargando…' : 'Aún no has reportado ningún ticket.'}
                    </p>
                  ) : filteredTickets.length === 0 ? (
                    <p className="text-xs text-slate-400 py-1">Sin resultados para la búsqueda.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {filteredTickets.map(t => (
                        <button key={t.id} onClick={() => openTicketDetail(t)}
                          className="w-full flex items-center gap-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-lg px-3 py-2 text-left hover:border-indigo-200 dark:hover:border-indigo-500/40 transition-colors">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{t.subject}</p>
                            <p className="text-[11px] text-slate-400">{t.code} · {formatDate(t.createdAt)} · {t.assignedToName ?? 'Sin asignar'}</p>
                          </div>
                          <span className="shrink-0 inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border"
                            style={{ backgroundColor: `${t.statusColorHex}1A`, borderColor: `${t.statusColorHex}33`, color: t.statusColorHex }}>
                            {t.status}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer fijo */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button onClick={closeModal} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cerrar
              </button>
              {tab === 'new' && (
                <button onClick={handleSubmit} disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                  {saving
                    ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    : <Send className="w-3.5 h-3.5" />}
                  {saving ? 'Creando…' : 'Crear ticket'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="¿Eliminar ticket?"
        message={`El ticket "${selectedTicket?.subject}" se eliminará permanentemente. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDeleteTicket}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </>
  )
}
