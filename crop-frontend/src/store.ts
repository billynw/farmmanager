import { create } from 'zustand'
import { authApi } from './api'
import type { User } from './api'

interface AuthState {
  user: User | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  init: () => Promise<void>
  setToken: (token: string) => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token'),

  // メールアドレス + パスワードでログイン
  login: async (email, password) => {
    const { data } = await authApi.login(email, password)
    localStorage.setItem('token', data.access_token)
    set({ token: data.access_token })
    const me = await authApi.me()
    set({ user: me.data })
  },

  logout: () => {
    localStorage.removeItem('token')
    set({ user: null, token: null })
  },

  init: async () => {
    const token = localStorage.getItem('token')
    if (!token) return
    try {
      const me = await authApi.me()
      set({ user: me.data })
    } catch {
      localStorage.removeItem('token')
      set({ token: null })
    }
  },

  // 登録完了後にそのままログイン状態にする
  setToken: async (token: string) => {
    localStorage.setItem('token', token)
    set({ token })
    const me = await authApi.me()
    set({ user: me.data })
  },
}))
