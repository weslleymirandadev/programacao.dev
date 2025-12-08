// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function proxy(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const { pathname } = req.nextUrl;

  // Rotas de API públicas para GET (cursos e jornadas públicos)
  const isPublicApiRoute = 
    (pathname === "/api/courses" || pathname === "/api/journeys") && 
    req.method === "GET";

  const isPublicRoute =
    pathname.startsWith("/signin") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/curso/") ||           // páginas públicas de curso
    pathname.startsWith("/jornada/") ||         // páginas públicas de jornada
    pathname.startsWith("/api/public") ||
    pathname === "/" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/assets") ||
    pathname.startsWith("/favicon") ||
    isPublicApiRoute;

  if (!isPublicRoute && !token) {
    const url = new URL("/signin", req.url);
    url.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // Somente admin / moderator acessa /admin
  if (pathname.startsWith("/admin")) {
    if (!token || !["ADMIN", "MODERATOR"].includes(token.role as string)) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  // Users logados não podem ir para /signin /register
  if (token && (pathname === "/signin" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/auth|_next|static|.*\\..*).*)",
  ],
};
