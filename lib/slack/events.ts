import type { Seat } from '../types';
export type Incoming = { key: string; seat: Seat; text: string; channel: string };
/** Identity comes from Slack's event envelope, never from the message text. */
export function incomingMessage(body: any, teamId: string, botId: string, participants: { seat: Seat; userId: string }[]): Incoming | null {
  const e = body?.event;
  if (body?.team_id !== teamId || e?.type !== 'message' || e.channel_type !== 'im' || e.bot_id || e.subtype || e.user === botId) return null;
  const person = participants.find(p => p.userId === e.user);
  if (!person || typeof e.text !== 'string' || !e.text.trim() || typeof e.channel !== 'string' || !e.channel.startsWith('D') || typeof body.event_id !== 'string') return null;
  return { key: body.event_id, seat: person.seat, text: e.text.trim(), channel: e.channel };
}
