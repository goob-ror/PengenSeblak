/**
 * Redis singleton — shared across rate limiting, API cache, and session store.
 * Connects lazily; all consumers should check `redis` for null before using.
 *
 * Usage:
 *   import { redis, isRedisAvailable } from "@/config/redis"
 */
import Redis from "ioredis";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "../../../.env") });

let _client: Redis | null = null;
let _connecting = false;

export async function connectRedis(): Promise<Redis | null> {
  if (_client) return _client;
  if (_connecting) return null;
  _connecting = true;

  try {
    const client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      enableOfflineQueue: false,
      connectTimeout: 3_000,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    await client.connect();
    _client = client;

    _client.on("error", (err: Error) => {
      console.error("[REDIS] Error:", err.message);
    });
    _client.on("close", () => {
      console.warn("[REDIS] Connection closed.");
    });

    console.log("✅  Redis terhubung:", process.env.REDIS_URL ?? "redis://localhost:6379");
    return _client;
  } catch (err) {
    console.warn("⚠️   Redis tidak tersedia — fallback ke in-memory:", (err as Error).message);
    _client = null;
    return null;
  } finally {
    _connecting = false;
  }
}

/** Returns the connected Redis client, or null if unavailable. */
export function getRedis(): Redis | null {
  return _client;
}

/** True after a successful connection. */
export function isRedisAvailable(): boolean {
  return _client !== null && _client.status === "ready";
}
