import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.ROOMPEACE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'count-me-in-chat-'));
const { agents, createRoom, studentChat, settle, viewFor } = await import('../lib/engine');
const { buildNegotiatorPrompt } = await import('../lib/agents');
import type { Task } from '../lib/types';
const tasks: Task[] = ['a', 'b', 'c'].map(seat => ({ seat: seat as Task['seat'], task: 'Dinner at Union Food Hall, $10 per person', due: 'Thursday 7:05–7:50 PM', dueIso: '2026-10-29T19:05:00-07:00' }));
agents.hasApiKey = () => true;
agents.runIntake = async (_room, seat) => ({ reply: 'I have a sharing preview.', items: [
  { kind: 'availability', text: `${seat} is free 7–9 PM` },
  { kind: 'constraint', text: `${seat} can spend $10 and walk 5 minutes` },
  { kind: 'reason', text: 'PRIVATE: money is tight this month' },
] });
agents.runNegotiator = async room => room.currentProposal
  ? { action: 'accept', tasks: null, message: 'Fits approved facts.', note: 'Ready for review.' }
  : { action: 'propose', tasks, message: 'Dinner at the food hall.', note: 'Proposed.' };
agents.runAmend = async () => ({ tasks: tasks.map(t => ({ ...t, due: 'Thursday 7:10–7:55 PM', dueIso: '2026-10-29T19:10:00-07:00' })), note: 'Dinner moves five minutes later.', reply: 'Here is the revised plan.' });
const room = createRoom(['Max', 'Jordan', 'Sam'], true, 'campus');
await studentChat(room, 'a', 'Dinner after class, please.');
assert.equal(room.seats.a.pending!.length, 3);
assert.ok(room.seats.a.chat.some(m => m.text.includes('share p1 safe')));
await studentChat(room, 'a', 'yes');
assert.equal(room.seats.a.approved.length, 0, 'Ambiguous yes is not consent');
await studentChat(room, 'a', 'share p0 safe');
assert.equal(room.seats.a.approved.length, 0, 'Stale preview cannot be shared');
await studentChat(room, 'a', 'share p1 99');
assert.equal(room.seats.a.approved.length, 0, 'Invalid item list must share nothing');
await studentChat(room, 'a', 'share p1 safe');
assert.equal(room.seats.a.approved.length, 2);
assert.ok(!JSON.stringify(room.exchange).includes('PRIVATE'));
assert.ok(!buildNegotiatorPrompt(room, 'a').user.includes('PRIVATE'));
assert.ok(!JSON.stringify(viewFor(room, 'b')).includes('PRIVATE'));
assert.equal(room.status, 'intake');
for (const seat of ['b', 'c'] as const) {
  await studentChat(room, seat, 'I can come too.');
  await studentChat(room, seat, 'share p1 1,2');
}
await settle(room);
assert.equal(room.status, 'awaiting_approval');
assert.ok(room.seats.a.chat.some(m => m.text.includes('approve v1')));
await studentChat(room, 'a', 'approve v1');
await studentChat(room, 'a', 'approve v1');
assert.equal(room.exchange.filter(e => e.kind === 'approved').length, 1);
assert.equal(room.status, 'awaiting_approval');
await studentChat(room, 'b', 'approve v1');
await studentChat(room, 'c', 'approve v1');
assert.equal(room.status, 'confirmed');
await studentChat(room, 'a', 'change: Meet five minutes later.');
const stale = room.seats.a.amendDraft!.id;
await studentChat(room, 'b', 'change: Meet five minutes later.');
await studentChat(room, 'a', `send change ${stale}`);
assert.equal(room.agreement!.version, 2);
assert.equal(room.status, 'awaiting_approval');
assert.equal(room.seats.b.amendDraft, null, 'Another amendment invalidates pending previews');
assert.ok(Object.values(room.seats).every(s => s.approvedVersion === 0));
await studentChat(room, 'b', 'approve v1');
assert.equal(room.seats.b.approvedVersion, 0);
await studentChat(room, 'a', `send change ${stale}`);
assert.equal(room.agreement!.version, 2);
await studentChat(room, 'a', 'reminders on');
assert.equal(room.seats.a.reminders, true);
assert.ok(room.seats.a.chat.some(m => m.from === 'student' && m.text === 'approve v1'));
console.log('Chat checks passed: message-only consent, preview numbers, privacy, three-person gating, duplicate/stale approvals, and confirmed-plan revisions.');
