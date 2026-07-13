import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-out",
  "/cutsync",
  "/motionforge",
  "/pricing",
  "/privacy",
  "/terms",
  "/docs(.*)",
  "/autovfx",
  "/checkout",
  "/purchase/complete",
  "/activate",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/panel-auth(.*)",
  // Dashboard — auth enforced client-side in layout (avoids session edge cases on Vercel)
  "/dashboard(.*)",
  // All API routes — each handler enforces its own auth via currentUser() / auth()
  // Calling auth.protect() in Edge middleware causes MIDDLEWARE_INVOCATION_FAILED on Vercel
  "/api/(.*)",
]);

const isIgnoredRoute = createRouteMatcher([
  "/auth-redirect",
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
