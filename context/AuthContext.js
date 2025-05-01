// src/context/AuthContext.js
"use client"; // This context will be used in client components

import React, { createContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation"; // Use App Router's router
import Cookies from "js-cookie"; // Library to easily handle cookies client-side

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // Store authenticated user data
  const [token, setToken] = useState(null); // Store JWT token
  const [loading, setLoading] = useState(true); // Loading state for initial auth check
  const router = useRouter();

  // --- Check for existing token on initial load ---
  useEffect(() => {
    const checkAuthStatus = async () => {
      setLoading(true);
      const storedToken = Cookies.get("authToken"); // Check for token in cookies

      if (storedToken) {
        try {
          // Option 1: Decode token client-side (less secure, reveals payload)
          // const decoded = jwt_decode(storedToken); // Requires jwt-decode library
          // setUser({ userId: decoded.userId, username: decoded.username }); // Set user from token payload

          // Option 2 (Recommended): Verify token with a backend endpoint
          // This ensures the token is still valid and fetches fresh user data.
          const response = await fetch("/api/auth/verify", {
            // Example endpoint
            headers: { Authorization: `Bearer ${storedToken}` },
          });

          if (response.ok) {
            const userData = await response.json();
            setUser(userData.user); // Set user data from backend response
            setToken(storedToken);
            console.log("AuthContext: User verified via API.");
          } else {
            // Token invalid or expired, remove it
            console.log(
              "AuthContext: Token verification failed, removing cookie."
            );
            Cookies.remove("authToken");
            setUser(null);
            setToken(null);
          }
        } catch (error) {
          console.error("AuthContext: Error verifying token:", error);
          Cookies.remove("authToken"); // Remove potentially corrupt token
          setUser(null);
          setToken(null);
        }
      } else {
        console.log("AuthContext: No auth token found.");
        setUser(null);
        setToken(null);
      }
      setLoading(false);
    };

    checkAuthStatus();
  }, []); // Run only once on mount

  // --- Login Function ---
  const login = useCallback((userData, jwtToken) => {
    console.log("AuthContext: Logging in user:", userData.username);
    setUser(userData);
    setToken(jwtToken);
    // Cookie setting is handled by the API route (HttpOnly)
    // Cookies.set('authToken', jwtToken, { expires: 7, path: '/', sameSite: 'strict', secure: process.env.NODE_ENV === 'production' });
    // Redirect after login (optional, could be handled in the component)
    // router.push('/');
  }, []);

  // --- Logout Function ---
  const logout = useCallback(async () => {
    console.log("AuthContext: Logging out user.");
    setUser(null);
    setToken(null);
    Cookies.remove("authToken", { path: "/" }); // Remove cookie client-side
    // Optional: Notify backend to invalidate session/token if needed
    // await fetch('/api/auth/logout', { method: 'POST' });
    // Redirect to login page
    router.push("/login");
    // Disconnect socket if managed globally (better handled in SocketContext)
    // disconnectSocket();
  }, [router]);

  // --- Context Value ---
  const value = {
    user,
    token,
    isAuthenticated: !!user, // Boolean flag for convenience
    loading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// --- Custom Hook for easy access ---
// (Define useAuth in src/hooks/useAuth.js as shown previously)
// export const useAuth = () => {
//   const context = useContext(AuthContext);
//   if (context === undefined) {
//     throw new Error('useAuth must be used within an AuthProvider');
//   }
//   return context;
// };

export default AuthContext; // Export context for direct use if needed
// ```
// *Self-Correction:* Added a `loading` state to handle the initial asynchronous check for authentication. Included a placeholder `/api/auth/verify` endpoint call for a more secure token validation approach (this endpoint would need to be created). Emphasized that cookie setting is primarily handled server-side (HttpOnly). Added `useCallback` for `login` and `logout`. Removed direct `useAuth` export, assuming it's in `src/hooks/useAuth.j
