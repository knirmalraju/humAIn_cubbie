"use client";

import { use, useMemo, useState } from "react";
import { negotiationFromSeat } from "@/lib/negotiation-view";
import { ExchangePanel } from "@/components/ExchangePanel";
import { SeatPanel } from "@/components/SeatPanel";
import { Stepper } from "@/components/Stepper";
import { TabPanel, Tabs, negotiationSub, seatCount, seatSub, useUnread, type TabDef } from "@/components/Tabs";
import { TopBar } from "@/components/TopBar";
import { useSeat } from "@/components/useSeat";

export default function SeatPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const handle = useSeat(token);
  const [active, setActive] = useState("me");
  const v = handle.view;
  const counts = useMemo(() => ({ me: seatCount(handle), neg: v ? v.exchange.length : null }), [handle, v]);
  const unread = useUnread(counts, active);

  if (handle.notFound) {
    return (
      <>
        <TopBar />
        <main className="shell page" style={{ paddingTop: 48 }}>
          <p className="lede">This link doesn&apos;t match a room. Ask your friends for a new one, or start a new room.</p>
        </main>
      </>
    );
  }

  const tabs: TabDef[] = [
    { id: "me", label: v ? `${v.me.name} · my agent` : "My agent", sub: seatSub(v), accent: `agent-${v?.seat ?? "a"}`, icon: <span className="orb">{v?.me.name[0]?.toUpperCase() ?? ""}</span>, unread: unread("me") },
    { id: "neg", label: "Agent negotiation", sub: negotiationSub(v), accent: "agent-sys", icon: <span className="hub" aria-hidden="true">⇄</span>, unread: unread("neg") },
  ];

  return (
    <>
      <TopBar chip={v?.demo ? "Demo · fictional data" : "Private link · don't share it"} />
      <main className="shell page" style={{ paddingTop: 28, gap: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="eyebrow">Your private room</span>
            <h1 className="display" style={{ fontSize: "var(--t-3xl)" }}>
              {v ? <>Hi {v.me.name}, <em>let&apos;s sort it out.</em></> : <>&nbsp;</>}
            </h1>
          </div>
          <Stepper view={v} />
        </div>
        <Tabs tabs={tabs} active={active} onChange={setActive} label="Your chats" />
        <TabPanel id="me" active={active}>
          <SeatPanel handle={handle} />
        </TabPanel>
        <TabPanel id="neg" active={active}>
          <ExchangePanel view={negotiationFromSeat(handle.view)} />
        </TabPanel>
      </main>
    </>
  );
}
