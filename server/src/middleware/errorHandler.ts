import { Request, Response, NextFunction } from "express";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  console.error("[ERROR]", err);
  const status = (err as { status?: number }).status ?? 500;
  const message =
    err instanceof Error
      ? err.message
      : "Terjadi kesalahan pada server. Silakan coba lagi.";
  res.status(status).json({ success: false, message });
}
