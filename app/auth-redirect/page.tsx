import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function AuthRedirectPage() {
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  redirect("/dashboard");
}
