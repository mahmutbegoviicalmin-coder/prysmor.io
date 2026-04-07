import { currentUser } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { Monitor, Laptop, CheckCircle2, Circle, WifiOff, ShieldAlert } from "lucide-react";
import { getDashboardData } from "@/lib/firestore/dashboard";

export const metadata = { title: "Devices — Dashboard" };

export default async function DevicesPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  let data;
  try {
    data = await getDashboardData(user.id, user);
  } catch {
    data = {
      limits: { devicesUsed: 0, deviceLimit: 1, credits: 0, creditsTotal: 0, resetDate: "—" },
      panel: { allDevices: [], connected: false, deviceName: "—", platform: "—", hostApp: "—", hostAppVersion: "—", cepVersion: "—", firstConnectedAt: "—", lastActiveAt: "—" },
      license: { planName: "Starter", status: "active" as const, renewalDate: "—", lastVerifiedAt: "—" },
      security: { mfaEnabled: false, lastLoginAt: "—", activeSessions: 1 },
      activity: [],
    };
  }

  const { limits, panel } = data;
  const devices = panel.allDevices;
  const atLimit = limits.devicesUsed >= limits.deviceLimit;

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-[800px]">
      <div className="mb-8">
        <h1 className="text-[28px] font-semibold text-white tracking-tight mb-1.5">Devices</h1>
        <p className="text-[14px] text-[#6B7280]">Machines authorized to run the Prysmor panel.</p>
      </div>

      {/* Seat summary */}
      <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-4 mb-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-[12px] text-[#6B7280] mb-1">Device seats</p>
          <p className="text-[22px] font-semibold text-white">
            {limits.devicesUsed}
            <span className="text-[15px] font-normal text-[#4B5563] ml-1">/ {limits.deviceLimit}</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="w-32">
            <div className="h-[3px] rounded-full bg-white/[0.07] overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, Math.round((limits.devicesUsed / limits.deviceLimit) * 100))}%`,
                  background: atLimit ? "#F87171" : "#A3FF12",
                  opacity: 0.85,
                }}
              />
            </div>
          </div>
          <p className={`text-[11px] ${atLimit ? "text-[#F87171]" : "text-[#4B5563]"}`}>
            {atLimit ? "Limit reached" : `${limits.deviceLimit - limits.devicesUsed} seat remaining`}
          </p>
        </div>
      </div>

      {/* Limit warning */}
      {atLimit && (
        <div className="mb-6 flex items-start gap-3 rounded-[10px] border border-[#F87171]/20 bg-[#F87171]/[0.06] px-4 py-3">
          <ShieldAlert className="w-4 h-4 text-[#F87171] flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-[#F87171] leading-relaxed">
            You have reached the 1-device limit. To connect a new device, sign out from the Prysmor panel on your current machine first.
          </p>
        </div>
      )}

      {/* Device list */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3">
        Registered devices
      </p>

      {devices.length === 0 ? (
        <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] px-5 py-8 flex flex-col items-center gap-2">
          <WifiOff className="w-6 h-6 text-[#374151]" />
          <p className="text-[13px] text-[#4B5563]">No devices registered yet</p>
          <p className="text-[12px] text-[#374151]">Open the Prysmor panel in Premiere Pro to connect.</p>
        </div>
      ) : (
        <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] overflow-hidden">
          {devices.map((d, i) => {
            const isWindows = d.platform.toLowerCase().includes("win");
            const Icon = isWindows ? Monitor : Laptop;
            return (
              <div
                key={d.id}
                className={`flex items-center justify-between px-5 py-4 ${
                  i < devices.length - 1 ? "border-b border-white/[0.04]" : ""
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-[8px] flex-shrink-0 flex items-center justify-center border ${
                    d.connected
                      ? "bg-[#A3FF12]/[0.07] border-[#A3FF12]/20"
                      : "bg-white/[0.03] border-white/[0.07]"
                  }`}>
                    <Icon className={`w-4 h-4 ${d.connected ? "text-[#A3FF12]" : "text-[#4B5563]"}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-[#D1D5DB] truncate">{d.name}</p>
                    <p className="text-[11px] text-[#4B5563] mt-0.5 truncate">
                      {[
                        d.hostApp !== "—" ? `${d.hostApp} ${d.hostAppVersion}`.trim() : null,
                        d.platform !== "—" ? d.platform : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                  <div className="text-right hidden sm:block">
                    <p className="text-[11px] text-[#4B5563]">Last seen</p>
                    <p className="text-[11px] text-[#6B7280]">{d.lastActiveAt}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {d.connected
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-[#A3FF12]" />
                      : <Circle className="w-3.5 h-3.5 text-[#374151]" />
                    }
                    <span className={`text-[11px] font-medium ${d.connected ? "text-[#A3FF12]" : "text-[#4B5563]"}`}>
                      {d.connected ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-[12px] text-[#374151]">
        To deactivate a device, sign out from the Prysmor panel on that machine.
        Each account supports <span className="text-[#6B7280]">1 device</span> at a time.
      </p>
    </div>
  );
}
