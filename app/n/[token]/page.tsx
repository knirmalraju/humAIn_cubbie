'use client';
import { use, useEffect, useState } from 'react';
import { ExchangePanel } from '@/components/ExchangePanel';
import { TopBar } from '@/components/TopBar';
import type { NegotiationView } from '@/lib/negotiation-view';
export default function NegotiationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [view, setView] = useState<NegotiationView | null>(null);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function refresh() {
      try {
        const res = await fetch(`/api/negotiation/${encodeURIComponent(token)}`, { cache: 'no-store', signal: controller.signal });
        const data = await res.json();
        if (stopped) return;
        if (!res.ok) { setOnline(false); setError(data.error ?? 'View unavailable.'); }
        else { setView(data.view); setOnline(data.online); setError(data.deliveryError ?? ''); }
      } catch { if (!stopped) { setOnline(false); setError('Could not reach the local server. Reconnecting…'); } }
      if (!stopped) timer = setTimeout(refresh, 2000);
    }
    void refresh();
    return () => { stopped = true; controller.abort(); clearTimeout(timer); };
  }, [token]);
  return <><TopBar chip="Slack · live negotiation"/><main className="shell page" style={{ paddingTop: 32 }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <span className="eyebrow">Three private Slack conversations · one shared plan</span>
      <h1 className="display" style={{ fontSize: 'var(--t-3xl)' }}>The agents <em>work it out here.</em></h1>
      <p className="lede">Chat with Count Me In privately in Slack. Share permissions, approve a version, or request changes there. This view shows only approved facts and the agents’ negotiation.</p>
      <span className={`badge ${online ? 'ok' : 'warn'}`} style={{ alignSelf: 'flex-start' }}>{online ? 'Slack connected · updates every 2 seconds' : 'Slack worker offline or reconnecting'}</span>
      {error && <p className="note warn" role="status">{error}</p>}
    </div>
    <div style={{ maxWidth: 960, width: '100%', margin: '0 auto' }}><ExchangePanel view={view}/></div>
  </main></>;
}
