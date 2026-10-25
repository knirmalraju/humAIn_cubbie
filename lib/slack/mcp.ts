import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import { safeSlackError } from './config';
import type { Seat } from '../types';
type Recipient = { seat: Seat; name: string; userId: string };
export function createMessagingMcp(participants: Recipient[], send: (recipient: Recipient, text: string, messageId: string) => Promise<string | undefined>) {
  const server = new McpServer({ name: 'count-me-in-slack', version: '1.0.0' });
  for (const participant of participants) {
    server.registerTool(`send_private_message_${participant.seat}`, {
      description: `Deliver this agent's reply only to ${participant.name}'s private Slack DM.`,
      inputSchema: { text: z.string().min(1).max(12000), messageId: z.string().min(1).max(100) },
    }, async ({ text, messageId }) => {
      try {
        const ts = await send(participant, text, messageId);
        return { content: [{ type: 'text', text: JSON.stringify({ delivered: true, ts }) }] };
      } catch (error) { return { isError: true, content: [{ type: 'text', text: `Slack delivery failed: ${safeSlackError(error)}` }] }; }
    });
  }
  return server;
}
