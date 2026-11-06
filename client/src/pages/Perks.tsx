import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import Header from "../components/Header";

const NAV = "font-mono text-xs uppercase tracking-[0.15em] text-ink-500 transition-colors hover:text-frost-600";

/** Sign-in perks pitch + wallet tutorial. Hidden whenever sign-in is disabled. */
export default function Perks() {
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    api.me().then(() => setSignedIn(true)).catch(() => undefined);
    api
      .config()
      .then((cfg) => {
        if (!cfg.signinEnabled) navigate("/", { replace: true });
      })
      .catch(() => undefined);
  }, [navigate]);

  return (
    <>
      <Header>
        <div className="flex items-center gap-4">
          <Link to="/" className={NAV}>
            Faucet
          </Link>
          <Link to="/signin" className={NAV}>
            Sign in
          </Link>
        </div>
      </Header>

      <main className="f-shell py-12 sm:py-16">
        <p className="f-klabel mb-4">Wallet sign-in · optional</p>
        <h1 className="max-w-xl text-3xl font-semibold leading-[1.05] tracking-tight text-ink-900 sm:text-4xl">
          Sign once, <span className="f-grad italic">claim smarter.</span>
        </h1>
        <p className="mt-4 max-w-xl text-sm text-ink-500">
          Signing in proves you own your BNT address with a single wallet signature — no password, no email. Claiming
          works exactly the same without it; the dashboard on top is the perk.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <section className="f-card p-5">
            <h2 className="f-klabel flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-frost-400" />
              Your stats
            </h2>
            <p className="mt-2 text-sm text-ink-600">
              Total claims, total BNT earned, and a next-claim countdown for your address — the moment you sign in.
            </p>
          </section>
          <section className="f-card p-5">
            <h2 className="f-klabel flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-lilac-400" />
              Full history
            </h2>
            <p className="mt-2 text-sm text-ink-600">
              Every claim you've made, with txids and explorer links — not just the public feed's recent slice.
            </p>
          </section>
          <section className="f-card p-5">
            <h2 className="f-klabel flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-seaglass-400" />
              Referral rewards
            </h2>
            <p className="mt-2 text-sm text-ink-600">
              A personal referral link. Friends claim through it, you earn rewards — reviewed and paid by the operator.
            </p>
          </section>
          <section className="f-card p-5">
            <h2 className="f-klabel flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-sorbet-400" />
              Stay signed in
            </h2>
            <p className="mt-2 text-sm text-ink-600">
              One signature keeps you signed in for 30 days. Nothing to remember, sign out anytime.
            </p>
          </section>
        </div>

        <p className="f-card mt-3 px-5 py-4 text-sm text-ink-500">
          <span className="font-semibold text-ink-700">Nothing leaves your wallet.</span> The signature only proves
          ownership — no transaction is broadcast and no private key is shared, ever.
        </p>

        <section className="f-card mt-8">
          <h2 className="f-klabel border-b border-frost-100 px-5 py-4">How to sign in · 5 steps</h2>
          <ol className="space-y-2.5 border-t border-frost-100/60 px-5 py-4 text-sm text-ink-500">
            <li>1 · Open the Sign in page — the faucet shows a fresh one-time challenge</li>
            <li>2 · Copy the challenge message</li>
            <li>3 · Open your Blocknet wallet and go to the Sign / Verify message page</li>
            <li>4 · Enter your BNT address and the challenge, then sign the message</li>
            <li>
              5 · Paste the 128-hex signature into the faucet and verify —{" "}
              <span className="text-ink-700">you're in for 30 days</span>
            </li>
          </ol>
          <p className="border-t border-frost-100/60 px-5 py-3 font-mono text-xs text-ink-500">
            View-only wallets cannot sign messages. Used or expired challenges are replaced automatically on retry.
          </p>
        </section>

        <div className="mt-6">
          <Link to={signedIn ? "/dashboard" : "/signin"} className="f-btn">
            {signedIn ? "Open your dashboard" : "Start sign-in"}
          </Link>
        </div>
      </main>
    </>
  );
}
