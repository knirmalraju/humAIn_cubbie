const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

type P = { size?: number };

export const LockIcon = ({ size = 13 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <rect x="4" y="11" width="16" height="10" rx="2.5" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

export const CheckIcon = ({ size = 14 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={2.6}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export const SendIcon = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={2.4}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </svg>
);

export const ArrowIcon = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const ShieldIcon = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

export const LayersIcon = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <path d="M12 3l9 5-9 5-9-5 9-5z" />
    <path d="M3 13l9 5 9-5" />
  </svg>
);

export const PauseIcon = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M10 9v6M14 9v6" />
  </svg>
);

export const BellIcon = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </svg>
);

export const BrandMark = ({ size = 32 }: P) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <defs>
      {[["a", "#8b9cff", "#3d4bd6"], ["b", "#ffa36c", "#c2541f"], ["c", "#f59ac6", "#b8407e"]].map(([id, mid, dark]) => (
        <radialGradient key={id} id={`bm-${id}`} cx="35%" cy="30%" r="70%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".35" stopColor={mid} />
          <stop offset="1" stopColor={dark} />
        </radialGradient>
      ))}
    </defs>
    <circle cx="16" cy="10.5" r="7" fill="url(#bm-c)" />
    <circle cx="10.5" cy="20" r="7" fill="url(#bm-a)" fillOpacity=".95" />
    <circle cx="21.5" cy="20" r="7" fill="url(#bm-b)" fillOpacity=".92" />
  </svg>
);
