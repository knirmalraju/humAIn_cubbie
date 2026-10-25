import { NextResponse } from "next/server";
import { createRoom } from "@/lib/engine";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({})) ?? {}) as { names?: string[]; demo?: boolean };
  const demo = Boolean(body.demo);
  const names = (demo ? ["Max", "Jordan", "Sam"] : (Array.isArray(body.names) ? body.names : []).map((n) => String(n ?? "").trim().slice(0, 40))) as string[];
  if (names.length !== 3 || names.some((n) => !n)) return NextResponse.json({ error: "Enter all three names." }, { status: 400 });
  if (new Set(names.map((n) => n.toLowerCase())).size !== 3) return NextResponse.json({ error: "Use three different names." }, { status: 400 });
  const room = createRoom(names as [string, string, string], demo, "campus");
  return NextResponse.json({ a: room.seats.a.token, b: room.seats.b.token, c: room.seats.c.token, demo: room.demoToken });
}
