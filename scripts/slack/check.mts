import './load-env.mts';
import { WebClient, LogLevel } from '@slack/web-api';
import { SocketModeClient } from '@slack/socket-mode';
import { readSlackConfig, safeSlackError } from '../../lib/slack/config';
const { participants } = readSlackConfig();
try {
  if (!process.env.SLACK_BOT_TOKEN?.startsWith('xoxb-')) { console.error('SLACK_BOT_TOKEN must start with xoxb-.'); process.exit(1); }
  if (!process.env.SLACK_APP_TOKEN?.startsWith('xapp-')) { console.error('SLACK_APP_TOKEN must be an app-level token starting with xapp-, with connections:write scope.'); process.exit(1); }
  const web = new WebClient(process.env.SLACK_BOT_TOKEN, { logLevel: LogLevel.ERROR });
  const auth = await web.auth.test();
  if (participants.some(p => p.userId === auth.user_id)) throw new Error('A participant is the bot.');
  console.log(`Authenticated bot in workspace: ${auth.team}.`);
  for (const p of participants) {
    const dm = await web.conversations.open({ users: p.userId });
    if (!dm.channel?.id) throw new Error('Could not open a participant DM.');
    console.log(`Private DM available for ${p.name}.`);
  }
  const socket = new SocketModeClient({ appToken: process.env.SLACK_APP_TOKEN!, logLevel: LogLevel.ERROR });
  await socket.start();
  await socket.disconnect();
  console.log('Socket Mode connected successfully. No messages sent by this check.');
} catch (error) {
  console.error(`Slack setup check failed: ${safeSlackError(error)}. Check app installation, tokens, and required scopes.`);
  process.exitCode = 1;
}
