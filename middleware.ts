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
    "/api/webhooks(.*)",   // covers /api/webhooks/clerk and /api/webhooks/lemonsqueezy
    "/api/firebase/test",
    // Panel-auth web page is public (user may not be logged in yet)
    "/panel-auth(.*)",
  ],
  // ignoredRoutes bypass ALL Clerk processing (incl. bot detection).
  // Required for CEP browser requests which Clerk may fingerprint as bots.
  // NOTE: confirm is NOT here — it calls currentUser() and needs Clerk context.
  ignoredRoutes: [
    "/api/panel/auth/start",
    "/api/panel/auth/poll",
    // MotionForge panel API — own auth via X-Panel-Key, Clerk must not interfere
    "/api/v1/motionforge(.*)",
  ],
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
