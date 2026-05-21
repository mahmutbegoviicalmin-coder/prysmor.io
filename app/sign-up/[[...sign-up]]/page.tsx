import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 gap-6"
      style={{
        background:
          "radial-gradient(ellipse 60% 45% at 50% 30%, rgba(163,255,18,0.07) 0%, transparent 65%), #05050A",
      }}
    >
      <div className="flex flex-col items-center gap-2 mb-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo/logo-icon.png"
          alt="Prysmor"
          className="w-9 h-9 object-contain"
          draggable={false}
        />
        <span className="text-[13px] text-[#4B5563] tracking-wide">
          prysmor.io
        </span>
      </div>

      <SignUp />
    </div>
  );
}
