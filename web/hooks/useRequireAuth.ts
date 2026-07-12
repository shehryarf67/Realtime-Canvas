"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

// Redirects to /login once we've confirmed there's no logged-in user.
// Returns whether the caller is clear to render its real content — false
// while the auth check is still in flight, or once the redirect has fired.
export function useRequireAuth(): boolean {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!auth?.isLoading && !auth?.user) {
      router.push("/login");
    }
  }, [auth?.isLoading, auth?.user, router]);

  return !auth?.isLoading && !!auth?.user;
}
