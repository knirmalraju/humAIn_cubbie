import './load-env.mts';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SocketModeClient } from '@slack/socket-mode';
import { WebClient, LogLevel } from '@slack/web-api';
import { readSlackConfig, slackDirectory, safeSlackError } from '../../lib/slack/config';
import { incomingMessage, type Incoming } from '../../lib/slack/events';
import { negotiationView } from '../../lib/negotiation-view';
import { SEATS, type Room } from '../../lib/types';

const directory = slackDirectory();
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
process.env.ROOMPEACE_DATA_DIR = directory; // This process exclusively owns Slack rooms.
const { createRoom, studentChat, isNegotiating, agents, kick } = await import('../../lib/engine');
const { findByRoomId, save } = await import('../../lib/store');
const { participants } = readSlackConfig();
const configKey = JSON.stringify(participants);
const lock = path.join(directory, 'worker.lock');
if (fs.existsSync(lock)) {
  const pid = Number(fs.readFileSync(lock, 'utf8'));
  let alive = true;
  try { process.kill(pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') alive = false; }
  if (alive) throw new Error('A Slack worker is already running. Stop it before starting another.');
  fs.unlinkSync(lock);
}
fs.writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
process.on('exit', () => { try { fs.unlinkSync(lock); } catch {} });

const stateFile = path.join(directory, 'bridge.json');
type State = { roomId: string; viewerToken: string; configKey: string; delivered: string[]; processed: string[]; inbox: Incoming[]; teamId: string };
let state: State;
let room: Room;
let online = false;
let deliveryError: string | null = null;
const persist = () => {
  fs.writeFileSync(`${stateFile}.tmp`, JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(`${stateFile}.tmp`, stateFile);
};
function publish() {
  const snapshot = { token: state.viewerToken, updatedAt: Date.now(), online, deliveryError, view: negotiationView(room, isNegotiating(room), agents.hasApiKey()) };
  const file = path.join(directory, 'public.json');
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(snapshot), { mode: 0o600 });
  fs.renameSync(`${file}.tmp`, file);
}
let socket: SocketModeClient | undefined;
let mcp: Client | undefined;
let interval: ReturnType<typeof setInterval> | undefined;
try {
  if (!process.env.SLACK_BOT_TOKEN?.startsWith('xoxb-') || !process.env.SLACK_APP_TOKEN?.startsWith('xapp-')) throw new Error('Configure SLACK_BOT_TOKEN and SLACK_APP_TOKEN.');
  const slack = new WebClient(process.env.SLACK_BOT_TOKEN, { logLevel: LogLevel.ERROR });
  const auth = await slack.auth.test();
  if (!auth.team_id || !auth.user_id || participants.some(p => p.userId === auth.user_id)) throw new Error('Invalid workspace or participant configuration.');
  if (fs.existsSync(stateFile)) {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (state.configKey !== configKey || state.teamId !== auth.team_id) throw new Error('Participant/workspace configuration changed. Use a new SLACK_DATA_DIR for a new group.');
    const existing = findByRoomId(state.roomId);
    if (!existing) throw new Error('Saved Slack room is missing. Restore its rooms.json file.');
    room = existing;
  } else {
    const names = SEATS.map(s => participants.find(p => p.seat === s)!.name) as [string, string, string];
    room = createRoom(names, false, 'campus');
    state = { roomId: room.id, viewerToken: crypto.randomBytes(24).toString('base64url'), configKey, delivered: [], processed: [], inbox: [], teamId: auth.team_id };
    persist();
  }
  room.transport = "slack";
  save();
  // Resolve DM recipients before processing anything; no arbitrary channels are accepted.
  const expectedChannels = new Map<string, string>();
  for (const p of participants) {
    const dm = await slack.conversations.open({ users: p.userId });
    if (!dm.channel?.id) throw new Error('Could not open a private conversation.');
    expectedChannels.set(p.seat, dm.channel.id);
  }
  mcp = new Client({ name: 'count-me-in-agent-host', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath, args: ['--import', 'tsx', path.resolve('scripts/slack/mcp-server.mts')], cwd: process.cwd(),
    env: { PATH: process.env.PATH ?? '', SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN! }, stderr: 'inherit',
  });
  await mcp.connect(transport);
  const toolList = await mcp.listTools();
  if (!SEATS.every(s => toolList.tools.some(t => t.name === `send_private_message_${s}`))) throw new Error('MCP messaging tools are unavailable.');
  console.log('MCP connected: three recipient-bound messaging tools.');

  function queueReminders() {
    if (room.status !== 'confirmed' || !room.agreement) return;
    const agreement = room.agreement;
    agreement.tasks.forEach((task, index) => {
      const due = Date.parse(task.dueIso);
      const chat = room.seats[task.seat].chat;
      const id = `reminder:${agreement.version}:${index}`;
      if (!room.seats[task.seat].reminders || agreement.done[index] || !Number.isFinite(due) || Date.now() < due - 2 * 3600_000 || chat.some(m => m.id === id)) return;
      chat.push({ id, from: 'agent', text: `Reminder: ${task.task} — ${task.due}.${Date.now() > due ? ' The time has passed.' : ' Coming up soon.'}`, at: Date.now() });
      save();
    });
  }
  let flushing = false;
  async function flush() {
    if (flushing) return;
    flushing = true;
    try {
      for (const seat of SEATS) {
        for (const msg of room.seats[seat].chat) {
          if (msg.from === 'student' || state.delivered.includes(msg.id)) continue;
          const parts = msg.text.match(/[\s\S]{1,3000}/g) ?? [];
          for (const [i, part] of parts.entries()) {
            const partId = `${msg.id}:${i}`;
            if (state.delivered.includes(partId)) continue;
            const response = await mcp!.callTool({ name: `send_private_message_${seat}`, arguments: { text: part, messageId: partId } });
            if (response.isError) { deliveryError = 'A private reply could not be delivered. The worker will retry.'; console.error('MCP delivery failed; check bot scopes and recipient DM access.'); return; }
            state.delivered.push(partId);
            persist();
          }
          state.delivered.push(msg.id);
          persist();
        }
      }
      deliveryError = null;
    } catch { deliveryError = 'Messaging connection interrupted. Replies remain queued for retry.'; }
    finally { flushing = false; publish(); }
  }
  let draining = false;
  async function drain() {
    if (draining) return;
    draining = true;
    try {
      while (state.inbox.length) {
        const item = state.inbox[0];
        const prior = room.seats[item.seat].chat.findIndex(m => m.externalId === item.key);
        if (prior === -1) {
          if (item.text.length > 2000) {
            room.seats[item.seat].chat.push({ id: crypto.randomUUID(), from: 'agent', text: 'Please send a message of 2,000 characters or fewer.', at: Date.now(), externalId: item.key });
            save();
          } else await studentChat(room, item.seat, item.text, item.key);
        }
        else if (!room.seats[item.seat].chat.slice(prior + 1).some(m => m.from !== 'student')) {
          room.seats[item.seat].chat.push({ id: crypto.randomUUID(), from: 'agent', text: 'The connection restarted while I was handling your last message. Please send it again so I can finish responding.', at: Date.now() });
          save();
        }
        state.processed.push(item.key);
        state.inbox.shift();
        persist();
        publish();
        await flush();
      }
    } catch { console.error('Message processing paused; the queued event will be checked again.'); }
    finally { draining = false; }
  }
  socket = new SocketModeClient({ appToken: process.env.SLACK_APP_TOKEN!, logLevel: LogLevel.ERROR });
  socket.on('message', async ({ body, ack }) => {
    const item = incomingMessage(body, state.teamId, auth.user_id!, participants);
    if (item && expectedChannels.get(item.seat) === item.channel && !state.processed.includes(item.key) && !state.inbox.some(i => i.key === item.key)) {
      state.inbox.push(item);
      persist(); // Durable inbox before acknowledging Slack's delivery.
    }
    await ack();
    void drain();
  });
  socket.on('connected', () => { online = true; publish(); });
  socket.on('disconnected', () => { online = false; publish(); });
  socket.on('error', () => { online = false; console.error('Slack connection error; reconnecting.'); publish(); });
  await socket.start();
  online = true;
  publish();
  if (room.status === 'negotiating' && !room.error) kick(room);
  interval = setInterval(() => { queueReminders(); publish(); void flush(); void drain(); }, 2000);
  await flush();
  void drain();
  console.log(`Slack worker connected to ${auth.team}. Private agent chats are ready.`);
  console.log(`Negotiation view: ${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/n/${state.viewerToken}`);
  async function stop() {
    if (interval) clearInterval(interval);
    online = false; publish();
    await socket?.disconnect();
    await mcp?.close();
    process.exit(0);
  }
  process.once('SIGINT', () => { void stop(); });
  process.once('SIGTERM', () => { void stop(); });
} catch (error) {
  if (interval) clearInterval(interval);
  console.error('Slack worker could not start:', safeSlackError(error));
  if (error instanceof Error && !('data' in error) && !('code' in error)) console.error(error.message.replace(/xox[baprs]-\S+|xapp-\S+/g, '[redacted]'));
  await socket?.disconnect().catch(() => {});
  await mcp?.close().catch(() => {});
  process.exitCode = 1;
}
