import type { Room, Seat, SeatView } from './types';
import { SEATS } from './types';

export type NegotiationView = Pick<SeatView, 'scenario' | 'status' | 'accepts' | 'exchange' | 'declined' | 'round' | 'currentProposal' | 'agreement' | 'negotiating' | 'error' | 'hasApiKey'> & {
  people: { seat: Seat; name: string; busy: boolean; reviewing: boolean; shared: boolean; approvedVersion: number }[];
};

/** Allowlist only: never spread a room, seat, chat, preview, or token into a public view. */
export function negotiationView(room: Room, negotiating: boolean, hasApiKey: boolean): NegotiationView {
  return {
    scenario: room.scenario, status: room.status, accepts: room.accepts,
    exchange: room.exchange, declined: room.declined, round: room.round,
    currentProposal: room.currentProposal, agreement: room.agreement,
    negotiating, error: room.error, hasApiKey,
    people: SEATS.map(seat => {
      const s = room.seats[seat];
      return { seat, name: s.name, busy: s.busy, reviewing: Boolean(s.pending), shared: s.shareApproved, approvedVersion: s.approvedVersion };
    }),
  };
}

export function negotiationFromSeat(v: SeatView | null): NegotiationView | null {
  if (!v) return null;
  return {
    scenario: v.scenario, status: v.status, accepts: v.accepts, exchange: v.exchange,
    declined: v.declined, round: v.round, currentProposal: v.currentProposal,
    agreement: v.agreement, negotiating: v.negotiating, error: v.error, hasApiKey: v.hasApiKey,
    people: [
      { seat: v.seat, name: v.me.name, busy: v.me.busy, reviewing: Boolean(v.me.pending), shared: v.me.shareApproved, approvedVersion: v.me.approvedVersion },
      ...v.others.map(s => ({ seat: s.seat, name: s.name, busy: s.busy, reviewing: s.reviewing, shared: s.shareApproved, approvedVersion: s.approvedVersion })),
    ].sort((a, b) => SEATS.indexOf(a.seat) - SEATS.indexOf(b.seat)),
  };
}
