import { create } from 'zustand'
import { authAPI } from '../lib/api'

interface User {
  id: number
  email: string
  username: string
  chess_com_username?: string
  created_at: string
  last_import_at?: string
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: (username: string, password: string) => Promise<void>
  register: (email: string, username: string, password: string, chessComUsername?: string) => Promise<void>
  logout: () => void
  fetchUser: () => Promise<void>
  updateProfile: (data: { chess_com_username?: string }) => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem('access_token'),
  isLoading: false,
  error: null,

  clearError: () => set({ error: null }),

  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null })
    try {
      const response = await authAPI.login({ username, password })
      const { access_token, refresh_token } = response.data
      
      localStorage.setItem('access_token', access_token)
      localStorage.setItem('refresh_token', refresh_token)
      
      // Fetch user data
      const userResponse = await authAPI.me()
      set({
        user: userResponse.data,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      })
    } catch (error: any) {
      // Clean up tokens if login process fails
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      const errorMessage = error.response?.data?.detail || 'Login failed. Please try again.'
      set({ isLoading: false, error: errorMessage })
      throw error
    }
  },

  register: async (email: string, username: string, password: string, chessComUsername?: string) => {
    set({ isLoading: true, error: null })
    try {
      await authAPI.register({
        email,
        username,
        password,
        chess_com_username: chessComUsername,
      })
      
      // Auto-login after registration
      const response = await authAPI.login({ username, password })
      const { access_token, refresh_token } = response.data
      
      localStorage.setItem('access_token', access_token)
      localStorage.setItem('refresh_token', refresh_token)
      
      const userResponse = await authAPI.me()
      set({
        user: userResponse.data,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      })
    } catch (error: any) {
      // Clean up tokens if registration/login process fails
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      const errorMessage = error.response?.data?.detail || 'Registration failed. Please try again.'
      set({ isLoading: false, error: errorMessage })
      throw error
    }
  },

  logout: () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    set({
      user: null,
      isAuthenticated: false,
    })
  },

  fetchUser: async () => {
    try {
      const response = await authAPI.me()
      set({ user: response.data })
    } catch (error) {
      // If fetching user fails, logout
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      set({
        user: null,
        isAuthenticated: false,
      })
    }
  },

  updateProfile: async (data: { chess_com_username?: string }) => {
    try {
      const response = await authAPI.updateProfile(data)
      set({ user: response.data })
    } catch (error) {
      throw error
    }
  },
}))

