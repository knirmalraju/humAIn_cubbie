import { NextResponse } from "next/server";
import { RuleError, studentChat, viewFor } from "@/lib/engine";
import { findBySeatToken } from "@/lib/store";
export const runtime = "nodejs";
type Params = { params: Promise<{ token: string }> };
export async function GET(_req: Request, { params }: Params) {
  const found = findBySeatToken((await params).token);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(viewFor(found.room, found.seat));
}
export async function POST(req: Request, { params }: Params) {
  const found = findBySeatToken((await params).token);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => null);
  if (body?.action !== "chat" || typeof body.text !== "string" || !body.text.trim() || body.text.length > 2000) {
    return NextResponse.json({ error: "Send a chat message of 1–2000 characters. Approvals and changes must be sent as messages." }, { status: 400 });
  }
  try { await studentChat(found.room, found.seat, body.text.trim()); }
  catch (error) {
    if (error instanceof RuleError) return NextResponse.json({ error: error.message, view: viewFor(found.room, found.seat) }, { status: 409 });
    throw error;
  }
  return NextResponse.json(viewFor(found.room, found.seat));
}
