"use client";

import { useState, type SyntheticEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthScaffold, { AuthField, PasswordField } from "@/components/AuthScaffold";
import { useAuth } from "@/contexts/AuthContext";
import { isValidEmail, isValidPassword, MIN_PASSWORD_LENGTH } from "@/lib/validation";
import { safeJson } from "@/lib/http";

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const auth = useAuth();
  const router = useRouter();

  const canSubmit =
    name.trim().length > 0 && email.trim().length > 0 && password.length > 0;

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setError(null);

    if (!isValidEmail(email)) {
      setError("Enter a valid email address");
      return;
    }
    if (!isValidPassword(password)) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }

    setIsLoading(true);

    let res: Response;
    try {
      res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, email, password }),
      });
    } catch {
      setError("Can't reach the server right now. Please try again.");
      setIsLoading(false);
      return;
    }

    const data = await safeJson(res);

    if (!res.ok || !data) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      setIsLoading(false);
      return;
    }

    auth?.setUser({ userId: data.userId, name: data.name, email: data.email });
    router.push("/");
  }

  return (
    <AuthScaffold
      eyebrow="Get started"
      title="Create your account."
      subtitle="Spin up boards and keep every collaborator in sync."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-neutral-900 underline underline-offset-4 transition-colors hover:text-neutral-600 motion-reduce:transition-none"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <AuthField
          id="name"
          label="Display name"
          value={name}
          onChange={setName}
          placeholder="How teammates will see you"
          autoComplete="name"
        />
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
          placeholder="Create a password"
          autoComplete="new-password"
          hint="At least 8 characters."
        />

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <button
          type="submit"
          disabled={!canSubmit || isLoading}
          className="mt-1 inline-flex w-full items-center justify-center gap-2 bg-neutral-900 px-6 py-3.5 text-base font-medium text-white transition-colors hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
        >
          {isLoading ? "Creating account..." : "Create account"}
        </button>
      </form>
    </AuthScaffold>
  );
}
