import { ApiError, GoogleGenAI } from "@google/genai";
import { z } from "zod/v4";
import type { ApprovedFact, ChatMsg, ExchangeEntry, ItemKind, Proposal, Room, Seat, Task } from "./types";
import { MAX_DECLINES, SEATS, othersOf } from "./types";

// "gemini-flash-latest" always points at Google's current Flash model.
// Set GEMINI_MODEL to pin a specific model (e.g. a Pro model for stronger negotiation).
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
// Used when the main model is overloaded, rate-limited or slow. Set GEMINI_FALLBACK_MODEL="" to disable.
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL ?? "gemini-flash-lite-latest";
const ATTEMPT_TIMEOUT_MS = 20_000;

export class AgentError extends Error {}

let client: GoogleGenAI | null = null;
const getClient = () => (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

export const hasApiKey = () => Boolean(process.env.GEMINI_API_KEY);

/** Errors worth retrying on the fallback model: overload, quota, server errors and timeouts. */
const isTransient = (err: unknown) =>
  err instanceof ApiError ? err.status === 429 || err.status >= 500 : err instanceof Error && /abort|timeout/i.test(`${err.name} ${err.message}`);

/** One Gemini call that must return JSON matching `schema`. */
async function callAgent<S extends z.ZodType>(schema: S, system: string, user: string): Promise<z.infer<S>> {
  if (!hasApiKey()) throw new AgentError("No GEMINI_API_KEY is configured on the server.");
  const { $schema: _drop, ...jsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
  const models = [MODEL, FALLBACK_MODEL].filter((m, i, all) => m && all.indexOf(m) === i);

  let res;
  for (const [i, model] of models.entries()) {
    try {
      res = await getClient().models.generateContent({
        model,
        contents: user,
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          responseJsonSchema: jsonSchema,
          httpOptions: { timeout: ATTEMPT_TIMEOUT_MS, retryOptions: { attempts: 1 } },
        },
      });
      break;
    } catch (err) {
      if (isTransient(err) && i < models.length - 1) {
        console.warn(`[roompeace] ${model} unavailable (${err instanceof ApiError ? err.status : "timeout"}), falling back to ${models[i + 1]}`);
        continue;
      }
      if (err instanceof ApiError) {
        if (err.status === 400 || err.status === 401 || err.status === 403) throw new AgentError(`Gemini rejected the request (${err.status}). Check GEMINI_API_KEY and GEMINI_MODEL.`);
        if (err.status === 429) throw new AgentError("Rate limited by the Gemini API. Try again in a moment.");
        if (err.status >= 500) throw new AgentError("Gemini is overloaded right now. Try again in a moment.");
        throw new AgentError(`Gemini API error ${err.status}: ${err.message}`);
      }
      if (isTransient(err)) throw new AgentError("Gemini took too long to respond. Try again.");
      throw err;
    }
  }
  if (!res) throw new AgentError("Gemini didn't respond.");
  if (res.promptFeedback?.blockReason) throw new AgentError("Gemini blocked this request.");
  const finish = String(res.candidates?.[0]?.finishReason ?? "");
  if (finish === "MAX_TOKENS") throw new AgentError("The agent's response was cut off.");
  if (finish && finish !== "STOP") throw new AgentError("The agent declined to respond to this request.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(res.text ?? "");
  } catch {
    throw new AgentError("The agent returned an unreadable response.");
  }
  // Gemini follows the schema, but validate anyway: the engine relies on these shapes.
  const checked = schema.safeParse(parsed);
  if (!checked.success) throw new AgentError("The agent's response didn't match the expected format.");
  return checked.data;
}

/**
 * The agents' notion of "now". Demo rooms run on a fixed Thursday afternoon so the
 * scripted scenario ("I can clean tomorrow or take Saturday's turn") reads as intended
 * whatever day the demo is shown.
 */
export function agentNow(room: Room): Date {
  if (!room.demo) return new Date();
  const d = new Date(room.createdAt);
  d.setDate(d.getDate() + ((4 - d.getDay() + 7) % 7)); // next Thursday (or today, if Thursday)
  d.setHours(14, 0, 0, 0);
  return d;
}

function now(room: Room) {
  const d = agentNow(room);
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
  const mm = String(Math.abs(off) % 60).padStart(2, "0");
  const human = d.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${human} (UTC offset ${sign}${hh}:${mm})${room.demo ? " [demo clock]" : ""}`;
}

const factList = (facts: ApprovedFact[]) =>
  facts.length ? facts.map((f) => `- [${f.kind}] ${f.text}`).join("\n") : "- (nothing shared)";

export function renderTasks(tasks: Task[], room: Room) {
  return tasks.map((t) => `${room.seats[t.seat].name}: ${t.task} — ${t.due}`).join("; ");
}

function renderExchange(room: Room, entries: ExchangeEntry[]) {
  if (!entries.length) return "(nothing yet)";
  return entries
    .map((e) => {
      const who = e.from === "system" ? "RoomPeace" : `${room.seats[e.from].name}'s agent`;
      const prop = e.proposal ? ` [Proposal ${e.proposal.n}: ${renderTasks(e.proposal.tasks, room)}]` : "";
      return `- ${who} (${e.kind}): ${e.text}${prop}`;
    })
    .join("\n");
}

