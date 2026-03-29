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
    // MotionForge panel API — authenticated via X-Panel-Key header, not Clerk session
    "/api/v1/motionforge(.*)",
    // Panel-auth web page is public (user may not be logged in yet)
    "/panel-auth(.*)",
  ],
  // ignoredRoutes bypass ALL Clerk processing (incl. bot detection).
  // Required for CEP browser requests which Clerk may fingerprint as bots.
  ignoredRoutes: [
    "/api/panel/auth/start",
    "/api/panel/auth/poll",
    "/api/panel/auth/confirm",
  ],
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
