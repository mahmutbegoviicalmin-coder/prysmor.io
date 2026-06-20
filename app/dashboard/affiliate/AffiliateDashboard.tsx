"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Wallet,
  Users,
  TrendingUp,
  ArrowUpRight,
  Clock,
  X,
  ListChecks,
  Zap,
  Crown,
  Sparkles,
  Copy,
  Check,
  Link2,
} from "lucide-react";

interface Stats {
  totalEarnings: number;
  pendingEarnings: number;
  paidEarnings: number;
  starterCount: number;
  proCount: number;
  exclusiveCount: number;
}

interface AffiliateProfile {
  commissionPercent: number;
  note: string;
}

interface ReferralRow {
  id: string;
  referredEmail: string;
  plan: string;
  commission: number;
  status: "pending" | "paid";
  createdAt: string | null;
}

type PayoutMethod = "paypal" | "bank";

interface PayoutRequestRow {
  id: string;
  amount: number;
  method: PayoutMethod;
  status: "pending" | "paid" | "rejected";
  createdAt: string | null;
}

const inputClass =
  "w-full rounded-lg border border-white/[0.08] bg-[#0a0a0a] px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#39FF6A]/35";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusColor(status: PayoutRequestRow["status"]) {
  if (status === "paid") return "text-[#39FF6A]";
  if (status === "rejected") return "text-red-400";
  return "text-amber-400";
}

function StatCard({
  label,
  value,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string;
  accent: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0c0c0c] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#555]">
            {label}
          </p>
          <p className="mt-2 text-[28px] font-bold tracking-tight" style={{ color: accent }}>
            {value}
          </p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#39FF6A]/15 bg-[#39FF6A]/[0.06]">
          <Icon className="h-4 w-4 text-[#39FF6A]" />
        </div>
      </div>
    </div>
  );
}

function PlanCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0c0c0c] p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#555]">
          {label}
        </p>
        <Icon className="h-3.5 w-3.5" style={{ color: accent }} />
      </div>
      <p className="mt-2 text-[24px] font-bold text-white">{value}</p>
    </div>
  );
}

