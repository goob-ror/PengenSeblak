import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../config/db";
import { authenticate, JwtPayload } from "../middleware/auth";

const router = Router();

// ──────────────────────────────────────────────
// POST /api/auth/login
// ──────────────────────────────────────────────
router.post("/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      res.status(400).json({ success: false, message: "Email dan password wajib diisi." });
      return;
    }

    // Fetch user by email
    const [rows] = await pool.execute(
      "SELECT id, email, password_hash, full_name FROM users WHERE email = ? LIMIT 1",
      [email.toLowerCase().trim()],
    );
    const users = rows as Array<{
      id: number;
      email: string;
      password_hash: string;
      full_name: string;
    }>;

    if (users.length === 0) {
      res.status(401).json({ success: false, message: "Email atau password salah." });
      return;
    }

    const user = users[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      res.status(401).json({ success: false, message: "Email atau password salah." });
      return;
    }

    // Update last_login
    await pool.execute("UPDATE users SET last_login = NOW() WHERE id = ?", [user.id]);

    // Sign JWT
    const secret = process.env.JWT_SECRET ?? "secret";
    const expiresIn = (process.env.JWT_EXPIRES_IN ?? "7d") as jwt.SignOptions["expiresIn"];
    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      fullName: user.full_name,
    };
    const token = jwt.sign(payload, secret, { expiresIn });

    // Set httpOnly cookie (optional, alongside JSON response)
    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "strict" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    });

    res.json({
      success: true,
      message: "Login berhasil.",
      token,
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
