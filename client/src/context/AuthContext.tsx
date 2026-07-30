import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { authApi, userSelfApi } from '../lib/api'

interface AuthUser {
  userId: string
  names: string
  email: string
  roleName: string
  /** Códigos de los módulos a los que el usuario tiene acceso (ej. ['hr', 'crm']). */
  modules: string[]
  /** Códigos de los permisos granulares del usuario (ej. ['hr.employees.create']). */
  permissions: string[]
  /** Empleado vinculado al usuario, si tiene uno (para comparaciones de "es mío" en el cliente). */
  employeeId?: string
  /** Foto de perfil propia de la cuenta (independiente de la foto de la ficha de empleado). */
  photoUrl?: string
}

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  /** Refleja en el estado local cambios de nombre/correo ya guardados en el servidor. */
  updateUser: (changes: Partial<Pick<AuthUser, 'names' | 'email' | 'photoUrl'>>) => void
}

/** Consulta la foto de perfil propia una vez restaurada/iniciada la sesión. */
async function fetchOwnPhotoUrl(): Promise<string | undefined> {
  const res = await userSelfApi.photoUrl()
  if (!res.ok) return undefined
  const { url } = await res.json()
  return url ?? undefined
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Al montar, intenta restaurar sesión con el refresh token guardado
  useEffect(() => {
    authApi.restore().then(async (ok) => {
      if (ok) {
        const { apiFetch } = await import('../lib/api')
        const res = await apiFetch('/api/auth/me')
        if (res.ok) {
          const data = await res.json()
          setUser({ ...data, photoUrl: await fetchOwnPhotoUrl() })
        }
      }
      setIsLoading(false)
    })
  }, [])

  const login = async (email: string, password: string) => {
    await authApi.login(email, password)
    const { apiFetch } = await import('../lib/api')
    const res = await apiFetch('/api/auth/me')
    if (res.ok) {
      const data = await res.json()
      setUser({ ...data, photoUrl: await fetchOwnPhotoUrl() })
    }
  }

  const logout = async () => {
    await authApi.logout()
    setUser(null)
  }

  const updateUser = (changes: Partial<Pick<AuthUser, 'names' | 'email' | 'photoUrl'>>) => {
    setUser(prev => prev ? { ...prev, ...changes } : prev)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
