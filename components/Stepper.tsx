"use client";

import { motion } from "framer-motion";
import type { SeatView } from "@/lib/types";
import { CheckIcon } from "./icons";

const STEPS = ["Private chats", "Sharing", "Negotiation", "Agreement", "Follow-up"];

function phase(v: SeatView | null) {
  if (!v) return 0;
  switch (v.status) {
    case "intake":
      return v.me.shareApproved || v.others.some((o) => o.shareApproved) ? 1 : 0;
    case "negotiating":
    case "paused":
      return 2;
    case "awaiting_approval":
    case "no_agreement":
      return 3;
    case "confirmed":
      return 4;
  }
}

export function Stepper({ view }: { view: SeatView | null }) {
  const p = phase(view);
  return (
    <ol className="stepper" aria-label="Progress" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {STEPS.map((s, i) => (
        <motion.li key={s} className={`step${i < p ? " done" : i === p ? " active" : ""}`} layout aria-current={i === p ? "step" : undefined}>
          <span className="n">{i < p ? <CheckIcon size={11} /> : i + 1}</span>
          {s}
        </motion.li>
      ))}
    </ol>
  );
}
