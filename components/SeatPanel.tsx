"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { SeatView, Task } from "@/lib/types";
import { BellIcon, LockIcon, SendIcon } from "./icons";
import type { SeatHandle } from "./useSeat";

export function SeatPanel({ handle, suggestions = [] }: { handle: SeatHandle; suggestions?: string[] }) {
  const { view, act, pending, flash } = handle;
  if (!view) return <div className="card" style={{ minHeight: 240 }} aria-busy="true" />;
  const { me, seat } = view;
  let prompts = me.shareApproved ? [] : suggestions;
  if (me.pending) prompts = [`share p${me.previewVersion ?? 0} safe`, `share p${me.previewVersion ?? 0} none`];
  else if (me.amendDraft?.id) prompts = [`send change ${me.amendDraft.id}`, "discard change"];
  else if (view.status === "awaiting_approval" && view.agreement) prompts = [
    ...(me.approvedVersion === view.agreement.version ? [] : [`approve v${view.agreement.version}`]),
    "change: Could we meet 15 minutes later?",
  ];
  else if (view.status === "paused" && !me.flexAnswered) prompts = ["nothing will change", "I could be flexible about the location."];
  else if (view.status === "confirmed") prompts = ["reminders on", "change: My schedule changed. Can we find another time?"];
  if (view.error) prompts = ["retry", ...prompts];
  return <motion.section className={`card agent-${seat}`} aria-label={`${me.name}'s private chat`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
    <div className="card-head">
      <div className="orb">{me.name[0]?.toUpperCase()}</div>
      <div style={{ flex: 1 }}><div className="title">{me.name}&apos;s agent</div><div className="muted">Only {me.name} sees this</div></div>
      <span className="badge accent"><LockIcon size={11}/>Private</span>
    </div>
    <div className="card-body">
      <Chat view={view}/>
      {flash && <div className="msg"><div className="bubble notice" role="alert">{flash}</div></div>}
      <Composer view={view} disabled={pending || me.busy} onSend={text => { void act({ action: "chat", text }); }} suggestions={prompts}/>
    </div>
  </motion.section>;
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
        {view.me.pending && !view.me.chat.some(m => m.text.startsWith(`Sharing preview p${view.me.previewVersion ?? 0}`)) && <div className="msg"><div className="bubble agent">{`Sharing preview p${view.me.previewVersion ?? 0}:\n${view.me.pending.map((item, i) => `${i + 1}. [${item.kind}] ${item.text}`).join("\n")}\nReply “share p${view.me.previewVersion ?? 0} safe” to exclude reasons and complaints, or “share p${view.me.previewVersion ?? 0} 1,2” for exact items.`}</div></div>}
        {view.status === "confirmed" && view.agreement?.tasks.map((task, i) => task.seat === view.seat ? <Reminder key={`${view.agreement!.version}-${i}`} task={task} on={view.me.reminders} done={!!view.agreement!.done[i]} /> : null)}
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

  const send = () => {
    const t = text.trim();
    if (!t || disabled) return;
    setText("");
    onSend(t);
  };
  const used = new Set(view.me.chat.filter((m) => m.from === "student").map((m) => m.text));
  // Demo lines only help before the first share; afterwards they would just be noise.
  const left = suggestions.filter((s) => !used.has(s));
  return (
    <>
      {left.length > 0 && (
        <div className="suggest" aria-label="Suggested messages">
          <span className="eyebrow">Suggested messages · tap to draft, then send</span>
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
          placeholder="Type a message or approval…"
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
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
      new Notification("Count Me In reminder", { body: `${task.task}: ${task.due}` });
    }
  }, [active, task]);
  if (!active) return null;
  return <div className="msg"><div className="bubble notice" role="status">Reminder: {task.task} — {task.due}. {now > due ? "The time has passed." : "Coming up soon."}</div></div>;
}
