import { create } from 'zustand';
import { api, saveTokens, clearTokens, getTokens } from '../api/client';

export interface User {
  id: string;
  username: string;
  email: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  cover_url?: string | null;
  gender: 'MALE' | 'FEMALE';
  role: string;
  is_verified: boolean;
  follower_count: number;
  following_count: number;
  post_count: number;
  like_count?: number;
  profile_view_enabled?: boolean;
}

interface AuthStore {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  loadMe: () => Promise<void>;
  updateUser: (partial: Partial<User>) => void;
}

interface RegisterData {
  username: string;
  email: string;
  password: string;
  display_name: string;
  gender: 'MALE' | 'FEMALE';
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  loading: true,

  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    await saveTokens(data.access_token, data.refresh_token);
    set({ user: data.user });
  },

  register: async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    await saveTokens(data.access_token, data.refresh_token);
    set({ user: data.user });
  },

  logout: async () => {
    try {
      const tokens = await getTokens();
      if (tokens) {
        await api.post('/auth/logout', { refresh_token: tokens.refresh }).catch(() => {});
      }
    } catch {}
    await clearTokens();
    set({ user: null });
  },

  loadMe: async () => {
    const token = await getTokens();
    if (!token) {
      set({ loading: false });
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      set({ user: data, loading: false });
    } catch {
      await clearTokens();
      set({ user: null, loading: false });
    }
  },

  updateUser: (partial) => set((s) => ({ user: s.user ? { ...s.user, ...partial } : null })),
}));
