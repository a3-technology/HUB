import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { ReactNode } from 'react'

interface RequireModuleProps {
  /** Código del módulo requerido (ej. 'hr', 'crm', 'security'). */
  module: string
  /** Si es true, además del módulo exige rol Administrador (ej. catálogos de un módulo). */
  adminOnly?: boolean
  /**
   * Permiso granular requerido además del módulo (ej. 'hr.dashboard.view').
   * Para pantallas de solo lectura sin una acción propia que las gatee —
   * ocultarlas del sidebar no alcanza si alguien navega directo a la URL.
   */
  permission?: string
  children: ReactNode
}

/**
 * Guard de rutas por módulo: solo renderiza el contenido si el usuario
 * autenticado tiene acceso al módulo indicado; en caso contrario redirige
 * al dashboard. La seguridad real la aplica el backend con sus políticas —
 * esto solo evita mostrar pantallas que el usuario no puede usar.
 */
export function RequireModule({ module, adminOnly, permission, children }: RequireModuleProps) {
  const { user } = useAuth()

  if (!user?.modules.includes(module)) {
    return <Navigate to="/dashboard" replace />
  }

  if (adminOnly && user.roleName !== 'Administrador') {
    return <Navigate to="/dashboard" replace />
  }

  if (permission && !user.permissions.includes(permission)) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
