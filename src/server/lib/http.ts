import type { Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";

/**
 * Client IP: first entry of the configured IP_HEADER (only safe behind a
 * reverse proxy that overwrites it — direct exposure lets clients spoof and
 * evade IP bans / geo-block), else the socket peer address.
 */
export function clientIp(c: Context, ipHeader: string): string {
  if (ipHeader) {
    const first = (c.req.header(ipHeader) ?? "").split(",")[0]?.trim() ?? "";
    if (first) return first;
  }
  try {
    return getConnInfo(c).remote?.address ?? "";
  } catch {
    return "";
  }
}

/** fetch with a hard timeout (abort). Network errors propagate as exceptions. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { redirect: "follow", ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}
