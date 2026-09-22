import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface JwtPayload {
  userId: number;
  email: string;
  fullName: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  // Accept token from Authorization header OR httpOnly cookie
  const authHeader = req.headers["authorization"];
  const tokenFromHeader = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const tokenFromCookie = req.cookies?.token as string | undefined;
  const token = tokenFromHeader ?? tokenFromCookie;

  if (!token) {
    res.status(401).json({ success: false, message: "Token tidak ditemukan. Silakan login." });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET ?? "secret") as JwtPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ success: false, message: "Token tidak valid atau sudah kedaluwarsa." });
  }
}
