import { Download, CheckCircle2, AlertCircle } from "lucide-react";
import { mockPanel } from "@/lib/mockData";

export const metadata = { title: "Plugin — Dashboard" };

const steps = [
  "Download the Prysmor panel installer for your OS.",
  "Run the installer and follow the on-screen instructions.",
  "Restart Adobe Premiere Pro.",
  "Open: Window \u2192 Extensions \u2192 Prysmor.",
  "Sign in with this account to activate your license.",
];

export default function PluginPage() {
  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-[800px]">
      <div className="mb-8">
        <h1 className="text-[28px] font-semibold text-white tracking-tight mb-1.5">Premiere Panel</h1>
        <p className="text-[14px] text-[#6B7280]">Download and install the Prysmor panel for Adobe Premiere Pro.</p>
      </div>

      {/* Connection status */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3">Panel status</p>
      <div className={`rounded-[12px] border p-4 mb-8 flex items-start gap-3 ${
        mockPanel.connected
          ? "border-[#A3FF12]/[0.14] bg-[#A3FF12]/[0.04]"
          : "border-white/[0.07] bg-[#111113]"
      }`}>
        {mockPanel.connected
          ? <CheckCircle2 className="w-4 h-4 text-[#A3FF12] mt-0.5 flex-shrink-0" />
          : <AlertCircle className="w-4 h-4 text-[#F59E0B] mt-0.5 flex-shrink-0" />
        }
        <div>
          <p className="text-[13px] font-medium text-white">
            {mockPanel.connected ? "Panel connected" : "Panel not connected"}
          </p>
          <p className="text-[12px] text-[#6B7280] mt-0.5">
            {mockPanel.connected
              ? `${mockPanel.deviceName} \u00b7 ${mockPanel.platform} \u00b7 Last active ${mockPanel.lastActiveAt}`
              : "Install the panel to connect this account to Premiere Pro."
            }
          </p>
        </div>
      </div>

      {/* Download */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3">Download</p>
      <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-5 mb-8">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-[15px] font-semibold text-white mb-1">Prysmor Panel v1.0</p>
            <p className="text-[12px] text-[#6B7280]">
              Compatible with Premiere Pro CC 2022+ &nbsp;&middot;&nbsp; Windows &amp; macOS
            </p>
          </div>
          <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[8px] bg-[#A3FF12] text-[#050505] text-[13px] font-semibold hover:bg-[#B6FF3C] transition-colors flex-shrink-0">
            <Download className="w-4 h-4" />
            Download installer
          </button>
        </div>
      </div>

      {/* Steps */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-[#374151] mb-3">Installation steps</p>
      <div className="rounded-[12px] border border-white/[0.07] bg-[#111113] p-5">
        <ol className="space-y-3.5">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3.5">
              <span className="flex-shrink-0 w-5 h-5 rounded-full border border-[#A3FF12]/20 bg-[#A3FF12]/[0.07] flex items-center justify-center text-[10px] font-bold text-[#A3FF12]">
                {i + 1}
              </span>
              <span className="text-[13px] text-[#9CA3AF] leading-relaxed pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
        <div className="mt-5 pt-4 border-t border-white/[0.05] flex items-start gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-[#A3FF12] mt-0.5 flex-shrink-0" />
          <p className="text-[12px] text-[#4B5563]">
            Your license key is automatically synced when you sign in inside Premiere Pro.
          </p>
        </div>
      </div>
    </div>
  );
}
