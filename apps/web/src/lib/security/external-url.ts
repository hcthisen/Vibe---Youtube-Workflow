import dns from "node:dns/promises";
import net from "node:net";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
]);

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home"];
const ALLOWED_PORTS = new Set([80, 443]);

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b, c, d] = parts;

  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 198 && b === 18) return true;
  if (a === 198 && b === 19) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;
  if (a === 255 && b === 255 && c === 255 && d === 255) return true;

  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe80")) return true;
  if (normalized.startsWith("ff")) return true;
  if (normalized.startsWith("2001:db8")) return true;
  if (normalized.startsWith("::ffff:")) {
    const v4 = normalized.replace("::ffff:", "");
    return isPrivateIpv4(v4);
  }
  return false;
}

function isPrivateIp(ip: string): boolean {
  const type = net.isIP(ip);
  if (type === 4) return isPrivateIpv4(ip);
  if (type === 6) return isPrivateIpv6(ip);
  return true;
}

async function isPublicHost(hostname: string): Promise<boolean> {
  const normalized = hostname.replace(/\.$/, "").toLowerCase();
  if (!normalized) return false;

  if (BLOCKED_HOSTS.has(normalized)) return false;
  if (BLOCKED_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) return false;

  if (net.isIP(normalized)) {
    return !isPrivateIp(normalized);
  }

  try {
    const records = await dns.lookup(normalized, { all: true, verbatim: true });
    if (!records.length) return false;
    return records.every((record) => !isPrivateIp(record.address));
  } catch {
    return false;
  }
}

export async function validateExternalUrl(rawUrl: string): Promise<{
  ok: boolean;
  reason?: string;
  normalizedUrl?: string;
}> {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "Only http/https URLs are allowed" };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, reason: "Credentials in URL are not allowed" };
  }

  if (parsed.port && !ALLOWED_PORTS.has(Number(parsed.port))) {
    return { ok: false, reason: "Only ports 80 and 443 are allowed" };
  }

  const hostOk = await isPublicHost(parsed.hostname);
  if (!hostOk) {
    return { ok: false, reason: "URL resolves to a private or invalid address" };
  }

  return { ok: true, normalizedUrl: parsed.toString() };
}
