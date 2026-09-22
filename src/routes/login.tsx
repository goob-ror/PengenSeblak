import { createFileRoute, redirect } from "@tanstack/react-router";
import { LoginPage } from "@/components/auth/LoginPage";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Masuk — Nusantara Terminal" },
      { name: "description", content: "Login ke Nusantara Terminal untuk mengakses analisis pasar IDX." },
    ],
  }),
  // Redirect away if already authenticated
  beforeLoad: ({ context }) => {
    // context.auth is set in __root.tsx — if we have a user, skip login
    if ((context as { auth?: { user: unknown } }).auth?.user) {
      throw redirect({ to: "/" });
    }
  },
  component: LoginPage,
});
