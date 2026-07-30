import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Handshake, FolderKanban, ShoppingBag, LifeBuoy, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { employeesApi, opportunitiesApi, ticketsApi, projectsApi, salesOrdersApi, usersApi } from '../lib/api'

/** Módulo real del sistema, mostrado como widget si el usuario lo tiene asignado. */
interface HubModule {
  key: string
  label: string
  icon: React.ElementType
  to: string
  /** Etiqueta del número clave que muestra el widget (ej. "Empleados activos"). */
  metricLabel: string
  /** Consulta que produce ese número; se resuelve en paralelo al cargar. */
  loadMetric: () => Promise<number>
}

/** Acento único (indigo, el color primario del sistema) para todos los widgets. */
const ACCENT = {
  icon: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  ring: 'group-hover:ring-indigo-200 dark:group-hover:ring-indigo-500/30',
  bar: 'bg-indigo-500',
}

const countActive = async (list: () => Promise<Response>): Promise<number> => {
  const res = await list()
  if (!res.ok) return 0
  const data: { isActive?: boolean }[] = await res.json()
  return data.filter(x => x.isActive).length
}

const HUB_MODULES: HubModule[] = [
  {
    key: 'hr', label: 'Recursos Humanos', icon: Users, to: '/hr/resumen',
    metricLabel: 'Empleados activos', loadMetric: () => countActive(() => employeesApi.list()),
  },
  {
    key: 'crm', label: 'CRM', icon: Handshake, to: '/crm/clientes',
    metricLabel: 'Oportunidades activas', loadMetric: async () => {
      const res = await opportunitiesApi.list({ active: true })
      return res.ok ? (await res.json()).length : 0
    },
  },
  {
    key: 'helpdesk', label: 'Helpdesk', icon: LifeBuoy, to: '/helpdesk/resumen',
    metricLabel: 'Tickets abiertos', loadMetric: async () => {
      const res = await ticketsApi.list()
      if (!res.ok) return 0
      const tickets: { statusIsFinal: boolean }[] = await res.json()
      return tickets.filter(t => !t.statusIsFinal).length
    },
  },
  {
    key: 'projects', label: 'Proyectos', icon: FolderKanban, to: '/projects/resumen',
    metricLabel: 'Proyectos activos', loadMetric: async () => {
      const res = await projectsApi.list({ active: true })
      return res.ok ? (await res.json()).length : 0
    },
  },
  {
    key: 'ventas', label: 'Ventas', icon: ShoppingBag, to: '/ventas/productos',
    metricLabel: 'Órdenes activas', loadMetric: async () => {
      const res = await salesOrdersApi.list({ active: true })
      return res.ok ? (await res.json()).length : 0
    },
  },
  {
    key: 'security', label: 'Seguridad', icon: ShieldCheck, to: '/security/usuarios',
    metricLabel: 'Usuarios activos', loadMetric: () => countActive(() => usersApi.list()),
  },
]

export function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [metrics, setMetrics] = useState<Record<string, number | null>>({})

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
  const firstName = user?.names?.split(' ')[0] ?? ''
  const today = new Date().toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' })

  const isAdmin = user?.roleName === 'Administrador'
  const visibleModules = isAdmin ? HUB_MODULES.filter(m => user?.modules.includes(m.key)) : []

  useEffect(() => {
    if (!isAdmin) return
    visibleModules.forEach(m => {
      m.loadMetric()
        .then(value => setMetrics(prev => ({ ...prev, [m.key]: value })))
        .catch(() => setMetrics(prev => ({ ...prev, [m.key]: null })))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  return (
    <div className="p-6 space-y-8">

      {/* Encabezado */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          ¡{greeting}{firstName ? `, ${firstName}` : ''}!
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 capitalize">
          {today}
        </p>
      </div>

      {/* Widgets por módulo — solo para Administradores; el resto usa el menú lateral. */}
      {isAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
          {visibleModules.map(m => {
            const Icon = m.icon
            const value = metrics[m.key]
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => navigate(m.to)}
                className={`group relative text-left overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-lg hover:-translate-y-1 ring-1 ring-transparent transition-all duration-200 cursor-pointer p-5 ${ACCENT.ring}`}
              >
                <span className={`absolute top-0 left-0 h-1 w-full ${ACCENT.bar}`} />
                <div className="flex items-center gap-3">
                  <span className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110 ${ACCENT.icon}`}>
                    <Icon className="w-6 h-6" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{m.label}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className="text-xs text-slate-400 truncate">{m.metricLabel}</p>
                      {value === undefined ? (
                        <span className="inline-block h-4 w-6 rounded-full bg-slate-100 dark:bg-slate-800 animate-pulse shrink-0" />
                      ) : (
                        <span className={`inline-flex items-center justify-center px-1.5 h-4 min-w-[1rem] rounded-full text-[10px] font-bold tabular-nums shrink-0 ${ACCENT.icon}`}>
                          {value === null ? '—' : value}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
