"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { ShareItem, SeatView, Task } from "@/lib/types";
import { PRIVATE_BY_DEFAULT, nextUp } from "@/lib/types";
import { BellIcon, CheckIcon, LockIcon, SendIcon } from "./icons";
import { joinNames, nameOf, othersNames } from "./names";
import type { SeatHandle } from "./useSeat";

const KIND_LABEL: Record<string, string> = {
  availability: "Availability",
  constraint: "Hard constraint",
  preference: "Preference",
  flexibility: "Offer",
  reason: "Reason · private by default",
  complaint: "Complaint · private by default",
  other: "Other",
};

const rise = {
  initial: { opacity: 0, y: 12, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.98 },
};

export function SeatPanel({ handle, suggestions = [], onSent }: { handle: SeatHandle; suggestions?: string[]; onSent?: () => void }) {
  const { view, act, pending, flash } = handle;
  if (!view) return <SkeletonPanel />;
  const { me, seat } = view;
  const them = othersNames(view);
  const stillDeciding = view.others.filter((o) => !o.flexAnswered).map((o) => o.name);

  return (
    <motion.section layout className={`card agent-${seat}`} aria-label={`${me.name}'s private chat`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      <div className="card-head">
        <div className="orb">{me.name[0]?.toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="title">{me.name}&apos;s agent</div>
          <div className="muted">Only {me.name} sees this</div>
        </div>
        <span className="badge accent"><LockIcon size={11} />Private</span>
      </div>

      <div className="card-body">
        <Chat view={view} />
        <AnimatePresence>
          {flash && (
            <motion.div key="flash" {...rise} className="note err" role="alert">{flash}</motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="popLayout">
          {me.pending && (
            <motion.div key={me.pending.map((i) => i.id).join()} {...rise} layout>
              <SharePreview items={me.pending} them={them} onApprove={(ids) => { act({ action: "approveShare", checked: ids }); onSent?.(); }} disabled={pending} />
            </motion.div>
          )}

          {view.status === "paused" && !me.flexAnswered && (
            <motion.div key="flex" {...rise} layout className="tile tint">
              <span className="eyebrow" style={{ color: "var(--accent)" }}>Agents paused · your call</span>
              <div style={{ fontSize: "var(--t-md)" }}>
                Three proposals didn&apos;t fit. Tell your agent below what you could change. Anything you offer goes through a sharing preview first.
              </div>
              <button className="btn" disabled={pending} onClick={() => act({ action: "nothingWillChange" })}>Nothing will change</button>
            </motion.div>
          )}

          {view.status === "paused" && me.flexAnswered && stillDeciding.length > 0 && (
            <motion.div key="waiting" {...rise} className="muted">Waiting for {joinNames(stillDeciding)} to answer…</motion.div>
          )}

          {view.agreement && (view.status === "awaiting_approval" || view.status === "confirmed") && (
            <motion.div key={`ag-${view.status}`} {...rise} layout>
              <AgreementBox handle={handle} />
            </motion.div>
          )}
        </AnimatePresence>

        <Composer view={view} disabled={pending || me.busy} onSend={(text) => { act({ action: "chat", text }); onSent?.(); }} suggestions={suggestions} />
      </div>
    </motion.section>
  );
}

function SkeletonPanel() {
  return (
    <div className="card" aria-busy="true">
      <div className="card-body">
        {[70, 50, 80].map((w, i) => (
          <motion.div key={i} style={{ height: 38, width: `${w}%`, borderRadius: 16, background: "var(--surface-2)" }} animate={{ opacity: [0.4, 0.8, 0.4] }} transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.15 }} />
        ))}
      </div>
    </div>
  );
}

function Chat({ view }: { view: SeatView }) {
  const ref = useRef<HTMLDivElement>(null);
  const n = view.me.chat.length;
  useNoticeAlerts(view);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [n, view.me.busy]);
  // A hidden tab can't scroll; jump to the latest message when the tab is opened.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let wasHidden = el.clientHeight === 0;
    const ro = new ResizeObserver(() => {
      const hidden = el.clientHeight === 0;
      if (wasHidden && !hidden) el.scrollTop = el.scrollHeight;
      wasHidden = hidden;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="chat" ref={ref} aria-live="polite">
      <AnimatePresence initial={false}>
        {view.me.chat.map((m) => (
          <motion.div
            key={m.id}
            className={`msg ${m.from === "student" ? "me" : ""}`}
            initial={{ opacity: 0, y: 14, scale: 0.96, originX: m.from === "student" ? 1 : 0 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            layout="position"
          >
            {m.from === "notice" ? (
              <div className="bubble notice" role="status">
                <span className="notice-head"><BellIcon size={13} />Cubbie</span>
                {m.text}
              </div>
            ) : (
              <div className={`bubble ${m.from === "student" ? "me" : "agent"}`}>{m.text}</div>
            )}
          </motion.div>
        ))}
        {view.me.busy && (
          <motion.div key="typing" className="typing" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} aria-label="Agent is thinking">
            {[0, 1, 2].map((i) => (
              <motion.span key={i} animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Pops a browser notification for each new Cubbie notice, if this roommate turned reminders on. */
function useNoticeAlerts(view: SeatView) {
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const notices = view.me.chat.filter((m) => m.from === "notice");
    if (seen.current === null) {
      seen.current = new Set(notices.map((m) => m.id)); // don't replay old ones on page load
      return;
    }
    for (const m of notices) {
      if (seen.current.has(m.id)) continue;
      seen.current.add(m.id);
      if (view.me.reminders && "Notification" in window && Notification.permission === "granted") {
        new Notification(`Cubbie · for ${view.me.name}`, { body: m.text });
      }
    }
  }, [view.me.chat, view.me.reminders, view.me.name]);
}

function Composer({ view, disabled, onSend, suggestions }: { view: SeatView; disabled: boolean; onSend: (t: string) => void; suggestions: string[] }) {
  const [text, setText] = useState("");
  const ended = view.status === "confirmed" || view.status === "no_agreement";
  const send = () => {
    const t = text.trim();
    if (!t || disabled) return;
    setText("");
    onSend(t);
  };
  const used = new Set(view.me.chat.filter((m) => m.from === "student").map((m) => m.text));
  // Demo lines only help before the first share; afterwards they would just be noise.
  const left = view.me.shareApproved ? [] : suggestions.filter((s) => !used.has(s));
  return (
    <>
      {left.length > 0 && (
        <div className="suggest" aria-label="Demo lines">
          <span className="eyebrow">Try saying</span>
          {left.map((s) => (
            <motion.button key={s} type="button" onClick={() => setText(s)} whileHover={{ x: 2 }} whileTap={{ scale: 0.98 }}>
              “{s}”
            </motion.button>
          ))}
        </div>
      )}
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <label htmlFor={`msg-${view.seat}`} className="sr-only">Message your agent</label>
        <textarea
          id={`msg-${view.seat}`}
          rows={1}
          value={text}
          placeholder={ended ? "Ask your agent anything" : "Tell your agent what's going on"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <motion.button className="send" type="submit" disabled={disabled || !text.trim()} aria-label="Send" whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.92 }}>
          <SendIcon />
        </motion.button>
      </form>
    </>
  );
}

function SharePreview({ items, them, onApprove, disabled }: { items: ShareItem[]; them: string; onApprove: (ids: string[]) => void; disabled: boolean }) {
  const [checked, setChecked] = useState(() => new Set(items.filter((i) => i.checked).map((i) => i.id)));
  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <div className="tile tint">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span className="eyebrow" style={{ color: "var(--accent)" }}>Sharing preview</span>
        <span className="badge">{checked.size}/{items.length} selected</span>
      </div>
      <div style={{ fontSize: "var(--t-md)", color: "var(--fg-2)" }}>
        The agents of {them} see exactly the checked items, worded as shown. Nothing else from this chat.
      </div>
      <motion.div style={{ display: "flex", flexDirection: "column", gap: 8 }} initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.06 } } }}>
        {items.map((i) => {
          const priv = PRIVATE_BY_DEFAULT.includes(i.kind);
          const on = checked.has(i.id);
          return (
            <motion.label key={i.id} className={`choice${on ? " on" : ""}`} variants={{ hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0 } }} whileTap={{ scale: 0.99 }}>
              <input type="checkbox" checked={on} onChange={() => toggle(i.id)} />
              <span className="check">
                <AnimatePresence>{on && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><CheckIcon size={12} /></motion.span>}</AnimatePresence>
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span className={`kind${priv ? " private" : ""}`}>{priv && <LockIcon size={10} />} {KIND_LABEL[i.kind] ?? i.kind}</span>
                <span style={{ fontSize: "var(--t-md)" }}>{i.text}</span>
              </span>
            </motion.label>
          );
        })}
      </motion.div>
      <motion.button className="btn btn-accent btn-block" disabled={disabled} onClick={() => onApprove([...checked])} whileTap={{ scale: 0.98 }}>
        {checked.size ? `Approve and share ${checked.size} item${checked.size === 1 ? "" : "s"}` : "Share nothing"}
      </motion.button>
    </div>
  );
}

function AgreementBox({ handle }: { handle: SeatHandle }) {
  const { view, act, pending } = handle;
  const [change, setChange] = useState("");
  const [showChange, setShowChange] = useState(false);
  if (!view?.agreement) return null;
  const { agreement: ag, me, seat } = view;
  const them = othersNames(view);
  const confirmed = view.status === "confirmed";
  const iApproved = me.approvedVersion === ag.version;
  const voided = me.approvedVersion > 0 && !iApproved;
  const mine = ag.tasks.map((t, i) => ({ t, i })).filter(({ t }) => t.seat === seat);
  const up = nextUp(ag);
  const theirs = ag.tasks.filter((t) => t.seat !== seat);

  if (confirmed) {
    return (
      <div className="tile tint">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span className="eyebrow" style={{ color: "var(--accent)" }}>Your part</span>
          <span className="badge ok"><CheckIcon size={11} />v{ag.version} confirmed</span>
        </div>
        {mine.length === 0 && <div className="muted">Nothing assigned to you this time.</div>}
        {mine.map(({ t, i }) => (
          <div key={i} className="tile" style={{ gap: 8, borderColor: up === i ? "var(--accent-line)" : undefined }}>
            {up === i && <span className="badge accent" style={{ alignSelf: "flex-start" }}><span className="pulse" />Your turn now</span>}
            <div style={{ fontWeight: 600 }}>{t.task}</div>
            <div className="mono" style={{ color: "var(--accent)", fontSize: "var(--t-sm)" }}>{t.due}</div>
            <Reminder task={t} on={me.reminders} done={!!ag.done[i]} />
            <AnimatePresence mode="wait">
              {ag.done[i] ? (
                <motion.div key="done" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="badge ok" style={{ height: 36, justifyContent: "center", fontSize: 13 }}>
                  <CheckIcon size={13} />Done
                </motion.div>
              ) : (
                <motion.button key="todo" exit={{ opacity: 0 }} className="btn btn-accent" disabled={pending} onClick={() => act({ action: "done", index: i })} whileTap={{ scale: 0.97 }}>
                  Mark done
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        ))}
        <label className={`choice${me.reminders ? " on" : ""}`}>
          <input
            type="checkbox"
            checked={me.reminders}
            onChange={async (e) => {
              const on = e.target.checked;
              if (on && "Notification" in window && Notification.permission === "default") await Notification.requestPermission();
              act({ action: "reminders", on });
            }}
          />
          <span className="check">{me.reminders && <CheckIcon size={12} />}</span>
          <span style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "var(--t-md)" }}><BellIcon size={15} />Remind me 2 hours before</span>
        </label>
        <div className="muted">Reminders go to {me.name} only. Each roommate&apos;s own agent looks after their part.</div>
      </div>
    );
  }

  return (
    <div className="tile" style={{ borderColor: "var(--accent-line)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span className="eyebrow">Draft agreement · v{ag.version}</span>
        <span className={`badge ${iApproved ? "ok" : "warn"}`}>{iApproved ? "You approved" : "Needs you"}</span>
      </div>
      <TaskList title="Your part" tasks={mine.map((m) => m.t)} strong />
      <TaskList title="Everyone else" tasks={theirs} names={(s) => nameOf(view, s)} />
      <AnimatePresence>
        {voided && (
          <motion.div {...rise} className="note warn">You approved v{me.approvedVersion}, but the draft changed. That approval no longer counts.</motion.div>
        )}
      </AnimatePresence>
      {me.amendDraft ? (
        <motion.div {...rise} className="tile tint">
          <span className="eyebrow" style={{ color: "var(--accent)" }}>Your change · not sent</span>
          <div style={{ fontSize: "var(--t-md)" }}>{me.amendDraft.note}</div>
          {me.amendDraft.tasks.map((t, i) => (
            <div key={i} className="muted">{t.seat === seat ? "You" : nameOf(view, t.seat)}: {t.task} · <span className="mono">{t.due}</span></div>
          ))}
          <div className="muted">Sending makes this v{ag.version + 1}. Both approvals reset, including yours.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-accent" disabled={pending} onClick={() => act({ action: "sendAmend" })}>Send as v{ag.version + 1}</button>
            <button className="btn btn-ghost" disabled={pending} onClick={() => act({ action: "discardAmend" })}>Discard</button>
          </div>
        </motion.div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!iApproved && (
            <motion.button className="btn btn-accent" disabled={pending} onClick={() => act({ action: "approve", version: ag.version })} whileTap={{ scale: 0.97 }}>
              <CheckIcon size={14} />Approve v{ag.version}
            </motion.button>
          )}
          <button className="btn" disabled={pending || me.busy} onClick={() => setShowChange((s) => !s)}>Request a change</button>
        </div>
      )}
      <AnimatePresence>
        {showChange && !me.amendDraft && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              if (!change.trim()) return;
              act({ action: "requestAmend", text: change.trim() });
              setChange("");
              setShowChange(false);
            }}
          >
            <label htmlFor={`chg-${seat}`} className="sr-only">What should change?</label>
            <textarea id={`chg-${seat}`} rows={1} value={change} placeholder="e.g. Could I do Saturday by 2 PM instead?" onChange={(e) => setChange(e.target.value)} />
            <button className="btn" type="submit" disabled={!change.trim() || me.busy}>Draft</button>
          </motion.form>
        )}
      </AnimatePresence>
      <div className="muted">Your agent can&apos;t approve for you. {them} only see whether you approved.</div>
    </div>
  );
}

