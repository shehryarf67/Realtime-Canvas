"use client";

import { useState, type SyntheticEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthScaffold, { AuthField, PasswordField } from "@/components/AuthScaffold";
import { useAuth } from "@/contexts/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const auth = useAuth();
  const router = useRouter();

  const canSubmit = email.trim().length > 0 && password.length > 0;

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error);
      setIsLoading(false);
      return;
    }

    auth?.setUser({ userId: data.userId, name: data.name, email: data.email });
    router.push("/");
  }

  return (
    <AuthScaffold
      eyebrow="Welcome back"
      title="Sign in to coboard."
      subtitle="Pick up right where your team left off."
      footer={
        <>
          New to coboard?{" "}
          <Link
            href="/signup"
            className="font-medium text-neutral-900 underline underline-offset-4 transition-colors hover:text-neutral-600 motion-reduce:transition-none"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <AuthField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          autoComplete="email"
        />
        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          placeholder="Your password"
          autoComplete="current-password"
        />

        <Link
          href="/forgot-password"
          className="-mt-2 self-end text-sm font-medium text-neutral-600 underline underline-offset-4 transition-colors hover:text-neutral-900 motion-reduce:transition-none"
        >
          Forgot password?
        </Link>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <button
          type="submit"
          disabled={!canSubmit || isLoading}
          className="mt-1 inline-flex w-full items-center justify-center gap-2 bg-neutral-900 px-6 py-3.5 text-base font-medium text-white transition-colors hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
        >
          {isLoading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </AuthScaffold>
  );
}
