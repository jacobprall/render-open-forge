import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, withApiHandler } from "@/lib/api";
import { createForgeProvider } from "@/lib/forgejo/client";

const postBodySchema = z.object({
  name: z.string().min(1),
  value: z.string().min(1),
});

export const GET = withApiHandler({}, async ({ session, params }) => {
  const auth = session!;
  const { org } = params;

  const forge = createForgeProvider(auth.forgejoToken);

  try {
    const secrets = await forge.orgs.secrets.list(org);
    return NextResponse.json({ secrets });
  } catch (e) {
    throw new ApiError(
      "UPSTREAM_ERROR",
      e instanceof Error ? e.message : "Failed to list org secrets",
      502,
    );
  }
});

export const POST = withApiHandler(
  { bodySchema: postBodySchema },
  async ({ session, params, body }) => {
    const auth = session!;
    const { org } = params;

    const forge = createForgeProvider(auth.forgejoToken);
    try {
      await forge.orgs.secrets.set(org, body.name, body.value);
      return NextResponse.json({ ok: true });
    } catch (e) {
      throw new ApiError(
        "UPSTREAM_ERROR",
        e instanceof Error ? e.message : "Failed to create org secret",
        502,
      );
    }
  },
);
