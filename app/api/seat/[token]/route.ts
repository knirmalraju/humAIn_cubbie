import { NextResponse } from "next/server";
import {
  RuleError,
  approveAgreement,
  approveShare,
  discardAmend,
  markDone,
  nothingWillChange,
  requestAmend,
  retry,
  sendAmend,
  setReminders,
  studentChat,
  viewFor,
} from "@/lib/engine";
import { findBySeatToken } from "@/lib/store";

export const runtime = "nodejs";

type Params = { params: Promise<{ token: string }> };

export async function GET(_req: Request, { params }: Params) {
  const found = findBySeatToken((await params).token);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(viewFor(found.room, found.seat));
}

type Action =
  | { action: "chat"; text: string }
  | { action: "approveShare"; checked: string[] }
  | { action: "nothingWillChange" }
  | { action: "requestAmend"; text: string }
  | { action: "sendAmend" }
  | { action: "discardAmend" }
  | { action: "approve"; version: number }
  | { action: "done"; index: number }
  | { action: "reminders"; on: boolean }
  | { action: "retry" };

export async function POST(req: Request, { params }: Params) {
  const found = findBySeatToken((await params).token);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { room, seat } = found;
  const body = (await req.json().catch(() => null)) as Action | null;
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  try {
    switch (body.action) {
      case "chat": {
        const text = String(body.text ?? "").trim().slice(0, 2000);
        if (!text) throw new RuleError("Say something first.");
        await studentChat(room, seat, text);
        break;
      }
      case "approveShare":
        approveShare(room, seat, Array.isArray(body.checked) ? body.checked.map(String) : []);
        break;
      case "nothingWillChange":
        nothingWillChange(room, seat);
        break;
      case "requestAmend": {
        const text = String(body.text ?? "").trim().slice(0, 1000);
        if (!text) throw new RuleError("Describe the change first.");
        await requestAmend(room, seat, text);
        break;
      }
      case "sendAmend":
        sendAmend(room, seat);
        break;
      case "discardAmend":
        discardAmend(room, seat);
        break;
      case "approve":
        approveAgreement(room, seat, Number(body.version));
        break;
      case "done":
        markDone(room, seat, Number(body.index));
        break;
      case "reminders":
        setReminders(room, seat, Boolean(body.on));
        break;
      case "retry":
        retry(room);
        break;
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof RuleError) return NextResponse.json({ error: err.message, view: viewFor(room, seat) }, { status: 409 });
    throw err;
  }
  return NextResponse.json(viewFor(room, seat));
}
