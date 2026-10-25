import Link from "next/link";
import { BrandMark } from "./icons";

export function TopBar({ chip, children }: { chip?: string; children?: React.ReactNode }) {
  return (
    <header className="nav">
      <div className="shell nav-inner">
        <Link href="/" className="brand" aria-label="RoomPeace home">
          <BrandMark />
          <span className="brand-word">RoomPeace</span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {chip && <span className="badge">{chip}</span>}
          {children}
        </div>
      </div>
    </header>
  );
}
