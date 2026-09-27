/**
 * Optional ngrok tunnel, started automatically when NGROK_AUTHTOKEN is set.
 * ==========================================================================
 * WHY THIS EXISTS: previously ngrok had to be started manually in a separate
 * terminal (`ngrok start pengenseblak`), which caused confusion when the
 * tunnel silently died or when an orphaned agent kept the endpoint online
 * (ERR_NGROK_334) and blocked a new tunnel from binding.
 *
 * BEHAVIOR:
 *   • No NGROK_AUTHTOKEN → silently skipped (local dev unchanged).
 *   • Token present → tunnel opened on PORT, public URL logged on boot.
 *
 * CONFIG (.env, project root — server reads ../../../.env):
 *   NGROK_AUTHTOKEN           the ngrok authtoken
 *   NGROK_DOMAIN              (optional) reserved custom domain. When set the
 *                             tunnel binds to that fixed URL instead of getting
 *                             a random one. Requires a paid ngrok plan.
 *   NGROK_ENABLED             set "false" to force-disable even with a token
 *
 * The tunnel is intentionally fire-and-forget: if ngrok fails, the Express
 * server keeps running locally. A dead tunnel must never take the API down.
 */

import * as ngrok from "@ngrok/ngrok";

export interface NgrokTunnelInfo {
  url: string;
  addr: string;
  domain?: string;
}

let activeTunnel: NgrokTunnelInfo | null = null;

/**
 * Opens the tunnel. Never rejects — failures are logged and swallowed so the
 * API stays up. Returns the public URL when successful, else null.
 */
export async function startNgrokTunnel(
  port: number = Number(process.env.PORT ?? 3001),
): Promise<NgrokTunnelInfo | null> {
  const token = process.env.NGROK_AUTHTOKEN;
  const enabled = process.env.NGROK_ENABLED !== "false";

  if (!enabled) {
    console.log("[ngrok] NGROK_ENABLED=false — tunnel dinonaktifkan.");
    return null;
  }

  if (!token) {
    console.log(
      "[ngrok] NGROK_AUTHTOKEN tidak diset — tunnel dilewati (lokal saja).",
    );
    return null;
  }

  try {
    // If a domain is pinned, use it (stable URL across restarts).
    const domain = process.env.NGROK_DOMAIN?.trim();

    const listener = await ngrok.forward({
      addr: port,
      authtoken: token,
      ...(domain ? { domain } : {}),
    });

    const url = listener.url() ?? "(unknown)";

    activeTunnel = { url, addr: String(port), domain: domain || undefined };

    console.log("\n" + "═".repeat(64));
    console.log("  🌐  ngrok tunnel aktif");
    console.log(`  Public URL : ${url}`);
    console.log(`  Local      : http://localhost:${port}`);
    if (domain) console.log(`  Domain     : ${domain} (reserved)`);
    console.log("═".repeat(64));
    console.log(
      "  Tambahkan host ini ke vite.config.ts → server.allowedHosts\n",
    );

    return activeTunnel;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[ngrok] Gagal membuka tunnel: ${msg}\n` +
        `         Server tetap berjalan di http://localhost:${port}`,
    );
    return null;
  }
}

/** Returns the currently active tunnel info (null if none). */
export function getNgrokTunnel(): NgrokTunnelInfo | null {
  return activeTunnel;
}

/**
 * Closes the tunnel. Called on graceful shutdown so a restarted server doesn't
 * collide with an orphaned endpoint still holding the URL upstream.
 */
export async function stopNgrokTunnel(): Promise<void> {
  if (!activeTunnel) return;
  try {
    await ngrok.disconnect();
    console.log("[ngrok] Tunnel ditutup.");
  } catch {
    /* best effort — process may already be exiting */
  } finally {
    activeTunnel = null;
  }
}
