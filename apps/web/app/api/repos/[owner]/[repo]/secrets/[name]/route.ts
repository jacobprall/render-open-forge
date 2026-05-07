import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { createForgeProvider } from "@/lib/forgejo/client"

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; name: string }> },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { owner, repo, name } = await params

  let body: { value?: string }
  try {
    body = (await req.json()) as { value?: string }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (typeof body.value !== "string" || body.value.length === 0) {
    return NextResponse.json({ error: "Secret value is required" }, { status: 400 })
  }

  const forge = createForgeProvider(session.forgejoToken)

  try {
    await forge.secrets.set(owner, repo, name, body.value)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to set secret" },
      { status: 502 },
    )
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ owner: string; repo: string; name: string }> },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { owner, repo, name } = await params
  const forge = createForgeProvider(session.forgejoToken)

  try {
    await forge.secrets.delete(owner, repo, name)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete secret" },
      { status: 502 },
    )
  }
}
