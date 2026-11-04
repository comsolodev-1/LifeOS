import { auth } from "@/auth";

export default auth((req) => {
  if (!req.auth) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }
});

export const config = {
  matcher: [
    "/((?!api/auth|api/health|api/chat|login|_next/static|_next/image|manifest.webmanifest|icon.svg|favicon.ico).*)",
  ],
};
