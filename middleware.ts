import { authMiddleware } from "@clerk/nextjs";

export default authMiddleware({
  signInUrl: "/sign-in",
  publicRoutes: [
    "/",
    "/sign-out",
    "/auth-redirect",
    "/cutsync",
    "/motionforge",
    "/pricing",
    "/docs",
    "/docs/install",
    "/autovfx",
    "/sign-in(.*)",
    "/sign-up(.*)",
    "/api/webhooks(.*)",
    "/api/firebase/test",
    "/panel-auth(.*)",
    // Analytics — must be public so anonymous visitors can be tracked
    "/api/track",
    // Panel API — own auth via validatePanelToken, must not require Clerk session
    "/api/panel/auth/start",
    "/api/panel/auth/poll",
    "/api/panel/heartbeat",
    "/api/panel/version",
    "/api/v1/motionforge(.*)",
    // NOTE: /api/panel/auth/confirm is NOT here — it calls currentUser() and needs Clerk session.
  ],
  // ignoredRoutes bypass ALL Clerk processing (incl. bot detection).
  // CEP browser requests can be fingerprinted as bots — ignore them entirely.
  ignoredRoutes: [
    "/api/track",
    "/api/panel/auth/start",
    "/api/panel/auth/poll",
    "/api/panel/heartbeat",
    "/api/panel/version",
    "/api/v1/motionforge(.*)",
  ],
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
