/**
 * Canonical href for a session-linked pull request.
 * Prefers upstream (e.g. GitHub) URL, then Forgejo public origin when configured, else internal app path.
 */
export function agentSessionPullHref(args: {
  repoPath: string | null | undefined;
  prNumber: number | null | undefined;
  upstreamPrUrl?: string | null;
  forgejoWebOrigin?: string | null;
}): string {
  if (args.prNumber == null) return "#";
  const upstream = args.upstreamPrUrl?.trim();
  if (upstream) return upstream;
  const rp = args.repoPath?.trim();
  if (!rp) return "#";
  const base = args.forgejoWebOrigin?.replace(/\/$/, "").trim();
  if (base) return `${base}/${rp}/pulls/${args.prNumber}`;
  return `/${rp}/pulls/${args.prNumber}`;
}
