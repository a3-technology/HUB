import { useEffect, useState } from 'react'
import { X, Pencil, Mail, Phone, MapPin, GitBranch, Building2, Users, Star, User, ChevronDown } from 'lucide-react'
import { contactsApi } from '../lib/api'
import { useModalTransition } from '../hooks/useModalTransition'

interface BranchContact {
  id: string
  name: string
  position?: string
  email?: string
  phones: string[]
  isPrimary: boolean
}

interface BranchDetail {
  id: string
  name: string
  companyName: string
  taxId?: string
  email?: string
  phone?: string
  address?: string
  isMain: boolean
  isActive: boolean
}

interface BranchDetailOffcanvasProps {
  open: boolean
  branch: BranchDetail | null
  onClose: () => void
  onEdit: () => void
}

/** Panel lateral (offcanvas) de solo lectura con el detalle de una sucursal, con acceso directo a editarla. */
export function BranchDetailOffcanvas({ open, branch, onClose, onEdit }: BranchDetailOffcanvasProps) {
  const { mounted, closing } = useModalTransition(open)
  const [contacts, setContacts] = useState<BranchContact[]>([])
  const [contactsLoading, setContactsLoading] = useState(true)
  const [contactsOpen, setContactsOpen] = useState(false)

  useEffect(() => {
    if (!open || !branch) return
    setContactsLoading(true)
    contactsApi.list({ branchId: branch.id })
      .then(async res => setContacts(res.ok ? await res.json() : []))
      .finally(() => setContactsLoading(false))
  }, [open, branch?.id])

  useEffect(() => { if (open) setContactsOpen(false) }, [open, branch?.id])

  if (!mounted) return null

  return (
    <div className="fixed inset-0 z-50">
      <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${closing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} onClick={onClose} />
      <div className={`absolute inset-y-0 right-0 bg-white dark:bg-slate-900 shadow-xl border-l border-slate-100 dark:border-slate-800 w-full max-w-md flex flex-col ${closing ? 'offcanvas-panel-exit' : 'offcanvas-panel-enter'}`}>
        {/* Header fijo */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <GitBranch className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">{branch?.name}</h2>
                {branch?.isMain && (
                  <span title="Sucursal principal">
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
                  </span>
                )}
              </div>
              <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full mt-0.5 ${
                branch?.isActive
                  ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                  : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500'
              }`}>
                {branch?.isActive ? 'Activa' : 'Inactiva'}
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
                  {branch?.companyName || '—'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm text-slate-500">N° Identificación</dt>
                <dd className="text-sm text-slate-700 dark:text-slate-200 text-right">{branch?.taxId || '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm text-slate-500">Correo</dt>
                <dd className="text-sm text-right">
                  {branch?.email ? (
                    <a href={`mailto:${branch.email}`}
                      className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      {branch.email}
                    </a>
                  ) : (
                    <span className="text-slate-300 dark:text-slate-600">—</span>
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm text-slate-500">Teléfono</dt>
                <dd className="text-sm text-right">
                  {branch?.phone ? (
                    <a href={`tel:${branch.phone}`}
                      className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      {branch.phone}
                    </a>
                  ) : (
                    <span className="text-slate-300 dark:text-slate-600">—</span>
                  )}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-sm text-slate-500 shrink-0">Dirección</dt>
                <dd className="text-sm text-slate-700 dark:text-slate-200 text-right flex items-start gap-1.5 justify-end">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span>{branch?.address || '—'}</span>
                </dd>
              </div>
            </dl>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <button type="button" onClick={() => setContactsOpen(o => !o)}
              className="flex items-center justify-between w-full text-left cursor-pointer">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Contactos{!contactsLoading && contacts.length > 0 ? ` (${contacts.length})` : ''}
              </h3>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${contactsOpen ? 'rotate-180' : ''}`} />
            </button>
            {contactsOpen && (contactsLoading ? (
                <div className="h-8 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse mt-4" />
              ) : contacts.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-slate-300 dark:text-slate-600 mt-4">
                  <Users className="w-3.5 h-3.5 shrink-0" />Sin contactos registrados
                </p>
              ) : (
                <div className="space-y-2 mt-4">
                {contacts.map(ct => (
                  <div key={ct.id} className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="flex items-center gap-1 min-w-0 text-sm font-medium text-slate-700 dark:text-slate-200">
                        <User className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{ct.name}</span>
                      </span>
                      {ct.position && (
                        <span className="min-w-0 truncate text-xs text-slate-400">· {ct.position}</span>
                      )}
                      {ct.isPrimary && (
                        <span title="Contacto principal">
                          <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                        </span>
                      )}
                    </div>
                    {(ct.email || ct.phones.length > 0) && (
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                        {ct.email && (
                          <a href={`mailto:${ct.email}`}
                            className="flex items-center gap-1 min-w-0 truncate hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                            <Mail className="w-3 h-3 shrink-0" />
                            {ct.email}
                          </a>
                        )}
                        {ct.phones.length > 0 && (
                          <span className="flex items-center gap-1 min-w-0 truncate">
                            <Phone className="w-3 h-3 shrink-0" />
                            {ct.phones.map((p, i) => (
                              <span key={i}>
                                <a href={`tel:${p}`} className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">{p}</a>
                                {i < ct.phones.length - 1 && ', '}
                              </span>
                            ))}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                </div>
              ))}
          </div>
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
