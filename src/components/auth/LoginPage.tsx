import { useState, useRef, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Lock, Mail, TrendingUp, AlertCircle, Loader2 } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";

// ── Animated ticker tape ────────────────────────────────────────────────────
const TICKERS = [
  { sym: "BBCA", val: "+1.24%", pos: true },
  { sym: "TLKM", val: "-0.41%", pos: false },
  { sym: "ASII", val: "+0.78%", pos: true },
  { sym: "BMRI", val: "+2.11%", pos: true },
  { sym: "UNVR", val: "-1.03%", pos: false },
  { sym: "GOTO", val: "+3.45%", pos: true },
  { sym: "BREN", val: "+0.92%", pos: true },
  { sym: "KLBF", val: "-0.55%", pos: false },
  { sym: "INDF", val: "+1.67%", pos: true },
  { sym: "PTBA", val: "+0.33%", pos: true },
  { sym: "ADRO", val: "-0.89%", pos: false },
  { sym: "SMGR", val: "+1.15%", pos: true },
];

function TickerTape() {
  return (
    <div className="overflow-hidden border-b border-white/5 py-2">
      <div className="flex animate-[ticker_30s_linear_infinite] gap-8 whitespace-nowrap">
        {[...TICKERS, ...TICKERS].map((t, i) => (
          <span key={i} className="flex items-center gap-1.5 text-[10px] font-medium uppercase">
            <span className="text-white/40">{t.sym}</span>
            <span className={t.pos ? "text-emerald-400" : "text-rose-400"}>{t.val}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Background grid & glow ──────────────────────────────────────────────────
function BackgroundEffect() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Grid */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(45,212,191,1) 1px, transparent 1px), linear-gradient(90deg, rgba(45,212,191,1) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      {/* Radial glow top-right */}
      <div
        className="absolute -right-40 -top-40 size-[600px] rounded-full opacity-20"
        style={{
          background: "radial-gradient(circle, oklch(0.72 0.095 185) 0%, transparent 65%)",
        }}
      />
      {/* Radial glow bottom-left */}
      <div
        className="absolute -bottom-60 -left-40 size-[500px] rounded-full opacity-10"
        style={{
          background: "radial-gradient(circle, oklch(0.65 0.14 240) 0%, transparent 65%)",
        }}
      />
    </div>
  );
}

// ── Stat pill ───────────────────────────────────────────────────────────────
function StatPill({ label, value, up }: { label: string; value: string; up: boolean }) {
  return (
    <div className="flex flex-col items-center rounded border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-sm">
      <span
        className={cn(
          "text-sm font-semibold tabular-nums",
          up ? "text-emerald-400" : "text-rose-400",
        )}
      >
        {value}
      </span>
      <span className="mt-0.5 text-[9px] uppercase tracking-wider text-white/40">{label}</span>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { login, isLoading } = useAuthStore();

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Email tidak boleh kosong.");
      return;
    }
    if (!password) {
      setError("Password tidak boleh kosong.");
      return;
    }

    try {
      await login(email.trim(), password, rememberMe);
      await navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login gagal. Coba lagi.");
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-[oklch(0.13_0.006_240)]">
      {/* Ticker tape */}
      <TickerTape />

      {/* Background effects */}
      <BackgroundEffect />

      {/* Content */}
      <div className="relative flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          {/* Logo + Title */}
          <div className="mb-8 text-center">
            <div className="mb-5 inline-flex size-16 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 shadow-[0_0_32px_oklch(0.72_0.095_185_/_0.25)]">
              <img
                src="/Nusantara Terminal Icon Transparent.png"
                alt="Nusantara Terminal"
                className="size-10"
              />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-white">Nusantara Terminal</h1>
            <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/35">
              Pasar Modal Intelligence Platform
            </p>
          </div>

          {/* Stats row */}
          <div className="mb-8 flex justify-center gap-3">
            <StatPill label="IHSG" value="7,284.3" up />
            <StatPill label="Mkt Cap" value="Rp 12,4 T" up />
            <StatPill label="Vol Asing" value="-142 M" up={false} />
          </div>

          {/* Card */}
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl backdrop-blur-xl">
            <div className="mb-6">
              <h2 className="text-base font-semibold text-white/90">Masuk ke Terminal</h2>
              <p className="mt-1 text-xs text-white/35">
                Akses analisis sektor, emiten, dan intelijen pasar real-time.
              </p>
            </div>

            <form id="login-form" onSubmit={handleSubmit} noValidate className="space-y-4">
              {/* Email field */}
              <div>
                <label
                  htmlFor="login-email"
                  className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/50"
                >
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/25" />
                  <input
                    ref={emailRef}
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(null);
                    }}
                    placeholder="pengenseblak@nt.com"
                    disabled={isLoading}
                    className={cn(
                      "w-full rounded-lg border bg-white/5 py-2.5 pl-9 pr-4 text-sm text-white placeholder:text-white/20 outline-none transition-all",
                      "focus:border-primary/60 focus:bg-white/[0.07] focus:ring-1 focus:ring-primary/30",
                      error ? "border-rose-500/60" : "border-white/10",
                      isLoading && "opacity-60 cursor-not-allowed",
                    )}
                  />
                </div>
              </div>

              {/* Password field */}
              <div>
                <label
                  htmlFor="login-password"
                  className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/50"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/25" />
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                    placeholder="••••••••••"
                    disabled={isLoading}
                    className={cn(
                      "w-full rounded-lg border bg-white/5 py-2.5 pl-9 pr-10 text-sm text-white placeholder:text-white/20 outline-none transition-all",
                      "focus:border-primary/60 focus:bg-white/[0.07] focus:ring-1 focus:ring-primary/30",
                      error ? "border-rose-500/60" : "border-white/10",
                      isLoading && "opacity-60 cursor-not-allowed",
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 transition-colors hover:text-white/60"
                    tabIndex={-1}
                    aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {/* Remember Me */}
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={rememberMe}
                  id="remember-me"
                  onClick={() => setRememberMe((v) => !v)}
                  disabled={isLoading}
                  className={cn(
                    "relative flex size-4 shrink-0 items-center justify-center rounded border transition-all",
                    rememberMe
                      ? "border-primary bg-primary"
                      : "border-white/20 bg-white/5 hover:border-white/40",
                    isLoading && "opacity-60 cursor-not-allowed",
                  )}
                >
                  {rememberMe && (
                    <svg
                      viewBox="0 0 12 10"
                      fill="none"
                      className="size-3 text-primary-foreground"
                      aria-hidden="true"
                    >
                      <path
                        d="M1 5l3 3 7-7"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
                <label
                  htmlFor="remember-me"
                  onClick={() => !isLoading && setRememberMe((v) => !v)}
                  className={cn(
                    "select-none text-xs text-white/50 transition-colors",
                    !isLoading && "cursor-pointer hover:text-white/70",
                  )}
                >
                  Ingat saya selama 30 hari
                </label>
                <span
                  className="ml-auto text-[10px] text-white/25"
                  title="Tanpa 'Ingat saya', sesi berakhir dalam 8 jam atau saat browser ditutup."
                >
                  {rememberMe ? "30 hari" : "8 jam"}
                </span>
              </div>

              {/* Error message */}
              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5">
                  <AlertCircle className="size-4 shrink-0 text-rose-400" />
                  <span className="text-xs text-rose-300">{error}</span>
                </div>
              )}

              {/* Submit */}
              <button
                id="login-submit"
                type="submit"
                disabled={isLoading}
                className={cn(
                  "mt-2 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold transition-all",
                  "bg-primary text-primary-foreground shadow-[0_0_24px_oklch(0.72_0.095_185_/_0.35)]",
                  "hover:bg-primary/90 hover:shadow-[0_0_32px_oklch(0.72_0.095_185_/_0.55)]",
                  "active:scale-[0.98]",
                  isLoading && "cursor-not-allowed opacity-70",
                )}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Memverifikasi…
                  </>
                ) : (
                  <>
                    <TrendingUp className="size-4" />
                    Masuk ke Terminal
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Footer note */}
          <p className="mt-6 text-center text-[10px] leading-relaxed text-white/20">
            Platform ini hanya untuk pengguna terdaftar.
            <br />
            Data bersumber dari <span className="text-primary/60">Sectors</span>.
          </p>
        </div>
      </div>

      {/* Bottom ticker */}
      <div className="border-t border-white/5 py-2 text-center text-[9px] uppercase tracking-widest text-white/15">
        Nusantara Terminal · IDX · SGX · KLSE · ©{new Date().getFullYear()}
      </div>

      {/* Ticker keyframe */}
      <style>{`
        @keyframes ticker {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
