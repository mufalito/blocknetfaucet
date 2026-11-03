import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import CopyBtn from "../components/CopyBtn";
import Header from "../components/Header";

export default function Signin() {
  const navigate = useNavigate();
  const [challenge, setChallenge] = useState<{ message: string; nonce: string } | null>(null);
  const [outage, setOutage] = useState("");
  const [error, setError] = useState("");
  const [address, setAddress] = useState("");
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);

  // Fresh challenge on every retry: the posted one is either consumed or
  // malformed, and the user should be able to sign again directly.
  const freshChallenge = useCallback(() => {
    setError("");
    setOutage("");
    api
      .challenge()
      .then(setChallenge)
      .catch((e) => setOutage(e instanceof ApiError ? e.message : "Sign-in is temporarily unavailable, try again shortly"));
  }, []);

  useEffect(() => {
    api.me().then(() => navigate("/dashboard", { replace: true })).catch(() => undefined);
    api
      .config()
      .then((cfg) => {
        if (!cfg.signinEnabled) navigate("/", { replace: true });
      })
      .catch(() => undefined);
    freshChallenge();
  }, [freshChallenge, navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!challenge || busy) return;
    setBusy(true);
    try {
      await api.verify(challenge.nonce, address, signature);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "request failed");
      freshChallenge();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Header>
        <Link to="/" className="font-mono text-xs uppercase tracking-[0.15em] text-ink-500 transition-colors hover:text-frost-600">
          Faucet
        </Link>
      </Header>

      <main className="f-shell py-12 sm:py-16">
        <p className="f-klabel mb-4">Sign in with your wallet</p>
        <h1 className="max-w-xl text-3xl font-semibold leading-[1.05] tracking-tight text-ink-900 sm:text-4xl">
          Prove you own <span className="f-grad italic">the address.</span>
        </h1>

        {outage ? <div className="f-err mt-8">{outage}</div> : null}
        {error ? <div className="f-err mt-8">{error}</div> : null}

        <section className="f-card mt-8">
          <h2 className="f-klabel border-b border-frost-100 px-5 py-4">1 · Copy this challenge</h2>
          <div className="flex items-center gap-2 px-5 py-4">
            <code className="block min-w-0 flex-1 break-all font-mono text-sm text-frost-700">
              {challenge ? challenge.message : <span className="inline-block h-4 w-64 animate-pulse rounded bg-frost-100" />}
            </code>
            {challenge ? <CopyBtn text={challenge.message} title="Copy challenge" /> : null}
          </div>
          <ol className="space-y-1.5 border-t border-frost-100 px-5 py-4 text-sm text-ink-500">
            <li>2 · Open your Blocknet wallet and go to the Sign / Verify message page</li>
            <li>3 · Enter your address and the challenge, sign it, and paste the 128-hex signature below</li>
          </ol>
          <p className="border-t border-frost-100/60 px-5 py-3 font-mono text-xs text-ink-500">
            View-only wallets cannot sign messages.
          </p>
        </section>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            type="text"
            placeholder="BNT address…"
            autoComplete="off"
            spellCheck={false}
            required
            className="f-input"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <textarea
            rows={4}
            placeholder="signature (128 hex chars)"
            spellCheck={false}
            required
            className="f-input h-24 font-mono"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
          />
          <button type="submit" className="f-btn w-full" disabled={!challenge || busy}>
            Verify signature
          </button>
        </form>
      </main>
    </>
  );
}
