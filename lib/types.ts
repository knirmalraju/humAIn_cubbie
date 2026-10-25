export type Seat = "a" | "b" | "c";

/** Every room has three roommates, always in this order. */
export const SEATS: Seat[] = ["a", "b", "c"];

export const othersOf = (s: Seat): Seat[] => SEATS.filter((x) => x !== s);

export type ItemKind =
  | "availability"
  | "constraint"
  | "preference"
  | "flexibility"
  | "reason"
  | "complaint"
  | "other";

/** Kinds that stay private unless the student explicitly checks them. */
export const PRIVATE_BY_DEFAULT: ItemKind[] = ["reason", "complaint"];

export interface ShareItem {
  id: string;
  text: string;
  kind: ItemKind;
  checked: boolean;
}

export interface ApprovedFact {
  id: string;
  text: string;
  kind: ItemKind;
}

export interface ChatMsg {
  id: string;
  /** Slack event ID for replay protection; never exposed in the shared view. */
  externalId?: string;
  /** "notice" = an automatic Cubbie notification (e.g. a roommate finished his turn). */
  from: "student" | "agent" | "notice";
  text: string;
  at: number;
}

export interface Task {
  seat: Seat;
  task: string;
  /** Human-readable deadline, e.g. "Today before 6:00 PM". */
  due: string;
  /** Machine-readable deadline used for reminders (ISO 8601), or "" if unknown. */
  dueIso: string;
}

export interface Proposal {
  n: number;
  by: Seat;
  tasks: Task[];
}

export type ExchangeKind =
  | "shared"
  | "propose"
  | "counter"
  | "decline"
  | "accept"
  | "pause"
  | "flex"
  | "resume"
  | "no_agreement"
  | "presented"
  | "amend"
  | "approved"
  | "confirmed"
  | "done"
  | "error";

export interface ExchangeEntry {
  id: string;
  from: Seat | "system";
  kind: ExchangeKind;
  text: string;
  facts?: string[];
  proposal?: Proposal;
  at: number;
}

export interface Agreement {
  version: number;
  tasks: Task[];
  history: { version: number; by: Seat | "agents"; note: string }[];
  done: Record<number, boolean>;
}

export interface AmendDraft {
  tasks: Task[];
  note: string;
  id?: string;
  baseVersion?: number;
}

export interface SeatState {
  name: string;
  /** Only set when known (the fictional demo roommates). Agents otherwise use the name or "they". */
  pronouns?: string;
  token: string;
  chat: ChatMsg[];
  /** Sharing preview awaiting the student's decision. */
  pending: ShareItem[] | null;
  previewVersion?: number;
  /** Everything this student has approved for the other agent to see. */
  approved: ApprovedFact[];
  shareApproved: boolean;
  /** During a pause: has this student answered "what would you change?" */
  flexAnswered: boolean;
  flexNothing: boolean;
  amendDraft: AmendDraft | null;
  /** Version of the agreement this student approved (0 = none). */
  approvedVersion: number;
  reminders: boolean;
  busy: boolean;
}

export type RoomStatus =
  | "intake"
  | "negotiating"
  | "paused"
  | "awaiting_approval"
  | "confirmed"
  | "no_agreement";

export interface Room {
  transport?: "slack";
  id: string;
  scenario?: "campus";
  demo: boolean;
  demoToken: string | null;
  createdAt: number;
  status: RoomStatus;
  seats: Record<Seat, SeatState>;
  exchange: ExchangeEntry[];
  /** Declined proposals in the current round. */
  declined: number;
  /** Round 1 = before the "what would you change?" pause, round 2 = after. */
  round: 1 | 2;
  proposalCount: number;
  currentProposal: Proposal | null;
  /** Agents that have accepted the proposal on the table (the proposer excluded). */
  accepts: Seat[];
  turn: Seat;
  agreement: Agreement | null;
  error: string | null;
}

export const MAX_DECLINES = 3;

/** The agreement's tasks in rotation order: by deadline, then as listed. */
export function rotationOrder(tasks: Task[]): number[] {
  const at = (t: Task) => (t.dueIso ? Date.parse(t.dueIso) : Number.POSITIVE_INFINITY);
  return tasks.map((_, i) => i).sort((x, y) => at(tasks[x]) - at(tasks[y]) || x - y);
}

/** Index of the first unfinished task in rotation order, or undefined when everyone is done. */
export const nextUp = (ag: Agreement) => rotationOrder(ag.tasks).find((i) => !ag.done[i]);

/** What one student's browser is allowed to see. */
export interface SeatView {
  roomId: string;
  scenario?: "campus";
  demo: boolean;
  seat: Seat;
  status: RoomStatus;
  me: Omit<SeatState, "token">;
  /** The other roommates: status only, never their private chat or previews. */
  others: {
    seat: Seat;
    name: string;
    shareApproved: boolean;
    flexAnswered: boolean;
    approvedVersion: number;
    /** Their agent is replying to them right now (like a typing indicator). */
    busy: boolean;
    /** They have a sharing preview waiting for their decision. */
    reviewing: boolean;
  }[];
  accepts: Seat[];
  exchange: ExchangeEntry[];
  declined: number;
  round: 1 | 2;
  currentProposal: Proposal | null;
  agreement: Agreement | null;
  negotiating: boolean;
  error: string | null;
  hasApiKey: boolean;
}
