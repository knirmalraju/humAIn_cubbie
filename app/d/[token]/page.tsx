"use client";

import { motion } from "framer-motion";
import { use, useEffect, useMemo, useState } from "react";
import { negotiationFromSeat } from "@/lib/negotiation-view";
import { ExchangePanel } from "@/components/ExchangePanel";
import { SeatPanel } from "@/components/SeatPanel";
import { Stepper } from "@/components/Stepper";
import { TabPanel, Tabs, negotiationSub, seatCount, seatSub, useUnread, type TabDef } from "@/components/Tabs";
import { TopBar } from "@/components/TopBar";
import { useSeat } from "@/components/useSeat";

const LINES: Record<"a" | "b" | "c", string[]> = {
  a: ["Let’s get dinner together. I’m free from 7 to 9 tonight, can spend up to $15, and can walk 10 minutes. I have a lab before then, but keep that reason private."],
  b: ["I’m free from 6 to 8 tonight. I need vegetarian options, a meal under $12, and a walk of no more than 10 minutes. I need to leave by 8."],
  c: ["I can join between 6:30 and 8:30 tonight, spend at most $10, and walk up to 5 minutes. Money is tight this month; don’t share that reason."],
};

const SEAT_TABS = ["a", "b", "c"] as const;

export default function DemoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [seats, setSeats] = useState<{ a: string; b: string; c: string } | null>(null);
  const [missing, setMissing] = useState(false);
  const [active, setActive] = useState<string>("a");
  useEffect(() => {
    fetch(`/api/demo/${token}`).then(async (r) => (r.ok ? setSeats(await r.json()) : setMissing(true)));
  }, [token]);
  const handles = { a: useSeat(seats?.a ?? null), b: useSeat(seats?.b ?? null), c: useSeat(seats?.c ?? null) };
  const anyView = handles.a.view;

  const counts = useMemo(
    () => ({ a: seatCount(handles.a), b: seatCount(handles.b), c: seatCount(handles.c), neg: anyView ? anyView.exchange.length : null }),
    [handles.a, handles.b, handles.c, anyView],
  );
  const unread = useUnread(counts, active);

  if (missing) {
    return (
      <>
        <TopBar />
        <main className="shell page" style={{ paddingTop: 48 }}><p className="lede">Demo not found. Start a new one from the home page.</p></main>
      </>
    );
  }

  const tabs: TabDef[] = [
    ...SEAT_TABS.map((s) => {
      const v = handles[s].view;
      return {
        id: s,
        label: v?.me.name ?? "…",
        sub: seatSub(v),
        accent: `agent-${s}`,
        icon: <span className="orb">{v?.me.name[0]?.toUpperCase() ?? ""}</span>,
        unread: unread(s),
      };
    }),
    {
      id: "neg",
      label: "Agent negotiation",
      sub: negotiationSub(anyView),
      accent: "agent-sys",
      icon: <span className="hub" aria-hidden="true">⇄</span>,
      unread: unread("neg"),
    },
  ];

  return (
    <>
      <TopBar chip="Demo · fictional data" />
      <main className="shell page" style={{ paddingTop: 28, gap: 12 }}>
        <motion.div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 20 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 760 }}>
            <span className="eyebrow">Live demo · you play all three friends</span>
            <h1 className="display" style={{ fontSize: "var(--t-3xl)" }}>
              <em className="grad-iris">Max</em>, <em className="grad-ember">Jordan</em> and <em className="grad-rose">Sam</em> make dinner happen.
            </h1>
            <p className="lede" style={{ fontSize: "var(--t-base)" }}>
              Three separate Gemini agents. Each person’s tab is a private chat; the negotiation tab is where only approved facts are traded.
              Share facts, approve a plan, or request changes by messaging your own agent. Watch the agents in the negotiation tab.
            </p>
          </div>
          <Stepper view={anyView} />
        </motion.div>

        <Tabs tabs={tabs} active={active} onChange={setActive} label="Demo chats" />

        {SEAT_TABS.map((s) => (
          <TabPanel key={s} id={s} active={active}>
            <SeatPanel handle={handles[s]} suggestions={LINES[s]} />
          </TabPanel>
        ))}
        <TabPanel id="neg" active={active}>
          <ExchangePanel view={negotiationFromSeat(handles.a.view)} onOpenSeat={(s) => setActive(s)} />
        </TabPanel>
      </main>
    </>
  );
}
