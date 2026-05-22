import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-out",
  "/cutsync",
  "/motionforge",
  "/pricing",
  "/docs(.*)",
  "/autovfx",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/api/firebase/test",
  "/panel-auth(.*)",
  // Dashboard — auth enforced client-side in layout (avoids custom-domain session edge cases)
  "/dashboard(.*)",
  // Analytics — must be public so anonymous visitors can be tracked
  "/api/track",
  // Panel API — uses its own validatePanelToken auth, must not require Clerk session
  "/api/panel/auth/start",
  "/api/panel/auth/poll",
  "/api/panel/heartbeat",
  "/api/panel/version",
  "/api/v1/motionforge(.*)",
]);

const isIgnoredRoute = createRouteMatcher([
  "/auth-redirect",
  "/api/track",
  "/api/panel/auth/start",
  "/api/panel/auth/poll",
  "/api/panel/heartbeat",
  "/api/panel/version",
  "/api/v1/motionforge(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isIgnoredRoute(req)) return;
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