const roommateNames = (room: Room) => SEATS.map((s) => room.seats[s].name) as [string, string, string];
/** A pronoun line for agent prompts, only when pronouns are known. */
const pronounNote = (room: Room) => {
  const known = SEATS.filter((s) => room.seats[s].pronouns).map((s) => `${room.seats[s].name} (${room.seats[s].pronouns})`);
  return known.length ? `\n\nPronouns: ${known.join(", ")}. Use them when you refer to these roommates.` : "";
};
const and = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

const taskSchema = (names: [string, ...string[]]) =>
  z.object({
    assignee: z.enum(names),
    task: z.string(),
    due: z.string(),
    due_iso: z.string(),
  });

function toTasks(raw: { assignee: string; task: string; due: string; due_iso: string }[], room: Room): Task[] {
  return raw.flatMap((t) => {
    const seat = SEATS.find((s) => room.seats[s].name === t.assignee);
    if (!seat) return [];
    return [{ seat, task: t.task.trim(), due: t.due.trim(), dueIso: Number.isNaN(Date.parse(t.due_iso)) ? "" : t.due_iso }];
  });
}

// ---------------------------------------------------------------------------
// Private intake agent: talks only with its own student.
// ---------------------------------------------------------------------------

const KINDS = ["availability", "constraint", "preference", "flexibility", "reason", "complaint", "other"] as const;

const IntakeSchema = z.object({
  reply: z.string(),
  share_items: z.array(z.object({ text: z.string(), kind: z.enum(KINDS) })),
});

