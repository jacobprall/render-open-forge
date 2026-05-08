import { lookup } from "node:dns/promises";

/**
 * SSRF hardening for agent-initiated HTTP fetches.
 * Blocks loopback, link-local, private-space hostnames, and sandbox host.
 * Also resolves DNS to catch rebinding attacks where a public hostname resolves
 * to an internal IP.
 */
export async function assertSafeHttpUrl(urlString: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error("Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed");
  }

  const hostname = url.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "0.0.0.0"
  ) {
    throw new Error("Host is not allowed");
  }

  if (hostname === "::1" || hostname.startsWith("::ffff:")) {
    throw new Error("Address is not allowed");
  }

  const sandbox = process.env.SANDBOX_SERVICE_HOST?.split(":")[0]?.toLowerCase();
  if (sandbox && hostname === sandbox) {
    throw new Error("Host is not allowed");
  }

  // Check if the hostname is a literal IP address
  const v4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    assertNotPrivateIPv4(Number(v4[1]), Number(v4[2]));
  }

  const defaultPort = url.protocol === "https:" ? "443" : "80";
  const effectivePort = url.port || defaultPort;
  if (effectivePort !== "80" && effectivePort !== "443" && effectivePort !== "8080" && effectivePort !== "8443") {
    throw new Error("URL port is not allowed");
  }

  // DNS rebinding protection: resolve hostname and verify the resolved IP
  if (!v4) {
    try {
      const { address } = await lookup(hostname);
      const resolved = address.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
      if (resolved) {
        assertNotPrivateIPv4(Number(resolved[1]), Number(resolved[2]));
      }
      if (address === "::1" || address.startsWith("::ffff:127.")) {
        throw new Error("Resolved address is not allowed");
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("not allowed")) {
        throw err;
      }
      throw new Error("DNS resolution failed for URL");
    }
  }

  return url;
}

function assertNotPrivateIPv4(a: number, b: number): void {
  if (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  ) {
    throw new Error("Address is not allowed");
  }
}
