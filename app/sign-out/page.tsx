import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function SignOutPage() {
  const { sessionId } = await auth();

  if (sessionId) {
    try {
      const clerk = await clerkClient();
      await clerk.sessions.revokeSession(sessionId);
    } catch {
      // Session already invalid — proceed to sign-in anyway
    }
  }

  redirect("/sign-in");
}
