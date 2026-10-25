# Count Me In · Track 3

Three students, three private chats, and one **Agent negotiation** tab. Max, Jordan, and Sam want to get a campus dinner out of the group chat and into a plan that works for everyone. Each student talks to their own Gemini agent; agents negotiate using only facts that student explicitly shared.

The existing dark, four-tab interface is retained. **All permissions, approvals, revisions, and follow-up actions are sent as chat messages.** There are no approval cards, checkboxes, or separate action forms in the private chats. Suggested replies only fill the composer; the student still sends the message. The Agent negotiation tab is read-only and never impersonates a student.

## Run locally

```bash
cp .env.example .env.local # only if you do not already have .env or .env.local
# Set GEMINI_API_KEY
npm install
npm run dev
```

Open http://localhost:3000 and choose **Live demo**. Start a fresh demo for the campus scenario; older saved rooms retain their original scenario. The demo lets you switch between all three fictional students. **Start a room for three** creates separate private bearer links instead.

The app runs in one long-lived Node process. Rooms are mirrored to `.data/rooms.json`. Links grant access to the corresponding seat; keep real seat links private. The all-students view exists only for fictional demos. This is a local prototype. The Slack integration below provides private bot conversations; calendar integration is not included.

## A message-only demo

1. In Max's chat, send his suggested availability, meal budget, and walking limit. His lab is a private reason.
2. The agent replies with a numbered sharing preview, for example `p1`. Send `share p1 safe` to share non-private facts only, or `share p1 1,2` to share exactly items 1 and 2. Reasons and complaints require explicit item selection. `share p1 none` discards the preview.
3. Repeat in Jordan's and Sam's chats. Jordan needs vegetarian food and must leave by 8 PM; Sam has a $10 budget and a five-minute walking limit. Sam's financial reason stays private.
4. Watch **Agent negotiation**. Agents propose, check constraints, accept, counter, or decline. Only after both other agents accept does a draft reach all three private chats.
5. Each student sends `approve v1` for that exact plan. A plain `yes` is not consent. Nothing is final until all three approve the same version.
6. To revise a draft or confirmed plan, send `change: Could we meet five minutes later?`. Review the private change preview, then send the displayed `send change <id>` message. Publishing it invalidates all earlier approvals. Everyone must review and approve the new version separately.

Other messages:

- `discard change` — discard the private revision preview.
- `nothing will change` — answer when the agents pause to ask about flexibility.
- `reminders on` / `reminders off` — in-chat reminders while the student's page is open.
- `done 1` — mark only your own numbered item in the plan complete.
- `retry` — retry a negotiation interrupted by an API error.
- `help` — show message commands.

Preview numbers and change IDs prevent stale messages from publishing a different preview. Plan approvals are version-bound and duplicates do not add votes. Changing a confirmed plan reopens approval for all three students. The seat API accepts only chat actions; it does not expose separate approval actions.

## Campus sample data and limits

The agents use three fictional venues: Union Food Hall ($10, five-minute walk), Green Table ($12, eight-minute walk), and Noodle Corner ($16, twelve-minute walk). All have sample vegetarian options. These are **not live listings or verified prices**. Agents plan a 45-minute meal, allowing walking time after availability begins and finishing before everyone must leave. No booking is made.

The model reasons about the approved scheduling and food constraints; server code enforces permission boundaries, draft acceptance, pauses, and human approvals. Demo time is a fixed Thursday afternoon so the scenario stays reproducible; real rooms use real time. Each proposal must serve the same three students. After three declined proposals, agents ask each student what they can change. Nobody is silently committed, and no agreement is a valid outcome.

Gemini calls use JSON schemas plus zod validation. The default model is `gemini-flash-latest`, with `gemini-flash-lite-latest` as fallback on overload, rate limits, or a 20-second timeout. Configure `GEMINI_MODEL` and `GEMINI_FALLBACK_MODEL` to change this. An empty fallback disables it.

## Validation

```bash
npm run check      # original coordination rules + message-only consent/privacy tests
npm run typecheck
npm run build
```

Tests use scripted agents and require no Gemini key. Live model behavior needs a configured key and network access.

## Three private Slack chats + browser negotiation

The three participants in `slack.config.json` each DM the same bot. The worker routes their messages to separate agent contexts. Approvals stay in each participant’s DM; the browser shows only approved shared facts and negotiation status.

1. In the Slack app settings, enable Socket Mode and create an app-level token with `connections:write`.
2. Add bot scopes `chat:write`, `im:write`, and `im:history`; subscribe to the bot event `message.im`. Enable the App Home Messages tab and allow users to send messages. Install/reinstall the app to the workspace after changing scopes.
3. Store `SLACK_BOT_TOKEN` (`xoxb-...`) and `SLACK_APP_TOKEN` (`xapp-...`) alongside `GEMINI_API_KEY` in `.env` or `.env.local`. Never commit tokens. `.env.local` overrides `.env`.
4. Run `npm run slack:check` to verify credentials and all three DM recipients. This opens DM conversations but sends no messages.
5. Keep `npm run dev` running, then run `npm run slack` in a second terminal. The worker sends each participant a welcome and prints a private `/n/...` browser link. Keep that link within your group.
6. Each person sends their availability, budget, and meal preferences to the bot, reviews the sharing preview, and sends `share p1 safe` or selected numbered items. After negotiation, each approves the same draft using `approve v1` in their own DM.

Inbound messages arrive through Slack Socket Mode. Outbound replies pass through a local MCP server exposing three recipient-bound tools. It uses one workspace bot installation; it does not log in as or impersonate the three people. No public webhook or tunnel is required for local use.

The Slack worker exclusively owns `.data/slack/rooms.json`, a durable event inbox, and delivery progress. Next.js reads only an allowlisted shared snapshot for the negotiation page. Private chats, unapproved previews, and seat access tokens are excluded from that snapshot. Slack data and tokens are ignored by Git; private chats remain stored locally in plaintext. Run one worker per data directory. Keep both processes running for live updates. `reminders on` enables one DM reminder per assigned task/version, starting two hours before its known deadline (or when the worker next runs).

Incoming event IDs prevent duplicate processing. Outbound delivery retries after interruptions; a crash between Slack accepting a message and the worker saving progress can produce a duplicate reply. The integration is a local prototype, not a highly available deployment. To start a separate group, use a fresh `SLACK_DATA_DIR` in both processes.
