import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { createForgejoClient } from "@/lib/forgejo/client"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { owner, repo } = await params
  const client = createForgejoClient(session.forgejoToken)

  try {
    const data = await client.listRepoSecrets(owner, repo)
    const secrets = (data.secrets ?? []).map((s) => ({ name: s.name }))
    return NextResponse.json({ secrets })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to list secrets" },
      { status: 502 },
    )
  }
}
