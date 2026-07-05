import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Raised when a URL is rejected before any network request is made. */
export class UnsafeUrlError extends Error {}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n))) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // "this network"
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const addr = ip.toLowerCase().split("%")[0]!;
  if (addr === "::1" || addr === "::") return true; // loopback / unspecified
  if (addr.startsWith("fe80")) return true; // link-local
  if (addr.startsWith("fc") || addr.startsWith("fd")) return true; // unique-local fc00::/7
  // IPv4-mapped (::ffff:a.b.c.d) — validate the embedded v4.
  const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (mapped) return isPrivateIpv4(mapped[1]!);
  return false;
}

/** True when an IP literal is in a private/loopback/link-local/reserved range. */
export function isPrivateIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPrivateIpv4(ip);
  if (kind === 6) return isPrivateIpv6(ip);
  return true; // not a valid IP — treat as unsafe
}

/**
 * Validate a URL is a public http(s) target and resolve its host to a public IP.
 * Throws {@link UnsafeUrlError} for non-http(s) schemes, malformed URLs, or hosts
 * that resolve into private/loopback/link-local/reserved ranges (SSRF guard).
 * Returns the parsed URL on success.
 */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError(`Not a valid URL: ${rawUrl}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError(`Only http(s) URLs are allowed, got ${url.protocol}`);
  }
  const host = url.hostname;
  // A bare IP literal is checked directly; a hostname is resolved and every
  // returned address must be public (guards DNS rebinding to a private range).
  if (isIP(host)) {
    if (isPrivateIp(host)) {
      throw new UnsafeUrlError(`Refusing to reach a private address: ${host}`);
    }
    return url;
  }
  if (host.toLowerCase() === "localhost" || host.toLowerCase().endsWith(".localhost")) {
    throw new UnsafeUrlError("Refusing to reach localhost");
  }
  let records: { address: string }[];
  try {
    records = await lookup(host, { all: true });
  } catch {
    throw new UnsafeUrlError(`Could not resolve host: ${host}`);
  }
  if (records.length === 0) {
    throw new UnsafeUrlError(`Host did not resolve: ${host}`);
  }
  for (const { address } of records) {
    if (isPrivateIp(address)) {
      throw new UnsafeUrlError(
        `Refusing to reach a private address for ${host}: ${address}`,
      );
    }
  }
  return url;
}
