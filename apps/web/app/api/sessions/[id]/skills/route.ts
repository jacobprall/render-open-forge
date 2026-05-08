import { NextRequest, NextResponse } from "next/server";
import { getPlatform, requireAuth } from "@/lib/platform";
import { AppError } from "@render-open-forge/shared";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [{ id }, auth] = await Promise.all([params, requireAuth()]);

  try {
    const activeSkills = await getPlatform().sessions.getSkills(auth, id);
    return NextResponse.json({ activeSkills });
  } catch (err) {
    if (err instanceof Response) throw err;
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    }
    throw err;
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [{ id }, auth] = await Promise.all([params, requireAuth()]);

  const body = await req.json();
  const activeSkills = body.activeSkills;
  if (!Array.isArray(activeSkills)) {
    return NextResponse.json({ error: "activeSkills array required" }, { status: 400 });
  }

  try {
    await getPlatform().sessions.updateSkills(auth, id, activeSkills);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof Response) throw err;
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    }
    throw err;
  }
}
