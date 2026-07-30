import { useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, LogOut, X,
  Users, Building2, BriefcaseBusiness, Wallet, CalendarCheck, UserPlus, TreePalm, FileSignature,
  ChevronDown, Handshake, BookUser, Target, ClipboardList, BarChart2,
  ShieldCheck, UserCog, KeyRound,
  FolderKanban, ListTodo, GanttChartSquare, Gauge,
  ShoppingBag, Package, FileText, ShoppingCart,
  LifeBuoy, Tag, Flag, Waypoints, Settings2,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { A3HubLogo } from '../components/A3HubLogo'

interface NavItem {
  to: string
  icon: React.ElementType
  label: string
  /** Si es true, el ítem solo se muestra a usuarios con rol Administrador. */
  adminOnly?: boolean
  /**
   * Prefijos de permiso (ej. 'hr.employees.') que vuelven relevante esta
   * pantalla. Si se define, el ítem solo se muestra cuando el usuario tiene
   * al menos un permiso que empieza con alguno de estos prefijos — de nada
   * sirve mostrar una pantalla de gestión (categorías, roles, empleados…) a
   * quien no puede crear/editar/eliminar nada ahí. Se omite en pantallas
   * puramente de lectura (resúmenes, reportes, dashboards), que ya son
   * accesibles con solo el módulo.
   */
  anyPrefix?: string[]
}

interface NavSection {
  /** Identificador único de la sección — usado como React key y para el estado de expandido. */
  key: string
  label: string
  icon: React.ElementType
  items: NavItem[]
  /**
   * Módulo del JWT que gatea la visibilidad de la sección completa. Si se
   * omite, se usa `key`. Existe para poder tener dos secciones de sidebar con
   * etiquetas distintas que comparten el mismo módulo de autorización (ej.
   * "Seguridad" y "Configuración" bajo el módulo 'security') sin duplicar
   * `key` — dos secciones con la misma key colisionarían como React key y
   * compartirían el estado de expandido/colapsado.
   */
  moduleKey?: string
}

const FLAT_NAV: NavItem[] = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
]

