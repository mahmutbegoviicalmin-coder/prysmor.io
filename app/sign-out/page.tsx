import { auth, createClerkClient } from "@clerk/nextjs/server";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
import { redirect } from "next/navigation";

export default async function SignOutPage() {
  const { sessionId } = await auth();

  if (sessionId) {
    try {
      await clerk.sessions.revokeSession(sessionId);
    } catch {
      // Session already invalid — proceed to sign-in anyway
    }
  }

  redirect("/sign-in");
}
