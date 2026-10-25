"use client";

import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import type { ExchangeEntry, Seat } from "@/lib/types";
import { MAX_DECLINES, SEATS, nextUp } from "@/lib/types";
import { CheckIcon } from "./icons";
import { Scene, type SceneMood } from "./Scene";
import type { NegotiationView } from "@/lib/negotiation-view";

const TAG: Record<ExchangeEntry["kind"], string> = {
  shared: "Shared · approved",
  propose: "Proposal",
  counter: "Counteroffer",
  decline: "Declined",
  accept: "Accepted for review",
  pause: "Paused",
  flex: "Student answered",
  resume: "Negotiating",
  no_agreement: "No agreement",
  presented: "Draft presented",
  amend: "Changed",
  approved: "Approval",
  confirmed: "Confirmed",
  done: "Follow-up",
  error: "Error",
};

const STATUS: Record<NegotiationView["status"], { label: string; tone: string; live?: boolean }> = {
  intake: { label: "Waiting for sharing previews", tone: "" },
  negotiating: { label: "Agents negotiating", tone: "accent", live: true },
  paused: { label: "Paused · asking everyone", tone: "warn" },
  awaiting_approval: { label: "Waiting for approvals", tone: "warn" },
  confirmed: { label: "Agreement confirmed", tone: "ok" },
  no_agreement: { label: "No agreement", tone: "" },
};

function moodFor(v: NegotiationView): SceneMood {
  if (v.status === "confirmed") return "agreed";
  if (v.status === "no_agreement") return "apart";
  if (v.negotiating || v.status === "negotiating") return "talking";
  return "idle";
}

