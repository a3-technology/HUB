import { X, Pencil, Mail, Phone, Building2, GitBranch, User, Star, FileText } from 'lucide-react'
import { useModalTransition } from '../hooks/useModalTransition'

interface ContactDetail {
  id: string
  companyName: string
  branchName?: string
  name: string
  position?: string
  email?: string
  phones: string[]
  isPrimary: boolean
  notes?: string
  isActive: boolean
}

interface ContactDetailOffcanvasProps {
  open: boolean
  contact: ContactDetail | null
  onClose: () => void
  onEdit: () => void
}

/** Panel lateral (offcanvas) de solo lectura con el detalle de un contacto, con acceso directo a editarlo. */
export function ContactDetailOffcanvas({ open, contact, onClose, onEdit }: ContactDetailOffcanvasProps) {
  const { mounted, closing } = useModalTransition(open)

  if (!mounted) return null

  return (
    <div className="fixed inset-0 z-50">
      <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${closing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} onClick={onClose} />
      <div className={`absolute inset-y-0 right-0 bg-white dark:bg-slate-900 shadow-xl border-l border-slate-100 dark:border-slate-800 w-full max-w-md flex flex-col ${closing ? 'offcanvas-panel-exit' : 'offcanvas-panel-enter'}`}>
        {/* Header fijo */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">{contact?.name}</h2>
                {contact?.isPrimary && (
                  <span title="Contacto principal">
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
                  </span>
                )}
              </div>
              <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full mt-0.5 ${
                contact?.isActive
                  ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                  : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500'
              }`}>
                {contact?.isActive ? 'Activo' : 'Inactivo'}
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
                <dt className="text-sm text-slate-500">Empresa</dt>
                <dd className="text-sm text-slate-700 dark:text-slate-200 text-right flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  {contact?.companyName || '—'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm text-slate-500">Sucursal</dt>
                <dd className="text-sm text-right">
                  {contact?.branchName ? (
                    <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                      <GitBranch className="w-3.5 h-3.5 text-slate-400" />
                      {contact.branchName}
                    </span>
                  ) : (
                    <span className="text-slate-300 dark:text-slate-600">—</span>
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm text-slate-500">Puesto</dt>
                <dd className="text-sm text-slate-700 dark:text-slate-200 text-right">{contact?.position || '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm text-slate-500">Correo</dt>
                <dd className="text-sm text-right">
                  {contact?.email ? (
                    <a href={`mailto:${contact.email}`}
                      className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      {contact.email}
                    </a>
                  ) : (
                    <span className="text-slate-300 dark:text-slate-600">—</span>
                  )}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-sm text-slate-500 shrink-0">Teléfono(s)</dt>
                <dd className="text-sm text-right">
                  {contact && contact.phones.length > 0 ? (
                    <div className="flex flex-col items-end gap-1">
                      {contact.phones.map((p, i) => (
                        <a key={i} href={`tel:${p}`}
                          className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          {p}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-300 dark:text-slate-600">—</span>
                  )}
                </dd>
              </div>
            </dl>
          </div>

          {contact?.notes && (
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Notas</h3>
              <p className="flex items-start gap-1.5 text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>{contact.notes}</span>
              </p>
            </div>
          )}
        </div>

        {/* Footer fijo */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            Cerrar
          </button>
          <button onClick={onEdit}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
            <Pencil className="w-3.5 h-3.5" />
            Editar
          </button>
        </div>
      </div>
    </div>
  )
}
