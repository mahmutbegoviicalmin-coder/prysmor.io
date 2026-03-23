import { Monitor, Laptop, CheckCircle2, Circle } from "lucide-react";
import { mockLimits } from "@/lib/mockData";

export const metadata = { title: "Devices — Dashboard" };

const devices = [
  {
    name: "DESKTOP-WIN11",
    detail: "Adobe Premiere Pro 2024 \u00b7 Windows 11",
    lastSeen: "Today, 14:32",
    active: true,
    icon: Monitor,
  },
  {
    name: "MacBook-Pro-M2",
    detail: "Adobe Premiere Pro 2023 \u00b7 macOS Sonoma",
    lastSeen: "Feb 28, 2026",
    active: false,
    icon: Laptop,
  },
];

export default function DevicesPage() {
  const pct = Math.round((mockLimits.devicesUsed / mockLimits.deviceLimit) * 100);

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-[800px]">
      <div className="mb-8">
        <h1 className="text-[28px] font-semibold text-white tracking-tight mb-1.5">Devices</h1>
        <p className="text-[14px] text-[#6B7280]">Machines authorized to run the Prysmor panel.</p>
      </div>

      {/* Seats summary */}
      <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-4 mb-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-[12px] text-[#6B7280] mb-1">Device seats</p>
          <p className="text-[22px] font-semibold text-white">
            {mockLimits.devicesUsed}
            <span className="text-[15px] font-normal text-[#4B5563] ml-1">/ {mockLimits.deviceLimit}</span>
          </p>
        </div>
        <div className="w-32">
          <div className="h-[3px] rounded-full bg-white/[0.07] overflow-hidden">
            <div className="h-full rounded-full bg-[#A3FF12]" style={{ width: `${pct}%`, opacity: 0.85 }} />
          </div>
          <p className="text-[11px] text-[#4B5563] mt-1.5">{mockLimits.deviceLimit - mockLimits.devicesUsed} seat(s) remaining</p>
        </div>
      </div>

      {/* Device list */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3">Registered devices</p>
      <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] overflow-hidden">
        {devices.map((d, i) => {
          const Icon = d.icon;
          return (
            <div key={d.name} className={`flex items-center justify-between px-5 py-4 ${i < devices.length - 1 ? "border-b border-white/[0.04]" : ""}`}>
              <div className="flex items-center gap-3 min-w-0">
                <Icon className="w-4 h-4 text-[#4B5563] flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-[#D1D5DB] truncate">{d.name}</p>
                  <p className="text-[11px] text-[#4B5563] mt-0.5">{d.detail}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                <div className="text-right hidden sm:block">
                  <p className="text-[11px] text-[#4B5563]">Last seen</p>
                  <p className="text-[11px] text-[#6B7280]">{d.lastSeen}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {d.active
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-[#A3FF12]" />
                    : <Circle className="w-3.5 h-3.5 text-[#374151]" />
                  }
                  <span className={`text-[11px] font-medium ${d.active ? "text-[#A3FF12]" : "text-[#4B5563]"}`}>
                    {d.active ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[12px] text-[#374151]">
        To deactivate a device, sign out from the Prysmor panel on that machine.
      </p>
    </div>
  );
}
