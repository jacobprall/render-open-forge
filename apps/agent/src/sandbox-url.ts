/**
 * Replace the host-side Forgejo URL with the Docker-internal service name
 * so git commands running inside the sandbox container can reach Forgejo.
 *
 * Only applies to URLs that match the internal Forgejo host. External
 * forge URLs (GitHub, GitLab) pass through unchanged.
 */
export function rewriteForSandbox(url: string): string {
  const sandboxUrl = process.env.FORGEJO_SANDBOX_URL;
  if (!sandboxUrl) return url;
  const internalUrl = process.env.FORGEJO_INTERNAL_URL ?? process.env.FORGEJO_URL ?? "http://localhost:3000";
  const internalHost = new URL(internalUrl).host;
  if (!url.includes(internalHost)) return url;
  return url.replace(internalHost, new URL(sandboxUrl).host);
}
