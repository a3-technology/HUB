import { useEffect, useState } from 'react'
import { Plus, X, Pencil, ToggleLeft, ToggleRight, Trash2, Save, Waypoints, Phone, MapPin, Building2, Users, Mail, User } from 'lucide-react'
import { branchesApi, contactsApi } from '../lib/api'
import { ConfirmDialog } from './ConfirmDialog'
import { PhoneInput } from './PhoneInput'
import { PhonesListInput } from './PhonesListInput'
import { TabsScroller } from './TabsScroller'
import { useToast } from '../context/ToastContext'
import { useModalTransition } from '../hooks/useModalTransition'
import { usePermission } from '../hooks/usePermission'

interface Branch {
  id: string
  companyId: string
  name: string
  taxId?: string
  address?: string
  phone?: string
  email?: string
  isMain: boolean
  isActive: boolean
}

interface BranchForm {
  name: string
  taxId: string
  address: string
  phone: string
  email: string
  isMain: boolean
}

const EMPTY_FORM: BranchForm = { name: '', taxId: '', address: '', phone: '', email: '', isMain: false }

interface BranchContact {
  id: string
  name: string
  position?: string
  email?: string
  phones: string[]
  isPrimary: boolean
  isActive: boolean
}

interface ContactDraft {
  name: string
  position: string
  email: string
  phones: string[]
}

const EMPTY_CONTACT_DRAFT: ContactDraft = { name: '', position: '', email: '', phones: [] }

interface CompanyBranchesModalProps {
  open: boolean
  company: { id: string; name: string } | null
  onClose: () => void
  /** Se dispara tras crear o eliminar una sucursal (el conteo de la tabla de Empresas cambia). */
  onChanged?: () => void
}

