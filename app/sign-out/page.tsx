import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  destroySession,
  clearSessionCookieJar,
} from "@/lib/auth/session";

export default async function SignOutPage() {
  const jar = await cookies();
  const sessionId = jar.get(SESSION_COOKIE)?.value;
  await destroySession(sessionId);
  await clearSessionCookieJar();
  redirect("/sign-in");
}