const MODULE_SECTIONS: NavSection[] = [
  {
    key: 'hr',
    label: 'Recursos Humanos',
    icon: Users,
    items: [
      { to: '/hr/resumen',       icon: Gauge,         label: 'Resumen',       anyPrefix: ['hr.dashboard.'] },
      { to: '/hr/empleados',     icon: Users,        label: 'Empleados',     anyPrefix: ['hr.employees.'] },
      { to: '/hr/departamentos', icon: Building2,     label: 'Departamentos', anyPrefix: ['hr.departments.'] },
      { to: '/hr/cargos',        icon: BriefcaseBusiness, label: 'Cargos',    anyPrefix: ['hr.positions.'] },
      { to: '/hr/nomina',        icon: Wallet,        label: 'Nómina',        anyPrefix: ['hr.payroll.'] },
      { to: '/hr/contratos',     icon: FileSignature, label: 'Contratos y Horas', anyPrefix: ['hr.contracts.', 'hr.time-entries.', 'hr.work-types.'] },
      { to: '/hr/asistencia',    icon: CalendarCheck, label: 'Asistencia',    anyPrefix: ['hr.attendance.'] },
      { to: '/hr/vacaciones',    icon: TreePalm,      label: 'Vacaciones y Ausencias', anyPrefix: ['hr.vacations.', 'hr.leaves.'] },
      { to: '/hr/reclutamiento', icon: UserPlus,      label: 'Reclutamiento', anyPrefix: ['hr.vacancies.', 'hr.candidates.', 'hr.applications.'] },
      { to: '/hr/reportes',      icon: BarChart2,     label: 'Reportes',      anyPrefix: ['hr.reports.'] },
    ],
  },
  {
    key: 'crm',
    label: 'CRM',
    icon: Handshake,
    items: [
      { to: '/crm/clientes',      icon: Building2,     label: 'Clientes',      anyPrefix: ['crm.clients.'] },
      { to: '/crm/contactos',     icon: BookUser,      label: 'Contactos',     anyPrefix: ['crm.contacts.'] },
      { to: '/crm/oportunidades', icon: Target,        label: 'Oportunidades', anyPrefix: ['crm.opportunities.'] },
      { to: '/crm/actividades',   icon: ClipboardList, label: 'Actividades',   anyPrefix: ['crm.activities.'] },
      { to: '/crm/reportes',      icon: BarChart2,     label: 'Reportes'      },
    ],
  },
  {
    key: 'projects',
    label: 'Proyectos',
    icon: FolderKanban,
    items: [
      { to: '/projects/resumen',    icon: Gauge,             label: 'Resumen',    anyPrefix: ['projects.dashboard.'] },
      { to: '/projects/proyectos',  icon: FolderKanban,      label: 'Proyectos',  anyPrefix: ['projects.projects.'] },
      { to: '/projects/tareas',     icon: ListTodo,          label: 'Tareas',     anyPrefix: ['projects.tasks.'] },
      { to: '/projects/cronograma', icon: GanttChartSquare,  label: 'Cronograma', anyPrefix: ['projects.tasks.'] },
      { to: '/projects/reportes',   icon: BarChart2,         label: 'Reportes',   anyPrefix: ['projects.reports.'] },
    ],
  },
  {
    key: 'ventas',
    label: 'Ventas',
    icon: ShoppingBag,
    items: [
      { to: '/ventas/productos',    icon: Package,      label: 'Productos y Servicios', anyPrefix: ['ventas.products.'] },
      { to: '/ventas/cotizaciones', icon: FileText,     label: 'Cotizaciones',          anyPrefix: ['ventas.quotes.'] },
      { to: '/ventas/ordenes',      icon: ShoppingCart, label: 'Órdenes de Venta',      anyPrefix: ['ventas.orders.'] },
      { to: '/ventas/contratos',    icon: FileSignature, label: 'Contratos',            anyPrefix: ['ventas.contracts.'] },
      { to: '/ventas/reportes',     icon: BarChart2,    label: 'Reportes'              },
    ],
  },
  {
    key: 'helpdesk',
    label: 'Helpdesk',
    icon: LifeBuoy,
    items: [
      { to: '/helpdesk/resumen',     icon: Gauge,    label: 'Resumen',     anyPrefix: ['helpdesk.dashboard.'] },
      { to: '/helpdesk/tickets',     icon: LifeBuoy, label: 'Tickets',     anyPrefix: ['helpdesk.tickets.'] },
      { to: '/helpdesk/categorias',  icon: Tag,      label: 'Categorías',  anyPrefix: ['helpdesk.categories.'] },
      { to: '/helpdesk/prioridades', icon: Flag,     label: 'Prioridades', anyPrefix: ['helpdesk.priorities.'] },
      { to: '/helpdesk/estados',     icon: Waypoints, label: 'Estados',    anyPrefix: ['helpdesk.statuses.'] },
      { to: '/helpdesk/reportes',    icon: BarChart2, label: 'Reportes',    anyPrefix: ['helpdesk.reports.'] },
    ],
  },
  {
    key: 'security',
    label: 'Seguridad',
    icon: ShieldCheck,
    items: [
      { to: '/security/usuarios', icon: UserCog,  label: 'Usuarios', anyPrefix: ['security.users.'] },
      { to: '/security/roles',    icon: KeyRound, label: 'Roles',    anyPrefix: ['security.roles.'] },
    ],
  },
  {
    key: 'general',
    moduleKey: 'security', // reutiliza el módulo de autorización 'security' — no amerita un módulo dedicado en dbo.Modules
    label: 'Configuración',
    icon: Settings2,
    items: [
      { to: '/general/empresa', icon: Building2, label: 'Empresa', anyPrefix: ['general.company.'] },
    ],
  },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Un ítem con anyPrefix requiere al menos un permiso que empiece con alguno
  // de esos prefijos; sin anyPrefix, el módulo alcanza (pantallas de solo lectura).
  const hasRelevantPermission = (prefixes: string[]) =>
    (user?.permissions ?? []).some(p => prefixes.some(prefix => p.startsWith(prefix)))

  // Solo se muestran las secciones cuyos módulos el usuario tiene permitidos,
  // y dentro de cada una, solo los ítems donde el permiso los vuelve relevantes.
  // Si a una sección no le queda ningún ítem visible, se oculta la sección entera.
  const visibleSections = MODULE_SECTIONS
    .filter(s => user?.modules.includes(s.moduleKey ?? s.key))
    .map(s => ({ ...s, items: s.items.filter(i => !i.anyPrefix || hasRelevantPermission(i.anyPrefix)) }))
    .filter(s => s.items.length > 0)

  // Inicializa expandido si la ruta activa pertenece a esa sección
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      MODULE_SECTIONS.map((s) => [
        s.key,
        s.items.some((i) => pathname.startsWith(i.to)),
      ])
    )
  )

  const toggle = (key: string) =>
    setExpanded((prev) =>
      Object.fromEntries(
        MODULE_SECTIONS.map((s) => [s.key, s.key === key ? !prev[key] : false])
      )
    )

  const handleLogoutConfirm = async () => {
    setConfirmOpen(false)
    await logout()
    navigate('/login', { replace: true })
  }

  const linkClass = (isActive: boolean) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-indigo-600 text-white'
        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
    }`

  return (
    <>
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 flex flex-col
          shadow-[2px_0_8px_rgba(0,0,0,0.08)] dark:shadow-[4px_0_16px_rgba(0,0,0,0.25)]
          transition-transform duration-300 ease-in-out
          ${open ? 'translate-x-0' : '-translate-x-full'}
          lg:static lg:translate-x-0 lg:z-auto lg:h-screen lg:sticky lg:top-0
        `}
      >
        {/* Logo */}
        <div className="h-14 px-5 border-b border-slate-800 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => { navigate('/dashboard'); onClose() }}
            className="flex items-center focus:outline-none cursor-pointer"
            title="Ir al dashboard"
          >
            <A3HubLogo className="h-7 w-auto text-white" />
          </button>
          <button
            onClick={onClose}
            className="lg:hidden text-slate-400 hover:text-white transition-colors p-1 -mr-1"
            aria-label="Cerrar menú"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navegación */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--color-slate-700)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-700 hover:[&::-webkit-scrollbar-thumb]:bg-slate-600">

          {/* Ítems planos (Dashboard, etc.) */}
          {FLAT_NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) => linkClass(isActive)}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}

          {/* Separador */}
          {visibleSections.length > 0 && (
          <div className="pt-3 pb-1">
            <p className="text-slate-600 text-xs font-medium uppercase tracking-wider px-3">
              Módulos
            </p>
          </div>
          )}

          {/* Secciones colapsables */}
          {visibleSections.map((section) => {
            const isOpen = expanded[section.key]
            const SectionIcon = section.icon
            const visibleItems = section.items.filter(i => !i.adminOnly || user?.roleName === 'Administrador')
            const hasActive = visibleItems.some((i) => pathname.startsWith(i.to))

            return (
              <div key={section.key}>
                {/* Cabecera del módulo */}
                <button
                  onClick={() => toggle(section.key)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    hasActive && !isOpen
                      ? 'text-indigo-400 bg-indigo-600/10'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                  }`}
                >
                  <SectionIcon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-left">{section.label}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {/* Sub-ítems */}
                {isOpen && (
                  <div className="mt-0.5 ml-3 pl-3 border-l border-slate-800 space-y-0.5">
                    {visibleItems.map(({ to, icon: Icon, label }) => (
                      <NavLink
                        key={to}
                        to={to}
                        onClick={onClose}
                        className={({ isActive }) => linkClass(isActive)}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Logout */}
        <div className="border-t border-slate-800 h-12 flex items-center">
          <button
            onClick={() => setConfirmOpen(true)}
            className="w-full flex items-center gap-3 px-5 text-sm text-slate-400 hover:bg-slate-800 hover:text-red-400 h-full transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <ConfirmDialog
        open={confirmOpen}
        title="¿Cerrar sesión?"
        message="Tu sesión actual se cerrará y tendrás que volver a iniciar sesión para acceder."
        confirmLabel="Sí, cerrar sesión"
        cancelLabel="Cancelar"
        onConfirm={handleLogoutConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  )
}
