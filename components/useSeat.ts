"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SeatView } from "@/lib/types";

export type SeatAction = { action: "chat"; text: string };

export interface SeatHandle {
  view: SeatView | null;
  notFound: boolean;
  pending: boolean;
  flash: string | null;
  act: (a: SeatAction) => Promise<void>;
}

export function useSeat(token: string | null): SeatHandle {
  const [view, setView] = useState<SeatView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [pending, setPending] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const viewRef = useRef<SeatView | null>(null);
  viewRef.current = view;

  const refresh = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`/api/seat/${token}`, { cache: "no-store" }).catch(() => null);
    if (!res) return;
    if (res.status === 404) return setNotFound(true);
    if (res.ok) setView(await res.json());
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      await refresh();
      if (stop) return;
      const v = viewRef.current;
      const fast = v && (v.negotiating || v.status === "negotiating" || v.me.busy);
      timer = setTimeout(loop, fast ? 1200 : 3000);
    };
    loop();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [token, refresh]);

  const act = useCallback(
    async (a: SeatAction) => {
      if (!token) return;
      setPending(true);
      setFlash(null);
      // Show the student's own message right away while the agent thinks.
      if (a.action === "chat" && viewRef.current) {
        const v = viewRef.current;
        setView({ ...v, me: { ...v.me, busy: true, chat: [...v.me.chat, { id: "local", from: "student", text: a.text, at: Date.now() }] } });
      }
      try {
        const res = await fetch(`/api/seat/${token}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(a),
        });
        const data = await res.json();
        if (res.ok) setView(data);
        else {
          setFlash(data.error ?? "Something went wrong.");
          if (data.view) setView(data.view);
        }
      } catch {
        setFlash("Couldn't reach the server.");
      } finally {
        setPending(false);
      }
    },
    [token],
  );

  return { view, notFound, pending, flash, act };
}
