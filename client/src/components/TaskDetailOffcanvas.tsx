import { X, Pencil, FolderKanban, User, CalendarDays, AlertTriangle, FileText, ListChecks, Paperclip, MessageSquare } from 'lucide-react'
import { useModalTransition } from '../hooks/useModalTransition'
import { TaskDependencies } from './TaskDependencies'
import { TaskComments } from './TaskComments'
import { TaskAttachments } from './TaskAttachments'
import { TaskChecklist } from './TaskChecklist'

interface TaskDetail {
  id: string
  projectId: string
  projectName: string
  projectCode: string
  name: string
  description?: string
  assignedToId?: string
  assignedToName?: string
  assignedToPhotoUrl?: string
  startDate?: string
  dueDate?: string
  status: string
  priority: string
  progressPercent: number
  isActive: boolean
}

interface TaskDetailOffcanvasProps {
  open: boolean
  task: TaskDetail | null
  canEdit: boolean
  onClose: () => void
  onEdit: () => void
}

const STATUS_LABELS: Record<string, string> = {
  Pending:    'Pendiente',
  InProgress: 'En progreso',
  Blocked:    'Bloqueada',
  Completed:  'Completada',
}

const STATUS_STYLES: Record<string, string> = {
  Pending:    'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600',
  InProgress: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-500/20',
  Blocked:    'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-100 dark:border-red-500/20',
  Completed:  'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20',
}

const PRIORITY_LABELS: Record<string, string> = { Low: 'Baja', Medium: 'Media', High: 'Alta' }

const PRIORITY_STYLES: Record<string, string> = {
  Low:    'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400',
  Medium: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  High:   'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400',
}

function fmtDate(d?: string): string {
  return d ? new Date(d).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
}

function initials(name?: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
}

/** Panel lateral (offcanvas) de solo lectura con el detalle completo de una tarea, con acceso directo a editarla. */
export function TaskDetailOffcanvas({ open, task, canEdit, onClose, onEdit }: TaskDetailOffcanvasProps) {
  const { mounted, closing } = useModalTransition(open)

  if (!mounted) return null

  const todayISO = new Date().toISOString().slice(0, 10)
  const isOverdue = !!task?.dueDate && task.dueDate.slice(0, 10) < todayISO && task.status !== 'Completed'

  return (
    <div className="fixed inset-0 z-50">
      <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${closing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} onClick={onClose} />
      <div className={`absolute inset-y-0 right-0 bg-white dark:bg-slate-900 shadow-xl border-l border-slate-100 dark:border-slate-800 w-full max-w-md flex flex-col ${closing ? 'offcanvas-panel-exit' : 'offcanvas-panel-enter'}`}>
        {/* Header fijo */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <ListChecks className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">{task?.name}</h2>
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border mt-0.5 ${task ? (STATUS_STYLES[task.status] ?? '') : ''}`}>
                {task ? (STATUS_LABELS[task.status] ?? task.status) : ''}
              </span>
            </div>
          </div>
          <button onClick={onClose} title="Cerrar"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body con scroll propio */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Datos generales</h3>
            <dl className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm text-slate-500">Proyecto</dt>
                <dd className="text-sm text-slate-700 dark:text-slate-200 text-right flex items-center gap-1.5 min-w-0">
                  <FolderKanban className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{task?.projectCode} — {task?.projectName}</span>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm text-slate-500">Responsable</dt>
                <dd className="text-sm text-right">
                  {task?.assignedToName ? (
                    <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                      {task.assignedToPhotoUrl ? (
                        <img src={task.assignedToPhotoUrl} alt={task.assignedToName} className="w-5 h-5 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700" />
                      ) : (
                        <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[9px] font-bold shrink-0">
                          {initials(task.assignedToName)}
                        </span>
                      )}
                      {task.assignedToName}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-slate-300 dark:text-slate-600">
                      <User className="w-3.5 h-3.5" />
                      Sin asignar
                    </span>
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm text-slate-500">Fechas</dt>
                <dd className={`text-sm text-right flex items-center gap-1.5 ${isOverdue ? 'text-red-500 dark:text-red-400 font-medium' : 'text-slate-700 dark:text-slate-200'}`}>
                  <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                  {fmtDate(task?.startDate)} — {fmtDate(task?.dueDate)}
                  {isOverdue && <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm text-slate-500">Prioridad</dt>
                <dd className="text-sm text-right">
                  <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${task ? (PRIORITY_STYLES[task.priority] ?? '') : ''}`}>
                    {task ? (PRIORITY_LABELS[task.priority] ?? task.priority) : ''}
                  </span>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm text-slate-500 shrink-0">Progreso</dt>
                <dd className="flex-1 flex items-center gap-2 max-w-[65%]">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                    <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${task?.progressPercent ?? 0}%` }} />
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{task?.progressPercent ?? 0}%</span>
                </dd>
              </div>
            </dl>
          </div>

          {task?.description && (
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Descripción</h3>
              <p className="flex items-start gap-1.5 text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>{task.description}</span>
              </p>
            </div>
          )}

          {task && (
            <>
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <ListChecks className="w-3.5 h-3.5" />
                  Checklist y Dependencias
                </h3>
                <div className="space-y-4">
                  <TaskChecklist taskId={task.id} />
                  <TaskDependencies taskId={task.id} projectId={task.projectId} />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5" />
                  Adjuntos
                </h3>
                <TaskAttachments taskId={task.id} />
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" />
                  Comentarios
                </h3>
                <TaskComments taskId={task.id} />
              </div>
            </>
          )}
        </div>

        {/* Footer fijo */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            Cerrar
          </button>
          {canEdit && (
            <button onClick={onEdit}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
              <Pencil className="w-3.5 h-3.5" />
              Editar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
