import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

interface Props {
  searchParams: { from?: string };
}

export default async function AuthRedirectPage({ searchParams }: Props) {
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  // Came from pricing CTA → go to pricing section
  // Normal login → go to dashboard
  if (searchParams.from === "pricing") {
    redirect("/#pricing");
  }

  redirect("/dashboard");
}
