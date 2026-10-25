import * as realAgents from "./agents";
import { AgentError, allowedActions, renderTasks } from "./agents";
import { newId, putRoom, save } from "./store";
import type { ExchangeEntry, Room, Seat, SeatState, SeatView } from "./types";
import { MAX_DECLINES, PRIVATE_BY_DEFAULT, SEATS, othersOf, rotationOrder } from "./types";

// The engine owns every rule that must hold no matter what the model says:
// what may be shared, who may act, version-bound approvals, the three-decline
// pause and the no-agreement outcome. The agents only choose moves within it.

const MAX_AGENT_STEPS = 16;

/** The Gemini-backed agents. Swappable so the rules can be tested with scripted agents. */
export const agents = {
  runIntake: realAgents.runIntake,
  runNegotiator: realAgents.runNegotiator,
  runAmend: realAgents.runAmend,
  hasApiKey: realAgents.hasApiKey,
};

/** "Max", "Max and Jordan", "Max, Jordan and Sam" */
export const names = (room: Room, seats: Seat[]) => {
  const n = seats.map((s) => room.seats[s].name);
  return n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} and ${n.at(-1)}`;
};

function blankSeat(name: string, intro: string): SeatState {
  return {
    name,
    token: newId(18),
    chat: [{ id: newId(), from: "agent", text: intro, at: Date.now() }],
    pending: null,
    approved: [],
    shareApproved: false,
    flexAnswered: false,
    flexNothing: false,
    amendDraft: null,
    approvedVersion: 0,
    reminders: false,
    busy: false,
  };
}

export function createRoom(seatNames: [string, string, string], demo: boolean, scenario?: "campus"): Room {
  const intro = (me: string, them: string) =>
    (scenario === "campus" ? `Hi ${me}. I’m your Count Me In agent. Let’s get you, ${them} together for a 45-minute campus dinner. Tell me when you’re free, your budget, walking limit and food preferences. Your reasons stay private unless you explicitly share them. I’ll send a numbered sharing preview here; reply with the exact items I may share. Nothing is final until all three of you message your approval.` : `Hi ${me}. I'm your RoomPeace agent, and this chat is private. Tell me what's going on with the bathroom rota: when you can and can't clean, any deadline, and anything bothering you. I'll only share what you approve with ${them}'s agents.`);
  const [a, b, c] = seatNames;
  const room: Room = {
    id: newId(),
    scenario,
    demo,
    demoToken: demo ? newId(18) : null,
    createdAt: Date.now(),
    status: "intake",
    seats: {
      a: blankSeat(a, intro(a, `${b} and ${c}`)),
      b: blankSeat(b, intro(b, `${a} and ${c}`)),
      c: blankSeat(c, intro(c, `${a} and ${b}`)),
    },
    exchange: [],
    declined: 0,
    round: 1,
    proposalCount: 0,
    currentProposal: null,
    accepts: [],
    turn: "a",
    agreement: null,
    error: null,
  };
  // The fictional demo roommates are all men.
  if (demo) for (const s of SEATS) room.seats[s].pronouns = "he/him";
  putRoom(room);
  return room;
}

const log = (room: Room, e: Omit<ExchangeEntry, "id" | "at">) => room.exchange.push({ ...e, id: newId(), at: Date.now() });
const tell = (room: Room, seat: Seat, text: string) =>
  room.seats[seat].chat.push({ id: newId(), from: "agent", text, at: Date.now() });
const tellAll = (room: Room, f: (s: Seat) => string) => SEATS.forEach((s) => tell(room, s, f(s)));

export class RuleError extends Error {}

// ---------------------------------------------------------------------------
// Student actions
// ---------------------------------------------------------------------------

