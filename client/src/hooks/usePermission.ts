import { useAuth } from '../context/AuthContext'

/** Indica si el usuario autenticado tiene el permiso granular indicado (ej. 'hr.employees.create'). */
export function usePermission(code: string): boolean {
  const { user } = useAuth()
  return user?.permissions.includes(code) ?? false
}
