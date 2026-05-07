import { NextResponse } from "next/server";
import { fetchAnthropicModels } from "@/lib/models/anthropic-models";

export async function GET() {
  const models = await fetchAnthropicModels();
  return NextResponse.json({ models });
}
