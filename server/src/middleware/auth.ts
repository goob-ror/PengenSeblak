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

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET tidak diset di production. Server configuration error.");
    }
    return "dev-secret-CHANGE-IN-PRODUCTION";
  }
  return secret;
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
    const decoded = jwt.verify(token, getSecret()) as JwtPayload;

    // Validate required fields — never trust deserialized data blindly
    if (
      typeof decoded.userId !== "number" ||
      typeof decoded.email !== "string" ||
      typeof decoded.fullName !== "string"
    ) {
      res.status(401).json({ success: false, message: "Token tidak valid." });
      return;
    }

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      fullName: decoded.fullName,
    };
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ success: false, message: "Sesi sudah berakhir. Silakan login kembali." });
    } else {
      res.status(401).json({ success: false, message: "Token tidak valid atau sudah kedaluwarsa." });
    }
  }
}