function TaskList({ title, tasks, strong, names }: { title: string; tasks: Task[]; strong?: boolean; names?: (s: Task["seat"]) => string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="muted">{title}</span>
      {tasks.length === 0 && <span className="muted">Nothing</span>}
      {tasks.map((t, i) => (
        <div key={i}>
          <div style={{ fontWeight: 600 }}>{names ? `${names(t.seat)}: ` : ""}{t.task}</div>
          <div className="mono" style={{ fontSize: "var(--t-sm)", color: strong ? "var(--accent)" : "var(--fg-3)" }}>{t.due}</div>
        </div>
      ))}
    </div>
  );
}

/** In-app reminder: a banner (and a browser notification if allowed) 2 hours before the deadline. */
function Reminder({ task, on, done }: { task: Task; on: boolean; done: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef(false);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const due = task.dueIso ? Date.parse(task.dueIso) : NaN;
  const active = on && !done && !Number.isNaN(due) && now >= due - 2 * 3600_000;
  useEffect(() => {
    if (active && !fired.current && "Notification" in window && Notification.permission === "granted") {
      fired.current = true;
      new Notification("RoomPeace reminder", { body: `${task.task}: ${task.due}` });
    }
  }, [active, task]);
  if (!active) return null;
  return <div className="note warn" role="status">Reminder: this is due {now > due ? "now (past the deadline)" : "soon"}.</div>;
}
