/** Explicit fictional catalogue: never imply live listings, menu checks or bookings. */
export const CAMPUS_CONTEXT = `Plan one shared 45-minute campus dinner for exactly three students.
These are fictional sample venues, not live availability:
- Union Food Hall: $10 per person, 5-minute walk from the library, vegetarian meals, open 5–9 PM.
- Green Table: $12 per person, 8-minute walk from the library, vegetarian meals, open 5–8:30 PM.
- Noodle Corner: $16 per person, 12-minute walk from the library, vegetarian meals, open 5–10 PM.
Use only these options. The price is the sample total meal budget. Leave enough time to walk from the library after each person's available-from time, eat for 45 minutes, and finish before their leave-by time. For example, if the latest available-from time is 7:00 PM and the venue is a 5-minute walk, propose 7:05–7:50 PM, NOT 7:00–7:45 PM. Compute this before accepting too. Respect every approved budget, diet, and walking limit. Do not invent missing constraints or silently relax them. Never claim to reserve a table, access a calendar, or send a reminder outside this chat.
A proposal has one task per student, all at the SAME venue and SAME start/end time. Each task describes joining the dinner, venue and per-person price. due gives the same human-readable start–end range; due_iso is the start in ISO 8601 with the correct UTC offset.`;
