"use client";

import { Suspense, useState, type SyntheticEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthScaffold, { PasswordField } from "@/components/AuthScaffold";
import { isValidPassword, MIN_PASSWORD_LENGTH } from "@/lib/validation";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setError(null);

    if (!isValidPassword(password)) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    setIsLoading(true);

    let res: Response;
    try {
      res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
    } catch {
      setError("Can't reach the server right now. Please try again.");
      setIsLoading(false);
      return;
    }

    const data = await res.json();
    setIsLoading(false);

    if (!res.ok) {
      setError(data.error);
      return;
    }

    setSuccess(true);
    setTimeout(() => router.push("/login"), 1500);
  }

  if (!token) {
    return (
      <p className="text-sm text-neutral-600">
        This reset link is missing or invalid. Request a new one from{" "}
        <Link
          href="/forgot-password"
          className="font-medium text-neutral-900 underline underline-offset-4 transition-colors hover:text-neutral-600 motion-reduce:transition-none"
        >
          the forgot password page
        </Link>
        .
      </p>
    );
  }

  if (success) {
    return <p className="text-sm text-neutral-600">Password updated — redirecting you to sign in…</p>;
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <PasswordField
        id="password"
        label="New password"
        value={password}
        onChange={setPassword}
        placeholder="Create a new password"
        autoComplete="new-password"
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
      />
      <PasswordField
        id="confirmPassword"
        label="Confirm new password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        placeholder="Type it again"
        autoComplete="new-password"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={isLoading}
        className="mt-1 inline-flex w-full items-center justify-center gap-2 bg-neutral-900 px-6 py-3.5 text-base font-medium text-white transition-colors hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
      >
        {isLoading ? "Updating..." : "Update password"}
      </button>
    </form>
  );
}

export default function ResetPassword() {
  return (
    <AuthScaffold
      eyebrow="Reset your password"
      title="Choose a new password."
      subtitle="Make it something you haven't used here before."
      footer={<span />}
    >
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </AuthScaffold>
  );
}
