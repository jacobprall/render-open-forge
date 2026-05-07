import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { createForgeProvider } from "@/lib/forgejo/client"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { owner, repo } = await params
  const forge = createForgeProvider(session.forgejoToken)

  try {
    const secrets = await forge.secrets.list(owner, repo)
    return NextResponse.json({ secrets: secrets.map((name) => ({ name })) })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to list secrets" },
      { status: 502 },
    )
  }
}
