import { NextResponse } from "next/server";
import {
  MODEL_DEFS,
  filterModelsByCredentialAvailability,
  toModelSummaries,
} from "@render-open-forge/shared";

export async function GET() {
  const available = filterModelsByCredentialAvailability(MODEL_DEFS, {
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
  });

  return NextResponse.json({ models: toModelSummaries(available) });
}
