import { authMiddleware } from "@clerk/nextjs";

export default authMiddleware({
  publicRoutes: [
    "/",
    "/cutsync",
    "/motionforge",
    "/pricing",
    "/docs",
    "/docs/install",
    "/sign-in(.*)",
    "/sign-up(.*)",
    "/api/webhooks(.*)",
    "/api/firebase/test",
    "/panel-auth(.*)",
    // Panel API — own auth, must not require Clerk session
    "/api/panel/auth/start",
    "/api/panel/auth/poll",
    "/api/panel/version",
    "/api/v1/motionforge(.*)",
  ],
  // ignoredRoutes bypass ALL Clerk processing (incl. bot detection).
  // CEP browser requests can be fingerprinted as bots — ignore them entirely.
  // NOTE: confirm is NOT here — it calls currentUser() and needs Clerk context.
  ignoredRoutes: [
    "/api/panel/auth/start",
    "/api/panel/auth/poll",
    "/api/panel/version",
    "/api/v1/motionforge(.*)",
  ],
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
