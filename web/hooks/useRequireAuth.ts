"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

// Protected pages stay blank until auth is known, then logged-out users go to login.
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
