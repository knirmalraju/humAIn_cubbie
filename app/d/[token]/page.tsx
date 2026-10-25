"use client";

import { motion } from "framer-motion";
import { use, useEffect, useMemo, useState } from "react";
import { ExchangePanel } from "@/components/ExchangePanel";
import { SeatPanel } from "@/components/SeatPanel";
import { Stepper } from "@/components/Stepper";
import { TabPanel, Tabs, negotiationSub, seatCount, seatSub, useUnread, type TabDef } from "@/components/Tabs";
import { TopBar } from "@/components/TopBar";
import { useSeat } from "@/components/useSeat";

const LINES: Record<"a" | "b" | "c", string[]> = {
  a: [
    "It's my bathroom turn today, but I have an assignment tonight. I can clean tomorrow or on Saturday.",
    "Also, honestly, I'm still annoyed about the hair in the sink last week.",
  ],
  b: [
    "I have guests tonight. I need the bathroom clean before 6, and I could do it if someone takes my turn next Tuesday.",
    "Kind of tired of always covering extra turns, to be honest.",
  ],
  c: [
    "Saturday is my turn but I'm away all weekend. I can take any turn next week.",
    "Also someone keeps leaving wet towels on the floor.",
  ],
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
            <span className="eyebrow">Live demo · you play all three roommates</span>
            <h1 className="display" style={{ fontSize: "var(--t-3xl)" }}>
              <em className="grad-iris">Max</em>, <em className="grad-ember">Jordan</em> and <em className="grad-rose">Sam</em> share one bathroom.
            </h1>
            <p className="lede" style={{ fontSize: "var(--t-base)" }}>
              Three separate Gemini agents. Each roommate tab is a private chat; the negotiation tab is where only approved facts are traded.
              Sending a message takes you to the negotiation so you can watch what happens.
            </p>
          </div>
          <Stepper view={anyView} />
        </motion.div>

        <Tabs tabs={tabs} active={active} onChange={setActive} label="Demo chats" />

        {SEAT_TABS.map((s) => (
          <TabPanel key={s} id={s} active={active}>
            <SeatPanel handle={handles[s]} suggestions={LINES[s]} onSent={() => setActive("neg")} />
          </TabPanel>
        ))}
        <TabPanel id="neg" active={active}>
          <ExchangePanel handle={handles.a} onOpenSeat={(s) => setActive(s)} />
        </TabPanel>
      </main>
    </>
  );
}
