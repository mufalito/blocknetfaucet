import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, type AdminOverview, type ReferralsReport } from "../api";
import CopyBtn from "../components/CopyBtn";
import { rewardContext } from "../format";

type Tab = "overview" | "claims" | "settings" | "bans" | "banners" | "referrals";

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "claims", label: "Claims" },
  { id: "settings", label: "Settings" },
  { id: "bans", label: "Bans" },
  { id: "banners", label: "Banners" },
  { id: "referrals", label: "Referrals" },
];

const SLOT_OPTIONS = [
  { value: "auto", label: "auto" },
  { value: "top", label: "top strip" },
  { value: "grid", label: "homepage grid" },
  { value: "sidebar", label: "sidebar" },
  { value: "bottom", label: "bottom billboard" },
];

interface SettingsForm {
  amountBnt: string;
  cooldownHours: string;
  dailyCapBnt: string;
  blockedCountries: string;
  donationAddress: string;
  referralMinClaims: string;
  referralMinSpanHours: string;
  referralRewardBnt: string;
}

export default function Admin() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("overview");
  const [ov, setOv] = useState<AdminOverview | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [slotDrafts, setSlotDrafts] = useState<Record<number, string>>({});
  const [refReport, setRefReport] = useState<ReferralsReport | null>(null);

  // add-ban / add-banner form state
  const [banKind, setBanKind] = useState("address");
  const [banValue, setBanValue] = useState("");
  const [banReason, setBanReason] = useState("");
  const [bnTitle, setBnTitle] = useState("");
  const [bnImage, setBnImage] = useState("");
  const [bnLink, setBnLink] = useState("");
  const [bnSlot, setBnSlot] = useState("auto");

  const refresh = useCallback(() => {
    api
      .adminOverview()
      .then((data) => {
        setOv(data);
        setForm((prev) =>
          prev ?? {
            amountBnt: data.settings["amount_bnt"] ?? "",
            cooldownHours: data.settings["cooldown_hours"] ?? "",
            dailyCapBnt: data.settings["daily_cap_bnt"] ?? "",
            blockedCountries: data.settings["blocked_countries"] ?? "",
            donationAddress: data.settings["donation_address"] ?? "",
            referralMinClaims: data.settings["referral_min_claims"] ?? "2",
            referralMinSpanHours: data.settings["referral_min_span_hours"] ?? "48",
            referralRewardBnt: data.settings["referral_reward_bnt"] ?? "0.02",
          },
        );
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) navigate("/admin/login", { replace: true });
      });
  }, [navigate]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const refreshReferrals = useCallback(() => {
    api
      .adminReferrals()
      .then(setRefReport)
      .catch((e) => setMsg({ kind: "err", text: e instanceof ApiError ? e.message : "request failed" }));
  }, []);

  useEffect(() => {
    if (tab === "referrals") refreshReferrals();
  }, [tab, refreshReferrals]);

  const payBatch = async (referrer: string, count: number, payableBnt: string) => {
    if (!window.confirm(`Pay ${count} qualified referral${count === 1 ? "" : "s"} — ${payableBnt} BNT to the referrer?`)) return;
    try {
      const res = await api.adminReferralsPay(referrer);
      setMsg({
        kind: "ok",
        text: `Paid ${res.paid} referral${res.paid === 1 ? "" : "s"} (${res.amountBnt} BNT) — txid ${res.txid} (explorer: ${res.explorerUrl})`,
      });
      refreshReferrals();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof ApiError ? e.message : "request failed" });
    }
  };

  const act = async (fn: () => Promise<unknown>, okText = "Saved.") => {
    try {
      await fn();
      setMsg({ kind: "ok", text: okText });
      await refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof ApiError ? e.message : "request failed" });
    }
  };

  const logout = async () => {
    await api.adminLogout().catch(() => undefined);
    navigate("/admin/login", { replace: true });
  };

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-frost-100/80 bg-white/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
          <Link to="/admin" className="flex items-center gap-2.5">
            <span className="f-dot" />
            <span className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-ink-800">BNT Faucet</span>
            <span className="font-mono text-sm text-ink-500">/ admin</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-full px-3.5 py-1.5 font-mono text-xs uppercase tracking-[0.12em] transition-colors ${
                  tab === t.id ? "bg-frost-600 text-white shadow-[0_6px_16px_-8px_rgba(52,102,184,0.8)]" : "text-ink-500 hover:bg-frost-100 hover:text-frost-700"
                }`}
              >
                {t.label}
              </button>
            ))}
            <Link
              to="/"
              className="rounded-full px-3.5 py-1.5 font-mono text-xs uppercase tracking-[0.12em] text-ink-500 transition-colors hover:text-frost-600"
            >
              Public page ↗
            </Link>
          </nav>
          <button
            type="button"
            onClick={logout}
            className="ml-auto font-mono text-xs uppercase tracking-[0.12em] text-ink-500 transition-colors hover:text-rose-500"
          >
            logout
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-5 py-10">
        {msg ? <div className={msg.kind === "ok" ? "f-ok" : "f-err"}>{msg.text}</div> : null}

        {ov === null ? (
          <div className="space-y-6">
            <div className="h-28 animate-pulse rounded-2xl bg-frost-100/70" />
            <div className="h-72 animate-pulse rounded-2xl bg-frost-100/70" />
          </div>
        ) : tab === "overview" ? (
          <section>
            <div className="f-card grid grid-cols-1 divide-y divide-frost-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="p-5">
                <p className="f-klabel">Total claims</p>
                <p className="mt-2 font-mono text-3xl font-semibold text-ink-900">{ov.stats.total}</p>
              </div>
              <div className="p-5">
                <p className="f-klabel">Last 24 h</p>
                <p className="mt-2 font-mono text-3xl font-semibold text-ink-900">
                  {ov.stats.dayCount}
                  <span className="ml-2 text-sm font-normal text-ink-500">claims · {ov.stats.dayBnt} BNT</span>
                </p>
              </div>
              <div className="p-5">
                <p className="f-klabel">Budget left today</p>
                <p className="mt-2 font-mono text-3xl font-semibold text-frost-600">
                  {ov.stats.remainingBnt}
                  <span className="ml-2 text-sm font-normal text-ink-500">BNT</span>
                </p>
              </div>
            </div>
          </section>
        ) : tab === "claims" ? (
          <section className="f-card">
            <h2 className="f-klabel border-b border-frost-100 px-5 py-4">Claims · last {ov.claims.length}</h2>
            {ov.claims.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="f-th">When</th>
                      <th className="f-th">Address</th>
                      <th className="f-th">IP</th>
                      <th className="f-th">Amount</th>
                      <th className="f-th">txid / error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ov.claims.map((c, i) => (
                      <tr key={i} className="transition-colors hover:bg-frost-50/60">
                        <td className="f-td whitespace-nowrap font-mono text-xs text-ink-500">{c.when}</td>
                        <td className="f-td whitespace-nowrap font-mono text-xs text-ink-600">
                          {c.addressShort} <CopyBtn text={c.address} title="Copy address" className="ml-1" />
                        </td>
                        <td className="f-td whitespace-nowrap font-mono text-xs text-ink-500">{c.ip}</td>
                        <td className="f-td whitespace-nowrap font-mono text-xs">
                          <span className="font-semibold text-frost-600">{c.amountBnt}</span>{" "}
                          <span className="text-ink-500">BNT</span>
                        </td>
                        <td className={`f-td font-mono text-xs break-all ${c.txid ? "text-seaglass-600" : "text-rose-400"}`}>
                          {c.txid ? (
                            <>
                              <a className="transition-colors hover:text-frost-600" href={c.txUrl} target="_blank" rel="noopener">
                                {c.txid} ↗
                              </a>{" "}
                              <CopyBtn text={c.txid} title="Copy txid" className="ml-1" />
                            </>
                          ) : (
                            c.error
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-5 py-8 text-center font-mono text-sm text-ink-500">No claims yet.</p>
            )}
          </section>
        ) : tab === "settings" && form ? (
          <section className="f-card">
            <h2 className="f-klabel border-b border-frost-100 px-5 py-4">Claim settings</h2>
            <form
              className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6"
              onSubmit={(e) => {
                e.preventDefault();
                act(() => api.adminSettings({ ...form }));
              }}
            >
              <label className="grid gap-2">
                <span className="f-klabel">Amount per claim (BNT)</span>
                <input
                  required
                  className="f-input"
                  value={form.amountBnt}
                  onChange={(e) => setForm({ ...form, amountBnt: e.target.value })}
                />
              </label>
              <label className="grid gap-2">
                <span className="f-klabel">Cooldown (hours, 1–720)</span>
                <input
                  required
                  className="f-input"
                  value={form.cooldownHours}
                  onChange={(e) => setForm({ ...form, cooldownHours: e.target.value })}
                />
              </label>
              <label className="grid gap-2">
                <span className="f-klabel">Daily cap (BNT)</span>
                <input
                  required
                  className="f-input"
                  value={form.dailyCapBnt}
                  onChange={(e) => setForm({ ...form, dailyCapBnt: e.target.value })}
                />
              </label>
              <label className="grid gap-2">
                <span className="f-klabel">Blocked countries (ISO, empty = off)</span>
                <input
                  className="f-input"
                  value={form.blockedCountries}
                  onChange={(e) => setForm({ ...form, blockedCountries: e.target.value })}
                />
              </label>
              <label className="grid gap-2 sm:col-span-2">
                <span className="f-klabel">Donation address (empty = hide donate box)</span>
                <input
                  className="f-input"
                  value={form.donationAddress}
                  onChange={(e) => setForm({ ...form, donationAddress: e.target.value })}
                />
              </label>
              <label className="grid gap-2">
                <span className="f-klabel">Referral: min successful claims</span>
                <input
                  required
                  className="f-input"
                  value={form.referralMinClaims}
                  onChange={(e) => setForm({ ...form, referralMinClaims: e.target.value })}
                />
              </label>
              <label className="grid gap-2">
                <span className="f-klabel">Referral: min span between first/last claim (h)</span>
                <input
                  required
                  className="f-input"
                  value={form.referralMinSpanHours}
                  onChange={(e) => setForm({ ...form, referralMinSpanHours: e.target.value })}
                />
              </label>
              <label className="grid gap-2">
                <span className="f-klabel">Referral: reward per qualified referral (BNT)</span>
                <input
                  required
                  className="f-input"
                  value={form.referralRewardBnt}
                  onChange={(e) => setForm({ ...form, referralRewardBnt: e.target.value })}
                />
                <span className="font-mono text-xs text-ink-500">{rewardContext(form.referralRewardBnt, form.amountBnt) || "enter a positive amount"}</span>
              </label>
              <div className="sm:col-span-2">
                <button type="submit" className="f-btn">
                  Save settings
                </button>
              </div>
            </form>
          </section>
        ) : tab === "bans" ? (
          <section className="f-card">
            <h2 className="f-klabel border-b border-frost-100 px-5 py-4">Bans</h2>
            {ov.bans.length > 0 ? (
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="f-th">Kind</th>
                    <th className="f-th">Value</th>
                    <th className="f-th">Added</th>
                    <th className="f-th"></th>
                  </tr>
                </thead>
                <tbody>
                  {ov.bans.map((b) => (
                    <tr key={b.id} className="transition-colors hover:bg-frost-50/60">
                      <td className="f-td">
                        {b.kind === "ip" ? (
                          <span className="f-badge bg-rose-100 text-rose-500">ip</span>
                        ) : (
                          <span className="f-badge bg-frost-100 text-frost-600">addr</span>
                        )}
                      </td>
                      <td className="f-td font-mono text-xs break-all text-ink-600">
                        {b.value}
                        {b.reason ? (
                          <span className="mt-1 block font-sans text-xs text-ink-500">{b.reason}</span>
                        ) : null}
                      </td>
                      <td className="f-td whitespace-nowrap font-mono text-xs text-ink-500">{b.when}</td>
                      <td className="f-td">
                        <button type="button" className="f-btn-danger" onClick={() => act(() => api.adminBanRemove(b.id), "Ban removed.")}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-5 py-6 text-center font-mono text-sm text-ink-500">No bans.</p>
            )}
            <form
              className="grid gap-2 border-t border-frost-100 p-5"
              onSubmit={(e) => {
                e.preventDefault();
                act(() => api.adminBanAdd(banKind, banValue, banReason), "Ban added.").then(() => {
                  setBanValue("");
                  setBanReason("");
                });
              }}
            >
              <div className="flex gap-2">
                <select
                  className="f-input w-auto py-2.5 text-sm"
                  value={banKind}
                  onChange={(e) => setBanKind(e.target.value)}
                >
                  <option value="address">address</option>
                  <option value="ip">ip</option>
                </select>
                <input
                  required
                  placeholder="Address or IP"
                  className="f-input min-w-0 flex-1 py-2.5 text-sm"
                  value={banValue}
                  onChange={(e) => setBanValue(e.target.value)}
                />
              </div>
              <input
                placeholder="Reason (optional)"
                className="f-input py-2.5 text-sm"
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
              />
              <div>
                <button type="submit" className="f-btn py-3">
                  Add ban
                </button>
              </div>
            </form>
          </section>
        ) : tab === "banners" ? (
          <section className="f-card">
            <h2 className="f-klabel border-b border-frost-100 px-5 py-4">Banners</h2>
            {ov.banners.length > 0 ? (
              <ul className="divide-y divide-frost-100/70">
                {ov.banners.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-frost-50/60">
                    <img
                      src={`/api/banner-img/${b.id}`}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-10 w-20 shrink-0 rounded-md border border-frost-200 bg-frost-50 object-cover"
                    />
                    <div className="min-w-0 flex-1 basis-52">
                      <a href={b.linkUrl} target="_blank" rel="noopener" className="text-sm text-ink-700 transition-colors hover:text-frost-600">
                        {b.title}
                      </a>
                      <span className="block truncate font-mono text-xs text-ink-500" title={b.linkUrl}>
                        {b.linkUrl}
                      </span>
                    </div>
                    {b.active ? (
                      <span className="f-badge bg-seaglass-100 text-seaglass-700">active</span>
                    ) : (
                      <span className="f-badge bg-frost-100 text-ink-500">hidden</span>
                    )}
                    <span className="flex items-center gap-1">
                      <select
                        className="f-input w-auto px-2 py-1 text-xs"
                        title={`Homepage placement — 'auto' derives it from the creative's shape (currently ${b.slotEffective})`}
                        value={slotDrafts[b.id] ?? b.slot}
                        onChange={(e) => setSlotDrafts({ ...slotDrafts, [b.id]: e.target.value })}
                      >
                        {SLOT_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="f-btn-sec"
                        onClick={() => act(() => api.adminBannerSlot(b.id, slotDrafts[b.id] ?? b.slot), "Slot updated.")}
                      >
                        set
                      </button>
                    </span>
                    <span className="font-mono text-xs text-ink-500" title="Pixels and effective placement">
                      {b.dims} → {b.slotEffective}
                    </span>
                    <span className="font-mono text-xs text-ink-500">{b.when}</span>
                    <div className="flex gap-2">
                      <button type="button" className="f-btn-sec" onClick={() => act(() => api.adminBannerToggle(b.id), "Updated.")}>
                        {b.active ? "Hide" : "Show"}
                      </button>
                      <button type="button" className="f-btn-danger" onClick={() => act(() => api.adminBannerRemove(b.id), "Banner removed.")}>
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-center font-mono text-sm text-ink-500">
                No banners yet. Wide (≥3:1) → top strip (≥900 px wide → bottom billboard);
                tall (&lt;3:4) → sidebar; else → homepage grid.
              </p>
            )}
            <form
              className="grid gap-2 border-t border-frost-100 p-5 sm:grid-cols-2 lg:grid-cols-5"
              onSubmit={(e) => {
                e.preventDefault();
                act(() => api.adminBannerAdd({ title: bnTitle, imageUrl: bnImage, linkUrl: bnLink, slot: bnSlot }), "Banner added.").then(() => {
                  setBnTitle("");
                  setBnImage("");
                  setBnLink("");
                  setBnSlot("auto");
                });
              }}
            >
              <input
                required
                placeholder="Title"
                className="f-input py-2.5 text-sm"
                value={bnTitle}
                onChange={(e) => setBnTitle(e.target.value)}
              />
              <input
                required
                placeholder="Image URL (https://… or /static/…)"
                className="f-input py-2.5 text-sm"
                value={bnImage}
                onChange={(e) => setBnImage(e.target.value)}
              />
              <input
                required
                placeholder="Link URL (https://…)"
                className="f-input py-2.5 text-sm"
                value={bnLink}
                onChange={(e) => setBnLink(e.target.value)}
              />
              <select
                className="f-input py-2.5 text-sm"
                title="Homepage placement — auto derives it from the image's shape"
                value={bnSlot}
                onChange={(e) => setBnSlot(e.target.value)}
              >
                {SLOT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.value === "auto" ? "auto placement" : o.label}
                  </option>
                ))}
              </select>
              <div>
                <button type="submit" className="f-btn w-full py-3">
                  Add banner
                </button>
              </div>
            </form>
          </section>
        ) : tab === "referrals" ? (
          <section className="f-card">
            <h2 className="f-klabel border-b border-frost-100 px-5 py-4">
              Referral program · qualified = ≥ {refReport?.minClaims ?? "?"} successful claims spanning ≥{" "}
              {refReport?.minSpanHours ?? "?"} h · reward {refReport?.rewardBnt ?? "?"} BNT (tune in Settings)
            </h2>
            {refReport ? (
              <p className="border-b border-frost-100 px-5 py-2 font-mono text-xs text-ink-500">
                {rewardContext(refReport.rewardBnt, refReport.amountBnt) || "set a reward in Settings"}
              </p>
            ) : null}
            {refReport === null ? (
              <p className="px-5 py-8 text-center font-mono text-sm text-ink-500">loading…</p>
            ) : refReport.referrers.length === 0 ? (
              <p className="px-5 py-8 text-center font-mono text-sm text-ink-500">No referrals recorded yet.</p>
            ) : (
              <ul className="divide-y divide-frost-100/70">
                {refReport.referrers.map((r) => (
                  <li key={r.referrer} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className="font-mono text-sm text-ink-700" title={r.referrer}>
                        {r.referrerShort}
                      </span>
                      <CopyBtn text={r.referrer} title="Copy referrer address" />
                      {r.code ? <span className="f-badge bg-frost-100 text-frost-700">code {r.code}</span> : null}
                      <span className="font-mono text-xs text-ink-500">
                        {r.qualified} qualified / {r.total} referred · {r.distinctRefereeIps} distinct IPs
                      </span>
                      {r.sameIpFlag ? (
                        <span className="f-badge bg-rose-100 text-rose-500" title="Some referee claims share an IP with the referrer — possible self-farming">
                          same IP ⚠
                        </span>
                      ) : null}
                      {r.unpaidQualified > 0 ? (
                        <button
                          type="button"
                          className="f-btn-sec"
                          onClick={() => payBatch(r.referrer, r.unpaidQualified, r.payableBnt)}
                        >
                          Pay {r.unpaidQualified} · {r.payableBnt} BNT
                        </button>
                      ) : r.qualified > 0 ? (
                        <span className="f-badge bg-seaglass-100 text-seaglass-700">all paid</span>
                      ) : null}
                    </div>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr>
                            <th className="f-th">Referee</th>
                            <th className="f-th">Referred</th>
                            <th className="f-th">Claims</th>
                            <th className="f-th">Span</th>
                            <th className="f-th">Last claim</th>
                            <th className="f-th">IPs</th>
                            <th className="f-th"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.referees.map((ref) => (
                            <tr key={ref.address} className="transition-colors hover:bg-frost-50/60">
                              <td className="f-td whitespace-nowrap font-mono text-xs text-ink-600">
                                {ref.addressShort} <CopyBtn text={ref.address} title="Copy referee address" className="ml-1" />
                              </td>
                              <td className="f-td whitespace-nowrap font-mono text-xs text-ink-500">{ref.referredWhen}</td>
                              <td className="f-td whitespace-nowrap font-mono text-xs text-ink-600">{ref.claims}</td>
                              <td className="f-td whitespace-nowrap font-mono text-xs text-ink-500">{ref.claims > 1 ? `${ref.spanHours} h` : "—"}</td>
                              <td className="f-td whitespace-nowrap font-mono text-xs text-ink-500">{ref.lastWhen || "—"}</td>
                              <td className="f-td whitespace-nowrap font-mono text-xs text-ink-500">
                                {ref.ips.join(", ") || "—"}
                                {ref.sharesIpWithReferrer ? (
                                  <span className="f-badge bg-rose-100 text-rose-500 ml-1">shared ⚠</span>
                                ) : null}
                              </td>
                              <td className="f-td">
                                {ref.paid ? (
                                  <span className="f-badge bg-seaglass-100 text-seaglass-700" title={ref.txid}>
                                    paid {ref.paidWhen}
                                  </span>
                                ) : ref.qualified ? (
                                  <span className="f-badge bg-frost-100 text-frost-700">qualified · unpaid</span>
                                ) : (
                                  <span className="f-badge bg-frost-100 text-ink-500">pending</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </main>
    </>
  );
}
