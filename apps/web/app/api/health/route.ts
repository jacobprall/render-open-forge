import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "ok", service: "forge-web" });
}
