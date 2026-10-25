import Link from "next/link";
import { BrandMark } from "./icons";

export function TopBar({ chip, children }: { chip?: string; children?: React.ReactNode }) {
  return (
    <header className="nav">
      <div className="shell nav-inner">
        <Link href="/" className="brand" aria-label="Count Me In home">
          <BrandMark />
          <span className="brand-word">Count Me In</span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {chip && <span className="badge">{chip}</span>}
          {children}
        </div>
      </div>
    </header>
  );
}
