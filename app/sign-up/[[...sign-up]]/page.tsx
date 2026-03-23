import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center pt-[64px] px-4"
      style={{ background: "radial-gradient(ellipse 55% 50% at 50% 40%,rgba(163,255,18,0.07) 0%,transparent 65%)" }}>
      <SignUp />
    </div>
  );
}
