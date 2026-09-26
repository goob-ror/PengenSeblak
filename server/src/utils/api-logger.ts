/**
 * API Response Logger Utility
 * 
 * Logs all Sectors API responses to JSON files for:
 * 1. Reuse during development (avoid burning API credits)
 * 2. Debugging and troubleshooting
 * 3. Historical data analysis
 * 4. Mock data generation for tests
 * 
 * Follows AGENTS.md principle: "Mode Pengembangan: Gunakan data mock atau local cache"
 * 
 * Directory structure:
 *   server/data/logs/
 *     ├── 2026-09-23/
 *     │   ├── index-daily_ihsg_14-30-05.json
 *     │   ├── foreign-flow_IHSG_14-30-06.json
 *     │   └── ...
 */

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

// Base directory for API logs
// Path: server/src/utils/api-logger.ts → server/data/api-logs
const LOG_BASE_DIR = path.join(__dirname, "../../data/api-logs");

/**
 * Ensures the log directory exists for a given date
 */
async function ensureLogDir(date: Date): Promise<string> {
  const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD
  const dir = path.join(LOG_BASE_DIR, dateStr);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Generates a safe filename for the API response log
 * Format: endpoint_timestamp_hash.json
 * Example: foreign-flow_IHSG_14-30-05_a3f2c1.json
 */
function generateLogFileName(
  endpoint: string,
  queryParams: Record<string, unknown>,
  timestamp: Date,
): string {
  // Sanitize endpoint for filename
  const safeEndpoint = endpoint
    .replace(/^\//, "")
    .replace(/\/$/, "")
    .replace(/\//g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "");
  
  // Create hash of query params for uniqueness
  const queryHash = crypto
    .createHash("md5")
    .update(JSON.stringify(queryParams))
    .digest("hex")
    .slice(0, 6);
  
  // Timestamp for ordering
  const timeStr = timestamp.toTimeString().slice(0, 8).replace(/:/g, "-");
  
  return `${safeEndpoint}_${timeStr}_${queryHash}.json`;
}

/**
 * Metadata added to each logged response
 */
interface LogMetadata {
  logged_at: string;
  endpoint: string;
  query_params: Record<string, unknown>;
  http_status: number;
  credits_used: number;
  cache_hit: boolean;
  response_time_ms?: number;
}

/**
 * Logs an API response to a JSON file
 * 
 * @param endpoint - API endpoint path (e.g., "/foreign-flow/IHSG/")
 * @param queryParams - Query parameters used
 * @param responseData - Response body from API
 * @param metadata - Additional metadata (status, credits, cache status)
 */
export async function logApiResponse(
  endpoint: string,
  queryParams: Record<string, unknown>,
  responseData: unknown,
  metadata: {
    http_status: number;
    credits_used: number;
    cache_hit: boolean;
    response_time_ms?: number;
  },
): Promise<void> {
  try {
    const now = new Date();
    const logDir = await ensureLogDir(now);
    const fileName = generateLogFileName(endpoint, queryParams, now);
    const filePath = path.join(logDir, fileName);
    
    const logEntry = {
      _metadata: {
        logged_at: now.toISOString(),
        endpoint,
        query_params: queryParams,
        http_status: metadata.http_status,
        credits_used: metadata.credits_used,
        cache_hit: metadata.cache_hit,
        response_time_ms: metadata.response_time_ms,
      } as LogMetadata,
      data: responseData,
    };
    
    await fs.writeFile(
      filePath,
      JSON.stringify(logEntry, null, 2),
      "utf-8",
    );
    
    // Log to console for visibility
    console.log(
      `[API_LOG] ${metadata.cache_hit ? "CACHE" : "FRESH"} ${endpoint} → ${fileName}`,
    );
  } catch (err) {
    // Non-fatal — don't let logging break the request
    console.warn("[API_LOG] Failed to log response:", (err as Error).message);
  }
}

/**
 * Retrieves a logged API response by endpoint and params
 * Useful for development/testing without hitting the API
 * 
 * @param endpoint - API endpoint path
 * @param queryParams - Query parameters
 * @param dateStr - Optional date string (YYYY-MM-DD), defaults to today
 */
export async function getLoggedResponse(
  endpoint: string,
  queryParams: Record<string, unknown>,
  dateStr?: string,
): Promise<{ data: unknown; metadata: LogMetadata } | null> {
  try {
    const date = dateStr ? new Date(dateStr) : new Date();
    const logDir = await ensureLogDir(date);
    
    // Find the most recent log file for this endpoint+params
    const files = await fs.readdir(logDir);
    const safeEndpoint = endpoint
      .replace(/^\//, "")
      .replace(/\/$/, "")
      .replace(/\//g, "_")
      .replace(/[^a-zA-Z0-9_-]/g, "");
    
    const queryHash = crypto
      .createHash("md5")
      .update(JSON.stringify(queryParams))
      .digest("hex")
      .slice(0, 6);
    
    const matchingFile = files
      .filter(f => f.includes(`${safeEndpoint}_`) && f.includes(`_${queryHash}.json`))
      .sort()
      .pop(); // Most recent
    
    if (!matchingFile) return null;
    
    const raw = await fs.readFile(path.join(logDir, matchingFile), "utf-8");
    const parsed = JSON.parse(raw);
    
    return {
      data: parsed.data,
      metadata: parsed._metadata as LogMetadata,
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("[API_LOG] Failed to read log:", (err as Error).message);
    }
    return null;
  }
}

/**
 * Lists all logged responses for a given date
 */
export async function listLoggedResponses(
  dateStr?: string,
): Promise<Array<{ filename: string; metadata: LogMetadata }>> {
  try {
    const date = dateStr ? new Date(dateStr) : new Date();
    const logDir = await ensureLogDir(date);
    const files = await fs.readdir(logDir);
    
    const results: Array<{ filename: string; metadata: LogMetadata }> = [];
    
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      
      try {
        const raw = await fs.readFile(path.join(logDir, file), "utf-8");
        const parsed = JSON.parse(raw);
        results.push({
          filename: file,
          metadata: parsed._metadata as LogMetadata,
        });
      } catch {
        // Skip malformed files
      }
    }
    
    return results.sort((a, b) => a.filename.localeCompare(b.filename));
  } catch (err) {
    console.warn("[API_LOG] Failed to list logs:", (err as Error).message);
    return [];
  }
}
