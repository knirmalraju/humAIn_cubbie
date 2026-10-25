import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Room, Seat } from "./types";
import { SEATS } from "./types";

// Prototype storage: an in-process map, mirrored to .data/rooms.json so a
// dev-server restart doesn't lose rooms. Run as a single Node server.
const DATA_DIR = process.env.ROOMPEACE_DATA_DIR ?? path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "rooms.json");

type Store = { rooms: Map<string, Room>; loaded: boolean };
const g = globalThis as unknown as { __roompeace?: Store };
const store: Store = (g.__roompeace ??= { rooms: new Map(), loaded: false });

function load() {
  if (store.loaded) return;
  store.loaded = true;
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as Room[];
    for (const r of raw) {
      if (!isCurrent(r)) continue;
      r.accepts ??= [];
      // Nobody is mid-call after a restart.
      for (const s of Object.values(r.seats)) s.busy = false;
      store.rooms.set(r.id, r);
    }
  } catch {
    // No saved rooms yet.
  }
}

export function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify([...store.rooms.values()]));
}

export const newId = (bytes = 9) => crypto.randomBytes(bytes).toString("base64url");

export function putRoom(room: Room) {
  load();
  store.rooms.set(room.id, room);
  save();
}

export function findBySeatToken(token: string): { room: Room; seat: Seat } | null {
  load();
  for (const room of store.rooms.values()) {
    if (!isCurrent(room)) continue;
    for (const seat of SEATS) {
      const s = room.seats[seat];
      if (s && safeEq(s.token, token)) return { room, seat };
    }
  }
  return null;
}

export function findByDemoToken(token: string): Room | null {
  load();
  for (const room of store.rooms.values()) {
    if (!isCurrent(room)) continue;
    if (room.demo && room.demoToken && safeEq(room.demoToken, token)) return room;
  }
  return null;
}

/** Rooms from the earlier two-roommate version can't be resumed; their links read as "not found". */
const isCurrent = (room: Room) => Boolean(room.seats?.c);

function safeEq(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