export async function runIntake(room: Room, seat: Seat): Promise<{ reply: string; items: { text: string; kind: ItemKind }[] }> {
  const me = room.seats[seat];
  const them = and(othersOf(seat).map((s) => room.seats[s].name));

  let mode: string;
  if (room.status === "paused" && !me.flexAnswered) {
    mode = `Negotiation is paused: the agents had ${MAX_DECLINES} proposals declined. Your job now is to learn what, if anything, ${me.name} is willing to change (times, which turn they take, an extra turn later, a shorter clean). Share items should capture only new flexibility or updated availability. If ${me.name} won't change anything, that's a legitimate answer: leave share_items empty and tell them to press "Nothing will change".`;
  } else if (room.status === "confirmed" || room.status === "no_agreement") {
    mode = `The negotiation has ended (${room.status === "confirmed" ? "agreement confirmed" : "no agreement"}). Answer questions about it. Leave share_items empty.`;
  } else if (me.shareApproved) {
    mode = `${me.name} has already shared some facts (listed below). Answer questions about how things are going using the status summary. Only produce share items for genuinely new facts that aren't already shared. If ${me.name} wants to change a drafted agreement, point them to "Request a change" on the agreement card.`;
  } else {
    mode = `This is the start. Understand ${me.name}'s situation and prepare the first sharing preview.`;
  }

  const system = `You are ${me.name}'s personal RoomPeace agent. ${me.name} shares a home with ${them}; each of them has a separate agent of their own. You help ${me.name} sort out household responsibilities; this prototype covers the bathroom-cleaning rota and swaps.

In this private chat you learn ${me.name}'s situation, availability, constraints and preferences, and you prepare a sharing preview: a short list of facts you would pass to the other roommates' agents. Nothing leaves this chat unless ${me.name} approves it in the preview, so it's fine for them to vent here.

How to write share items:
- One fact per item, neutral and in the third person, readable by the other agents (e.g. "${me.name} isn't available to clean tonight").
- Kinds: availability, constraint, preference, flexibility, reason, complaint, other.
  - constraint: a hard requirement about the chore itself, such as "the bathroom must be clean before 6:00 PM today".
  - flexibility: anything they offered or are willing to do: swapping turns, cleaning on another day, taking a later turn. Capture every offer they made; the negotiation depends on these.
  - reason: why they can or can't do something, such as an assignment, exam, coursework, guests, a job, travel, health or family. A deadline that belongs to their own life (an assignment due tonight) is a reason, never a constraint.
  - complaint: a grievance about a roommate or the household.
- Keep reasons and complaints in their own items, separate from the scheduling facts, so the student can share the fact without the reason ("${me.name} isn't available tonight" plus a separate reason item). Never fold a reason or complaint into another item.
- Never invent availability. If something essential is missing (when they can or can't clean, any hard deadline), ask instead of guessing and leave share_items empty.
- Resolve relative dates ("tomorrow", "Saturday") to concrete days in the item text.

share_items is the sharing preview the student will see: fill it whenever you have facts to propose, and only say there's a preview when share_items is non-empty.

Your reply is short, warm and plain. When the preview is ready, tell them to review it. You can't agree to anything on ${me.name}'s behalf; say so if asked.

Current situation: ${mode}${pronounNote(room)}`;

  const transcript = me.chat
    .map((m: ChatMsg) => `${m.from === "student" ? me.name : m.from === "notice" ? "Cubbie notification" : "You (agent)"}: ${m.text}`)
    .join("\n");

  const user = `Current time: ${now(room)}

Facts ${me.name} has already approved for sharing:
${factList(me.approved)}

Status: ${room.status}. ${room.agreement ? `Draft agreement v${room.agreement.version}: ${renderTasks(room.agreement.tasks, room)}.` : ""}
Agent exchange so far:
${renderExchange(room, room.exchange.slice(-12))}

Private chat with ${me.name}:
${transcript}

Respond to ${me.name}'s latest message.`;

  const out = await callAgent(IntakeSchema, system, user);
  return {
    reply: out.reply.trim(),
    items: out.share_items.filter((i) => i.text.trim()).map((i) => ({ text: i.text.trim(), kind: i.kind })),
  };
}

// ---------------------------------------------------------------------------
// Negotiating agent: sees ONLY approved facts and the shared exchange.
// It never receives any student's private chat, so it cannot leak it.
// ---------------------------------------------------------------------------

export type NegotiationAction = "propose" | "counter" | "decline" | "accept" | "no_agreement";

export interface NegotiationMove {
  action: NegotiationAction;
  message: string;
  note: string;
  tasks: Task[] | null;
}

export function allowedActions(room: Room, seat: Seat): NegotiationAction[] {
  const p = room.currentProposal;
  const acts: NegotiationAction[] = !p ? ["propose"] : p.by === seat || room.accepts.includes(seat) ? [] : ["accept", "counter", "decline"];
  if (acts.length && room.round === 2 && room.declined > 0) acts.push("no_agreement");
  return acts;
}

