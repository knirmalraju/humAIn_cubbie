// Checks the rules RoomPeace must keep no matter what the model says,
// using scripted agents in place of Gemini. Run: npm run check
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.ROOMPEACE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "roompeace-check-"));

const { buildNegotiatorPrompt } = await import("../lib/agents");
type NegotiationMove = import("../lib/agents").NegotiationMove;
const engine = await import("../lib/engine");
const { RuleError, agents, approveAgreement, approveShare, createRoom, markDone, nothingWillChange, requestAmend, sendAmend, settle, studentChat } = engine;
import type { Room, Seat, Task } from "../lib/types";

const SEATS: Seat[] = ["a", "b", "c"];
const COMPLAINT = "Complaint: hair left in the sink last week";
const REASON = "Why: CS 220 problem set due tonight";
const SAM_COMPLAINT = "Complaint: wet towels on the floor";
const PRIVATE_CHAT = "I'm still annoyed about the hair in the sink";

const t = (seat: Seat, task: string, due: string, dueIso = "2026-10-30T12:00:00-07:00"): Task => ({ seat, task, due, dueIso });
const tomorrow = [t("a", "Clean the bathroom", "Tomorrow")];
// Listed out of order on purpose: the rotation follows the deadlines (Max Thu → Jordan Sat → Sam Tue).
const rotation = [
  t("b", "Take Saturday", "Sat by noon", "2026-10-31T12:00:00-07:00"),
  t("a", "Clean today", "Today before 6 PM", "2026-10-29T18:00:00-07:00"),
  t("c", "Take Tuesday", "Tue by 6 PM", "2026-11-03T18:00:00-07:00"),
];

agents.hasApiKey = () => true;
agents.runIntake = async (_room, seat) => ({
  reply: "Here's what I'd share.",
  items:
    seat === "a"
      ? [
          { text: "Maya isn't available tonight", kind: "availability" },
          { text: "Maya can clean Saturday", kind: "flexibility" },
          { text: REASON, kind: "reason" },
          { text: COMPLAINT, kind: "complaint" },
        ]
      : seat === "b"
        ? [{ text: "Bathroom must be clean before 6 PM today", kind: "constraint" }]
        : [{ text: "Sam is away this weekend", kind: "availability" }, { text: SAM_COMPLAINT, kind: "complaint" }],
});
agents.runAmend = async (room) => ({
  tasks: room.agreement!.tasks.map((x) => (x.seat === "b" ? { ...x, due: "Today before 5:30 PM" } : x)),
  note: "Jordan's clean moves to 5:30 PM.",
  reply: "Drafted.",
});

/** Plays the scripted moves in order and records which seat was asked each time. */
let calls: Seat[] = [];
function script(moves: (() => NegotiationMove)[]) {
  let i = 0;
  calls = [];
  agents.runNegotiator = async (_room, seat) => {
    calls.push(seat);
    return moves[Math.min(i++, moves.length - 1)]();
  };
}
const propose = (tasks: Task[]) => (): NegotiationMove => ({ action: "propose", message: "Proposal.", note: "Proposed.", tasks });
const counter = (tasks: Task[]) => (): NegotiationMove => ({ action: "counter", message: "That breaks a deadline.", note: "Countered.", tasks });
const accept = (): NegotiationMove => ({ action: "accept", message: "Works.", note: "Accepted.", tasks: null });

async function shareAll(room: Room) {
  for (const seat of SEATS) {
    await studentChat(room, seat, seat === "a" ? `My turn, but assignment tonight. ${PRIVATE_CHAT}.` : "Here's my situation.");
    const pending = room.seats[seat].pending!;
    approveShare(room, seat, pending.filter((p) => p.checked).map((p) => p.id));
  }
  await settle(room);
}
const newRoom = () => createRoom(["Max", "Jordan", "Sam"], true);

const results: string[] = [];
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  results.push(`ok  ${name}`);
}

