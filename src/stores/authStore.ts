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
  /** True while the session is being validated on app startup */
  isInitializing: boolean;
  /** True while the login API call is in-flight */
  isLoading: boolean;
  /** Whether the user opted into a long-lived session */
  rememberMe: boolean;

  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * Called once on app mount. Validates the persisted token against /api/auth/me.
   * Sets isInitializing=false when complete (success or failure).
   */
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isInitializing: true,
      isLoading: false,
      rememberMe: false,

      login: async (email, password, rememberMe = false) => {
        set({ isLoading: true });
        try {
          const res = await api.auth.login(email, password, rememberMe);

          // Token storage: always use localStorage for the Authorization header.
          // The server also sets an httpOnly cookie — two channels for resilience.
          localStorage.setItem("auth_token", res.token);

          set({
            user: res.user,
            token: res.token,
            rememberMe: res.rememberMe,
            isInitializing: false,
            isLoading: false,
          });
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      logout: async () => {
        try {
          await api.auth.logout();
        } catch {
          // Ignore network errors — clear local state regardless
        }
        localStorage.removeItem("auth_token");
        set({ user: null, token: null, rememberMe: false, isInitializing: false });
      },

      initialize: async () => {
        const { token } = get();

        if (!token) {
          // No persisted token — not logged in, skip validation
          set({ isInitializing: false });
          return;
        }

        try {
          const res = await api.auth.me();
          set({ user: res.user, isInitializing: false });
        } catch {
          // Token invalid or expired — clear everything and send to login
          localStorage.removeItem("auth_token");
          set({ user: null, token: null, rememberMe: false, isInitializing: false });
        }
      },
    }),
    {
      name: "pengen-seblak-auth",
      // Only persist token + rememberMe. User is re-fetched from /api/auth/me on boot.
      // isInitializing and isLoading are intentionally NOT persisted.
      partialize: (state) => ({
        token: state.token,
        rememberMe: state.rememberMe,
      }),
      // When rehydrating from storage, mark as initializing (needs server validation)
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isInitializing = true;
        }
      },
    },
  ),
);
