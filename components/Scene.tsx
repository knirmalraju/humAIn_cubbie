"use client";

import dynamic from "next/dynamic";
import type { SceneMood } from "./AgentScene";

// WebGL only runs in the browser; render nothing on the server.
export const Scene = dynamic(() => import("./AgentScene"), { ssr: false, loading: () => null });
export type { SceneMood };