export async function studentChat(room: Room, seat: Seat, text: string, externalId?: string) {
  const me = room.seats[seat];
  if (externalId && me.chat.some(m => m.externalId === externalId)) return;
  if (me.busy) throw new RuleError("Your agent is still replying.");
  me.chat.push({ id: newId(), from: "student", text, at: Date.now(), externalId });
  if (await handleChatCommand(room, seat, text)) return;
  me.busy = true;
  save();
  try {
    const { reply, items } = await agents.runIntake(room, seat);
    tell(room, seat, reply);
    if (items.length) {
      me.previewVersion = (me.previewVersion ?? 0) + 1;
      me.pending = items.map((i) => ({ id: newId(), text: i.text, kind: i.kind, checked: !PRIVATE_BY_DEFAULT.includes(i.kind) }));
      const preview = me.pending.map((item, i) => `${i + 1}. [${item.kind}${PRIVATE_BY_DEFAULT.includes(item.kind) ? " · private by default" : ""}] ${item.text}`).join("\n");
      tell(room, seat, `Sharing preview p${me.previewVersion} — nothing shared yet.\n${preview}\n\nReply “share p${me.previewVersion} safe” to share only non-private items, or “share p${me.previewVersion} 1,2” to share exactly those numbered items. “share p${me.previewVersion} none” discards this preview. Reasons and complaints are excluded from “safe”.`);
    }
  } catch (err) {
    tell(room, seat, err instanceof AgentError ? `Sorry, I couldn't respond: ${err.message}` : "Sorry, something went wrong on my side.");
    if (!(err instanceof AgentError)) console.error(err);
  } finally {
    me.busy = false;
    save();
  }
}

/** Consent is parsed deterministically, never inferred by a model. Every action stays in the chat. */
async function handleChatCommand(room: Room, seat: Seat, text: string): Promise<boolean> {
  const me = room.seats[seat];
  const input = text.trim();
  const sharing = /^share p(\d+) (safe|none|\d+(?:\s*,\s*\d+)*)[.!]?$/i.exec(input);
  const approval = /^(?:i )?approve v(\d+)[.!]?$/i.exec(input);
  const change = /^change:\s*(.+)$/is.exec(input);
  const send = /^send change ([a-zA-Z0-9_-]+)$/.exec(input);
  const done = /^done (\d+)[.!]?$/i.exec(input);
  const reminder = /^reminders (on|off)[.!]?$/i.exec(input);
  try {
    if (sharing) {
      if (!me.pending || Number(sharing[1]) !== (me.previewVersion ?? 0)) throw new RuleError("That sharing preview is no longer current. Reply with the latest preview number and item numbers.");
      const selection = sharing[2].toLowerCase();
      let ids: string[];
      if (selection === "safe") ids = me.pending.filter(i => !PRIVATE_BY_DEFAULT.includes(i.kind)).map(i => i.id);
      else if (selection === "none") ids = [];
      else {
        const numbers = selection.split(',').map(n => Number(n.trim()));
        if (numbers.some(n => n < 1 || n > me.pending!.length)) throw new RuleError("One of those item numbers is not in this preview. Nothing was shared.");
        ids = [...new Set(numbers)].map(n => me.pending![n - 1].id);
      }
      approveShare(room, seat, ids);
    } else if (approval) approveAgreement(room, seat, Number(approval[1]));
    else if (change) await requestAmend(room, seat, change[1], true);
    else if (send) {
      if (!me.amendDraft?.id || send[1] !== me.amendDraft.id) throw new RuleError("That change preview is no longer current. Request a new one with “change: …”.");
      sendAmend(room, seat);
    } else if (/^discard change[.!]?$/i.test(input)) { discardAmend(room, seat); tell(room, seat, "Change preview discarded. The existing plan is unchanged."); }
    else if (/^nothing will change[.!]?$/i.test(input)) nothingWillChange(room, seat);
    else if (done) { markDone(room, seat, Number(done[1]) - 1); tell(room, seat, `Marked your item ${done[1]} done.`); }
    else if (reminder) { setReminders(room, seat, reminder[1].toLowerCase() === "on"); tell(room, seat, `In-chat reminders ${me.reminders ? "on" : "off"}. Reminders work only while ${room.transport === "slack" ? "the Slack worker is running" : "your chat is open"}.`); }
    else if (/^retry[.!]?$/i.test(input)) { retry(room); tell(room, seat, "I’ll retry the negotiation if it is waiting on an agent."); }
    else if (/^(?:help|yes|okay|ok|approve|i approve|share|send change)\b/i.test(input)) {
      tell(room, seat, `I won’t treat an ambiguous reply as permission. Use an exact message:\n${me.pending ? `• share p${me.previewVersion ?? 0} safe — excludes reasons and complaints\n• share p${me.previewVersion ?? 0} 1,2 — only those items\n` : ""}${room.agreement ? `• approve v${room.agreement.version} — confirm that exact plan\n` : ""}• change: describe your request\n• nothing will change — when agents ask about flexibility\n• reminders on / reminders off\n• done 1 — mark your assigned item 1 done\n• retry — retry an interrupted negotiation`);
    } else return false;
  } catch (error) {
    if (!(error instanceof RuleError)) throw error;
    tell(room, seat, error.message);
  }
  save();
  return true;
}

