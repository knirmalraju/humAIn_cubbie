import type { Seat, SeatView } from "@/lib/types";

/** "Max", "Max and Jordan", "Max, Jordan and Sam" */
export const joinNames = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export const nameOf = (view: SeatView, seat: Seat) => (seat === view.seat ? view.me.name : view.others.find((o) => o.seat === seat)?.name ?? "");

export const othersNames = (view: SeatView) => joinNames(view.others.map((o) => o.name));
