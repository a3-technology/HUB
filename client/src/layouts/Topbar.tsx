import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Menu, LogOut, ChevronDown, User, Sun, Moon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { HelpdeskSupportButton } from '../components/HelpdeskSupportButton'
import { NotificationsBell } from '../components/NotificationsBell'

interface PageMeta { module?: string; page: string }

const PAGE_META: Record<string, PageMeta> = {
  '/dashboard':           { page: 'Dashboard' },
  '/perfil':              { page: 'Mi perfil' },
  '/hr/resumen':          { module: 'Recursos Humanos', page: 'Resumen'       },
  '/hr/empleados':        { module: 'Recursos Humanos', page: 'Empleados'     },
  '/hr/departamentos':    { module: 'Recursos Humanos', page: 'Departamentos' },
  '/hr/cargos':           { module: 'Recursos Humanos', page: 'Cargos'        },
  '/hr/nomina':           { module: 'Recursos Humanos', page: 'Nómina'        },
  '/hr/asistencia':       { module: 'Recursos Humanos', page: 'Asistencia'    },
  '/hr/vacaciones':       { module: 'Recursos Humanos', page: 'Vacaciones y Ausencias' },
  '/hr/reclutamiento':    { module: 'Recursos Humanos', page: 'Reclutamiento' },
  '/hr/contratos':        { module: 'Recursos Humanos', page: 'Contratos'     },
  '/hr/reportes':         { module: 'Recursos Humanos', page: 'Reportes'      },
  '/crm/clientes':        { module: 'CRM',              page: 'Clientes'      },
  '/crm/contactos':       { module: 'CRM',              page: 'Contactos'     },
  '/crm/oportunidades':   { module: 'CRM',              page: 'Oportunidades' },
  '/crm/actividades':     { module: 'CRM',              page: 'Actividades'   },
  '/crm/reportes':        { module: 'CRM',              page: 'Reportes'      },
  '/security/usuarios':   { module: 'Seguridad',        page: 'Usuarios'      },
  '/security/roles':      { module: 'Seguridad',        page: 'Roles'         },
  '/projects/resumen':    { module: 'Proyectos',        page: 'Resumen'       },
  '/projects/proyectos':  { module: 'Proyectos',        page: 'Proyectos'     },
  '/projects/tareas':     { module: 'Proyectos',        page: 'Tareas'        },
  '/projects/cronograma': { module: 'Proyectos',        page: 'Cronograma'    },
  '/projects/reportes':   { module: 'Proyectos',        page: 'Reportes'      },
  '/helpdesk/resumen':     { module: 'Helpdesk',         page: 'Resumen'       },
  '/helpdesk/tickets':     { module: 'Helpdesk',         page: 'Tickets'       },
  '/helpdesk/categorias':  { module: 'Helpdesk',         page: 'Categorías'    },
  '/helpdesk/prioridades': { module: 'Helpdesk',         page: 'Prioridades'   },
  '/helpdesk/estados':     { module: 'Helpdesk',         page: 'Estados'       },
  '/helpdesk/reportes':    { module: 'Helpdesk',         page: 'Reportes'      },
  '/ventas/productos':     { module: 'Ventas',           page: 'Productos'     },
  '/ventas/cotizaciones':  { module: 'Ventas',           page: 'Cotizaciones'  },
  '/ventas/ordenes':       { module: 'Ventas',           page: 'Órdenes de venta' },
  '/ventas/contratos':     { module: 'Ventas',           page: 'Contratos'     },
  '/ventas/reportes':      { module: 'Ventas',           page: 'Reportes'      },
  '/general/empresa':      { module: 'Configuración',    page: 'Empresa'       },
}

interface TopbarProps {
  onMenuClick: () => void
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const meta  = PAGE_META[pathname] ?? { page: 'HUB' }

  const initials = user?.names
    ?.split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase() ?? '?'

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogoutConfirm = async () => {
    setConfirmOpen(false)
    setDropdownOpen(false)
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <>
    <header className="fixed top-0 right-0 left-0 lg:left-64 z-10 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 h-14 flex items-center px-4 sm:px-6 gap-3 transition-colors">
      {/* Hamburger — solo móvil */}
      <button
        onClick={onMenuClick}
        className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-colors shrink-0"
        aria-label="Abrir menú"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Breadcrumb módulo / página */}
      <div className="flex items-center gap-1.5 min-w-0">
        {/* Móvil — solo el módulo (la página ya se repite como título debajo) */}
        <span className="sm:hidden text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
          {meta.module ?? meta.page}
        </span>
        {/* Escritorio — módulo / página completo */}
        {meta.module && (
          <span className="hidden sm:flex items-center gap-1.5 shrink-0">
            <span className="text-sm text-slate-400 dark:text-slate-500 font-medium">{meta.module}</span>
            <span className="text-slate-300 dark:text-slate-600">/</span>
          </span>
        )}
        <span className="hidden sm:inline text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{meta.page}</span>
      </div>

      <div className="ml-auto flex items-center gap-1 sm:gap-2 shrink-0">

        {/* Toggle dark/light */}
        <button
          onClick={toggle}
          aria-label="Cambiar tema"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Soporte — solo para usuarios sin el módulo Helpdesk */}
        <HelpdeskSupportButton />

        {/* Notificaciones */}
        <NotificationsBell />

        {/* Separador */}
        <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />

        {/* Avatar + dropdown */}
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {user?.photoUrl ? (
              <img
                src={user.photoUrl}
                alt={user.names}
                className="w-7 h-7 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                {initials}
              </div>
            )}
            <div className="hidden md:block leading-tight text-left">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{user?.names?.split(' ').slice(0, 2).join(' ')}</p>
              <p className="text-xs text-slate-400">{user?.roleName}</p>
            </div>
            <ChevronDown
              className={`hidden md:block w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Dropdown */}
          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shadow-lg shadow-slate-200/60 dark:shadow-slate-950/60 py-1 z-50">
              {/* Info usuario */}
              <div className="px-4 py-3 border-b border-slate-50 dark:border-slate-800">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{user?.names}</p>
                <p className="text-xs text-slate-400 truncate mt-0.5">{user?.email}</p>
                <span className="inline-block mt-2 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-medium">
                  {user?.roleName}
                </span>
              </div>

              {/* Perfil */}
              <button
                onClick={() => { setDropdownOpen(false); navigate('/perfil') }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <User className="w-4 h-4 text-slate-400" />
                Mi perfil
              </button>

              {/* Cerrar sesión */}
              <div className="border-t border-slate-50 dark:border-slate-800 mt-1 pt-1">
                <button
                  onClick={() => { setDropdownOpen(false); setConfirmOpen(true) }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Cerrar sesión
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>

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