/** Everything the negotiator sees. Built only from approved facts and the shared exchange. */
export function buildNegotiatorPrompt(room: Room, seat: Seat) {
  const me = room.seats[seat];
  const others = othersOf(seat);
  const them = and(others.map((s) => room.seats[s].name));
  const allowed = allowedActions(room, seat);

  const Schema = z.object({
    action: z.enum(allowed as [NegotiationAction, ...NegotiationAction[]]),
    message_to_other_agents: z.string(),
    note_to_own_student: z.string(),
    proposal: z.object({ tasks: z.array(taskSchema(roommateNames(room))) }).nullable(),
  });

  const system = `You are ${me.name}'s negotiating agent in RoomPeace, working out the bathroom-cleaning rota with the agents of ${them}. Three roommates, three agents.

You only know the facts each student approved for sharing. You have no access to anything else in anyone's life and must not speculate about it. Never invent availability or constraints for anyone.

Aim for an arrangement all three students would actually accept: it must respect every hard constraint and stay fair. Before proposing, check every task against all three students' facts: never assign anyone a task at a time they said they're unavailable, and never repeat a proposal that was already declined. Swaps should be reciprocal, and work shouldn't pile onto one person. A three-way rotation (A covers B, B covers C, C covers A) is often the fair answer.

Actions:
- propose: put a concrete arrangement on the table (only when nothing is on the table).
- accept: the proposal on the table fits every approved constraint of ${me.name}. Accepting commits nobody; once both other agents accept, the exact proposal is presented to all three students, who each approve or not.
- counter: decline the proposal on the table, name the approved fact it conflicts with, and put a better proposal on the table.
- decline: decline without a counter, only if you see no alternative.
- no_agreement: only available after the students were asked what they'd change; use it when the approved constraints genuinely can't be reconciled. No agreement is a valid outcome.

A proposal lists every task, including every part of a swap: who does it, what, a human-readable deadline, and the same deadline in ISO 8601 with a UTC offset. Set proposal to null for accept, decline and no_agreement.

message_to_other_agents: one to three sentences, referring only to approved facts.
note_to_own_student: one or two plain sentences for ${me.name}'s private chat about what just happened. Remind them nothing is agreed until they approve, when relevant.${pronounNote(room)}`;

  const p = room.currentProposal;
  const factsOf = (s: Seat) => `${room.seats[s].name}'s approved facts${s === seat ? " (your student)" : ""}:\n${factList(room.seats[s].approved)}`;
  const user = `Current time: ${now(room)}

${[seat, ...others].map(factsOf).join("\n\n")}

Exchange so far:
${renderExchange(room, room.exchange)}

On the table: ${p ? `Proposal ${p.n} from ${room.seats[p.by].name}'s agent: ${renderTasks(p.tasks, room)}${room.accepts.length ? ` (already accepted by ${and(room.accepts.map((s) => `${room.seats[s].name}'s agent`))})` : ""}` : "nothing"}
Declined proposals this round: ${room.declined} of ${MAX_DECLINES} (at ${MAX_DECLINES}, ${room.round === 1 ? "the agents pause and ask every student what they'd change" : "the negotiation ends with no agreement"}).
Your allowed actions now: ${allowed.join(", ")}.

Make your move.`;
  return { Schema, system, user };
}

export async function runNegotiator(room: Room, seat: Seat): Promise<NegotiationMove> {
  const { Schema, system, user } = buildNegotiatorPrompt(room, seat);
  const out = await callAgent(Schema, system, user);
  const tasks = out.proposal && out.proposal.tasks.length ? toTasks(out.proposal.tasks, room) : null;
  return { action: out.action, message: out.message_to_other_agents.trim(), note: out.note_to_own_student.trim(), tasks: tasks && tasks.length ? tasks : null };
}

// ---------------------------------------------------------------------------
// Amendment: a student asks to change the drafted agreement.
// ---------------------------------------------------------------------------

export async function runAmend(room: Room, seat: Seat, request: string): Promise<{ tasks: Task[]; note: string; reply: string }> {
  const me = room.seats[seat];
  const others = othersOf(seat);
  const them = and(others.map((s) => room.seats[s].name));
  const ag = room.agreement!;

  const Schema = z.object({
    tasks: z.array(taskSchema(roommateNames(room))),
    note_for_everyone: z.string(),
    reply_to_student: z.string(),
  });

  const system = `You are ${me.name}'s RoomPeace agent. ${me.name} wants to change a drafted agreement with ${them}. Produce the revised list of tasks, applying only the requested change and keeping everything else identical. Deadlines are human-readable plus ISO 8601 with a UTC offset.

note_for_everyone is one neutral sentence describing what changed; every student and agent will see it. Leave out any reason or complaint that isn't in ${me.name}'s approved facts.
reply_to_student briefly confirms what the new version says and that ${them} will have to approve it again. If the request conflicts with someone's approved constraint, say so in the reply.${pronounNote(room)}`;

  const user = `Current time: ${now(room)}

Current agreement v${ag.version}: ${renderTasks(ag.tasks, room)}

${[seat, ...others].map((s) => `${room.seats[s].name}'s approved facts:\n${factList(room.seats[s].approved)}`).join("\n\n")}

${me.name}'s requested change (private): ${request}`;

  const out = await callAgent(Schema, system, user);
  const tasks = toTasks(out.tasks, room);
  if (!tasks.length) throw new AgentError("The agent couldn't produce revised terms. Try describing the change differently.");
  return { tasks, note: out.note_for_everyone.trim(), reply: out.reply_to_student.trim() };
}

export type { Proposal };
