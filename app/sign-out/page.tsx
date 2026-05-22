import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function SignOutPage() {
  const { sessionId } = await auth();

  if (sessionId) {
    try {
      await clerkClient.sessions.revokeSession(sessionId);
    } catch {
      // Session already invalid — proceed to sign-in anyway
    }
  }

  redirect("/sign-in");
}
