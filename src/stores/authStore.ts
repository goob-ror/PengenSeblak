import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "@/lib/api";

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;

  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const res = await api.auth.login(email, password);
          // Persist token to localStorage for Authorization header
          localStorage.setItem("auth_token", res.token);
          set({ user: res.user, token: res.token, isLoading: false });
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      logout: async () => {
        try {
          await api.auth.logout();
        } catch {
          // Ignore — clear local state regardless
        }
        localStorage.removeItem("auth_token");
        set({ user: null, token: null });
      },

      initialize: async () => {
        const { token } = get();
        if (!token) return;
        try {
          const res = await api.auth.me();
          set({ user: res.user });
        } catch {
          // Token invalid / expired — clear state
          localStorage.removeItem("auth_token");
          set({ user: null, token: null });
        }
      },
    }),
    {
      name: "pengen-seblak-auth",
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
);
