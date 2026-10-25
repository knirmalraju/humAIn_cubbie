"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { SeatView } from "@/lib/types";
import { nextUp } from "@/lib/types";
import type { SeatHandle } from "./useSeat";

export interface TabDef {
  id: string;
  label: string;
  sub: string;
  accent: string; // agent-a | agent-b | agent-c | agent-sys
  icon: React.ReactNode;
  unread: number;
}

/** Accessible tab bar: click or use ←/→, Home, End. The active pill slides between tabs. */
export function Tabs({ tabs, active, onChange, label }: { tabs: TabDef[]; active: string; onChange: (id: string) => void; label: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const last = tabs.length - 1;
    const to = e.key === "ArrowRight" ? (i === last ? 0 : i + 1) : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (to < 0) return;
    e.preventDefault();
    onChange(tabs[to].id);
    refs.current[to]?.focus();
  };
  return (
    <div className="tabbar">
      <div className={`tabs${tabs.length === 2 ? " two" : ""}`} role="tablist" aria-label={label}>
        {tabs.map((t, i) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => { refs.current[i] = el; }}
              id={`tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              className={`tab ${t.accent}`}
              onClick={() => onChange(t.id)}
              onKeyDown={(e) => onKey(e, i)}
            >
              {selected && <motion.span layoutId={`pill-${label}`} className="pill-bg" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              {t.icon}
              <span className="tab-text">
                <span className="tab-name">{t.label}</span>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span key={t.sub} className="tab-sub" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
                    {t.sub}
                  </motion.span>
                </AnimatePresence>
              </span>
              <AnimatePresence>
                {t.unread > 0 && !selected && (
                  <motion.span className="unread" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} aria-label={`${t.unread} new`}>
                    {t.unread > 9 ? "9+" : t.unread}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TabPanel({ id, active, children }: { id: string; active: string; children: React.ReactNode }) {
  const on = id === active;
  // Panels stay mounted (just hidden) so a half-typed message survives switching tabs.
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={!on} className="tabpanel">
      <motion.div initial={false} animate={on ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }} transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}>
        {children}
      </motion.div>
    </div>
  );
}

/** One-line status for a roommate's tab. */
export function seatSub(v: SeatView | null): string {
  if (!v) return "Connecting…";
  const ag = v.agreement;
  if (v.me.busy) return "Agent is typing…";
  if (v.me.pending) return "Preview ready to review";
  if (v.status === "paused" && !v.me.flexAnswered) return "Agents need your answer";
  if (v.status === "awaiting_approval" && ag) return v.me.approvedVersion === ag.version ? `Approved v${ag.version}` : `Approval needed · v${ag.version}`;
  if (v.status === "confirmed" && ag) {
    const up = nextUp(ag);
    if (up === undefined) return "Rotation complete";
    if (ag.tasks[up].seat === v.seat) return "Your turn now";
    const mineLeft = ag.tasks.some((t, i) => t.seat === v.seat && !ag.done[i]);
    return mineLeft ? "Waiting for your turn" : "Your part is done";
  }
  if (v.status === "no_agreement") return "No agreement";
  if (v.me.shareApproved) return "Shared · waiting";
  return "Private chat";
}

export function negotiationSub(v: SeatView | null): string {
  if (!v) return "Connecting…";
  switch (v.status) {
    case "intake": {
      const n = [v.me.shareApproved, ...v.others.map((o) => o.shareApproved)].filter(Boolean).length;
      return `${n}/3 shared`;
    }
    case "negotiating":
      return v.negotiating ? `Agents talking · ${v.declined}/3 declined` : "Agents negotiating";
    case "paused":
      return "Paused · asking everyone";
    case "awaiting_approval": {
      const ver = v.agreement?.version ?? 0;
      const n = [v.me.approvedVersion, ...v.others.map((o) => o.approvedVersion)].filter((x) => x === ver).length;
      return `Draft v${ver} · ${n}/3 approved`;
    }
    case "confirmed": {
      const ag = v.agreement;
      const up = ag ? nextUp(ag) : undefined;
      if (!ag || up === undefined) return "Rotation complete";
      const who = ag.tasks[up].seat === v.seat ? v.me.name : v.others.find((o) => o.seat === ag.tasks[up].seat)?.name;
      return `Confirmed · ${who} up next`;
    }
    case "no_agreement":
      return "No agreement";
  }
}

/**
 * Unread counter per tab: counts new items that arrived while the tab wasn't open.
 * `counts` maps tab id to a number that only grows (messages, previews, exchange entries).
 */
export function useUnread(counts: Record<string, number | null>, active: string) {
  const [seen, setSeen] = useState<Record<string, number>>({});
  useEffect(() => {
    setSeen((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const [id, c] of Object.entries(counts)) {
        if (c === null) continue;
        // First time we see a tab: everything already there counts as read.
        if (next[id] === undefined || id === active) {
          if (next[id] !== c) {
            next[id] = c;
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [counts, active]);
  return (id: string) => {
    const c = counts[id];
    return c === null || seen[id] === undefined ? 0 : Math.max(0, c - seen[id]);
  };
}

export const seatCount = (h: SeatHandle) => (h.view ? h.view.me.chat.length + (h.view.me.pending ? 1 : 0) + (h.view.agreement?.version ?? 0) : null);
