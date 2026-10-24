# RoomPeace

**Say it safely, solve it fairly.**

A Cubbie skill for college roommates: turn a private concern into a respectful request, consider the other person's response, propose a practical agreement, and follow up with consent.

RoomPeace covers bathroom and kitchen cleaning, dishes, trash, bills, shared resources, noise, guests, belongings, privacy, exclusion, move-out conversations, and coursework conflicts with chores. Its first complete demo is a bathroom chore swap around an assignment deadline.

## Install in Cubbie

Text this link to your own Cubbie:

https://github.com/knirmalraju/humAIn_cubbie/tree/main/roompeace

Approve installation if Cubbie asks. In a **new message**, try:

> RoomPeace, it's my bathroom turn today, but I have coursework due tonight. Help me ask my roommate for a fair swap.

To update after a new release, text the same branch link again and ask Cubbie to update it.

No API keys, packages, server, or extra accounts are required. Canvas/calendar checks are optional and use only the student's existing connections, with permission. Without those connections, RoomPeace uses the times the student provides.

## What makes it useful

- Separates facts, feelings and assumptions without deciding who is guilty.
- Drafts a specific request instead of forwarding the private complaint.
- Keeps a proposal separate from an accepted agreement; silence is not consent.
- Records who does what, by when, and any reciprocal turn, with permission.
- Handles academic scheduling without automatically excusing chores or exposing grades.
- Offers reminders for the installing student, with explicit consent.

## Communication and privacy

This is a private coaching skill, not an autonomous group-chat bot. The student normally sends the draft and brings back their roommate's response. RoomPeace labels reported acceptance honestly; it cannot independently verify a roommate's identity or consent. It never accesses a roommate's Canvas account.

Only an approved minimal agreement summary should be remembered. No custom server receives data. Cubbie's own platform still processes conversations; this project does not promise anonymity, end-to-end privacy beyond the platform's guarantees, or deletion of platform history. Threats and unsafe situations are handled as safety concerns rather than chore negotiations.

## Try the demo

See [DEMO.md](DEMO.md) for the complete bathroom → deadline conflict → proposed swap → reported acceptance → reminder walkthrough. All characters and examples are fictional. The walkthrough is an expected test scenario, not evidence of a live run.

## Project layout

- [roompeace/SKILL.md](roompeace/SKILL.md): installable skill and core workflow.
- [Agreement tracking](roompeace/references/agreement-tracking.md): proposal states, acceptance evidence and reminder lifecycle.
- [Household situations](roompeace/references/household-situations.md): issue-specific guidance.

## Validation and limitations

Validate with the official [Cubbie Hackathon Kit](https://github.com/imaginix-inc/cubbie-hackathon-kit):

```sh
python3 /path/to/cubbie-hackathon-kit/skills/cubbie-skill-creator/scripts/validate_cubbie_skill.py roompeace
```

Local format validation does not prove live behavior. Installation, Canvas access, saved memory and delivered reminders must be tested in Cubbie. There is no custom runtime code to run or server to deploy. Publishing this repository does not submit a hackathon entry.
