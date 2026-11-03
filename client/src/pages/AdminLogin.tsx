import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api.adminLogin(password);
      navigate("/admin");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="f-dot" />
          <span className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-ink-800">BNT Faucet</span>
        </div>

        <p className="f-klabel mb-3">Admin sign-in</p>

        {error ? <div className="f-err">{error}</div> : null}

        <form onSubmit={submit}>
          <input
            type="password"
            placeholder="admin password"
            autoComplete="current-password"
            required
            className="f-input mb-3"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" className="f-btn w-full">
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
