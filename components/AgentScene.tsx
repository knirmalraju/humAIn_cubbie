"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Float, Lightformer, MeshDistortMaterial, QuadraticBezierLine, Sparkles } from "@react-three/drei";
import { useReducedMotion } from "framer-motion";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * Three agents as glossy orbs in a triangle. Packets of light travel along the links while they negotiate.
 *  - idle: a slow trickle
 *  - talking: busy traffic on every link
 *  - agreed: the orbs draw together and the links glow green
 *  - apart: no agreement, the orbs drift away and the links go dark
 */
export type SceneMood = "idle" | "talking" | "agreed" | "apart";

export const AGENT_COLORS = ["#8b9cff", "#ffa36c", "#f59ac6"] as const;
const OK = "#5be0a0";
const ANGLES = [210, 330, 90].map((d) => (d * Math.PI) / 180);
const PAIRS: [number, number][] = [[0, 1], [1, 2], [2, 0]];

const MOOD = {
  idle: { radius: 1.55, packets: 1, speed: 0.12, link: 0.18 },
  talking: { radius: 1.45, packets: 2, speed: 0.38, link: 0.42 },
  agreed: { radius: 1.05, packets: 2, speed: 0.2, link: 0.85 },
  apart: { radius: 2.0, packets: 0, speed: 0, link: 0.05 },
} as const;

const posOf = (i: number, r: number, out: THREE.Vector3) => out.set(Math.cos(ANGLES[i]) * r, Math.sin(ANGLES[i]) * r * 0.82 + 0.1, 0);

function Orb({ i, radius }: { i: number; radius: React.MutableRefObject<number> }) {
  const ref = useRef<THREE.Group>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const start = useMemo(() => posOf(i, 1.55, new THREE.Vector3()).toArray(), [i]);
  useFrame(() => {
    if (!ref.current) return;
    posOf(i, radius.current, tmp);
    ref.current.position.lerp(tmp, 0.06);
  });
  return (
    <group ref={ref} position={start}>
      <Float speed={1.5 + i * 0.2} rotationIntensity={0.6} floatIntensity={0.7} floatingRange={[-0.07, 0.07]}>
        <mesh>
          <icosahedronGeometry args={[0.5, 24]} />
          <MeshDistortMaterial color={AGENT_COLORS[i]} distort={0.28} speed={1.4} roughness={0.12} metalness={0.15} envMapIntensity={1.2} />
        </mesh>
      </Float>
    </group>
  );
}

function Links({ mood, radius }: { mood: SceneMood; radius: React.MutableRefObject<number> }) {
  const m = MOOD[mood];
  const lines = useRef<any[]>([]);
  const packets = useRef<(THREE.Mesh | null)[]>([]);
  const curves = useMemo(() => PAIRS.map(() => new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3())), []);
  const a = useMemo(() => new THREE.Vector3(), []);
  const b = useMemo(() => new THREE.Vector3(), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }) => {
    const r = radius.current;
    PAIRS.forEach(([i, j], k) => {
      posOf(i, r, a);
      posOf(j, r, b);
      const c = curves[k];
      // start/end just outside each orb, bowed slightly toward the viewer
      c.v0.copy(a).lerp(b, 0.22);
      c.v2.copy(b).lerp(a, 0.22);
      c.v1.copy(a).add(b).multiplyScalar(0.35).setZ(0.5);
      lines.current[k]?.setPoints?.(c.v0, c.v2, c.v1);
    });
    const t = clock.getElapsedTime();
    packets.current.forEach((p, n) => {
      if (!p) return;
      const k = n % 3;
      const slot = Math.floor(n / 3);
      const visible = slot < m.packets;
      p.visible = visible;
      if (!visible) return;
      let u = (t * m.speed + slot / Math.max(m.packets, 1) + k * 0.17) % 1;
      if (slot % 2) u = 1 - u;
      curves[k].getPoint(u, tmp);
      p.position.copy(tmp);
      p.scale.setScalar(0.7 + Math.sin(u * Math.PI) * 0.6);
    });
  });

  return (
    <>
      {PAIRS.map((_, k) => (
        <QuadraticBezierLine
          key={k}
          ref={(el: any) => { lines.current[k] = el; }}
          start={[-1, 0, 0]}
          end={[1, 0, 0]}
          mid={[0, 0, 0.5]}
          color={mood === "agreed" ? OK : "#ffffff"}
          lineWidth={1.1}
          transparent
          opacity={m.link}
          dashed={mood !== "agreed"}
          dashSize={0.06}
          gapSize={0.05}
        />
      ))}
      {Array.from({ length: 6 }, (_, n) => {
        const [i, j] = PAIRS[n % 3];
        const from = Math.floor(n / 3) % 2 ? j : i;
        return (
          <mesh key={n} ref={(el) => { packets.current[n] = el; }}>
            <sphereGeometry args={[0.045, 16, 16]} />
            <meshBasicMaterial color={mood === "agreed" ? OK : AGENT_COLORS[from]} toneMapped={false} />
          </mesh>
        );
      })}
    </>
  );
}

function Rig({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ pointer }) => {
    if (!ref.current) return;
    ref.current.rotation.y = THREE.MathUtils.lerp(ref.current.rotation.y, pointer.x * 0.3, 0.04);
    ref.current.rotation.x = THREE.MathUtils.lerp(ref.current.rotation.x, -pointer.y * 0.15, 0.04);
  });
  return <group ref={ref}>{children}</group>;
}

function Stage({ mood }: { mood: SceneMood }) {
  const radius = useRef<number>(MOOD[mood].radius);
  useFrame(() => {
    radius.current = THREE.MathUtils.lerp(radius.current, MOOD[mood].radius, 0.04);
  });
  return (
    <Rig>
      {[0, 1, 2].map((i) => <Orb key={i} i={i} radius={radius} />)}
      <Links mood={mood} radius={radius} />
      <Sparkles count={40} scale={[6, 4, 2]} size={1.6} speed={0.25} opacity={0.35} color="#ffffff" />
    </Rig>
  );
}

export default function AgentScene({ mood = "idle", compact = false }: { mood?: SceneMood; compact?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <Canvas
      aria-hidden="true"
      dpr={[1, 2]}
      frameloop={reduce ? "demand" : "always"}
      camera={{ position: [0, 0, compact ? 6.2 : 6.6], fov: compact ? 36 : 40 }}
      gl={{ antialias: true, alpha: true }}
      style={{ position: "absolute", inset: 0 }}
    >
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 4, 5]} intensity={1.4} />
      <pointLight position={[-4, -1, 2]} intensity={14} color={AGENT_COLORS[0]} />
      <pointLight position={[4, -1, 2]} intensity={14} color={AGENT_COLORS[1]} />
      <pointLight position={[0, 4, 2]} intensity={10} color={AGENT_COLORS[2]} />
      <Environment resolution={128}>
        <Lightformer intensity={2.2} position={[0, 4, -2]} scale={[8, 2, 1]} />
        <Lightformer intensity={1.2} position={[-5, 0, 2]} scale={[2, 6, 1]} color={AGENT_COLORS[0]} />
        <Lightformer intensity={1.2} position={[5, 0, 2]} scale={[2, 6, 1]} color={AGENT_COLORS[1]} />
      </Environment>
      <Stage mood={mood} />
    </Canvas>
  );
}
