import "dotenv/config";
import path from "path";

// Load .env from server root
import dotenv from "dotenv";
dotenv.config({ path: path.join(__dirname, "../.env") });

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";

import { testConnection } from "./config/db";
import { errorHandler } from "./middleware/errorHandler";
import authRouter from "./routes/auth";
import healthRouter from "./routes/health";

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

// ─── Security ───────────────────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ?? "*",
    credentials: true,            // allow cookies
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// ─── Rate limiting ──────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Terlalu banyak percobaan login. Coba lagi dalam 15 menit." },
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(generalLimiter);

// ─── Parsers ─────────────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Logging ─────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "test") {
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
}

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use("/api", healthRouter);
app.use("/api/auth", loginLimiter); // apply stricter limit to auth
app.use("/api/auth", authRouter);

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Endpoint tidak ditemukan." });
});

// ─── Global error handler ────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Boot ────────────────────────────────────────────────────────────────────
async function bootstrap() {
  try {
    await testConnection();
    console.log("✅  MySQL terhubung ke database:", process.env.DB_NAME);
  } catch (err) {
    console.error("❌  Gagal terhubung ke MySQL:", err);
    console.warn("⚠️   Server tetap berjalan — pastikan MySQL aktif sebelum menggunakan fitur data.");
  }

  app.listen(PORT, () => {
    console.log(`🚀  Pengen Seblak API berjalan di http://localhost:${PORT}`);
    console.log(`    NODE_ENV  : ${process.env.NODE_ENV ?? "development"}`);
    console.log(`    CLIENT    : ${process.env.CLIENT_ORIGIN ?? "http://localhost:5173"}`);
  });
}

bootstrap();

export default app;
