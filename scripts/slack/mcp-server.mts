import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebClient, LogLevel } from '@slack/web-api';
import { readSlackConfig } from '../../lib/slack/config';
import { createMessagingMcp } from '../../lib/slack/mcp';
const { participants } = readSlackConfig();
const token = process.env.SLACK_BOT_TOKEN;
if (!token?.startsWith('xoxb-')) throw new Error('SLACK_BOT_TOKEN is missing or invalid.');
// stdout belongs exclusively to the MCP transport. No Gemini key is passed to this child.
const slack = new WebClient(token, { logLevel: LogLevel.ERROR, retryConfig: { retries: 2 }, rejectRateLimitedCalls: true });
const channels = new Map<string, string>();
const server = createMessagingMcp(participants, async (participant, text) => {
  let channel = channels.get(participant.seat);
  if (!channel) {
    const dm = await slack.conversations.open({ users: participant.userId });
    if (!dm.channel?.id) throw new Error('DM unavailable');
    channel = dm.channel.id;
    channels.set(participant.seat, channel);
  }
  const result = await slack.chat.postMessage({ channel, text, mrkdwn: false, parse: 'none', unfurl_links: false, unfurl_media: false });
  return result.ts;
});
await server.connect(new StdioServerTransport());
