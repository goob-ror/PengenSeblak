// Central API client for server communication
// Use a relative path so the same code works behind any proxy (ngrok, etc.).
// In dev, Vite's server.proxy forwards /api/* to the Express server on :3001.
const BASE_URL = (import.meta.env["VITE_API_URL"] as string | undefined) ?? "";

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  token: string;
  expiresIn: number;
  rememberMe: boolean;
  user: {
    id: number;
    email: string;
    fullName: string;
  };
}

export interface MeResponse {
  success: boolean;
  user: {
    id: number;
    email: string;
    fullName: string;
    lastLogin: string | null;
    createdAt: string;
  };
}

// ── CSRF token management ────────────────────────────────────────────────────
// The server sets a non-httpOnly `csrf_token` cookie. We read it and echo it
// in the X-CSRF-Token header on every state-changing request.
function getCsrfToken(): string | null {
  const match = document.cookie.split("; ").find((c) => c.startsWith("csrf_token="));
  return match ? decodeURIComponent(match.split("=")[1]!) : null;
}

// Fetch a CSRF token from the server if we don't have one in our cookies yet.
let csrfInitialized = false;
async function ensureCsrfToken(): Promise<void> {
  if (csrfInitialized) return;
  const existing = getCsrfToken();
  if (existing) {
    csrfInitialized = true;
    return;
  }
  try {
    await fetch(`${BASE_URL}/api/csrf-token`, {
      credentials: "include",
      method: "GET",
    });
    csrfInitialized = true;
  } catch {
    // Non-fatal — the request will fail with 403 and the user will be prompted to retry
  }
}

// ── Core request function ────────────────────────────────────────────────────
async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const isStateMutating = !["GET", "HEAD", "OPTIONS"].includes(method);

  // Ensure we have a CSRF token before any state-mutating request
  if (isStateMutating) {
    await ensureCsrfToken();
  }

  const token = localStorage.getItem("auth_token");
  const csrfToken = isStateMutating ? getCsrfToken() : null;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Echo the CSRF cookie value in the request header (double-submit pattern)
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: "include", // send httpOnly auth cookie + csrf_token cookie
    headers,
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({ message: "Terjadi kesalahan." }))) as {
      message?: string;
    };
    throw new Error(err.message ?? `Request gagal: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  auth: {
    login: (email: string, password: string, rememberMe = false) =>
      request<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, rememberMe }),
      }),

    logout: () =>
      request<ApiResponse>("/api/auth/logout", { method: "POST" }),

    me: () => request<MeResponse>("/api/auth/me"),
  },
  sectors: {
    get: <T = unknown>(endpoint: string, query?: Record<string, string | number | boolean>) => {
      const queryString = query ? "?" + new URLSearchParams(query as Record<string, string>).toString() : "";
      // Ensure endpoint starts with a slash
      const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
      return request<T>(`/api/sectors${cleanEndpoint}${queryString}`);
    },
  },
};
