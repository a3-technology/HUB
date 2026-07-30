import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, LogIn, AlarmClock, CalendarDays, Clock, KeyRound, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useModalTransition } from '../hooks/useModalTransition'
import { attendanceApi } from '../lib/api'
import { A3HubLogo } from '../components/A3HubLogo'
import loginBg from '../assets/login-bg.jpg'

export function LoginPage() {
  const { login, user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  // Kiosco de marcaje de asistencia: modal público (sin iniciar sesión)
  const [markOpen, setMarkOpen]   = useState(false)
  const [markType, setMarkType]   = useState<'In' | 'Out'>('In')
  const [markCode, setMarkCode]   = useState('')
  const [markError, setMarkError] = useState<string | null>(null)
  const [marking, setMarking]     = useState(false)
  const [clock, setClock]         = useState(new Date())
  const { mounted: markMounted, closing: markClosing } = useModalTransition(markOpen)

  // Reloj en vivo del modal (se actualiza cada segundo mientras está abierto)
  useEffect(() => {
    if (!markOpen) return
    setClock(new Date())
    const timer = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(timer)
  }, [markOpen])

  const openMark = () => {
    setMarkType('In'); setMarkCode(''); setMarkError(null); setMarkOpen(true)
  }

  const handleMark = async () => {
    if (!markCode.trim()) { setMarkError('Ingresa tu código de empleado.'); return }
    setMarking(true); setMarkError(null)
    try {
      const res = await attendanceApi.mark(markCode.trim().toUpperCase(), markType)
      const body = await res.json().catch(() => ({ message: 'Error al registrar el marcaje.' }))
      if (!res.ok) { setMarkError(body.message); return }
      toast.success(body.message)
      setMarkOpen(false)
    } catch {
      setMarkError('No se pudo conectar con el servidor.')
    } finally { setMarking(false) }
  }

  // Si ya está autenticado redirige directo al dashboard
  if (user) { navigate('/dashboard', { replace: true }); return null }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Panel izquierdo — branding */}
      <div
        className="hidden lg:flex lg:w-[42%] bg-slate-900 bg-cover bg-center flex-col justify-between p-12 relative overflow-hidden"
        style={{ backgroundImage: `url(${loginBg})` }}
      >
        {/* Decoración de fondo */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(99,102,241,0.25)_0%,_transparent_60%)]" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-indigo-600/10 rounded-full -translate-x-1/3 translate-y-1/3 blur-3xl" />

        <div className="relative z-10">
          <A3HubLogo className="h-8 w-auto text-white" />
        </div>

        <p className="relative z-10 text-slate-600 text-xs">
          © {new Date().getFullYear()} HUB. Todos los derechos reservados.
        </p>
      </div>

      {/* Panel derecho — formulario */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-white">
        {/* Logo móvil */}
        <div className="mb-10 lg:hidden">
          <A3HubLogo className="h-7 w-auto text-slate-900" />
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900">Iniciar sesión</h2>
            <p className="text-slate-500 text-sm mt-1">Ingresa tus credenciales para continuar</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@empresa.com"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-slate-900 text-sm placeholder:text-slate-400
                           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              />
            </div>

            {/* Contraseña */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 pr-10 rounded-lg border border-slate-200 text-slate-900 text-sm placeholder:text-slate-400
                             focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                  aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            {/* Botón */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700
                         disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium
                         py-2.5 rounded-lg transition"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {loading ? 'Iniciando sesión…' : 'Iniciar sesión'}
            </button>

            {/* Acceso rápido al marcaje de asistencia (sin iniciar sesión) */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={openMark}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:underline transition"
              >
                <AlarmClock className="w-4 h-4" />
                Marcar
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Modal de marcaje de asistencia (kiosco) */}
      {markMounted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${markClosing ? 'modal-overlay-exit' : 'modal-overlay-enter'}`} onClick={() => setMarkOpen(false)} />
          <div className={`relative bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm p-6 ${markClosing ? 'modal-panel-exit' : 'modal-panel-enter'}`}>
            <button
              onClick={() => setMarkOpen(false)}
              title="Cerrar"
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <h2 className="text-lg font-bold text-slate-900 text-center">Marcar asistencia</h2>

            {/* Fecha y reloj en vivo */}
            <div className="flex items-center justify-center gap-4 mt-2 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="w-4 h-4 text-slate-400" />
                {clock.toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </span>
              <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 tabular-nums">
                <Clock className="w-4 h-4 text-slate-400" />
                {clock.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).toUpperCase()}
              </span>
            </div>

            {/* Entrada / Salida */}
            <div className="flex items-center justify-center gap-2 mt-5">
              {([['In', 'Entrada'], ['Out', 'Salida']] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMarkType(value)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    markType === value
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                    markType === value ? 'border-white' : 'border-slate-400'
                  }`}>
                    {markType === value && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                  {label}
                </button>
              ))}
            </div>

            {/* Código de empleado */}
            <div className="mt-5 space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">Código empleado</label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  maxLength={10}
                  autoFocus
                  value={markCode}
                  onChange={e => setMarkCode(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === 'Enter') handleMark() }}
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-slate-200 text-slate-900 text-sm placeholder:text-slate-400 uppercase
                             focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                />
              </div>
            </div>

            {markError && (
              <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                {markError}
              </div>
            )}

            <button
              onClick={handleMark}
              disabled={marking}
              className="mt-5 w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700
                         disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition"
            >
              {marking
                ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <AlarmClock className="w-4 h-4" />}
              {marking ? 'Registrando…' : markType === 'In' ? 'Marcar entrada' : 'Marcar salida'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