export function approveShare(room: Room, seat: Seat, checkedIds: string[]) {
  const me = room.seats[seat];
  if (!["intake", "paused"].includes(room.status)) throw new RuleError("To revise a proposed or confirmed plan, send “change: …”. Wait for a negotiation already in progress to finish.");
  if (!me.pending) throw new RuleError("There's no sharing preview to approve.");
  if (room.status === "confirmed" || room.status === "no_agreement") throw new RuleError("This negotiation has ended.");
  const chosen = me.pending.filter((i) => checkedIds.includes(i.id));
  const kept = me.pending.length - chosen.length;
  me.pending = null;
  if (!chosen.length) {
    tell(room, seat, "Nothing was shared. Tell me more whenever you're ready.");
    save();
    return;
  }
  me.approved.push(...chosen.map(({ id, text, kind }) => ({ id, text, kind })));
  log(room, { from: seat, kind: "shared", text: `Shared ${chosen.length} approved item${chosen.length === 1 ? "" : "s"}.`, facts: chosen.map((c) => c.text) });
  tell(room, seat, `Shared exactly ${chosen.length} item${chosen.length === 1 ? "" : "s"}.${kept ? ` ${kept} stay${kept === 1 ? "s" : ""} private with me.` : ""} I won't agree to anything for you.`);

  if (room.status === "intake") {
    me.shareApproved = true;
    const waiting = othersOf(seat).filter((s) => !room.seats[s].shareApproved);
    if (!waiting.length) {
      room.status = "negotiating";
      log(room, { from: "system", kind: "resume", text: "All three students approved their sharing previews. The agents start negotiating." });
    } else {
      tell(room, seat, `Waiting for ${names(room, waiting)} to approve their own sharing preview${waiting.length > 1 ? "s" : ""}.`);
    }
  } else if (room.status === "paused") {
    me.flexAnswered = true;
    me.flexNothing = false;
    log(room, { from: seat, kind: "flex", text: `${me.name} is willing to change something (see shared items).` });
    maybeResume(room);
  }
  save();
  kick(room);
}

export function nothingWillChange(room: Room, seat: Seat) {
  if (room.status !== "paused") throw new RuleError("The agents aren't asking right now.");
  const me = room.seats[seat];
  me.flexAnswered = true;
  me.flexNothing = true;
  me.pending = null;
  log(room, { from: seat, kind: "flex", text: `${me.name} can't change any constraint.` });
  tell(room, seat, "Understood, nothing changes on your side. That's a fair answer.");
  maybeResume(room);
  save();
  kick(room);
}

function maybeResume(room: Room) {
  const all = SEATS.map((s) => room.seats[s]);
  if (!all.every((s) => s.flexAnswered)) return;
  if (all.every((s) => s.flexNothing)) {
    endWithoutAgreement(room, "No student can change a constraint, so the approved constraints can't be reconciled.");
    return;
  }
  room.status = "negotiating";
  room.round = 2;
  room.declined = 0;
  room.currentProposal = null;
  room.accepts = [];
  log(room, { from: "system", kind: "resume", text: "Everyone answered. The agents try again with the updated facts." });
}

export async function requestAmend(room: Room, seat: Seat, request: string, alreadyLogged = false) {
  if (!["awaiting_approval", "confirmed"].includes(room.status) || !room.agreement) throw new RuleError("There's no draft agreement to change.");
  const me = room.seats[seat];
  if (me.busy) throw new RuleError("Your agent is still working.");
  me.busy = true;
  const baseVersion = room.agreement.version;
  if (!alreadyLogged) me.chat.push({ id: newId(), from: "student", text: `Change request: ${request}`, at: Date.now() });
  save();
  try {
    const out = await agents.runAmend(room, seat, request);
    if (room.agreement?.version !== baseVersion) throw new AgentError("The plan changed while I drafted this. Send your change request again.");
    me.amendDraft = { tasks: out.tasks, note: out.note, id: newId(5), baseVersion };
    tell(room, seat, `${out.reply}\n\nPrivate change preview ${me.amendDraft.id}:\n${out.note}\n${renderTasks(out.tasks, room)}\n\nReply “send change ${me.amendDraft.id}” to publish v${baseVersion + 1} and clear everyone’s approvals, or “discard change”. This message does not approve the new plan.`);
  } catch (err) {
    tell(room, seat, err instanceof AgentError ? `Sorry, I couldn't draft that: ${err.message}` : "Sorry, something went wrong on my side.");
    if (!(err instanceof AgentError)) console.error(err);
  } finally {
    me.busy = false;
    save();
  }
}

