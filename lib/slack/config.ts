import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod/v4';
export const Participant = z.object({ seat: z.enum(['a', 'b', 'c']), name: z.string().min(1).max(60), userId: z.string().regex(/^U[A-Z0-9]+$/) });
const Config = z.object({ participants: z.array(Participant).length(3) }).refine(c => new Set(c.participants.map(p => p.seat)).size === 3 && new Set(c.participants.map(p => p.userId)).size === 3 && new Set(c.participants.map(p => p.name)).size === 3, 'Use three distinct seats, names, and Slack IDs.');
export const slackDirectory = () => path.resolve(/* turbopackIgnore: true */ process.env.SLACK_DATA_DIR ?? '.data/slack');
export function readSlackConfig() {
  return Config.parse(JSON.parse(fs.readFileSync(path.resolve('slack.config.json'), 'utf8')));
}
export function safeSlackError(error: unknown): string {
  const e = error as { data?: { error?: string; needed?: string }; code?: string };
  const code = e?.data?.error ?? e?.code;
  return typeof code === 'string' && /^[a-zA-Z0-9_]+$/.test(code) ? code : 'connection_or_processing_error';
}