/** Modal de sucursales de una empresa: lista con CRUD completo, abierto desde la celda "Sucursales" de EmpresasPage. */
export function CompanyBranchesModal({ open, company, onClose, onChanged }: CompanyBranchesModalProps) {
  const toast = useToast()
  const canCreate = usePermission('crm.branches.create')
  const canUpdate = usePermission('crm.branches.update')
  const canToggle = usePermission('crm.branches.toggle')
  const canDelete = usePermission('crm.branches.delete')
  const { mounted, closing } = useModalTransition(open)

  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading]   = useState(true)
  const [view, setView]         = useState<'list' | 'form'>('list')
  const [editing, setEditing]   = useState<Branch | null>(null)
  const [form, setForm]         = useState<BranchForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving]       = useState(false)
  const [toggleTarget, setToggleTarget] = useState<Branch | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null)

  const [formTab, setFormTab] = useState<'general' | 'contactos'>('general')
  const [branchContacts, setBranchContacts] = useState<BranchContact[]>([])
  const [pendingContacts, setPendingContacts] = useState<(ContactDraft & { tempId: string })[]>([])
  const [contactDraft, setContactDraft]       = useState<ContactDraft>(EMPTY_CONTACT_DRAFT)
  const [contactDraftError, setContactDraftError] = useState<string | null>(null)
  const [savingContact, setSavingContact]     = useState(false)
  const [contactDeleteTarget, setContactDeleteTarget] = useState<BranchContact | null>(null)

  const load = async () => {
    if (!company) return
    setLoading(true)
    try {
      const res = await branchesApi.list({ companyId: company.id })
      if (res.ok) setBranches(await res.json())
    } finally { setLoading(false) }
  }

  useEffect(() => {
    if (open && company) { setView('list'); load() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, company?.id])

  const loadBranchContacts = async (branchId: string) => {
    const res = await contactsApi.list({ branchId })
    setBranchContacts(res.ok ? await res.json() : [])
  }

  const openCreate = () => {
    setEditing(null); setForm(EMPTY_FORM); setFormError(null)
    setFormTab('general'); setBranchContacts([]); setPendingContacts([]); setContactDraft(EMPTY_CONTACT_DRAFT); setContactDraftError(null)
    setView('form')
  }
  const openEdit   = (b: Branch) => {
    setEditing(b)
    setForm({ name: b.name, taxId: b.taxId ?? '', address: b.address ?? '', phone: b.phone ?? '', email: b.email ?? '', isMain: b.isMain })
    setFormError(null)
    setFormTab('general'); setBranchContacts([]); setPendingContacts([]); setContactDraft(EMPTY_CONTACT_DRAFT); setContactDraftError(null)
    loadBranchContacts(b.id)
    setView('form')
  }
  const backToList = () => { setView('list'); setEditing(null); setFormError(null) }

  const handleAddContact = async () => {
    if (!contactDraft.name.trim()) { setContactDraftError('El nombre es requerido.'); return }
    setContactDraftError(null)

    if (editing && company) {
      setSavingContact(true)
      try {
        const res = await contactsApi.create({
          companyId: company.id,
          branchId: editing.id,
          name: contactDraft.name.trim(),
          position: contactDraft.position.trim() || undefined,
          email: contactDraft.email.trim() || undefined,
          phones: contactDraft.phones.filter(p => p.trim()),
          isPrimary: false,
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: 'Error al agregar el contacto.' }))
          toast.error(err.message); return
        }
        toast.success('Contacto agregado.')
        setContactDraft(EMPTY_CONTACT_DRAFT)
        await loadBranchContacts(editing.id)
      } finally { setSavingContact(false) }
    } else {
      setPendingContacts(list => [...list, { ...contactDraft, tempId: crypto.randomUUID() }])
      setContactDraft(EMPTY_CONTACT_DRAFT)
    }
  }

  const removePendingContact = (tempId: string) => setPendingContacts(list => list.filter(c => c.tempId !== tempId))

  const handleDeleteContact = async () => {
    if (!contactDeleteTarget) return
    try {
      const res = await contactsApi.remove(contactDeleteTarget.id)
      if (res.ok) { toast.success('Contacto eliminado correctamente.'); if (editing) await loadBranchContacts(editing.id) }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar el contacto.' }))
        toast.error(err.message)
      }
    } finally { setContactDeleteTarget(null) }
  }

  const handleSave = async () => {
    if (!company) return
    if (!form.name.trim()) { setFormError('El nombre es requerido.'); return }
    setSaving(true); setFormError(null)
    try {
      const payload = {
        companyId: company.id,
        name: form.name.trim(),
        taxId: form.taxId.trim() || undefined,
        address: form.address.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        isMain: form.isMain,
      }
      const res = editing
        ? await branchesApi.update(editing.id, payload)
        : await branchesApi.create(payload)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar.' }))
        setFormError(err.message); toast.error(err.message); return
      }

      // Contactos en cola (solo en creación): se guardan con el Id de la nueva sucursal
      if (!editing && pendingContacts.length > 0) {
        const result = await res.json().catch(() => null)
        const branchId = result?.id
        if (branchId) {
          for (const pc of pendingContacts) {
            const cRes = await contactsApi.create({
              companyId: company.id,
              branchId,
              name: pc.name.trim(),
              position: pc.position.trim() || undefined,
              email: pc.email.trim() || undefined,
              phones: pc.phones.filter(p => p.trim()),
              isPrimary: false,
            })
            if (!cRes.ok) {
              const err = await cRes.json().catch(() => ({ message: 'Error al guardar.' }))
              toast.error(`No se pudo guardar el contacto "${pc.name}": ${err.message}`)
            }
          }
        }
      }

      toast.success(editing ? 'Sucursal actualizada correctamente.' : 'Sucursal creada correctamente.')
      backToList(); await load(); onChanged?.()
    } finally { setSaving(false) }
  }

  const handleToggle = async () => {
    if (!toggleTarget) return
    const wasActive = toggleTarget.isActive
    try {
      const res = await branchesApi.toggle(toggleTarget.id)
      if (res.ok) { toast.success(wasActive ? 'Sucursal desactivada.' : 'Sucursal activada.'); await load() }
      else toast.error('No se pudo cambiar el estado de la sucursal.')
    } finally { setToggleTarget(null) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await branchesApi.remove(deleteTarget.id)
      if (res.ok) { toast.success('Sucursal eliminada correctamente.'); await load(); onChanged?.() }
      else {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar la sucursal.' }))
        toast.error(err.message)
      }
    } finally { setDeleteTarget(null) }
  }

  if (!mounted) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${closing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} />
      <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden ${closing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Sucursales — {company?.name}
          </h2>
          <button onClick={onClose} title="Cerrar"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pt-4 pb-5 [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] dark:[scrollbar-color:var(--color-slate-600)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
          {view === 'list' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-slate-500">{loading ? '…' : `${branches.length} sucursal(es)`}</p>
                {canCreate && (
                  <button onClick={openCreate}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
                    <Plus className="w-4 h-4" />
                    Nueva sucursal
                  </button>
                )}
              </div>

              {loading ? (
                <div className="h-16 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
              ) : branches.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <Waypoints className="w-8 h-8 text-slate-200 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">Sin sucursales registradas.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {branches.map(b => (
                    <div key={b.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                          <Waypoints className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">{b.name}</p>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              b.isActive
                                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                                : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500'
                            }`}>
                              {b.isActive ? 'Activa' : 'Inactiva'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          {canUpdate && (
                            <button onClick={() => openEdit(b)} title="Editar"
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canToggle && (
                            <button onClick={() => setToggleTarget(b)} title={b.isActive ? 'Desactivar' : 'Activar'}
                              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                                b.isActive
                                  ? 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
                                  : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                              }`}>
                              {b.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => setDeleteTarget(b)} title="Eliminar"
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      {(b.phone || b.address) && (
                        <div className="flex items-center gap-4 mt-2 ml-12 text-xs text-slate-400">
                          {b.phone && (
                            <span className="flex items-center gap-1 shrink-0"><Phone className="w-3 h-3" />{b.phone}</span>
                          )}
                          {b.address && (
                            <span className="flex items-center gap-1 min-w-0 truncate"><MapPin className="w-3 h-3 shrink-0" />{b.address}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <TabsScroller tone="modal" className="mb-4">
                <button type="button" onClick={() => setFormTab('general')}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                    formTab === 'general'
                      ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  Datos generales
                </button>
                <button type="button" onClick={() => setFormTab('contactos')}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                    formTab === 'contactos'
                      ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  Contactos
                  {(editing ? branchContacts.length : pendingContacts.length) > 0 && (
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                      formTab === 'contactos'
                        ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400'
                        : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                    }`}>
                      {editing ? branchContacts.length : pendingContacts.length}
                    </span>
                  )}
                </button>
              </TabsScroller>

              {formTab === 'general' && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre <span className="text-red-500">*</span></label>
                    <input type="text" maxLength={150} placeholder="Ej: Sucursal Central" value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">N° Identificación</label>
                    <input type="text" maxLength={50} placeholder="Ej: 3-101-123456" value={form.taxId}
                      onChange={e => setForm(f => ({ ...f, taxId: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
                    <input type="email" maxLength={200} placeholder="sucursal@empresa.com" value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Teléfono</label>
                    <PhoneInput value={form.phone} onChange={phone => setForm(f => ({ ...f, phone }))} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Dirección</label>
                  <input type="text" maxLength={300} placeholder="Dirección de la sucursal" value={form.address}
                    onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input type="checkbox" checked={form.isMain}
                    onChange={e => setForm(f => ({ ...f, isMain: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Sucursal principal de la empresa</span>
                </label>

                {formError && (
                  <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                    {formError}
                  </div>
                )}
              </div>
              )}

              {formTab === 'contactos' && (
              <div className="space-y-4">
                {!editing && (
                  <p className="text-xs text-slate-400">Los contactos se guardarán automáticamente al crear la sucursal.</p>
                )}

                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre <span className="text-red-500">*</span></label>
                      <input type="text" maxLength={200} placeholder="Nombre del contacto" value={contactDraft.name}
                        onChange={e => setContactDraft(d => ({ ...d, name: e.target.value }))}
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Puesto</label>
                      <input type="text" maxLength={100} placeholder="Ej: Encargado de sucursal" value={contactDraft.position}
                        onChange={e => setContactDraft(d => ({ ...d, position: e.target.value }))}
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Correo electrónico</label>
                      <input type="email" maxLength={200} placeholder="contacto@empresa.com" value={contactDraft.email}
                        onChange={e => setContactDraft(d => ({ ...d, email: e.target.value }))}
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Teléfonos</label>
                      <PhonesListInput value={contactDraft.phones} onChange={phones => setContactDraft(d => ({ ...d, phones }))} />
                    </div>
                  </div>

                  {contactDraftError && (
                    <p className="text-xs text-red-500">{contactDraftError}</p>
                  )}

                  <div className="flex justify-end">
                    <button type="button" onClick={handleAddContact} disabled={savingContact}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                      {savingContact
                        ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        : <Plus className="w-3.5 h-3.5" />}
                      Agregar contacto
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700/60 overflow-hidden">
                  {editing ? (
                    branchContacts.length === 0 ? (
                      <div className="px-4 py-10 text-center">
                        <Users className="w-8 h-8 text-slate-200 dark:text-slate-600 mx-auto mb-2" />
                        <p className="text-sm text-slate-400">Aún no hay contactos agregados.</p>
                      </div>
                    ) : (
                      branchContacts.map(c => (
                        <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="flex items-center gap-1 min-w-0 text-sm font-medium text-slate-700 dark:text-slate-200">
                                <User className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="truncate">{c.name}</span>
                              </span>
                              {c.position && (
                                <span className="min-w-0 truncate text-xs text-slate-400">· {c.position}</span>
                              )}
                            </div>
                            {c.email || c.phones.length > 0 ? (
                              <div className="flex items-center gap-3 text-xs text-slate-400">
                                {c.email && (
                                  <a href={`mailto:${c.email}`} onClick={e => e.stopPropagation()}
                                    className="flex items-center gap-1 min-w-0 truncate hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                                    <Mail className="w-3 h-3 shrink-0" />
                                    {c.email}
                                  </a>
                                )}
                                {c.phones.length > 0 && (
                                  <span className="flex items-center gap-1 min-w-0 truncate">
                                    <Phone className="w-3 h-3 shrink-0" />
                                    {c.phones.map((p, i) => (
                                      <span key={i}>
                                        <a href={`tel:${p}`} onClick={e => e.stopPropagation()}
                                          className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                                          {p}
                                        </a>
                                        {i < c.phones.length - 1 && ', '}
                                      </span>
                                    ))}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-400">Sin datos de contacto</p>
                            )}
                          </div>
                          <button type="button" onClick={() => setContactDeleteTarget(c)} title="Eliminar contacto"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors shrink-0">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )
                  ) : (
                    pendingContacts.length === 0 ? (
                      <div className="px-4 py-10 text-center">
                        <Users className="w-8 h-8 text-slate-200 dark:text-slate-600 mx-auto mb-2" />
                        <p className="text-sm text-slate-400">Aún no hay contactos agregados.</p>
                      </div>
                    ) : (
                      pendingContacts.map(c => (
                        <div key={c.tempId} className="flex items-center gap-3 px-4 py-2.5">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="flex items-center gap-1 min-w-0 text-sm font-medium text-slate-700 dark:text-slate-200">
                                <User className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="truncate">{c.name}</span>
                              </span>
                              {c.position && (
                                <span className="min-w-0 truncate text-xs text-slate-400">· {c.position}</span>
                              )}
                            </div>
                            {(() => {
                              const phones = c.phones.filter(p => p.trim())
                              return c.email || phones.length > 0 ? (
                                <div className="flex items-center gap-3 text-xs text-slate-400">
                                  {c.email && (
                                    <a href={`mailto:${c.email}`} onClick={e => e.stopPropagation()}
                                      className="flex items-center gap-1 min-w-0 truncate hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                                      <Mail className="w-3 h-3 shrink-0" />
                                      {c.email}
                                    </a>
                                  )}
                                  {phones.length > 0 && (
                                    <span className="flex items-center gap-1 min-w-0 truncate">
                                      <Phone className="w-3 h-3 shrink-0" />
                                      {phones.map((p, i) => (
                                        <span key={i}>
                                          <a href={`tel:${p}`} onClick={e => e.stopPropagation()}
                                            className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                                            {p}
                                          </a>
                                          {i < phones.length - 1 && ', '}
                                        </span>
                                      ))}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <p className="text-xs text-slate-400">Sin datos de contacto</p>
                              )
                            })()}
                          </div>
                          <button type="button" onClick={() => removePendingContact(c.tempId)} title="Quitar de la lista"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors shrink-0">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )
                  )}
                </div>
              </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
          {view === 'form' ? (
            <>
              <button onClick={backToList} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                {saving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Save className="w-3.5 h-3.5" />}
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </>
          ) : (
            <button onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
              Cerrar
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!toggleTarget}
        title={toggleTarget?.isActive ? '¿Desactivar sucursal?' : '¿Activar sucursal?'}
        message={
          toggleTarget?.isActive
            ? `La sucursal "${toggleTarget.name}" será desactivada.`
            : `La sucursal "${toggleTarget?.name}" volverá a estar disponible.`
        }
        confirmLabel={toggleTarget?.isActive ? 'Sí, desactivar' : 'Sí, activar'}
        cancelLabel="Cancelar"
        onConfirm={handleToggle}
        onCancel={() => setToggleTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar sucursal?"
        message={`La sucursal "${deleteTarget?.name}" se eliminará permanentemente. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={!!contactDeleteTarget}
        title="¿Eliminar contacto?"
        message={`El contacto "${contactDeleteTarget?.name}" se eliminará permanentemente. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDeleteContact}
        onCancel={() => setContactDeleteTarget(null)}
      />
    </div>
  )
}
