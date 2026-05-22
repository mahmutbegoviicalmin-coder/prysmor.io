import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import AuthRedirectClient from "./AuthRedirectClient";

/**
 * OAuth / sign-up completion lands here.
 * Server redirect when session cookie is already set; client component
 * runs AuthenticateWithRedirectCallback to finish the OAuth handshake.
 */
export default async function AuthRedirectPage() {
  const { userId } = auth();
  if (userId) {
    const user = await currentUser();
    const createdAt = user?.createdAt ? new Date(user.createdAt) : null;
    const isNewAccount =
      createdAt !== null && Date.now() - createdAt.getTime() < 5 * 60_000;
    redirect(isNewAccount ? "/dashboard/playground" : "/dashboard");
  }

  return <AuthRedirectClient />;
}
