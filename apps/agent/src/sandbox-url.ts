/**
 * Replace the host-side Forgejo URL with the Docker-internal service name
 * so git commands running inside the sandbox container can reach Forgejo.
 */
export function rewriteForSandbox(url: string): string {
  const sandboxUrl = process.env.FORGEJO_SANDBOX_URL;
  if (!sandboxUrl) return url;
  const internalUrl = process.env.FORGEJO_INTERNAL_URL ?? process.env.FORGEJO_URL ?? "http://localhost:3000";
  return url.replace(new URL(internalUrl).host, new URL(sandboxUrl).host);
}
