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
    // Panel device auth flow — start + poll are called from CEP (no Clerk session)
    "/api/panel/auth/start",
    "/api/panel/auth/poll",
    // Panel-auth web page is public (user may not be logged in yet)
    "/panel-auth(.*)",
  ],
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
