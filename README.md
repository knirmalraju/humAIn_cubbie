# RoomPeace

Three personal AI agents that help three roommates agree on household responsibilities, privately. Track 2 (agent-to-agent coordination) of the RoomPeace project.

Each roommate talks only to their own agent. The agents trade just the facts each student approved, negotiate the bathroom rota, and nothing becomes final until all three students approve the same version.

## Run it

```bash
cp .env.example .env.local   # then set GEMINI_API_KEY (.env also works; both are gitignored)
npm install
npm run dev
```

Open http://localhost:3000 and either:

- **Start the demo**: fictional roommates Max, Jordan and Sam in four switchable tabs: one private chat per roommate plus an **Agent negotiation** tab. Sending a message (or approving a sharing preview) jumps to the negotiation tab; switch back any time. Tabs show live status and unread badges. All three agents are real.
- **Start a room for three**: enter three names and get three private links. Each link opens two tabs: that roommate's private agent and the negotiation.

Run it as one long-lived Node server (`npm run dev` or `npm run build && npm start`). Rooms live in memory and are mirrored to `.data/rooms.json`. The negotiation runs in the background inside that process, so serverless hosting isn't supported yet.

## How it works

| Piece | What it does |
|---|---|
| Intake agent (one per student) | Chats privately, then drafts a **sharing preview**: one fact per item, each labelled (availability, constraint, preference, flexibility, reason, complaint). |
| Sharing preview | The student checks exactly what leaves the chat. Reasons and complaints start **unchecked**. |
| Negotiating agents | Take turns (round-robin) proposing, accepting, countering or declining. A proposal becomes a draft only when **both other agents** accept it. Each agent is built **only** from approved facts plus the shared exchange, and never receives anyone's private chat. |
| Agreement card | Responsibilities, deadlines, version and each person's approval status. |
| Change requests | A student asks for a change. Their agent drafts the new terms and the student previews them before sending them as a new version. |
| Follow-up | Each student marks only their own part done and can opt into an in-app or browser reminder 2 hours before their deadline. |
| Rotation notifications | Tasks run in deadline order. When a roommate marks his part done, Cubbie notifies the other two in their chats, tells whoever is next "It's now your turn", and announces when the rotation is complete. Roommates with reminders on also get a browser notification. |

All agents call the Gemini API through Google's `@google/genai` SDK, using JSON-schema output; every response is also validated with zod before the engine uses it. The default model is `gemini-flash-latest`; set `GEMINI_MODEL` to pin another one. If it's overloaded, rate-limited or takes longer than 20 seconds, the call falls back to `GEMINI_FALLBACK_MODEL` (default `gemini-flash-lite-latest`, set it empty to disable).

Demo rooms run on a fixed clock (the upcoming Thursday, 2 PM) so the scenario's "tomorrow" and "Saturday's turn" read as intended on any day. Real rooms use the real time.

### Rules the server enforces (not left to the model)

- Only approved facts reach the negotiation. Private chat never enters a negotiator's prompt.
- Negotiation starts only once all three students have approved a sharing preview.
- An agent's "accept" only counts toward a **draft**, which needs both other agents. Nobody is committed until they approve it themselves, and it is confirmed only when all three approve.
- Approvals are tied to one version number. Any edit creates a new version, which voids earlier approvals. A browser tab showing an old draft can't approve a newer one.
- After **3 declined proposals** the agents pause and ask each student what they'd change.
- If all three students say "nothing will change", or another 3 proposals are declined after the pause, the result is **no agreement**. That's a valid outcome.

`npm run check` tests these rules using scripted agents in place of Gemini, so it needs no API key.

## Scope and limits

- Three roommates, bathroom cleaning, availability typed in by hand, one rota swap. Calendar integration and other household issues come later.
- Reminders only fire while a student has the page open (in-app banner plus browser notification). There's no push or SMS yet.
- Links are bearer tokens. Anyone holding a seat link can act as that roommate.
- The demo view puts all three private chats on one page, as tabs. It exists only for demo rooms with fictional data. Real rooms have no demo link.