await check("reasons and complaints are unchecked by default", async () => {
  script([propose(rotation), accept, accept]);
  const room = newRoom();
  await studentChat(room, "a", PRIVATE_CHAT);
  const pending = room.seats.a.pending!;
  assert.equal(pending.find((p) => p.text === COMPLAINT)!.checked, false);
  assert.equal(pending.find((p) => p.text === REASON)!.checked, false);
  assert.equal(pending.find((p) => p.kind === "availability")!.checked, true);
});

await check("negotiation waits until all three students have shared", async () => {
  script([propose(rotation), accept, accept]);
  const room = newRoom();
  for (const seat of ["a", "b"] as Seat[]) {
    await studentChat(room, seat, "hi");
    approveShare(room, seat, room.seats[seat].pending!.filter((p) => p.checked).map((p) => p.id));
  }
  await settle(room);
  assert.equal(room.status, "intake");
  assert.equal(calls.length, 0);
});

await check("negotiators see only approved facts, never private chat or unapproved items", async () => {
  script([propose(rotation), accept, accept]);
  const room = newRoom();
  await shareAll(room);
  for (const seat of SEATS) {
    const { system, user } = buildNegotiatorPrompt(room, seat);
    for (const secret of [COMPLAINT, REASON, SAM_COMPLAINT, PRIVATE_CHAT]) {
      assert.ok(!system.includes(secret) && !user.includes(secret), `negotiator ${seat} saw "${secret}"`);
    }
  }
  const shared = JSON.stringify(room.exchange);
  assert.ok(!shared.includes("hair") && !shared.includes("towels"));
});

await check("an explicitly approved reason is shared", async () => {
  script([propose(rotation), accept, accept]);
  const room = newRoom();
  await studentChat(room, "a", "hi");
  approveShare(room, "a", room.seats.a.pending!.map((p) => p.id));
  assert.ok(buildNegotiatorPrompt(room, "c").user.includes(REASON));
});

await check("a draft needs BOTH other agents to accept; nobody is committed", async () => {
  script([propose(rotation), accept, counter(tomorrow), accept, accept]);
  const room = newRoom();
  await shareAll(room);
  // Jordan's agent accepted proposal 1 but Sam's countered, so proposal 1 never became a draft.
  assert.equal(room.agreement!.tasks, tomorrow, "the draft is the counteroffer both others accepted");
  assert.equal(room.exchange.filter((e) => e.kind === "accept").length, 3);
  assert.equal(room.status, "awaiting_approval");
  approveAgreement(room, "a", 1);
  approveAgreement(room, "b", 1);
  assert.equal(room.status, "awaiting_approval", "two of three approvals must not confirm");
});

await check("an agent is never asked to answer its own proposal", async () => {
  script([propose(rotation), accept, counter(tomorrow), accept, accept]);
  const room = newRoom();
  await shareAll(room);
  // a proposes → b accepts → c counters → (a, b answer c's counter)
  assert.deepEqual(calls, ["a", "b", "c", "a", "b"]);
});

await check("editing invalidates earlier approvals; only the same version confirms", async () => {
  script([propose(rotation), accept, accept]);
  const room = newRoom();
  await shareAll(room);
  approveAgreement(room, "a", 1);
  approveAgreement(room, "c", 1);
  await requestAmend(room, "b", "Can I finish by 5:30?");
  sendAmend(room, "b");
  assert.equal(room.agreement!.version, 2);
  approveAgreement(room, "b", 2);
  assert.equal(room.status, "awaiting_approval", "v1 + v2 approvals must not confirm");
  assert.throws(() => approveAgreement(room, "a", 1), RuleError, "stale page can't approve");
  approveAgreement(room, "a", 2);
  assert.equal(room.status, "awaiting_approval", "Sam hasn't approved v2");
  approveAgreement(room, "c", 2);
  assert.equal(room.status, "confirmed");
});

