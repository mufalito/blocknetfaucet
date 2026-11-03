export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const text = await resp.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      /* non-JSON body — treated as a raw failure below */
    }
  }
  if (!resp.ok) {
    let message = `request failed (${resp.status})`;
    if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
      message = data.error;
    }
    throw new ApiError(resp.status, message);
  }
  return data as T;
}

export interface Banner {
  id: number;
  title: string;
  imageUrl: string;
  linkUrl: string;
}

export interface FaucetConfig {
  amountBnt: string;
  cooldownHours: string;
  dailyCapBnt: string;
  donationAddress: string;
  turnstileSitekey: string;
  signinEnabled: boolean;
  banners: { top: Banner[]; grid: Banner[]; sidebar: Banner[]; bottom: Banner[] };
}

export interface RecentClaim {
  when: string;
  address: string;
  addressFull: string;
  txid: string;
  txUrl: string;
  amountBnt: string;
}
export interface Dashboard {
  address: string;
  history: Array<{ when: string; amountBnt: string; txid: string; txUrl: string; error: string }>;
  stats: { claims: number; totalBnt: string; next: string };
  referral: {
    code: string;
    refLink: string;
    referees: Array<{ address: string; when: string; qualified: boolean }>;
    minClaims: number;
    minSpanHours: number;
  } | null;
}

export interface DripOk {
  ok: true;
  message: string;
  txid: string;
  address: string;
}

export interface AdminBanner {
  id: number;
  title: string;
  imageUrl: string;
  linkUrl: string;
  active: boolean;
  when: string;
  width: number | null;
  height: number | null;
  dims: string;
  slot: string;
  slotEffective: string;
}

export interface AdminOverview {
  stats: { total: number; dayCount: number; dayBnt: string; remainingBnt: string };
  settings: Record<string, string>;
  claims: Array<{ when: string; address: string; addressShort: string; ip: string; amountBnt: string; txid: string; txUrl: string; error: string }>;
  bans: Array<{ id: number; kind: string; value: string; reason: string; when: string }>;
  banners: AdminBanner[];
}

export interface RefereeReport {
  address: string;
  addressShort: string;
  referredWhen: string;
  claims: number;
  firstWhen: string;
  lastWhen: string;
  spanHours: number;
  qualified: boolean;
  paid: boolean;
  paidWhen: string;
  txid: string;
  sharesIpWithReferrer: boolean;
  ips: string[];
}

export interface ReferrerReport {
  referrer: string;
  referrerShort: string;
  code: string | null;
  total: number;
  qualified: number;
  unpaidQualified: number;
  payableBnt: string;
  sameIpFlag: boolean;
  distinctRefereeIps: number;
  referees: RefereeReport[];
}

export interface ReferralsReport {
  minClaims: number;
  minSpanHours: number;
  rewardBnt: string;
  amountBnt: string;
  referrers: ReferrerReport[];
}

export interface ReferralPayResult {
  ok: true;
  txid: string;
  paid: number;
  amountBnt: string;
  explorerUrl: string;
}

export interface SettingsPatch {
  amountBnt?: string;
  cooldownHours?: string;
  dailyCapBnt?: string;
  blockedCountries?: string;
  donationAddress?: string;
  referralMinClaims?: string;
  referralMinSpanHours?: string;
  referralRewardBnt?: string;
}

export const api = {
  config: () => req<FaucetConfig>("/api/config"),
  recent: () => req<{ claims: RecentClaim[] }>("/api/recent"),
  drip: (address: string, turnstileToken?: string) =>
    req<DripOk>("/api/drip", { method: "POST", body: JSON.stringify({ address, turnstileToken }) }),
  ref: (code: string) => fetch(`/api/ref/${code}`, { credentials: "same-origin" }),

  challenge: () => req<{ message: string; nonce: string }>("/api/auth/challenge", { method: "POST" }),
  verify: (nonce: string, address: string, signature: string) =>
    req<{ address: string }>("/api/auth/verify", { method: "POST", body: JSON.stringify({ nonce, address, signature }) }),
  signout: () => req<{ ok: boolean }>("/api/auth/signout", { method: "POST" }),
  me: () => req<{ address: string }>("/api/me"),
  dashboard: () => req<Dashboard>("/api/me/dashboard"),

  adminLogin: (password: string) =>
    req<{ ok: boolean }>("/api/admin/login", { method: "POST", body: JSON.stringify({ password }) }),
  adminLogout: () => req<{ ok: boolean }>("/api/admin/logout", { method: "POST" }),
  adminOverview: () => req<AdminOverview>("/api/admin/overview"),
  adminReferrals: () => req<ReferralsReport>("/api/admin/referrals"),
  adminReferralsPay: (referrer: string) =>
    req<ReferralPayResult>("/api/admin/referrals/pay", { method: "POST", body: JSON.stringify({ referrer }) }),
  adminSettings: (patch: SettingsPatch) =>
    req<{ ok: boolean }>("/api/admin/settings", { method: "PATCH", body: JSON.stringify(patch) }),
  adminBanAdd: (kind: string, value: string, reason: string) =>
    req<{ ok: boolean }>("/api/admin/bans", { method: "POST", body: JSON.stringify({ kind, value, reason }) }),
  adminBanRemove: (id: number) => req<{ ok: boolean }>(`/api/admin/bans/${id}`, { method: "DELETE" }),
  adminBannerAdd: (banner: { title: string; imageUrl: string; linkUrl: string; slot: string }) =>
    req<{ ok: boolean }>("/api/admin/banners", { method: "POST", body: JSON.stringify(banner) }),
  adminBannerSlot: (id: number, slot: string) =>
    req<{ ok: boolean }>(`/api/admin/banners/${id}`, { method: "PATCH", body: JSON.stringify({ slot }) }),
  adminBannerToggle: (id: number) => req<{ ok: boolean }>(`/api/admin/banners/${id}/toggle`, { method: "POST" }),
  adminBannerRemove: (id: number) => req<{ ok: boolean }>(`/api/admin/banners/${id}`, { method: "DELETE" }),
};
