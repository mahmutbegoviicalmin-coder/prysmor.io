"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteAccountButton() {
  const router = useRouter();
  const [step, setStep]       = useState<"idle" | "confirm" | "deleting" | "done">("idle");
  const [error, setError]     = useState<string | null>(null);
  const [inputVal, setInputVal] = useState("");

  const CONFIRM_PHRASE = "delete my account";

  async function handleDelete() {
    setStep("deleting");
    setError(null);
    try {
      const res = await fetch("/api/user/delete", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deletion failed");
      setStep("done");
      // Give the user a moment to see the confirmation, then redirect
      setTimeout(() => router.replace("/"), 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("confirm");
    }
  }

  if (step === "done") {
    return (
      <div className="px-3.5 py-2.5 rounded-[8px] bg-red-500/10 border border-red-500/20 text-[12px] text-red-400/80">
        Account deleted. Redirecting…
      </div>
    );
  }

  if (step === "idle") {
    return (
      <button
        onClick={() => setStep("confirm")}
        className="px-3.5 py-2 rounded-[8px] text-[12px] font-medium border border-red-500/20 text-red-400/80 hover:bg-red-500/10 transition-colors"
      >
        Delete account
      </button>
    );
  }

  // confirm step
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-[#F59E0B]">
        This is permanent and cannot be undone. All data, credits, and devices will be removed.
      </p>
      <p className="text-[12px] text-[#6B7280]">
        Type <span className="text-white font-medium">{CONFIRM_PHRASE}</span> to confirm:
      </p>
      <input
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        placeholder={CONFIRM_PHRASE}
        disabled={step === "deleting"}
        className="w-full rounded-[8px] border border-white/[0.07] bg-[#0D0D0F] px-3.5 py-2.5 text-[13px] text-white outline-none placeholder:text-[#374151] focus:border-red-500/40"
      />
      {error && <p className="text-[12px] text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => { setStep("idle"); setInputVal(""); setError(null); }}
          disabled={step === "deleting"}
          className="px-3.5 py-2 rounded-[8px] text-[12px] font-medium border border-white/[0.07] text-[#6B7280] hover:bg-white/[0.04] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleDelete}
          disabled={inputVal !== CONFIRM_PHRASE || step === "deleting"}
          className="px-3.5 py-2 rounded-[8px] text-[12px] font-medium bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {step === "deleting" ? "Deleting…" : "Permanently delete account"}
        </button>
      </div>
    </div>
  );
}
