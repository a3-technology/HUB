import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Building2, Camera, Save, Trash2 } from 'lucide-react'
import { companySettingsApi } from '../../lib/api'
import { useToast } from '../../context/ToastContext'
import { usePermission } from '../../hooks/usePermission'
import { PhoneInput } from '../../components/PhoneInput'

interface CompanyForm {
  legalName: string
  tradeName: string
  taxId: string
  taxRegime: string
  address: string
  phone: string
  email: string
  website: string
  showLogoOnDocuments: boolean
}

const EMPTY_FORM: CompanyForm = {
  legalName: '', tradeName: '', taxId: '', taxRegime: '',
  address: '', phone: '', email: '', website: '',
  showLogoOnDocuments: true,
}

const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition disabled:opacity-60'
const labelCls = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5'
const cardCls  = 'bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-6'

export function EmpresaPage() {
  const toast = useToast()
  const canUpdate = usePermission('general.company.update')

  const [form, setForm]           = useState<CompanyForm>(EMPTY_FORM)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)

  const [hasLogo, setHasLogo]           = useState(false)
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null)
  const [uploadingLogo, setUploadingLogo]   = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    setLoading(true)
    try {
      const companyRes = await companySettingsApi.get()
      if (companyRes.ok) {
        const c = await companyRes.json()
        setForm({
          legalName: c.legalName ?? '',
          tradeName: c.tradeName ?? '',
          taxId: c.taxId ?? '',
          taxRegime: c.taxRegime ?? '',
          address: c.address ?? '',
          phone: c.phone ?? '',
          email: c.email ?? '',
          website: c.website ?? '',
          showLogoOnDocuments: c.showLogoOnDocuments ?? true,
        })
        setHasLogo(!!c.hasLogo)
        if (c.hasLogo) {
          const urlRes = await companySettingsApi.logoUrl()
          const { url } = urlRes.ok ? await urlRes.json() : { url: null }
          setLogoPreviewUrl(url ?? null)
        } else {
          setLogoPreviewUrl(null)
        }
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await companySettingsApi.update({
        legalName: form.legalName.trim(),
        tradeName: form.tradeName.trim() || undefined,
        taxId: form.taxId.trim() || undefined,
        taxRegime: form.taxRegime.trim() || undefined,
        address: form.address.trim() || undefined,
        phone: form.phone || undefined,
        email: form.email.trim() || undefined,
        website: form.website.trim() || undefined,
        showLogoOnDocuments: form.showLogoOnDocuments,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al guardar.' }))
        toast.error(err.message)
        return
      }
      toast.success('Configuración de empresa actualizada correctamente.')
    } finally {
      setSaving(false)
    }
  }

  const handleLogoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingLogo(true)
    try {
      const res = await companySettingsApi.uploadLogo(file)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'No se pudo subir el logotipo.' }))
        toast.error(err.message)
        return
      }
      setHasLogo(true)
      const urlRes = await companySettingsApi.logoUrl()
      const { url } = urlRes.ok ? await urlRes.json() : { url: null }
      setLogoPreviewUrl(url ?? null)
      toast.success('Logotipo actualizado correctamente.')
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleRemoveLogo = async () => {
    setUploadingLogo(true)
    try {
      const res = await companySettingsApi.deleteLogo()
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar el logotipo.' }))
        toast.error(err.message)
        return
      }
      setHasLogo(false)
      setLogoPreviewUrl(null)
      toast.success('Logotipo eliminado correctamente.')
    } finally {
      setUploadingLogo(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Empresa</h1>
        <p className="text-sm text-slate-500 mt-0.5">Datos de la empresa que usa el sistema — aparecen en el encabezado de los documentos generados.</p>
      </div>

      {loading ? (
        <div className={cardCls}>
          <div className="h-40 flex items-center justify-center text-sm text-slate-400">Cargando…</div>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Datos fiscales + logo */}
          <div className={cardCls}>
            <div className="flex flex-col sm:flex-row gap-6">
              <div className="shrink-0 flex flex-col items-center sm:items-start">
                <label className={labelCls}>Logotipo</label>
                <div className="relative w-32 h-32 sm:h-auto sm:flex-1">
                  <button
                    type="button"
                    onClick={() => canUpdate && logoInputRef.current?.click()}
                    title={canUpdate ? 'Cambiar logotipo' : undefined}
                    disabled={!canUpdate || uploadingLogo}
                    className="group relative block w-full h-full rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:ring-offset-2 dark:focus:ring-offset-slate-900 disabled:cursor-not-allowed"
                  >
                    {logoPreviewUrl ? (
                      <img src={logoPreviewUrl} alt="Logotipo de la empresa" className="w-full h-full object-contain" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300 dark:text-slate-600">
                        <Building2 className="w-9 h-9" />
                      </div>
                    )}
                    {canUpdate && (
                      <span className="absolute inset-0 bg-slate-900/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Camera className="w-5 h-5 text-white" />
                      </span>
                    )}
                  </button>
                  {canUpdate && hasLogo && (
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      disabled={uploadingLogo}
                      title="Eliminar logotipo"
                      className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleLogoSelected}
                  />
                </div>
              </div>

              <div className="flex-1 grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Razón social <span className="text-red-500">*</span></label>
                  <input
                    className={inputCls} required maxLength={200} disabled={!canUpdate}
                    value={form.legalName}
                    onChange={e => setForm(f => ({ ...f, legalName: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={labelCls}>Nombre comercial</label>
                  <input
                    className={inputCls} maxLength={200} disabled={!canUpdate}
                    value={form.tradeName}
                    onChange={e => setForm(f => ({ ...f, tradeName: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={labelCls}>Cédula jurídica / RUC</label>
                  <input
                    className={inputCls} maxLength={50} disabled={!canUpdate}
                    value={form.taxId}
                    onChange={e => setForm(f => ({ ...f, taxId: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={labelCls}>Régimen tributario</label>
                  <input
                    className={inputCls} maxLength={100} disabled={!canUpdate}
                    value={form.taxRegime}
                    onChange={e => setForm(f => ({ ...f, taxRegime: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Contacto y ubicación */}
          <div className={cardCls + ' space-y-4'}>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Contacto y ubicación</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Teléfono</label>
                <PhoneInput value={form.phone} onChange={phone => setForm(f => ({ ...f, phone }))} disabled={!canUpdate} />
              </div>
              <div>
                <label className={labelCls}>Correo</label>
                <input
                  type="email" className={inputCls} maxLength={150} disabled={!canUpdate}
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div>
                <label className={labelCls}>Sitio web</label>
                <input
                  className={inputCls} maxLength={200} disabled={!canUpdate}
                  value={form.website}
                  onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Dirección</label>
              <textarea
                className={inputCls + ' resize-none'} rows={2} maxLength={300} disabled={!canUpdate}
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              />
            </div>
          </div>

          {/* Documentos generados */}
          <div className={cardCls + ' space-y-3'}>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Documentos generados</h2>
            <label className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                disabled={!canUpdate}
                checked={form.showLogoOnDocuments}
                onChange={e => setForm(f => ({ ...f, showLogoOnDocuments: e.target.checked }))}
              />
              <span>
                Mostrar el logotipo en los documentos generados
                <span className="block text-xs text-slate-400 mt-0.5">
                  Si se desactiva, el encabezado de fichas y reportes solo muestra la razón social y la cédula jurídica, sin el logotipo.
                </span>
              </span>
            </label>
          </div>

          {canUpdate && (
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {saving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Save className="w-3.5 h-3.5" />}
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  )
}
