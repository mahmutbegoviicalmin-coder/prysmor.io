import { redirect } from "next/navigation";

/** Public sign-up is disabled — accounts are created only after purchase. */
export default function SignUpPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const purchase = typeof searchParams?.purchase === "string" ? searchParams.purchase : null;
  if (purchase && /^[a-f0-9]{64}$/.test(purchase)) {
    redirect(`/forgot-password`);
  }
  redirect("/sign-in");
}