export function sendAmend(room: Room, seat: Seat) {
  const me = room.seats[seat];
  if (!me.amendDraft || !room.agreement || !["awaiting_approval", "confirmed"].includes(room.status)) throw new RuleError("There's no change ready to send.");
  const ag = room.agreement;
  if (me.amendDraft.baseVersion !== undefined && me.amendDraft.baseVersion !== ag.version) throw new RuleError("The plan changed. Request a fresh change preview.");
  room.status = "awaiting_approval";
  ag.done = {};
  ag.version += 1;
  ag.tasks = me.amendDraft.tasks;
  ag.history.push({ version: ag.version, by: seat, note: me.amendDraft.note });
  SEATS.forEach(s => { room.seats[s].amendDraft = null; room.seats[s].approvedVersion = 0; });
  // Approvals are bound to a version number, so every earlier approval is now void.
  const note = ag.history.at(-1)!.note;
  log(room, { from: seat, kind: "amend", text: `Changed to v${ag.version}: ${note} Earlier approvals no longer count.` });
  tell(room, seat, `Sent v${ag.version}. Your earlier approval no longer counts; approve v${ag.version} if you're happy with it.`);
  othersOf(seat).forEach((s) => tell(room, s, `${me.name} asked for a change, so the draft is now v${ag.version}: ${note} Any earlier approval no longer counts. Please review it again.`));
  tellAll(room, () => `Plan v${ag.version}:\n${renderTasks(ag.tasks, room)}\n\nReply “approve v${ag.version}” only if you agree to this version, or “change: …”.`);
  save();
}

export function discardAmend(room: Room, seat: Seat) {
  room.seats[seat].amendDraft = null;
  save();
}

export function approveAgreement(room: Room, seat: Seat, version: number) {
  const ag = room.agreement;
  if (room.status !== "awaiting_approval" || !ag) throw new RuleError("There's nothing to approve.");
  // The student approves the exact version they were looking at; a stale page can't approve a newer draft.
  if (version !== ag.version) throw new RuleError(`The draft changed to v${ag.version}. Please review it before approving.`);
  const me = room.seats[seat];
  if (me.approvedVersion === ag.version) { tell(room, seat, `You already approved v${ag.version}. Waiting for the others.`); return; }
  me.approvedVersion = ag.version;
  log(room, { from: "system", kind: "approved", text: `${me.name} approved v${ag.version}, privately in their own chat.` });
  const waiting = othersOf(seat).filter((s) => room.seats[s].approvedVersion !== ag.version);
  if (!waiting.length) {
    room.status = "confirmed";
    log(room, { from: "system", kind: "confirmed", text: `Confirmed. All three students approved the same version (v${ag.version}).` });
    tellAll(room, () => `Confirmed: all three of you approved v${ag.version}. I'll track your part only, and send “reminders on” for in-chat reminders while ${room.transport === "slack" ? "the Slack worker is running" : "this page is open"}.`);
  } else {
    tell(room, seat, `You approved v${ag.version}. It's confirmed only once ${names(room, waiting)} approve${waiting.length === 1 ? "s" : ""} this same version.`);
  }
  save();
}

export function markDone(room: Room, seat: Seat, index: number) {
  const ag = room.agreement;
  if (room.status !== "confirmed" || !ag) throw new RuleError("There's no confirmed agreement yet.");
  const task = ag.tasks[index];
  if (!task || task.seat !== seat) throw new RuleError("You can only mark your own tasks done.");
  if (ag.done[index]) throw new RuleError("That task is already marked done.");
  ag.done[index] = true;
  const me = room.seats[seat];
  log(room, { from: "system", kind: "done", text: `${me.name} marked done: ${task.task}.` });
  if (room.scenario === "campus") {
    othersOf(seat).forEach(s => notice(room, s, `${me.name} marked their part of the outing done.`));
  } else notifyRotation(room, seat, index);
  save();
}

const possessive = (room: Room, seat: Seat) => {
  const p = room.seats[seat].pronouns ?? "";
  return p.startsWith("he") ? "his" : p.startsWith("she") ? "her" : "their";
};

/**
 * When someone finishes, Cubbie tells the other roommates, tells whoever is next that
 * it's now their turn, and says when the whole rotation is complete.
 */
