import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMessagingMcp } from '../lib/slack/mcp';
import { incomingMessage } from '../lib/slack/events';
import { negotiationView } from '../lib/negotiation-view';
process.env.ROOMPEACE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'slack-check-'));
const { createRoom, agents, studentChat } = await import('../lib/engine');
const people = [
  { seat: 'a' as const, name: 'A', userId: 'UA' },
  { seat: 'b' as const, name: 'B', userId: 'UB' },
  { seat: 'c' as const, name: 'C', userId: 'UC' },
];
const body = { team_id: 'T1', event_id: 'E1', event: { type: 'message', channel_type: 'im', channel: 'DA', user: 'UA', text: 'approve v1' } };
assert.equal(incomingMessage(body, 'T1', 'BOT', people)?.seat, 'a');
assert.equal(incomingMessage({ ...body, team_id: 'T2' }, 'T1', 'BOT', people), null);
for (const change of [{ user: 'OTHER' }, { user: 'BOT' }, { bot_id: 'BOT' }, { subtype: 'message_changed' }, { channel_type: 'channel' }, { text: '' }]) {
  assert.equal(incomingMessage({ ...body, event: { ...body.event, ...change } }, 'T1', 'BOT', people), null);
}
const room = createRoom(['A', 'B', 'C'], false, 'campus');
room.seats.a.chat.push({ id: 'secret', from: 'student', text: 'PRIVATE_REASON_CANARY', at: 1 });
room.seats.a.pending = [{ id: 'hidden', text: 'UNAPPROVED_CANARY', kind: 'reason', checked: false }];
room.seats.a.approved = [{ id: 'allowed', text: 'PUBLIC_CANARY', kind: 'constraint' }];
room.exchange.push({ id: 'public', from: 'a', kind: 'shared', text: 'Approved', facts: ['PUBLIC_CANARY'], at: 1 });
const publicJson = JSON.stringify(negotiationView(room, false, true));
for (const hidden of ['PRIVATE_REASON_CANARY', 'UNAPPROVED_CANARY', room.seats.a.token, room.seats.b.token, room.seats.c.token]) assert.ok(!publicJson.includes(hidden));
assert.ok(publicJson.includes('PUBLIC_CANARY'));
let intakeCalls = 0;
agents.runIntake = async () => { intakeCalls++; return { reply: 'Hello', items: [] }; };
await studentChat(room, 'b', 'Hello', 'SLACK_EVENT_1');
await studentChat(room, 'b', 'Hello', 'SLACK_EVENT_1');
assert.equal(intakeCalls, 1, 'Slack event replay must not invoke agent twice');
const deliveries: { userId: string; text: string }[] = [];
const server = createMessagingMcp(people, async (recipient, text) => { deliveries.push({ userId: recipient.userId, text }); return '123.0'; });
const client = new Client({ name: 'test', version: '1' });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
await client.connect(clientTransport);
assert.deepEqual((await client.listTools()).tools.map(t => t.name).sort(), ['send_private_message_a', 'send_private_message_b', 'send_private_message_c']);
await client.callTool({ name: 'send_private_message_b', arguments: { text: 'Hello B', messageId: 'm1', userId: 'UC' } });
assert.deepEqual(deliveries, [{ userId: 'UB', text: 'Hello B' }], 'Caller cannot override tool recipient');
const invalid = await client.callTool({ name: 'send_private_message_a', arguments: { text: '', messageId: 'm2' } });
assert.equal(invalid.isError, true);
assert.equal(deliveries.length, 1);
await client.close(); await server.close();
console.log('Slack checks passed: trusted sender mapping, ignored bots/channel edits, private-view isolation, event replay, MCP tool calls and fixed recipients.');
