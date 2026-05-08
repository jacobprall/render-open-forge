import { NextResponse } from "next/server";
import { getPlatform, requireAuth } from "@/lib/platform";

export async function GET() {
  const auth = await requireAuth();
  const result = await getPlatform().models.listModels(auth);
  return NextResponse.json(result);
}