function notifyRotation(room: Room, seat: Seat, index: number) {
  const ag = room.agreement!;
  const me = room.seats[seat];
  const task = ag.tasks[index];
  const nextIdx = rotationOrder(ag.tasks).find((i) => !ag.done[i]);
  const next = nextIdx === undefined ? null : ag.tasks[nextIdx];
  const finished = `${me.name} finished ${possessive(room, seat)} turn: ${task.task.replace(/\.$/, "")}.`;

  for (const s of othersOf(seat)) {
    let text = finished;
    if (!next) text += " That completes the rotation. Everyone has done their part.";
    else if (next.seat === s) text += ` It's now your turn: ${next.task.replace(/\.$/, "")}, ${next.due}.`;
    else text += ` Next up: ${room.seats[next.seat].name}, ${next.due}.`;
    notice(room, s, text);
  }
  const told = names(room, othersOf(seat));
  if (!next) notice(room, seat, `Nice work. I let ${told} know, and that completes the rotation.`);
  else if (next.seat === seat) notice(room, seat, `Nice work. I let ${told} know. You're up again next: ${next.task.replace(/\.$/, "")}, ${next.due}.`);
  else notice(room, seat, `Nice work. I let ${told} know. ${room.seats[next.seat].name} is up next.`);

  log(room, next
    ? { from: "system", kind: "done", text: `Cubbie notified ${told}. Next up: ${room.seats[next.seat].name}, ${next.due}.` }
    : { from: "system", kind: "done", text: `Cubbie notified ${told}. Rotation complete.` });
}

const notice = (room: Room, seat: Seat, text: string) =>
  room.seats[seat].chat.push({ id: newId(), from: "notice", text, at: Date.now() });

export function setReminders(room: Room, seat: Seat, on: boolean) {
  room.seats[seat].reminders = on;
  save();
}

// ---------------------------------------------------------------------------
// Agent-to-agent negotiation loop (runs in the background in this process)
// ---------------------------------------------------------------------------

const running = new Set<string>();

export function kick(room: Room) {
  if (room.status !== "negotiating" || running.has(room.id) || !agents.hasApiKey()) return;
  running.add(room.id);
  negotiate(room)
    .catch((err) => {
      console.error(err);
      room.error = "The negotiation stopped unexpectedly. Reload to retry.";
    })
    .finally(() => {
      running.delete(room.id);
      save();
    });
}

export const isNegotiating = (room: Room) => running.has(room.id);

/** Resolves when the background negotiation for this room (if any) has stopped. */
export async function settle(room: Room) {
  while (running.has(room.id)) await new Promise((r) => setTimeout(r, 5));
}

/** The next seat after `from` (round-robin) that still has to respond to the proposal on the table. */
function nextTurn(room: Room, from: Seat): Seat {
  const p = room.currentProposal;
  const start = SEATS.indexOf(from);
  for (let i = 1; i <= SEATS.length; i++) {
    const s = SEATS[(start + i) % SEATS.length];
    if (!p) return s;
    if (s !== p.by && !room.accepts.includes(s)) return s;
  }
  return SEATS[(start + 1) % SEATS.length];
}

async function negotiate(room: Room) {
  room.error = null;
  for (let step = 0; step < MAX_AGENT_STEPS && room.status === "negotiating"; step++) {
    if (!allowedActions(room, room.turn).length) room.turn = nextTurn(room, room.turn);
    let move;
    try {
      move = await agents.runNegotiator(room, room.turn);
    } catch (err) {
      room.error = err instanceof AgentError ? err.message : "An agent failed to respond.";
      save();
      return;
    }
    applyMove(room, room.turn, move);
    save();
  }
  if (room.status === "negotiating") {
    endWithoutAgreement(room, "The agents ran out of turns without an agreement.");
  }
}

