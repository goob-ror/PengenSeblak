import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../config/db";
import { authenticate, JwtPayload } from "../middleware/auth";

const router = Router();

// ── Constants ────────────────────────────────────────────────────────────────
const LOCKOUT_THRESHOLD = 5;           // failed attempts before lockout
const LOCKOUT_WINDOW_MINUTES = 15;     // sliding window for attempt count
const LOCKOUT_DURATION_MINUTES = 15;   // how long the account is locked

const SESSION_DURATION_MS  = 8  * 60 * 60 * 1000;   // 8 hours  (session, no remember-me)
const REMEMBER_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (remember me)

const JWT_SECRET = process.env.JWT_SECRET;
const isProduction = process.env.NODE_ENV === "production";

// ── Helper ───────────────────────────────────────────────────────────────────
function getSecret(): string {
  if (!JWT_SECRET) {
    if (isProduction) throw new Error("JWT_SECRET tidak diset.");
    // Development fallback — loud warning so you notice
    console.warn("⚠️  JWT_SECRET tidak diset. Menggunakan fallback dev-only. JANGAN di production!");
    return "dev-secret-CHANGE-IN-PRODUCTION";
  }
  return JWT_SECRET;
}

// ──────────────────────────────────────────────
// POST /api/auth/login
// ──────────────────────────────────────────────
router.post("/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, rememberMe } = req.body as {
      email?: string;
      password?: string;
      rememberMe?: boolean;
    };

    // ── Input validation ─────────────────────────────────────────────────────
    if (!email || !password) {
      res.status(400).json({ success: false, message: "Email dan password wajib diisi." });
      return;
    }

    // Basic email format check (never trust the client)
    const emailNorm = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      res.status(400).json({ success: false, message: "Format email tidak valid." });
      return;
    }

    if (password.length > 128) {
      // Prevent bcrypt DoS via very long passwords
      res.status(400).json({ success: false, message: "Email atau password salah." });
      return;
    }

    // ── Account lockout check (target-account brute-force protection) ────────
    const [lockRows] = await pool.execute(
      `SELECT COUNT(*) AS attempt_count
       FROM login_attempts
       WHERE email = ?
         AND success = 0
         AND attempted_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
      [emailNorm, LOCKOUT_WINDOW_MINUTES],
    );
    const lockData = lockRows as Array<{ attempt_count: number }>;
    if (lockData[0].attempt_count >= LOCKOUT_THRESHOLD) {
      // Log the blocked attempt
      await pool.execute(
        "INSERT INTO login_attempts (email, ip_address, user_agent, success) VALUES (?, ?, ?, 0)",
        [emailNorm, req.ip ?? "unknown", req.headers["user-agent"]?.slice(0, 255) ?? "unknown"],
      ).catch(() => {}); // best-effort log

      console.warn(`[AUTH] Account lockout hit — email: ${emailNorm}, IP: ${req.ip}`);
      res.status(429).json({
        success: false,
        message: `Terlalu banyak percobaan gagal. Akun dikunci sementara selama ${LOCKOUT_DURATION_MINUTES} menit.`,
      });
      return;
    }

    // ── Fetch user ───────────────────────────────────────────────────────────
    const [rows] = await pool.execute(
      "SELECT id, email, password_hash, full_name FROM users WHERE email = ? LIMIT 1",
      [emailNorm],
    );
    const users = rows as Array<{
      id: number;
      email: string;
      password_hash: string;
      full_name: string;
    }>;

    // ── Credential check (constant-time to prevent timing attacks) ───────────
    // Run bcrypt even when user not found to prevent user enumeration via timing
    const dummyHash = "$2b$12$invalidhashpaddingtomakeconstanttime.....";
    const hashToCheck = users.length > 0 ? users[0].password_hash : dummyHash;
    const passwordMatch = await bcrypt.compare(password, hashToCheck);

    if (users.length === 0 || !passwordMatch) {
      // Record failed attempt
      await pool.execute(
        "INSERT INTO login_attempts (email, ip_address, user_agent, success) VALUES (?, ?, ?, 0)",
        [emailNorm, req.ip ?? "unknown", req.headers["user-agent"]?.slice(0, 255) ?? "unknown"],
      ).catch(() => {});

      res.status(401).json({ success: false, message: "Email atau password salah." });
      return;
    }

    const user = users[0];

    // ── Success: record attempt, update last_login ───────────────────────────
    await Promise.all([
      pool.execute(
        "INSERT INTO login_attempts (email, ip_address, user_agent, success) VALUES (?, ?, ?, 1)",
        [emailNorm, req.ip ?? "unknown", req.headers["user-agent"]?.slice(0, 255) ?? "unknown"],
      ),
      pool.execute("UPDATE users SET last_login = NOW() WHERE id = ?", [user.id]),
    ]).catch(() => {});

    // ── Sign JWT ─────────────────────────────────────────────────────────────
    const durationMs = rememberMe ? REMEMBER_DURATION_MS : SESSION_DURATION_MS;
    const expiresInSeconds = Math.floor(durationMs / 1000);

    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      fullName: user.full_name,
    };

    const token = jwt.sign(payload, getSecret(), { expiresIn: expiresInSeconds });

    // ── Set httpOnly cookie ──────────────────────────────────────────────────
    res.cookie("token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "strict" : "lax",
      maxAge: durationMs,
    });

    // Refresh CSRF token on login to bind it to the authenticated session
    const crypto = await import("crypto");
    const newCsrfToken = crypto.randomBytes(32).toString("hex");
    res.cookie("csrf_token", newCsrfToken, {
      httpOnly: false,
      secure: isProduction,
      sameSite: isProduction ? "strict" : "lax",
      maxAge: durationMs,
    });

    res.json({
      success: true,
      message: "Login berhasil.",
      token,
      expiresIn: expiresInSeconds,
      rememberMe: !!rememberMe,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────
// POST /api/auth/logout
// ──────────────────────────────────────────────
router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("token");
  res.clearCookie("csrf_token");
  res.json({ success: true, message: "Logout berhasil." });
});

// ──────────────────────────────────────────────
// GET /api/auth/me  (protected)
// ──────────────────────────────────────────────
router.get("/me", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.user as JwtPayload;
    const [rows] = await pool.execute(
      "SELECT id, email, full_name, last_login, created_at FROM users WHERE id = ? LIMIT 1",
      [userId],
    );
    const users = rows as Array<{
      id: number;
      email: string;
      full_name: string;
      last_login: string | null;
      created_at: string;
    }>;

    if (users.length === 0) {
      res.status(404).json({ success: false, message: "User tidak ditemukan." });
      return;
    }

    const u = users[0];
    res.json({
      success: true,
      user: {
        id: u.id,
        email: u.email,
        fullName: u.full_name,
        lastLogin: u.last_login,
        createdAt: u.created_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
