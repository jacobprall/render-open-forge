import { tool } from "ai";
import { z } from "zod";
import { assertSafeHttpUrl } from "../url-safety";

const MAX_BODY_LENGTH = 10_000;

function assertWebFetchContentTypeOk(contentType: string | null): void {
  if (!contentType) return;
  const base = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (
    base.startsWith("text/") ||
    base === "application/json" ||
    base === "application/xml" ||
    base.endsWith("+json") ||
    base.endsWith("+xml") ||
    base === "application/javascript"
  ) {
    return;
  }
  throw new Error(`Unsupported Content-Type: ${base}`);
}

const webFetchInputSchema = z.object({
  url: z.string().url().describe("The URL to fetch"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional().describe("Request body for POST/PUT/PATCH"),
});

export const webFetchTool = tool({
  description: `Fetch a URL from the web and return the response body as text. Responses must be text-oriented; binary types are rejected. Body truncated to ${MAX_BODY_LENGTH} characters.`,
  inputSchema: webFetchInputSchema,
  execute: async ({ url, method = "GET", headers, body }) => {
    try {
      const safeUrl = assertSafeHttpUrl(url);
      let currentUrl = safeUrl.toString();
      let res: Response | undefined;

      for (let hop = 0; hop <= 5; hop++) {
        res = await fetch(currentUrl, {
          method,
          headers: headers as HeadersInit | undefined,
          body: body && method !== "GET" && method !== "HEAD" ? body : undefined,
          signal: AbortSignal.timeout(30_000),
          redirect: "manual",
        });

        if (res.status >= 300 && res.status < 400) {
          const loc = res.headers.get("location");
          if (!loc || hop === 5) {
            return { success: false as const, error: "Too many redirects" };
          }
          currentUrl = new URL(loc, currentUrl).toString();
          assertSafeHttpUrl(currentUrl);
          continue;
        }
        break;
      }

      if (!res) return { success: false as const, error: "No response" };

      assertWebFetchContentTypeOk(res.headers.get("content-type"));
      const text = await res.text();
      const truncated = text.length > MAX_BODY_LENGTH;
      return {
        success: true as const,
        status: res.status,
        body: truncated ? text.slice(0, MAX_BODY_LENGTH) + "… [truncated]" : text,
        truncated,
      };
    } catch (err) {
      return { success: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  },
});