function CopyLink({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12px] text-[#888] transition-colors hover:text-white"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-[#39FF6A]" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function PayoutRequestModal({
  open,
  onClose,
  available,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  available: number;
  onSubmitted: () => void;
}) {
  const [method, setMethod] = useState<PayoutMethod>("paypal");
  const [paypalMeLink, setPaypalMeLink] = useState("");
  const [bank, setBank] = useState({
    firstName: "",
    lastName: "",
    address: "",
    city: "",
    phone: "",
    accountNumber: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const submit = async () => {
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/affiliate/payout-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          method === "paypal" ? { method: "paypal", paypalMeLink } : { method: "bank", bank },
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Request failed");
        return;
      }
      onSubmitted();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-white/[0.08] bg-[#0c0c0c] p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold text-white">Request payout</h2>
            <p className="mt-1 text-[13px] text-[#777]">
              Available balance{" "}
              <span className="font-semibold text-[#39FF6A]">${available.toFixed(2)}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-[#555] hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {(["paypal", "bank"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={`rounded-lg px-4 py-2 text-[12px] font-medium ${
                method === m
                  ? "border border-[#39FF6A]/40 bg-[#39FF6A]/10 text-[#39FF6A]"
                  : "border border-white/[0.08] text-[#777] hover:text-white"
              }`}
            >
              {m === "paypal" ? "PayPal" : "Bank transfer"}
            </button>
          ))}
        </div>

        {method === "paypal" ? (
          <div>
            <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-[#555]">
              PayPal.me link
            </label>
            <input
              type="url"
              value={paypalMeLink}
              onChange={(e) => setPaypalMeLink(e.target.value)}
              placeholder="https://paypal.me/yourname"
              className={inputClass}
            />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["firstName", "First name"],
              ["lastName", "Last name"],
              ["address", "Address"],
              ["city", "City"],
              ["phone", "Phone"],
              ["accountNumber", "Account number"],
            ].map(([key, label]) => (
              <div key={key} className={key === "address" ? "sm:col-span-2" : undefined}>
                <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-[#555]">
                  {label}
                </label>
                <input
                  value={bank[key as keyof typeof bank]}
                  onChange={(e) => setBank((prev) => ({ ...prev, [key]: e.target.value }))}
                  className={inputClass}
                />
              </div>
            ))}
          </div>
        )}

        {error && <p className="mt-3 text-[12px] text-red-400">{error}</p>}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={submitting || available <= 0}
            className="flex-1 rounded-lg bg-[#39FF6A] py-2.5 text-[13px] font-semibold text-black disabled:opacity-40"
          >
            {submitting ? "Submitting…" : `Request $${available.toFixed(2)}`}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/[0.08] px-4 py-2.5 text-[13px] text-[#888]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function MyRequestsSection({
  requests,
  loading,
  openRequest,
}: {
  requests: PayoutRequestRow[];
  loading: boolean;
  openRequest: PayoutRequestRow | null;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0c0c0c] p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-[#39FF6A]" />
        <h2 className="text-[15px] font-semibold text-white">My requests</h2>
      </div>

      {openRequest && (
        <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-[13px] text-[#ccc]">
          Pending payout of{" "}
          <span className="font-semibold text-amber-400">
            ${openRequest.amount.toFixed(2)}
          </span>{" "}
          via {openRequest.method === "paypal" ? "PayPal" : "bank transfer"}.
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-[#333]" />
        </div>
      ) : requests.length === 0 ? (
        <p className="text-[13px] text-[#555]">No payout requests yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-[12px]">
            <thead>
              <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-[#555]">
                <th className="pb-2 pr-4 font-semibold">Date</th>
                <th className="pb-2 pr-4 font-semibold">Amount</th>
                <th className="pb-2 pr-4 font-semibold">Method</th>
                <th className="pb-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id} className="border-b border-white/[0.04] text-[#aaa]">
                  <td className="py-3 pr-4">{fmtDate(req.createdAt)}</td>
                  <td className="py-3 pr-4 font-semibold text-white">
                    ${req.amount.toFixed(2)}
                  </td>
                  <td className="py-3 pr-4 capitalize">
                    {req.method === "paypal" ? "PayPal" : "Bank"}
                  </td>
                  <td className={`py-3 font-bold uppercase ${statusColor(req.status)}`}>
                    {req.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AffiliateDashboard() {
  const [data, setData] = useState<{
    affiliate: AffiliateProfile;
    stats: Stats;
    refLink: string;
  } | null>(null);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [requests, setRequests] = useState<PayoutRequestRow[]>([]);
  const [openRequest, setOpenRequest] = useState<PayoutRequestRow | null>(null);
  const [payoutsLoading, setPayoutsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payoutModalOpen, setPayoutModalOpen] = useState(false);

  const loadPayouts = useCallback(() => {
    setPayoutsLoading(true);
    fetch("/api/affiliate/payout-requests")
      .then((r) => r.json())
      .then((d) => {
        setRequests(d.requests ?? []);
        setOpenRequest(d.openRequest ?? null);
      })
      .catch(() => {})
      .finally(() => setPayoutsLoading(false));
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/affiliate/stats").then((r) => r.json()),
      fetch("/api/affiliate/referrals").then((r) => r.json()),
    ])
      .then(([statsRes, refsRes]) => {
        if (statsRes.error) {
          setError(statsRes.error);
          return;
        }
        setData(statsRes);
        setReferrals(refsRes.referrals ?? []);
      })
      .catch(() => setError("Failed to load staff data"))
      .finally(() => setLoading(false));

    loadPayouts();
  }, [loadPayouts]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[#333]" />
      </div>
    );
  }

  if (error === "No affiliate profile found") {
    return (
      <div className="mx-auto max-w-lg px-6 py-20 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03]">
          <Users className="h-5 w-5 text-[#555]" />
        </div>
        <h1 className="text-[18px] font-semibold text-white">Staff access not set up</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[#666]">
          Contact admin to get access with the same email you use to sign in.
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="px-6 py-10 text-[13px] text-red-400">
        {error || "Unable to load dashboard"}
      </div>
    );
  }

  const { affiliate, stats, refLink } = data;
  const canRequestPayout = stats.pendingEarnings > 0 && !openRequest;

  return (
    <>
      <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#39FF6A]/70">
              Staff program
            </p>
            <h1 className="mt-2 text-[26px] font-bold tracking-tight text-white sm:text-[30px]">
              Staff dashboard
            </h1>
            <p className="mt-1 text-[14px] text-[#666]">
              Share your link, track referrals, and request payouts.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setPayoutModalOpen(true)}
            disabled={!canRequestPayout}
            className="inline-flex items-center gap-2 rounded-lg bg-[#39FF6A] px-5 py-2.5 text-[13px] font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Wallet className="h-4 w-4" />
            Request payout
          </button>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Total earned"
            value={`$${stats.totalEarnings.toFixed(2)}`}
            accent="#39FF6A"
            icon={TrendingUp}
          />
          <StatCard
            label="Available"
            value={`$${stats.pendingEarnings.toFixed(2)}`}
            accent="#F59E0B"
            icon={Wallet}
          />
          <StatCard
            label="Paid out"
            value={`$${stats.paidEarnings.toFixed(2)}`}
            accent="#fff"
            icon={ArrowUpRight}
          />
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <PlanCard
            label="Starter"
            value={stats.starterCount}
            icon={Sparkles}
            accent="#9CA3AF"
          />
          <PlanCard label="Pro" value={stats.proCount} icon={Zap} accent="#60A5FA" />
          <PlanCard
            label="Exclusive"
            value={stats.exclusiveCount}
            icon={Crown}
            accent="#F59E0B"
          />
        </div>

        <div className="mb-6 rounded-xl border border-white/[0.07] bg-[#0c0c0c] p-5">
          <div className="mb-3 flex items-center gap-2">
            <Link2 className="h-4 w-4 text-[#39FF6A]" />
            <h2 className="text-[14px] font-semibold text-white">Referral link</h2>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-white/[0.08] bg-[#0a0a0a] px-3 py-2.5 font-mono text-[11px] text-[#888]">
              {refLink}
            </code>
            <CopyLink text={refLink} />
          </div>
          <p className="mt-3 text-[11px] text-[#555]">
            {affiliate.commissionPercent}% commission on referred subscriptions
          </p>
        </div>

        <div className="mb-6">
          <MyRequestsSection
            requests={requests}
            loading={payoutsLoading}
            openRequest={openRequest}
          />
        </div>

        <div className="mb-6 rounded-xl border border-white/[0.07] bg-[#0c0c0c] p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#39FF6A]" />
            <h2 className="text-[15px] font-semibold text-white">Recent referrals</h2>
          </div>

          {referrals.length === 0 ? (
            <p className="text-[13px] text-[#555]">No referrals recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {referrals.slice(0, 8).map((ref) => (
                <div
                  key={ref.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] text-white/90">
                      {ref.referredEmail || "Customer"}
                    </p>
                    <p className="text-[11px] text-[#555]">
                      {ref.plan} · {fmtDate(ref.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] font-semibold text-[#39FF6A]">
                      ${ref.commission.toFixed(2)}
                    </p>
                    <p className="text-[10px] uppercase text-[#555]">{ref.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {affiliate.note && (
          <div className="rounded-xl border border-[#39FF6A]/15 bg-[#39FF6A]/[0.04] px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#39FF6A]/70">
              Note from admin
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-[#aaa]">{affiliate.note}</p>
          </div>
        )}
      </div>

      <PayoutRequestModal
        open={payoutModalOpen}
        onClose={() => setPayoutModalOpen(false)}
        available={stats.pendingEarnings}
        onSubmitted={loadPayouts}
      />
    </>
  );
}
