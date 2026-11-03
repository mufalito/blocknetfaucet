import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type FaucetConfig, type RecentClaim } from "../api";
import AdSlot from "../components/AdSlot";
import CopyBtn from "../components/CopyBtn";
import Header from "../components/Header";
import Result, { type DripOutcome } from "../components/Result";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (widget?: string) => void;
    };
  }
}

const REF_CODE_RE = /^[0-9a-f]{10}$/;

export default function Faucet() {
  const [config, setConfig] = useState<FaucetConfig | null>(null);
  const [claims, setClaims] = useState<RecentClaim[] | null>(null);
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<DripOutcome | null>(null);
  const [token, setToken] = useState("");
  const turnstileHost = useRef<HTMLDivElement>(null);
  const turnstileWidget = useRef<string | undefined>(undefined);

  const loadRecent = useCallback(() => {
    api.recent().then((r) => setClaims(r.claims)).catch(() => undefined);
  }, []);

  useEffect(() => {
    api.config().then(setConfig).catch((e) => {
      setResult({ error: e instanceof ApiError ? e.message : "request failed" });
    });

    // Referral landing: stash a well-formed ?ref= code (cookie set by the
    // API), then clean the URL.
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref") ?? "";
    if (REF_CODE_RE.test(ref)) {
      api.ref(ref).catch(() => undefined);
      params.delete("ref");
      const qs = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    }

    loadRecent();
    const timer = setInterval(loadRecent, 15000);
    return () => clearInterval(timer);
  }, [loadRecent]);

  // Turnstile widget — script injected once, rendered explicitly so the
  // token lands in React state and can be reset after each submit.
  useEffect(() => {
    if (!config?.turnstileSitekey) return;
    if (!document.getElementById("cf-turnstile-script")) {
      const s = document.createElement("script");
      s.id = "cf-turnstile-script";
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      document.head.appendChild(s);
    }
    const tryRender = () => {
      const ts = window.turnstile;
      if (!ts) return false; // script not loaded yet — keep polling
      if (!turnstileHost.current || turnstileWidget.current !== undefined) return true;
      turnstileWidget.current = ts.render(turnstileHost.current, {
        sitekey: config.turnstileSitekey,
        theme: "light",
        callback: (v: string) => setToken(v),
        "expired-callback": () => setToken(""),
      });
      return true;
    };
    if (!tryRender()) {
      const timer = setInterval(() => {
        if (tryRender()) clearInterval(timer);
      }, 200);
      return () => clearInterval(timer);
    }
  }, [config]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const r = await api.drip(address, token || undefined);
      setResult(r);
      setAddress("");
      loadRecent();
    } catch (err) {
      setResult({ error: err instanceof ApiError ? err.message : "request failed" });
    } finally {
      try {
        window.turnstile?.reset(turnstileWidget.current);
      } catch {
        /* widget not ready */
      }
      setToken("");
    }
  };

  const sidebar = config?.banners.sidebar ?? [];

  return (
    <>
      <Header wide>
        <div className="flex items-center gap-4">
          {config?.signinEnabled ? (
            <Link to="/signin" className="font-mono text-xs uppercase tracking-[0.15em] text-ink-500 transition-colors hover:text-frost-600">
              Sign in
            </Link>
          ) : null}
        </div>
      </Header>

      <main className="f-shell-wide">
        {(config?.banners.top.length ?? 0) > 0 ? (
          <section className="space-y-3 pt-8" aria-label="Sponsored">
            {config?.banners.top.map((b) => (
              <AdSlot key={b.id} banner={b} className="mx-auto w-fit" />
            ))}
          </section>
        ) : null}

        <div className={`grid gap-8 py-12 sm:py-16 ${sidebar.length > 0 ? "lg:grid-cols-[minmax(0,1fr)_336px]" : ""}`}>
          <div>
            <p className="f-klabel mb-4">Blocknet · one claim per address</p>
            <h1 className="max-w-xl text-4xl font-semibold leading-[1.05] tracking-tight text-ink-900 sm:text-5xl">
              Free BNT,
              <br />
              <span className="f-grad italic">straight to your wallet.</span>
            </h1>

            {config ? (
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="f-chip">
                  <span className="h-1.5 w-1.5 rounded-full bg-frost-400" />
                  {config.amountBnt} BNT per claim
                </span>
                <span className="f-chip">
                  <span className="h-1.5 w-1.5 rounded-full bg-lilac-400" />
                  every {config.cooldownHours} h
                </span>
              </div>
            ) : null}

            <div className="mt-8">{result ? <Result result={result} /> : null}</div>

            <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <input
                type="text"
                name="address"
                placeholder="BNT address…"
                autoComplete="off"
                spellCheck={false}
                required
                className="f-input min-w-0"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
              <button type="submit" className="f-btn shrink-0">
                Claim {config?.amountBnt ?? ""} BNT
              </button>
              {config?.turnstileSitekey ? <div ref={turnstileHost} className="min-h-[65px] sm:col-span-2" /> : null}
            </form>

            {(config?.banners.grid.length ?? 0) > 0 ? (
              <section className="grid items-start gap-3 pt-10 sm:grid-cols-2" aria-label="Sponsored">
                {config?.banners.grid.map((b) => (
                  <AdSlot key={b.id} banner={b} />
                ))}
              </section>
            ) : null}
          </div>

          {sidebar.length > 0 ? (
            <aside className="hidden self-start space-y-3 lg:sticky lg:top-20 lg:block" aria-label="Sponsored">
              {sidebar.map((b) => (
                <AdSlot key={b.id} banner={b} className="mx-auto" />
              ))}
            </aside>
          ) : null}
        </div>

        <section className="border-t border-frost-100 py-8">
          <h2 className="f-klabel mb-2 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-seaglass-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-seaglass-500" />
            </span>
            Recent claims · live
          </h2>
          {claims === null ? (
            <div className="space-y-2 py-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-9 animate-pulse rounded-lg bg-frost-100/70" />
              ))}
            </div>
          ) : claims.length === 0 ? (
            <p className="py-6 font-mono text-sm text-ink-500">No claims yet — be the first.</p>
          ) : (
            <ul className="divide-y divide-frost-100/80">
              {claims.map((c) => (
                <li key={c.txid} className="flex items-center gap-3 py-3 font-mono text-sm">
                  <span className="w-20 shrink-0 text-xs text-ink-500">{c.when}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-600" title={c.addressFull}>
                    {c.address}
                  </span>
                  <CopyBtn text={c.addressFull} title="Copy address" />
                  <a
                    className="hidden shrink-0 text-xs text-ink-500 transition-colors hover:text-frost-600 sm:inline"
                    href={c.txUrl}
                    target="_blank"
                    rel="noopener"
                    title={c.txid}
                  >
                    {c.txid} ↗
                  </a>
                  <CopyBtn text={c.txid} title="Copy txid" className="hidden sm:inline-flex" />
                  <span className="f-badge shrink-0 bg-seaglass-100 text-seaglass-700">+{c.amountBnt}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {config?.donationAddress ? (
          <section className="border-t border-frost-100 py-8">
            <h2 className="f-klabel mb-3 text-sorbet-600">Refill the pot</h2>
            <p className="mb-3 text-sm text-ink-500">The faucet runs on donations — send BNT to:</p>
            <div className="flex items-center gap-2">
              <code className="block min-w-0 flex-1 break-all rounded-xl border border-sorbet-200 bg-sorbet-50 px-4 py-3 font-mono text-xs text-sorbet-700">
                {config.donationAddress}
              </code>
              <CopyBtn text={config.donationAddress} title="Copy donation address" />
            </div>
          </section>
        ) : null}

        {(config?.banners.bottom.length ?? 0) > 0 ? (
          <section className="space-y-3 pb-8 pt-2" aria-label="Sponsored">
            {config?.banners.bottom.map((b) => (
              <AdSlot key={b.id} banner={b} className="mx-auto w-fit" />
            ))}
          </section>
        ) : null}
      </main>

      <footer className="border-t border-frost-100">
        <div className="f-shell-wide flex flex-wrap items-center justify-between gap-2 py-6 font-mono text-xs text-ink-500">
          <span>Blocknet (BNT) faucet</span>
          <span>payouts by OalgoPay</span>
        </div>
      </footer>
    </>
  );
}
