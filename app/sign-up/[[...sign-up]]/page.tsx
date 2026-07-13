import { redirect } from "next/navigation";

export default function SignUpPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const purchase = typeof searchParams?.purchase === "string" ? searchParams.purchase : null;
  if (purchase && /^[a-f0-9]{64}$/.test(purchase)) {
    redirect(`/sign-in?redirect=${encodeURIComponent(`/purchase/complete?claim=${purchase}`)}`);
  }
  redirect("/sign-in");
}
