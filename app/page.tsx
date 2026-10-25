"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowIcon, BellIcon, LayersIcon, LockIcon, PauseIcon, ShieldIcon } from "@/components/icons";
import { Scene } from "@/components/Scene";
import { TopBar } from "@/components/TopBar";

const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
};

const STEPS = [
  { n: "01", t: "Talk privately", d: "Each friend tells their own agent what's going on, including the parts they'd rather not say out loud." },
  { n: "02", t: "Share by message", d: "A sharing preview shows exactly what leaves the chat. Reply with the numbered facts you permit. Reasons and complaints stay private by default." },
  { n: "03", t: "Agents negotiate", d: "The three agents trade proposals and counteroffers using only approved facts." },
  { n: "04", t: "Everyone says yes", d: "Each friend sends “approve v1” in their own chat. All three must approve the same version." },
];

const RULES = [
  { icon: <LockIcon size={18} />, t: "Private by default", d: "Negotiating agents never see anyone’s private chat. Only approved items cross over.", wide: true },
  { icon: <ShieldIcon />, t: "No silent commitments", d: "An agent can propose and accept for review. Only the student can approve.", wide: true },
  { icon: <LayersIcon />, t: "Versioned agreements", d: "Every edit creates a new version and voids earlier approvals." },
  { icon: <PauseIcon />, t: "Three strikes, then ask", d: "After three declined proposals, agents pause and ask what each person would change." },
  { icon: <BellIcon />, t: "Follow-up that's yours", d: "Each agent tracks and reminds only its own student." },
];

