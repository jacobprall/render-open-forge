import { NextRequest, NextResponse } from "next/server";
import { getPlatform, requireAuth } from "@/lib/platform";
import { handlePlatformError, parseJsonBody } from "@/lib/api/errors";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  const { id } = await params;

  const body = await parseJsonBody<Record<string, unknown>>(req);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Expected JSON object" }, { status: 400 });
  }

  const shallow =
    typeof body.projectConfigPatch === "object" && body.projectConfigPatch !== null
      ? (body.projectConfigPatch as Record<string, unknown>)
      : typeof body.projectConfig === "object" && body.projectConfig !== null
        ? (body.projectConfig as Record<string, unknown>)
        : null;

  if (!shallow) {
    return NextResponse.json({ error: "Provide projectConfig or projectConfigPatch object" }, { status: 400 });
  }

  try {
    const projectConfig = await getPlatform().sessions.updateConfig(auth, id, shallow);
    return NextResponse.json({ success: true, projectConfig });
  } catch (err) {
    return handlePlatformError(err);
  }
}
