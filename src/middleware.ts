/**
 * Middleware — protect authenticated app routes.
 * Lightweight cookie check; full JWT verification happens in the
 * API routes and server components via getServerSession.
 */
import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/login" },
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/campaigns/:path*",
    "/characters/:path*",
    "/dice/:path*",
    "/settings/:path*",
  ],
};
