import { redirect } from "next/navigation";

/** Legacy activate URL → set-password / sign-in flow. */
export default function ActivatePage({
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
