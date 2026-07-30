import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Briefcase, Camera, Eye, EyeOff, KeyRound, Mail, Save, Shield, ShieldCheck, Trash2, UserRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { authApi, employeeSelfApi, userSelfApi } from '../lib/api'
import { PhoneInput } from '../components/PhoneInput'
import { PhotoCropModal } from '../components/PhotoCropModal'
import { TabsScroller } from '../components/TabsScroller'
import { ConfirmDialog } from '../components/ConfirmDialog'

interface SelfEmployee {
  code: string
  positionName: string
  departmentName: string
  phone?: string
  address?: string
}

const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition disabled:opacity-60'
const labelCls = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5'
const cardCls  = 'bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-6'

/**
 * Página de autoservicio "Mi perfil": accesible a cualquier usuario
 * autenticado, sin depender del módulo al que pertenezca. Combina datos de
 * cuenta (de solo lectura, vienen del JWT), datos de contacto del empleado
 * vinculado (editables vía /api/employees/me) y cambio de contraseña.
 */
export function ProfilePage() {
  const { user, updateUser, logout } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [names, setNames] = useState('')
  const [email, setEmail] = useState('')

  const [employee, setEmployee] = useState<SelfEmployee | null>(null)
  const [loadingEmployee, setLoadingEmployee] = useState(true)

  const [phone, setPhone]     = useState('')
  const [address, setAddress] = useState('')
  const [savingContact, setSavingContact] = useState(false)
  const [confirmEmailOpen, setConfirmEmailOpen] = useState(false)

  const photoInputRef = useRef<HTMLInputElement>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword]         = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew]         = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  const [tab, setTab] = useState<'contacto' | 'seguridad'>('contacto')

  useEffect(() => {
    setNames(user?.names ?? '')
    setEmail(user?.email ?? '')
  }, [user?.names, user?.email])

  useEffect(() => {
    if (!user?.employeeId) { setLoadingEmployee(false); return }
    employeeSelfApi.get().then(async res => {
      if (res.ok) {
        const data: SelfEmployee = await res.json()
        setEmployee(data)
        setPhone(data.phone ?? '')
        setAddress(data.address ?? '')
      }
      setLoadingEmployee(false)
    })
  }, [user?.employeeId])

  const initials = user?.names
    ?.split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase() ?? '?'

  const emailChanged = email.trim().toLowerCase() !== (user?.email ?? '').toLowerCase()

  const handleSaveContact = (e: FormEvent) => {
    e.preventDefault()
    if (emailChanged) { setConfirmEmailOpen(true); return }
    saveContact(false)
  }

  const saveContact = async (emailWillChange: boolean) => {
    setConfirmEmailOpen(false)
    setSavingContact(true)
    try {
      const profileRes = await authApi.updateProfile(names.trim(), email.trim())
      if (!profileRes.ok) {
        const err = await profileRes.json().catch(() => ({ message: 'Error al guardar los cambios.' }))
        toast.error(err.message)
        return
      }
      updateUser({ names: names.trim(), email: email.trim().toLowerCase() })

      if (user?.employeeId) {
        const contactRes = await employeeSelfApi.update({ phone: phone || null, address: address || null })
        if (!contactRes.ok) {
          const err = await contactRes.json().catch(() => ({ message: 'Error al guardar los cambios.' }))
          toast.error(err.message)
          return
        }
        setEmployee(prev => prev ? { ...prev, phone: phone || undefined, address: address || undefined } : prev)
      }

      if (emailWillChange) {
        toast.success('Correo de acceso actualizado. Debes iniciar sesión de nuevo con el nuevo correo.')
        await logout()
        navigate('/login', { replace: true })
        return
      }

      toast.success('Datos de contacto actualizados correctamente.')
    } finally {
      setSavingContact(false)
    }
  }

  const handlePhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setCropSrc(URL.createObjectURL(file))
  }

  const handleCropCancel = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
  }

  const handlePhotoCropped = async (file: File) => {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
    setUploadingPhoto(true)
    try {
      const res = await userSelfApi.uploadPhoto(file)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'No se pudo subir la foto.' }))
        toast.error(err.message)
        return
      }
      const urlRes = await userSelfApi.photoUrl()
      const { url } = urlRes.ok ? await urlRes.json() : { url: undefined }
      updateUser({ photoUrl: url ?? undefined })
      toast.success('Foto actualizada correctamente.')
    } finally {
      setUploadingPhoto(false)
    }
  }

  const handleRemovePhoto = async () => {
    setUploadingPhoto(true)
    try {
      const res = await userSelfApi.deletePhoto()
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'No se pudo eliminar la foto.' }))
        toast.error(err.message)
        return
      }
      updateUser({ photoUrl: undefined })
      toast.success('Foto eliminada correctamente.')
    } finally {
      setUploadingPhoto(false)
    }
  }

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault()
    if (newPassword === currentPassword) {
      toast.error('La nueva contraseña debe ser diferente a la actual.')
      return
    }
    setSavingPassword(true)
    try {
      const res = await authApi.changePassword(currentPassword, newPassword, newPassword)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Error al cambiar la contraseña.' }))
        toast.error(err.message)
        return
      }
      toast.success('Contraseña actualizada. Debes iniciar sesión de nuevo.')
      setCurrentPassword('')
      setNewPassword('')
      await logout()
      navigate('/login', { replace: true })
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Mi perfil</h1>
        <p className="text-sm text-slate-500 mt-0.5">Administra tus datos de cuenta y contraseña.</p>
      </div>

      {/* Encabezado: avatar + datos de cuenta (solo lectura, vienen del JWT) */}
      <div className={cardCls}>
        <div className="flex items-center gap-5">
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              title="Cambiar foto"
              disabled={uploadingPhoto}
              className="group relative block rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
            >
              {user?.photoUrl ? (
                <img
                  src={user.photoUrl}
                  alt={user?.names}
                  className="w-20 h-20 rounded-full object-cover ring-2 ring-slate-100 dark:ring-slate-700"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xl font-bold">
                  {initials}
                </div>
              )}
              <span className="absolute inset-0 rounded-full bg-slate-900/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera className="w-5 h-5 text-white" />
              </span>
            </button>
            {user?.photoUrl && (
              <button
                type="button"
                onClick={handleRemovePhoto}
                disabled={uploadingPhoto}
                title="Eliminar foto"
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handlePhotoSelected}
            />
          </div>

          <div className="min-w-0">
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">{user?.names}</p>
            <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-0.5">
              <Mail className="w-3.5 h-3.5 shrink-0" />
              {user?.email}
            </p>
            <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-medium">
              <Shield className="w-3 h-3" />
              {user?.roleName}
            </span>
            {employee && (
              <span className="inline-flex items-center gap-1 mt-2 ml-2 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium">
                <Briefcase className="w-3 h-3" />
                {employee.positionName} · {employee.departmentName}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs: datos de contacto / seguridad */}
      <TabsScroller>
        <button
          type="button"
          onClick={() => setTab('contacto')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
            tab === 'contacto'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <UserRound className="w-4 h-4" />
          Datos de contacto
        </button>
        <button
          type="button"
          onClick={() => setTab('seguridad')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
            tab === 'seguridad'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Seguridad
        </button>
      </TabsScroller>

      {/* Datos de contacto: nombre/correo de acceso + teléfono/dirección del empleado vinculado */}
      {tab === 'contacto' && !loadingEmployee && (
        <form onSubmit={handleSaveContact} className={cardCls + ' space-y-4'}>
          {user?.employeeId && employee ? (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Código de empleado</label>
                  <input className={inputCls} value={employee.code} disabled />
                </div>
                <div>
                  <label className={labelCls}>Nombre completo</label>
                  <input
                    className={inputCls}
                    required
                    maxLength={150}
                    value={names}
                    onChange={e => setNames(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls}>Correo de acceso</label>
                  <input
                    type="email"
                    className={inputCls}
                    required
                    maxLength={150}
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls}>Teléfono</label>
                  <PhoneInput value={phone} onChange={setPhone} />
                </div>
              </div>

              <div>
                <label className={labelCls}>Dirección</label>
                <textarea
                  className={inputCls + ' resize-none'}
                  rows={2}
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="Dirección domiciliar"
                />
              </div>
            </>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Nombre completo</label>
                  <input
                    className={inputCls}
                    required
                    maxLength={150}
                    value={names}
                    onChange={e => setNames(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls}>Correo de acceso</label>
                  <input
                    type="email"
                    className={inputCls}
                    required
                    maxLength={150}
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-sm text-slate-500">
                Tu usuario no está vinculado a un empleado; contacta a un administrador si necesitas registrar tu teléfono y dirección.
              </p>
            </>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingContact}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {savingContact
                ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <Save className="w-3.5 h-3.5" />}
              Guardar cambios
            </button>
          </div>
        </form>
      )}

      {/* Cambio de contraseña */}
      {tab === 'seguridad' && (
        <form onSubmit={handleChangePassword} className={cardCls + ' space-y-4'}>
          <div>
            <label className={labelCls}>Contraseña actual</label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                className={inputCls + ' pr-10'}
              />
              <button
                type="button"
                onClick={() => setShowCurrent(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                aria-label={showCurrent ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className={labelCls}>Nueva contraseña</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={6}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className={inputCls + ' pr-10'}
              />
              <button
                type="button"
                onClick={() => setShowNew(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                aria-label={showNew ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingPassword}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {savingPassword
                ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <KeyRound className="w-3.5 h-3.5" />}
              Cambiar contraseña
            </button>
          </div>
        </form>
      )}

      <PhotoCropModal
        open={!!cropSrc}
        imageSrc={cropSrc ?? ''}
        onCancel={handleCropCancel}
        onCropped={handlePhotoCropped}
      />

      <ConfirmDialog
        open={confirmEmailOpen}
        title="¿Cambiar correo de acceso?"
        message="Se cerrará tu sesión y deberás iniciar sesión de nuevo con el nuevo correo."
        confirmLabel="Sí, continuar"
        cancelLabel="Cancelar"
        onConfirm={() => saveContact(true)}
        onCancel={() => setConfirmEmailOpen(false)}
      />
    </div>
  )
}
