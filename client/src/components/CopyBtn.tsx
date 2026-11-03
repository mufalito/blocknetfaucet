import { useEffect, useRef, useState } from "react";

/** Copy-to-clipboard with a textarea fallback for non-secure contexts; the
 * label flashes "copied"/"failed" for 1.2 s (port of the old faucet.js). */
export default function CopyBtn({
  text,
  title,
  label = "copy",
  className = "",
}: {
  text: string;
  title?: string;
  label?: string;
  className?: string;
}) {
  const [flash, setFlash] = useState<"copied" | "failed" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onClick = async () => {
    let ok = false;
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch {
        ok = false;
      }
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand("copy");
      } finally {
        ta.remove();
      }
    }
    setFlash(ok ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlash(null), 1200);
  };

  return (
    <button type="button" className={`f-copy ${className}`} title={title ?? "Copy"} onClick={onClick}>
      {flash ?? label}
    </button>
  );
}
