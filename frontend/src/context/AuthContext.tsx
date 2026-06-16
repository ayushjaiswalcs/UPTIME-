import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authApi, type User } from '../api/auth'
import { tokens } from '../api/tokens'

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string, remember?: boolean) => Promise<{ requires_2fa: true; pre_token: string } | void>
  verify2fa: (pre_token: string, code: string, remember?: boolean) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
  updateUser: (u: User) => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (tokens.access) {
      authApi.getMe()
        .then(({ data }) => setUser(data))
        .catch(() => tokens.clear())
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = useCallback(async (email: string, password: string, remember = true) => {
    const { data } = await authApi.login(email, password)
    if ('requires_2fa' in data) {
      return data
    }
    tokens.save(data.access_token, data.refresh_token, remember)
    setUser(data.user)
  }, [])

  const verify2fa = useCallback(async (pre_token: string, code: string, remember = true) => {
    const { data } = await authApi.verify2fa(pre_token, code)
    tokens.save(data.access_token, data.refresh_token, remember)
    setUser(data.user)
  }, [])

  const register = useCallback(async (name: string, email: string, password: string) => {
    const { data } = await authApi.register(name, email, password)
    tokens.save(data.access_token, data.refresh_token, true)
    setUser(data.user)
  }, [])

  const logout = useCallback(() => {
    tokens.clear()
    setUser(null)
    window.location.href = '/'
  }, [])

  const refreshUser = useCallback(async () => {
    const { data } = await authApi.getMe()
    setUser(data)
  }, [])

  const updateUser = useCallback((u: User) => setUser(u), [])

  return (
    <AuthContext.Provider value={{ user, loading, login, verify2fa, register, logout, updateUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
