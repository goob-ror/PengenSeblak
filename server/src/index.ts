import path from "path";

// Single .env at project root (one level above server/)
import dotenv from "dotenv";
dotenv.config({ path: path.join(__dirname, "../../../.env") });

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import Redis from "ioredis";
import { RedisStore } from "rate-limit-redis";
import crypto from "crypto";

import { testConnection } from "./config/db";
import { errorHandler } from "./middleware/errorHandler";
import authRouter from "./routes/auth";
import healthRouter from "./routes/health";

// ─── Validation guard ────────────────────────────────────────────────────────
if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  console.error("❌  FATAL: JWT_SECRET tidak diset. Server tidak dapat berjalan di production.");
  process.exit(1);
}

const app = express();
const PORT = Number(process.env.PORT ?? 3001);
const isProduction = process.env.NODE_ENV === "production";

// ─── Security headers ────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'"],
        styleSrc:   ["'self'", "'unsafe-inline'"],
        imgSrc:     ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        frameSrc:   ["'none'"],
        objectSrc:  ["'none'"],
      },
    },
    hsts: isProduction
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  }),
);

// ─── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: Origin '${origin}' tidak diizinkan.`));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
    exposedHeaders: ["X-CSRF-Token"],
  }),
);

// ─── Parsers ─────────────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.COOKIE_SECRET ?? process.env.JWT_SECRET ?? "dev-cookie-secret"));

// ─── CSRF double-submit cookie protection ────────────────────────────────────
// The server sets a non-httpOnly csrf_token cookie. Every state-changing
// request must echo that value as X-CSRF-Token. Cross-origin JS cannot read
// cookies from this domain, so only legitimate same-origin code can do this.
app.use((req: Request, res: Response, next: NextFunction) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

  if (!req.cookies["csrf_token"]) {
    // Issue the cookie and let the request through — client will have it on retry
    const token = crypto.randomBytes(32).toString("hex");
    res.cookie("csrf_token", token, {
      httpOnly: false, // must be readable by JS to echo in the header
      secure: isProduction,
      sameSite: isProduction ? "strict" : "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });
    return next();
  }

  const cookieToken = req.cookies["csrf_token"] as string;
  const headerToken  = req.headers["x-csrf-token"] as string | undefined;

  if (!headerToken || headerToken !== cookieToken) {
    res.status(403).json({
      success: false,
      message: "CSRF token tidak valid. Muat ulang halaman dan coba lagi.",
    });
    return;
  }

  next();
});

// ─── Logging ─────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "test") {
  app.use(morgan(isProduction ? "combined" : "dev"));
}

// ─── CSRF provisioning endpoint ───────────────────────────────────────────────
// GET /api/csrf-token — client calls this once on load to receive the csrf_token cookie
app.get("/api/csrf-token", (req: Request, res: Response) => {
  let token = req.cookies["csrf_token"] as string | undefined;
  if (!token) {
    token = crypto.randomBytes(32).toString("hex");
    res.cookie("csrf_token", token, {
      httpOnly: false,
      secure: isProduction,
      sameSite: isProduction ? "strict" : "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });
  }
  res.json({ success: true, csrfToken: token });
});

// ─── Health ───────────────────────────────────────────────────────────────────
app.use("/api", healthRouter);

// ─── Bootstrap (async — registers rate limiters + auth routes after Redis init) ─
async function bootstrap() {
  // 1. Try Redis for distributed rate limiting (optional)
  let redisClient: Redis | null = null;
  try {
    const client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      enableOfflineQueue: false,
      connectTimeout: 3000,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    await client.connect();
    redisClient = client;
    console.log("✅  Redis terhubung — menggunakan Redis rate limit store.");
  } catch {
    console.warn("⚠️   Redis tidak tersedia — menggunakan in-memory rate limit store.");
  }

  // 2. Build rate limiters after Redis is ready
  function buildStore(prefix: string) {
    if (redisClient) {
      return new RedisStore({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sendCommand: (...args: string[]) => (redisClient as any).call(args[0], ...args.slice(1)) as Promise<any>,
        prefix: `rl:${prefix}:`,
      });
    }
    return undefined;
  }

  const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    store: buildStore("general"),
  });

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,                         // 5 failed attempts per 15 min per IP
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests: true,   // only failed attempts count toward the limit
    store: buildStore("login"),
    message: {
      success: false,
      message: "Terlalu banyak percobaan login. Coba lagi dalam 15 menit.",
    },
    handler: (req, res, _next, options) => {
      console.warn(`[RATE-LIMIT] Login blocked — IP: ${req.ip}, UA: ${req.headers["user-agent"]}`);
      res.status(429).json(options.message);
    },
  });

  // 3. Register limiters + auth routes (before 404 handler)
  app.use(generalLimiter);
  app.use("/api/auth", loginLimiter);
  app.use("/api/auth", authRouter);

  // 4. 404 catch-all (after all routes are registered)
  app.use((_req, res) => {
    res.status(404).json({ success: false, message: "Endpoint tidak ditemukan." });
  });

  // 5. Global error handler (must be last)
  app.use(errorHandler);

  // 6. Connect to MySQL
  try {
    await testConnection();
    console.log("✅  MySQL terhubung ke database:", process.env.DB_NAME);
  } catch (err) {
    console.error("❌  Gagal terhubung ke MySQL:", err);
    console.warn("⚠️   Server tetap berjalan — pastikan MySQL aktif sebelum menggunakan fitur data.");
  }

  // 7. Start server
  app.listen(PORT, () => {
    console.log(`🚀  Pengen Seblak API berjalan di http://localhost:${PORT}`);
    console.log(`    NODE_ENV  : ${process.env.NODE_ENV ?? "development"}`);
    console.log(`    CLIENT    : ${allowedOrigins.join(", ")}`);
    console.log(`    REDIS     : ${redisClient ? "connected" : "in-memory fallback"}`);
  });
}

bootstrap();

export default app;
