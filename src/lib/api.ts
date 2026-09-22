// Central API client for server communication
const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3001";

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  token: string;
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

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = localStorage.getItem("auth_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: "include",
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
    login: (email: string, password: string) =>
      request<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),

    logout: () =>
      request<ApiResponse>("/api/auth/logout", { method: "POST" }),

    me: () => request<MeResponse>("/api/auth/me"),
  },
};