export function ExchangePanel({ view, onOpenSeat }: { view: NegotiationView | null; onOpenSeat?: (s: Seat) => void }) {
  if (!view) return <div className="card" style={{ minHeight: 320 }} aria-busy="true" />;
  const name = (s: Seat) => view.people.find(p => p.seat === s)?.name ?? s;
  const st = STATUS[view.status];

  return (
    <motion.section className="card agent-sys" aria-label="Agent exchange" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
      <div className="scene-strip">
        <Scene mood={moodFor(view)} compact />
      </div>
      <div className="card-head" style={{ flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="title">Agent exchange</div>
          <div className="muted">Shared channel · all three friends can read it</div>
        </div>
        <span className={`badge ${st.tone}`}>{st.live && <span className="pulse" />}{st.label}{view.round === 2 ? " · round 2" : ""}</span>
        <div className="meter" aria-label={`${view.declined} of ${MAX_DECLINES} proposals declined`} title="Declined proposals before the agents pause">
          <span className="eyebrow" style={{ marginRight: 4 }}>Declines</span>
          {Array.from({ length: MAX_DECLINES }, (_, i) => (
            <motion.i key={i} className={i < view.declined ? "on" : ""} animate={{ scaleX: i < view.declined ? 1 : 0.85 }} />
          ))}
        </div>
      </div>

      <div className="card-body">
        {!view.hasApiKey && <div className="note err">No Gemini API key on the server. Add GEMINI_API_KEY to .env.local and restart.</div>}
        {view.error && (
          <div className="note err" role="alert" style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <span>{view.error}</span>
            <span className="muted">Send “retry” in your private chat.</span>
          </div>
        )}

        <Presence view={view} onOpen={onOpenSeat} />

        {view.exchange.length === 0 && (
          <div className="tile" style={{ alignItems: "center", textAlign: "center", padding: "36px 16px", borderStyle: "dashed" }}>
            <span className="eyebrow">Nothing exchanged yet</span>
            <span className="muted" style={{ maxWidth: 360 }}>Each agent waits until its own student approves a sharing preview. Only approved items ever appear here.</span>
          </div>
        )}

        <div className="timeline">
          <AnimatePresence initial={false}>
            {view.exchange.map((e) => {
              const cls = e.from === "system" ? "agent-sys" : `agent-${e.from}`;
              const who = e.from === "system" ? "Count Me In" : `${name(e.from)}'s agent`;
              const showTerms = e.proposal && (e.kind === "propose" || e.kind === "counter");
              return (
                <motion.div key={e.id} className={`ev ${cls}`} initial={{ opacity: 0, x: e.from === "b" ? 16 : -16 }} animate={{ opacity: 1, x: 0 }} layout="position">
                  <div className={`orb sm${e.from === "system" ? " sys" : ""}`}>{e.from === "system" ? <CheckIcon size={12} /> : name(e.from)[0]?.toUpperCase()}</div>
                  <div className="ev-card">
                    <div className="ev-head">
                      <span className="ev-who">{who}</span>
                      <span className="badge accent">{TAG[e.kind]}{showTerms ? ` ${e.proposal!.n}` : ""}</span>
                    </div>
                    <div className="ev-text">{e.text}</div>
                    {e.facts && <ul className="ev-facts">{e.facts.map((f, i) => <li key={i}>{f}</li>)}</ul>}
                    {showTerms && (
                      <div className="ev-terms">
                        {e.proposal!.tasks.map((t, i) => (
                          <div key={i}><strong>{name(t.seat)}</strong> · {t.task} · <span className="mono" style={{ color: "var(--fg-2)" }}>{t.due}</span></div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {view.negotiating && (
            <motion.div className="ev" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="orb sm sys" />
              <div className="typing" aria-label="An agent is considering the proposal">
                {[0, 1, 2].map((i) => (
                  <motion.span key={i} animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />
                ))}
              </div>
            </motion.div>
          )}
        </div>

        <AgreementCard view={view} name={name} />
      </div>
    </motion.section>
  );
}

/** The agreement as a physical card: tilts toward the pointer, stamps a seal when confirmed. */
function AgreementCard({ view, name }: { view: NegotiationView; name: (s: Seat) => string }) {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [6, -6]), { stiffness: 200, damping: 20 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-8, 8]), { stiffness: 200, damping: 20 });

  if (view.status === "no_agreement") {
    return (
      <motion.div className="agreement none" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <span className="eyebrow">Outcome</span>
        <h2 className="display" style={{ fontSize: "var(--t-2xl)" }}>No agreement, <em>and that&apos;s okay.</em></h2>
        <div style={{ color: "var(--fg-2)" }}>The approved constraints couldn&apos;t be reconciled. Nobody was committed to anything, and no outing is booked.</div>
      </motion.div>
    );
  }
  const ag = view.agreement;
  if (!ag || (view.status !== "awaiting_approval" && view.status !== "confirmed")) return null;
  const confirmed = view.status === "confirmed";
  const up = nextUp(ag);
  const statusOf = (v: number) => (v === ag.version ? { t: `Approved v${ag.version}`, c: "ok" } : v > 0 ? { t: `Voided · had v${v}`, c: "void" } : { t: "Pending", c: "" });
  const approvedOf = (s: Seat) => (view.people.find(p => p.seat === s)?.approvedVersion ?? 0);
  const people = SEATS.map((s) => ({ seat: s, n: name(s), s: statusOf(approvedOf(s)) }));

  return (
    <div style={{ perspective: 1200, paddingTop: 12 }}>
      <motion.div
        className={`agreement${confirmed ? " confirmed" : ""}`}
        style={{ rotateX: rx, rotateY: ry }}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          mx.set((e.clientX - r.left) / r.width - 0.5);
          my.set((e.clientY - r.top) / r.height - 0.5);
        }}
        onPointerLeave={() => { mx.set(0); my.set(0); }}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        key={`v${ag.version}`}
      >
        <AnimatePresence>
          {confirmed && (
            <motion.div className="seal" initial={{ scale: 2.4, opacity: 0, rotate: -30 }} animate={{ scale: 1, opacity: 1, rotate: -8 }} transition={{ type: "spring", stiffness: 260, damping: 14 }}>
              <span className="badge ok" style={{ height: 30, padding: "0 14px", fontSize: 12, background: "#0f2a1f" }}><CheckIcon size={13} />Confirmed by all three</span>
            </motion.div>
          )}
        </AnimatePresence>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap", transform: "translateZ(30px)" }}>
          <div>
            <span className="eyebrow">{view.scenario === "campus" ? "Campus dinner plan · sample venues" : "Agreement"}</span>
            <h2 className="display" style={{ fontSize: "var(--t-2xl)" }}>{confirmed ? <>It&apos;s <em>settled.</em></> : <>Draft, <em>awaiting everyone.</em></>}</h2>
          </div>
          <span className="badge mono">v{ag.version}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, transform: "translateZ(20px)" }}>
          {ag.tasks.map((t, i) => (
            <div key={i} className={`term agent-${t.seat}`}>
              <div className="orb sm">{name(t.seat)[0]?.toUpperCase()}</div>
              <div className="who">
                {name(t.seat)}
                {confirmed && ag.done[i] && <span className="badge ok" style={{ marginLeft: 8, height: 20 }}><CheckIcon size={10} />Done</span>}
                {confirmed && !ag.done[i] && up === i && <span className="badge accent" style={{ marginLeft: 8, height: 20 }}><span className="pulse" />Up next</span>}
              </div>
              <div className="task">{t.task}</div>
              <div className="due">{t.due}</div>
            </div>
          ))}
        </div>
        <div className="grid3" style={{ transform: "translateZ(10px)" }}>
          {people.map((p) => (
            <motion.div key={p.n + p.s.t} className={`vote agent-${p.seat} ${p.s.c}`} initial={{ scale: 0.96, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }}>
              <span className="muted">{p.n}</span>
              <strong style={{ fontSize: "var(--t-md)" }}>{p.s.t}</strong>
            </motion.div>
          ))}
        </div>
        {ag.history.length > 1 && (
          <div className="muted mono" style={{ fontSize: 12 }}>
            {ag.history.map((h) => `v${h.version} ${h.by === "agents" ? "agents" : name(h.by)}`).join("  →  ")}
          </div>
        )}
        <div className="muted">Confirmed only when all three approve the same version. Any change creates a new version and voids earlier approvals.</div>
      </motion.div>
    </div>
  );
}

/** Who is doing what right now. Status only: never anyone's private words. */
function Presence({ view, onOpen }: { view: NegotiationView; onOpen?: (s: Seat) => void }) {
  const people = view.people;
  const accepted = new Set(view.accepts);
  const proposer = view.currentProposal?.by;
  return (
    <div className="presence" aria-label="Friends' status">
      {people.map((p) => {
        let label = p.shared ? "Shared" : "Not shared yet";
        if (view.status === "negotiating") label = proposer === p.seat ? "Proposed" : accepted.has(p.seat) ? "Agent accepted" : "Agent deciding";
        if (p.reviewing) label = "Reviewing preview";
        if (p.busy) label = "Talking to their agent";
        const inner = (
          <>
            <span className="orb">{p.name[0]?.toUpperCase()}</span>
            <strong style={{ color: "var(--fg)", fontWeight: 600 }}>{p.name}</strong>
            <AnimatePresence mode="wait">
              <motion.span key={label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} style={{ color: p.busy ? "var(--accent)" : "var(--fg-3)" }}>
                {p.busy && <span className="pulse" style={{ display: "inline-block", marginRight: 6, verticalAlign: "middle" }} />}{label}
              </motion.span>
            </AnimatePresence>
          </>
        );
        return onOpen ? (
          <motion.button key={p.seat} layout type="button" className={`badge agent-${p.seat}`} style={{ cursor: "pointer" }} onClick={() => onOpen(p.seat)} whileHover={{ y: -1 }} title={`Open ${p.name}'s chat`}>
            {inner}
          </motion.button>
        ) : (
          <motion.span key={p.seat} layout className={`badge agent-${p.seat}`}>
            {inner}
          </motion.span>
        );
      })}
    </div>
  );
}
