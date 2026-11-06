import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type Dashboard as DashboardData } from "../api";
import CopyBtn from "../components/CopyBtn";
import Header from "../components/Header";
import { truncateMiddle } from "../format";

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    api
      .dashboard()
      .then(setData)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) navigate("/signin", { replace: true });
      });
  }, [navigate]);

  const signout = async () => {
    await api.signout().catch(() => undefined);
    navigate("/", { replace: true });
  };

  if (!data) {
    return (
      <>
        <Header>
          <span className="font-mono text-xs text-ink-500">loading…</span>
        </Header>
        <main className="f-shell space-y-8 py-10">
          <div className="h-28 animate-pulse rounded-2xl bg-frost-100/70" />
          <div className="h-64 animate-pulse rounded-2xl bg-frost-100/70" />
        </main>
      </>
    );
  }

  const referral = data.referral;

  return (
    <>
      <Header>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-ink-500" title={data.address}>
            {truncateMiddle(data.address)}
          </span>
          <CopyBtn text={data.address} title="Copy address" />
          <button type="button" className="f-btn-sec" onClick={signout}>
            Sign out
          </button>
        </div>
      </Header>

      <main className="f-shell space-y-8 py-10">
        <section>
          <div className="f-card grid grid-cols-1 divide-y divide-frost-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="p-5">
              <p className="f-klabel">Total claims</p>
              <p className="mt-2 font-mono text-3xl font-semibold text-ink-900">{data.stats.claims}</p>
            </div>
            <div className="p-5">
              <p className="f-klabel">Total BNT</p>
              <p className="mt-2 font-mono text-3xl font-semibold text-ink-900">{data.stats.totalBnt}</p>
            </div>
            <div className="p-5">
              <p className="f-klabel">Next claim</p>
              <p className="mt-2 font-mono text-3xl font-semibold text-frost-600">{data.stats.next}</p>
            </div>
          </div>
        </section>

        <section className="f-card">
          <h2 className="f-klabel border-b border-frost-100 px-5 py-4">History · {data.history.length}</h2>
          {data.history.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="f-th">When</th>
                    <th className="f-th">Amount</th>
                    <th className="f-th">txid / error</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.map((c, i) => (
                    <tr key={i} className="transition-colors hover:bg-frost-50/60">
                      <td className="f-td whitespace-nowrap font-mono text-xs text-ink-500">{c.when}</td>
                      <td className="f-td whitespace-nowrap font-mono text-xs">
                        <span className="font-semibold text-seaglass-600">{c.amountBnt}</span>{" "}
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
            <p className="px-5 py-8 text-center font-mono text-sm text-ink-500">No claims from this address yet.</p>
          )}
        </section>

        {data.referral ? (
          <section className="f-card">
            <h2 className="f-klabel border-b border-frost-100 px-5 py-4">
              Referrals · {data.referral.referees.length}
            </h2>
            {data.referral.paidCount > 0 ? (
              <div className="border-b border-frost-100 bg-gradient-to-r from-frost-50 via-white to-lilac-50/80 px-5 py-6">
                <p className="f-klabel">Referral rewards earned</p>
                <p className="mt-2 font-mono text-4xl font-semibold tracking-tight">
                  <span className="f-grad">{data.referral.earnedBnt}</span>
                  <span className="ml-2 text-lg font-medium text-ink-500">BNT</span>
                </p>
                <p className="mt-2 font-mono text-xs text-ink-500">
                  from {data.referral.paidCount} paid referral{data.referral.paidCount === 1 ? "" : "s"} ·{" "}
                  {data.referral.rewardBnt} BNT per qualified referral · straight to this wallet
                </p>
              </div>
            ) : (
              <p className="border-b border-frost-100 px-5 py-3 font-mono text-xs text-ink-500">
                earn {data.referral.rewardBnt} BNT per qualified referral — paid straight to this wallet
            </p>
            )}
            <div className="px-5 py-4">
              <ol className="mb-4 space-y-1.5 text-sm text-ink-500">
                <li>1 · Share your link</li>
                <li>
                  2 · Friend claims through it — it counts once they make ≥ {data.referral.minClaims} successful claims
                  with ≥ {data.referral.minSpanHours} h after the first
                </li>
                <li>3 · You earn a reward — reviewed and paid by the operator, no fixed schedule</li>
              </ol>
              <div className="flex items-center gap-2">
                <code className="block min-w-0 flex-1 break-all rounded-xl border border-frost-200 bg-white/80 px-4 py-3 font-mono text-xs text-frost-700">
                  {data.referral.refLink}
                </code>
                <CopyBtn text={data.referral.refLink} title="Copy referral link" />
              </div>
              <p className="mt-3 font-mono text-xs text-ink-500">
                code: <span className="text-ink-500">{data.referral.code}</span>
              </p>
            </div>
            {data.referral.referees.length > 0 ? (
              <ul className="divide-y divide-frost-100/80 border-t border-frost-100">
                {data.referral.referees.map((r) => (
                  <li key={r.address} className="flex items-center gap-3 px-5 py-3 font-mono text-sm">
                    <span className="w-20 shrink-0 text-xs text-ink-500">{r.when}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-600" title={r.address}>
                      {truncateMiddle(r.address)}
                    </span>
                    {r.paidWhen ? (
                      <a
                        href={r.txUrl}
                        target="_blank"
                        rel="noopener"
                        className="f-badge bg-seaglass-100 text-seaglass-700 transition-colors hover:bg-seaglass-200"
                        title="Reward paid — view the payout transaction"
                      >
                        paid · {r.paidWhen} ↗
                      </a>
                    ) : r.qualified ? (
                      <span className="f-badge bg-frost-100 text-frost-700" title="Counted toward a reward">
                        qualified
                      </span>
                    ) : (
                      <span className="f-badge bg-frost-100 text-ink-500" title={`Needs ≥ ${referral?.minClaims} successful claims with ≥ ${referral?.minSpanHours} h since the first — or an admin approval`}>
                        pending
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="border-t border-frost-100 px-5 py-6 text-center font-mono text-sm text-ink-500">
                No referrals yet.
              </p>
            )}
          </section>
        ) : null}
      </main>
    </>
  );
}
