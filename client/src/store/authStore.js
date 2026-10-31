import { create } from 'zustand';
import { api } from '../services/api';

export const useAuthStore = create((set, get) => ({
  user: null,
  isLoading: true,
  isAuthModalOpen: false,
  authMode: 'login', // 'login' | 'register'

  openAuthModal: (mode = 'login') => set({ isAuthModalOpen: true, authMode: mode }),
  closeAuthModal: () => set({ isAuthModalOpen: false }),
  setAuthMode: (mode) => set({ authMode: mode }),

  checkAuth: async () => {
    try {
      set({ isLoading: true });
      const user = await api('/api/auth/me');
      if (user && (user.id || user.email)) {
        set({ user, isLoading: false });
        return user;
      }
      set({ user: null, isLoading: false });
      return null;
    } catch {
      set({ user: null, isLoading: false });
      return null;
    }
  },

  login: async (email, password) => {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    set({ user: data.user, isAuthModalOpen: false });
    return data.user;
  },

  register: async (name, email, password) => {
    const data = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    set({ user: data.user, isAuthModalOpen: false });
    return data.user;
  },

  logout: async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } finally {
      set({ user: null });
    }
  },
}));