function applyMove(room: Room, seat: Seat, move: realAgents.NegotiationMove) {
  const p = room.currentProposal;
  const needsTasks = move.action === "propose" || move.action === "counter";
  if (needsTasks && !move.tasks) {
    // A proposal without terms isn't a proposal: treat a counter as a plain decline.
    if (move.action === "propose") return; // the same agent tries again next step
    move = { ...move, action: "decline" };
  }

  switch (move.action) {
    case "propose": {
      room.currentProposal = { n: ++room.proposalCount, by: seat, tasks: move.tasks! };
      room.accepts = [];
      log(room, { from: seat, kind: "propose", text: move.message, proposal: room.currentProposal });
      room.turn = nextTurn(room, seat);
      break;
    }
    case "accept": {
      if (!p) return;
      room.accepts = [...new Set([...room.accepts, seat])];
      log(room, { from: seat, kind: "accept", text: move.message, proposal: p });
      if (move.note) tell(room, seat, move.note);
      const stillToAnswer = othersOf(p.by).filter((s) => !room.accepts.includes(s));
      if (stillToAnswer.length) {
        room.turn = nextTurn(room, seat);
        break;
      }
      // Every other agent accepted: present the identical draft to all three students.
      const version = (room.agreement?.version ?? 0) + 1;
      room.agreement = { version, tasks: p.tasks, history: [{ version, by: "agents", note: `Proposal ${p.n}, presented to all three students.` }], done: {} };
      room.status = "awaiting_approval";
      SEATS.forEach((s) => (room.seats[s].approvedVersion = 0));
      log(room, { from: "system", kind: "presented", text: `Draft v${version} presented to all three students: ${renderTasks(p.tasks, room)}. Nothing is committed until everyone approves this exact version.` });
      tellAll(room, (s) => `All three agents accepted proposal ${p.n}. Plan v${version}:\n${p.tasks.map((t, i) => `${i + 1}. ${room.seats[t.seat].name}: ${t.task} — ${t.due}`).join("\n")}\n\nNothing is final until you, ${names(room, othersOf(s))} approve this version. Reply “approve v${version}” to agree, or “change: …” to request a revision.`);
      break;
    }
    case "counter":
    case "decline": {
      room.declined += 1;
      room.accepts = [];
      log(room, { from: seat, kind: "decline", text: move.message, proposal: p ?? undefined });
      if (move.note) tell(room, seat, move.note);
      if (room.declined >= MAX_DECLINES) {
        room.currentProposal = null;
        if (room.round === 1) {
          room.status = "paused";
          SEATS.forEach((s) => {
            room.seats[s].flexAnswered = false;
            room.seats[s].flexNothing = false;
          });
          log(room, { from: "system", kind: "pause", text: `${MAX_DECLINES} proposals were declined. The agents pause and ask each student what they're willing to change.` });
          tellAll(room, () => `We've had ${MAX_DECLINES} proposals declined, so we're pausing. What, if anything, would you be willing to change? Tell me here, or send "nothing will change" if the answer is nothing. That's a fair answer too.`);
        } else {
          endWithoutAgreement(room, `${MAX_DECLINES} more proposals were declined after the students updated their constraints.`);
        }
        return;
      }
      if (move.action === "counter") {
        room.currentProposal = { n: ++room.proposalCount, by: seat, tasks: move.tasks! };
        log(room, { from: seat, kind: "counter", text: "Counteroffer.", proposal: room.currentProposal });
      } else {
        room.currentProposal = null;
      }
      room.turn = nextTurn(room, seat);
      break;
    }
    case "no_agreement": {
      log(room, { from: seat, kind: "decline", text: move.message });
      endWithoutAgreement(room, move.message);
      break;
    }
  }
}

function endWithoutAgreement(room: Room, why: string) {
  room.status = "no_agreement";
  room.currentProposal = null;
  room.accepts = [];
  log(room, { from: "system", kind: "no_agreement", text: `No agreement. ${why} Nobody was committed to anything.` });
  tellAll(room, (s) => `No agreement this time, and that's a valid outcome. I didn't commit you to anything. You might talk with ${names(room, othersOf(s))} directly.`);
}

// ---------------------------------------------------------------------------
// Views: the privacy boundary between the students' browsers.
// ---------------------------------------------------------------------------

export function viewFor(room: Room, seat: Seat): SeatView {
  if (room.status === "negotiating" && !running.has(room.id) && !room.error) kick(room);
  const { token: _token, ...me } = room.seats[seat];
  return {
    roomId: room.id,
    scenario: room.scenario,
    demo: room.demo,
    seat,
    status: room.status,
    me,
    others: othersOf(seat).map((s) => {
      const t = room.seats[s];
      return { seat: s, name: t.name, shareApproved: t.shareApproved, flexAnswered: t.flexAnswered, approvedVersion: t.approvedVersion, busy: t.busy, reviewing: Boolean(t.pending) };
    }),
    accepts: room.accepts,
    exchange: room.exchange,
    declined: room.declined,
    round: room.round,
    currentProposal: room.currentProposal,
    agreement: room.agreement,
    negotiating: running.has(room.id),
    error: room.error,
    hasApiKey: agents.hasApiKey(),
  };
}

export function retry(room: Room) {
  room.error = null;
  kick(room);
}
