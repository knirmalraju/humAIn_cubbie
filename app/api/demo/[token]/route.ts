import { NextResponse } from "next/server";
import { findByDemoToken } from "@/lib/store";

export const runtime = "nodejs";

// Demo rooms use fictional people, so the demo view may hold every seat link.
// Real rooms have no demo token and never expose one seat to the other.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const room = findByDemoToken((await params).token);
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ a: room.seats.a.token, b: room.seats.b.token, c: room.seats.c.token });
}
