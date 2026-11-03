import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/** Translucent sticky header — f-dot logo + right-side slot. */
export default function Header({ wide = false, children }: { wide?: boolean; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-frost-100/80 bg-white/60 backdrop-blur-md">
      <div className={`${wide ? "f-shell-wide" : "f-shell"} flex flex-wrap items-center justify-between gap-3 py-4`}>
        <Link to="/" className="flex items-center gap-2.5">
          <span className="f-dot" />
          <span className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-ink-800">BNT Faucet</span>
        </Link>
        {children}
      </div>
    </header>
  );
}
