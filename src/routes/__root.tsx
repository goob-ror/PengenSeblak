import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useNavigate,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { TerminalShell } from "@/components/terminal/shell";
import { useAuthStore } from "@/stores/authStore";
function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <div className="text-6xl font-semibold text-primary">404</div>
        <p className="mt-3 text-sm text-muted-foreground">
          The requested terminal view is unavailable.
        </p>
        <Link to="/" className="mt-5 inline-flex border border-border px-4 py-2 text-xs">
          Return to market overview
        </Link>
      </div>
    </div>
  );
}
function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center">
      <button
        onClick={() => {
          router.invalidate();
          reset();
        }}
        className="border border-border px-4 py-2 text-xs"
      >
        Retry terminal
      </button>
    </div>
  );
}
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap",
      },
      { rel: "icon", href: "/favicon.ico" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});
function RootShell({ children }: { children: ReactNode }) {
  // Read theme from localStorage before first paint to avoid flash
  const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t==='light'){document.documentElement.classList.remove('dark');document.documentElement.classList.add('light');}else{document.documentElement.classList.add('dark');document.documentElement.classList.remove('light');}}catch(e){}})()`;
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
        {/* eslint-disable-next-line react/no-danger */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { user, token, isInitializing, initialize } = useAuthStore();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Validate persisted session against the server on first mount
  useEffect(() => {
    void initialize();
  }, [initialize]);

  // Auth guard — only redirect after initialization is complete so a hard
  // refresh doesn't bounce authenticated users to /login while /me is in-flight
  useEffect(() => {
    if (!isInitializing && !token && pathname !== "/login") {
      void navigate({ to: "/login", replace: true });
    }
  }, [isInitializing, token, pathname, navigate]);

  // Login page always renders without the terminal shell
  if (pathname === "/login") {
    return (
      <QueryClientProvider client={queryClient}>
        <Outlet />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      {/* Show a minimal loading overlay while validating the session.
          The shell and Outlet REMAIN MOUNTED underneath — this prevents the
          full app unmount/remount (which wiped scroll, filters, and every
          component's inline state, and refetched every query — perceived as
          "the page refreshing on its own"). */}
      {isInitializing && !user ? (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3">
            <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Memuat sesi…
            </span>
          </div>
        </div>
      ) : !user ? // Not authenticated after initialization — redirect is in progress
      null : (
        <TerminalShell>
          <Outlet />
        </TerminalShell>
      )}
    </QueryClientProvider>
  );
}
