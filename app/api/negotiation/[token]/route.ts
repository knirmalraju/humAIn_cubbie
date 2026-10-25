import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { slackDirectory } from '@/lib/slack/config';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
  try {
    // This file contains only an allowlisted public view, never private room state.
    const snapshot = JSON.parse(await fs.readFile(path.join(slackDirectory(), 'public.json'), 'utf8'));
    const a = Buffer.from(token); const b = Buffer.from(snapshot.token);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return Response.json({ error: 'Not found' }, { status: 404, headers });
    return Response.json({ view: snapshot.view, updatedAt: snapshot.updatedAt, online: snapshot.online && Date.now() - snapshot.updatedAt < 15000, deliveryError: snapshot.deliveryError }, { headers });
  } catch { return Response.json({ error: 'Negotiation unavailable. Start the Slack worker.' }, { status: 404, headers }); }
}