await check("each student can only mark their own task done", async () => {
  script([propose(rotation), accept, accept]);
  const room = newRoom();
  await shareAll(room);
  SEATS.forEach((s) => approveAgreement(room, s, 1));
  const mayaTask = room.agreement!.tasks.findIndex((x) => x.seat === "a");
  assert.throws(() => markDone(room, "c", mayaTask), RuleError);
  markDone(room, "a", mayaTask);
  assert.equal(room.agreement!.done[mayaTask], true);
});

await check("three declined proposals pause and ask everyone", async () => {
  script([propose(tomorrow), counter(rotation), counter(tomorrow), counter(rotation), accept]);
  const room = newRoom();
  await shareAll(room);
  assert.equal(room.status, "paused");
  assert.equal(room.declined, 3);
  assert.equal(room.agreement, null);
});

await check("if nobody can change anything, the result is no agreement", async () => {
  script([propose(tomorrow), counter(rotation), counter(tomorrow), counter(rotation)]);
  const room = newRoom();
  await shareAll(room);
  nothingWillChange(room, "a");
  nothingWillChange(room, "b");
  assert.equal(room.status, "paused", "must wait for all three answers");
  nothingWillChange(room, "c");
  assert.equal(room.status, "no_agreement");
  assert.equal(room.agreement, null);
});

await check("after a pause, new flexibility starts round 2 and can reach a draft", async () => {
  script([propose(tomorrow), counter(rotation), counter(tomorrow), counter(rotation), propose(rotation), accept, accept]);
  const room = newRoom();
  await shareAll(room);
  nothingWillChange(room, "a");
  nothingWillChange(room, "c");
  await studentChat(room, "b", "I could leave work early.");
  approveShare(room, "b", room.seats.b.pending!.map((p) => p.id));
  await settle(room);
  assert.equal(room.round, 2);
  assert.equal(room.status, "awaiting_approval");
});

await check("three more declines in round 2 end with no agreement", async () => {
  script([propose(tomorrow), counter(rotation), counter(tomorrow), counter(rotation), propose(rotation), counter(tomorrow), counter(rotation), counter(tomorrow)]);
  const room = newRoom();
  await shareAll(room);
  nothingWillChange(room, "a");
  nothingWillChange(room, "c");
  await studentChat(room, "b", "I could leave work early.");
  approveShare(room, "b", room.seats.b.pending!.map((p) => p.id));
  await settle(room);
  assert.equal(room.status, "no_agreement");
});

await check("finishing a turn notifies the other two and tells the next person it's his turn", async () => {
  script([propose(rotation), accept, accept]);
  const room = newRoom();
  await shareAll(room);
  SEATS.forEach((s) => approveAgreement(room, s, 1));
  const lastNotice = (s: Seat) => room.seats[s].chat.filter((m) => m.from === "notice").at(-1)?.text ?? "";
  const idx = (s: Seat) => room.agreement!.tasks.findIndex((x) => x.seat === s);

  markDone(room, "a", idx("a")); // Max goes first (earliest deadline)
  assert.match(lastNotice("b"), /Max finished his turn/);
  assert.match(lastNotice("b"), /It's now your turn/, "Jordan is next");
  assert.match(lastNotice("c"), /Max finished his turn/);
  assert.match(lastNotice("c"), /Next up: Jordan/);
  assert.match(lastNotice("a"), /Jordan is up next/);

  markDone(room, "b", idx("b"));
  assert.match(lastNotice("c"), /Jordan finished his turn.*It's now your turn/);
  assert.match(lastNotice("a"), /Next up: Sam/);

  markDone(room, "c", idx("c"));
  for (const s of ["a", "b"] as Seat[]) assert.match(lastNotice(s), /Sam finished his turn.*completes the rotation/);
  assert.throws(() => markDone(room, "c", idx("c")), RuleError, "can't finish the same turn twice");
});

console.log(results.join("\n"));
console.log(`\n${results.length} checks passed`);
