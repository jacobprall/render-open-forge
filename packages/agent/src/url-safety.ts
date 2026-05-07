/**
 * SSRF hardening for agent-initiated HTTP fetches.
 * Blocks loopback, link-local, private-space hostnames, and sandbox host.
 */
export function assertSafeHttpUrl(urlString: string): URL {
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

  const v4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
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

  const defaultPort = url.protocol === "https:" ? "443" : "80";
  const effectivePort = url.port || defaultPort;
  if (effectivePort !== "80" && effectivePort !== "443") {
    throw new Error("URL port is not allowed");
  }

  return url;
}
