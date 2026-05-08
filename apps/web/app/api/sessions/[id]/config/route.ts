import { NextRequest, NextResponse } from "next/server";
import { getPlatform, requireAuth } from "@/lib/platform";
import { isPlatformError } from "@/lib/api/errors";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Expected JSON object" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const shallow =
    typeof b.projectConfigPatch === "object" && b.projectConfigPatch !== null
      ? (b.projectConfigPatch as Record<string, unknown>)
      : typeof b.projectConfig === "object" && b.projectConfig !== null
        ? (b.projectConfig as Record<string, unknown>)
        : null;

  if (!shallow) {
    return NextResponse.json({ error: "Provide projectConfig or projectConfigPatch object" }, { status: 400 });
  }

  try {
    const projectConfig = await getPlatform().sessions.updateConfig(auth, id, shallow);
    return NextResponse.json({ success: true, projectConfig });
  } catch (err) {
    if (err instanceof Response) throw err;
    if (isPlatformError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    }
    throw err;
  }
}
