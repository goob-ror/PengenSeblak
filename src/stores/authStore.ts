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
  /** Guard flag: initialize() must only run once per module lifetime */
  hasInitialized: boolean;
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
      hasInitialized: false,
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
            hasInitialized: true,
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
        // Reset so a subsequent login re-runs validation from a clean slate
        set({
          user: null,
          token: null,
          rememberMe: false,
          isInitializing: false,
          hasInitialized: false,
        });
      },

      initialize: async () => {
        // IDEMPOTENT GUARD — RootComponent's effect relies on `initialize` being
        // a stable reference (dep array [initialize]), so React may invoke it
        // more than once per mount (StrictMode, route re-render, key change).
        // Running twice raced two /api/auth/me calls; one could resolve while
        // the other was in-flight and clobber state. Never start a second
        // validation while one is running, and never run twice overall.
        if (get().hasInitialized) return;
        set({ hasInitialized: true });

        const { token } = get();

        if (!token) {
          // No persisted token — not logged in, skip validation
          set({ isInitializing: false });
          return;
        }

        try {
          const res = await api.auth.me();
          set({ user: res.user, isInitializing: false });
        } catch (err) {
          const status = (err as { status?: number }).status;
          // TRANSIENT failure (network hiccup, 429 rate-limit, 5xx) must NOT
          // destroy the session. Persisted token stays; keep `user` if we have
          // it so the shell isn't torn down and refetched — the perceived
          // "page refresh on its own". Only a genuine auth rejection (401)
          // clears credentials.
          const isAuthRejection = status === 401;
          set(
            isAuthRejection
              ? { user: null, token: null, rememberMe: false, isInitializing: false }
              : { isInitializing: false },
          );
          if (isAuthRejection) localStorage.removeItem("auth_token");
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
