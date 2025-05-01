// middleware.js (Place in the root of your project, or inside src/ if preferred)
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/jwt"; // Your JWT verification function

// --- Configuration ---

// Public routes accessible without authentication
const PUBLIC_ROUTES = ["/login", "/signup"];

// Routes that require authentication
// Add any other protected routes here (e.g., '/settings', '/profile')
const PROTECTED_ROUTES_PREFIXES = ["/chat", "/"]; // Protect root and /chat/*

// API routes that should bypass this middleware (or have their own auth checks)
const API_AUTH_ROUTES_PREFIX = "/api/auth";
const API_SOCKET_ROUTE = "/api/socket"; // Socket.IO endpoint

export async function middleware(req) {
  const { pathname } = req.nextUrl; // Get the requested path

  // --- Bypass middleware for specific paths ---
  // Allow Next.js internals, static files, images, and specific API routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.startsWith("/public") ||
    pathname.includes("/favicon.ico") ||
    pathname.startsWith(API_AUTH_ROUTES_PREFIX) || // Allow auth API routes
    pathname.startsWith(API_SOCKET_ROUTE) // Allow Socket.IO connection endpoint
  ) {
    return NextResponse.next(); // Continue without checks
  }

  // --- Get Authentication Token ---
  const token = req.cookies.get("authToken")?.value;
  let decodedToken = null;

  if (token) {
    decodedToken = verifyToken(token); // Verify the token
    // Optional: Add DB check here to ensure user exists and is active
    // This adds latency but increases security against deleted/banned users
    // if (decodedToken) {
    //   await dbConnect();
    //   const userExists = await User.exists({ _id: decodedToken.userId });
    //   if (!userExists) decodedToken = null; // Invalidate token if user doesn't exist
    // }
  }

  const isAuthenticated = !!decodedToken; // True if token is valid

  // --- Determine Route Type ---
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);
  // Check if the path starts with any of the protected prefixes
  const isProtectedRoute = PROTECTED_ROUTES_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  // --- Logic ---

  // 1. Trying to access a PROTECTED route WITHOUT authentication
  if (isProtectedRoute && !isAuthenticated) {
    console.log(
      `[Middleware] Denied access to ${pathname} (unauthenticated). Redirecting to /login.`
    );
    const loginUrl = new URL("/login", req.url); // Construct absolute URL for redirection
    loginUrl.searchParams.set("redirectedFrom", pathname); // Optional: Pass redirect path
    return NextResponse.redirect(loginUrl);
  }

  // 2. Trying to access a PUBLIC route (login/signup) WITH authentication
  if (isPublicRoute && isAuthenticated) {
    console.log(
      `[Middleware] Authenticated user accessing ${pathname}. Redirecting to /.`
    );
    const homeUrl = new URL("/", req.url); // Redirect to home/dashboard
    return NextResponse.redirect(homeUrl);
  }

  // 3. Authenticated user accessing a PROTECTED route (or any other non-public route)
  if (isAuthenticated) {
    // Optional: Add user info to request headers for easy access in Server Components/API Routes
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-user-id", decodedToken.userId);
    requestHeaders.set("x-user-username", decodedToken.username);
    // Add other relevant user info if needed

    // Clone the request with the new headers
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  // 4. Unauthenticated user accessing a non-protected, non-public route (if any exist)
  // Or any other case not covered above - proceed as normal
  return NextResponse.next();
}

// --- Matcher ---
// Define the paths where this middleware should run.
// This avoids running it on unnecessary routes like static files or API endpoints handled elsewhere.
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - /public (public assets) - Adjust if your public assets are served differently
     * - /api/auth/ (authentication API routes)
     * - /api/socket (Socket.IO endpoint)
     * We want it to run on '/' and '/chat/*' and '/login', '/signup'.
     */
    "/((?!_next/static|_next/image|favicon.ico|public/|api/auth/|api/socket).*)",
  ],
};