export default function Home() {
  const router = useRouter();
  const [names, setNames] = useState(["", "", ""]);
  const [links, setLinks] = useState<{ name: string; url: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(demo: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ names, demo }) });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "Couldn't create the room.");
      if (demo) return router.push(`/d/${data.demo}`);
      setLinks(["a", "b", "c"].map((s, i) => ({ name: names[i], url: `${location.origin}/s/${data[s]}` })));
    } catch { setError("Couldn’t reach the server. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <>
      <TopBar chip="Track 3 · group chat assistant">
        <button className="btn btn-primary" disabled={busy} onClick={() => create(true)}>Live demo <ArrowIcon size={14} /></button>
      </TopBar>
      <main className="shell">
        <section className="hero">
          <div className="hero-copy">
            <motion.span className="eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>Three private agents · one shared agreement</motion.span>
            <motion.h1 className="display hero-title" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
              Campus plans,<br /><em className="grad-iris">negotiated</em> <em className="grad-ember">kindly.</em>
            </motion.h1>
            <motion.p className="lede" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              Each friend talks only to their own AI agent. The agents trade just what each person approved, find a dinner time and place that work,
              and nothing becomes final until all three say yes to the same version.
            </motion.p>
            <motion.div className="hero-ctas" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
              <motion.button className="btn btn-primary btn-lg" disabled={busy} onClick={() => create(true)} whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
                Watch three agents negotiate <ArrowIcon />
              </motion.button>
              <a className="btn btn-lg" href="#start">Start a room for three</a>
            </motion.div>
            <motion.div className="muted" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
              <span><LockIcon size={12} /> Your reasons stay private</span>
              <span>· Three people · four tabs</span>
              <span>· Fictional demo data</span>
            </motion.div>
          </div>
          <motion.div className="hero-stage" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1, duration: 1 }}>
            <Scene mood="talking" />
          </motion.div>
        </section>

        <section className="section">
          <motion.div className="section-head" {...reveal}>
            <span className="eyebrow">How it works</span>
            <h2 className="display section-title">From “dinner sometime” <em>to “see you there”</em> in four steps.</h2>
          </motion.div>
          <div className="steps">
            {STEPS.map((s, i) => (
              <motion.div key={s.n} className="card step-card" {...reveal} transition={{ delay: i * 0.08 }} whileHover={{ y: -4 }}>
                <span className="num">{s.n}</span>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="section">
          <motion.div className="section-head" {...reveal}>
            <span className="eyebrow">Guarantees</span>
            <h2 className="display section-title">Rules the app enforces, <em>not the model.</em></h2>
          </motion.div>
          <div className="bento">
            {RULES.map((r, i) => (
              <motion.div key={r.t} className={`card${r.wide ? " wide" : ""}`} {...reveal} transition={{ delay: i * 0.06 }}>
                <span className="orb sys" style={{ width: 40, height: 40, color: "var(--fg-inverse)" }}>{r.icon}</span>
                <h3>{r.t}</h3>
                <p>{r.d}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="section" id="start">
          <motion.div className="section-head" {...reveal}>
            <span className="eyebrow">Get started</span>
            <h2 className="display section-title">Try it <em>right now.</em></h2>
          </motion.div>
          <div className="start">
            <motion.div className="card agent-a" {...reveal}>
              <div className="card-body" style={{ padding: "var(--s-8)", gap: "var(--s-4)" }}>
                <span className="eyebrow" style={{ color: "var(--iris)" }}>Live demo</span>
                <h3 className="display" style={{ fontSize: "var(--t-2xl)" }}>Max, Jordan &amp; Sam, <em>four tabs</em></h3>
                <p className="lede" style={{ fontSize: "var(--t-base)" }}>Play all three friends in their own chat tabs, with a fourth tab for the agents’ negotiation. Share permissions and approvals are sent as messages. Dinner venues and prices are fictional sample data.</p>
                <motion.button className="btn btn-accent btn-lg" disabled={busy} onClick={() => create(true)} whileTap={{ scale: 0.98 }}>Start the demo <ArrowIcon /></motion.button>
              </div>
            </motion.div>
            <motion.div className="card agent-b" {...reveal} transition={{ delay: 0.08 }}>
              <div className="card-body" style={{ padding: "var(--s-8)", gap: "var(--s-4)" }}>
                <span className="eyebrow" style={{ color: "var(--ember)" }}>Real room</span>
                <h3 className="display" style={{ fontSize: "var(--t-2xl)" }}>Three people, <em>three private links</em></h3>
                {!links ? (
                  <form style={{ display: "flex", flexDirection: "column", gap: 12 }} onSubmit={(e) => { e.preventDefault(); create(false); }}>
                    {["Your name", "Friend 2", "Friend 3"].map((label, i) => (
                      <label key={label} className="field">
                        {label}
                        <input value={names[i]} onChange={(e) => setNames((n) => n.map((x, j) => (j === i ? e.target.value : x)))} maxLength={40} required />
                      </label>
                    ))}
                    <button className="btn btn-accent btn-lg" disabled={busy || names.some((n) => !n.trim())}>Create private links</button>
                  </form>
                ) : (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <p style={{ margin: 0, color: "var(--fg-2)" }}>Each link opens one person&apos;s private agent. Keep yours and send the others to your friends.</p>
                    {links.map((l, i) => (
                      <LinkRow key={l.url} label={i === 0 ? `${l.name}'s link (yours)` : `${l.name}'s link`} url={l.url} open={i === 0} />
                    ))}
                  </motion.div>
                )}
                {error && <div className="note err" role="alert">{error}</div>}
              </div>
            </motion.div>
          </div>
        </section>

        <footer className="footer">
          <span>Count Me In · a Track 3 prototype</span>
          <span>All demo people and data are fictional.</span>
        </footer>
      </main>
    </>
  );
}

function LinkRow({ label, url, open }: { label: string; url: string; open?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="muted">{label}</span>
      <div className="link-row">
        <code>{url}</code>
        <button className="btn" type="button" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); }}>{copied ? "Copied" : "Copy"}</button>
        {open && <a className="btn btn-accent" href={url}>Open</a>}
      </div>
    </div>
  );
}
