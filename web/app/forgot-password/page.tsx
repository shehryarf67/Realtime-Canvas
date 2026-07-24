"use client";

import { useState, type SyntheticEvent } from "react";
import Link from "next/link";
import AuthScaffold, { AuthField } from "@/components/AuthScaffold";
import { isValidEmail } from "@/lib/validation";
import { safeJson } from "@/lib/http";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Local dev can show the fallback link when email delivery is unavailable.
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setError(null);

    if (!isValidEmail(email)) {
      setError("Enter a valid email address");
      return;
    }

    setIsLoading(true);

    let res: Response;
    try {
      res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      setError("Can't reach the server right now. Please try again.");
      setIsLoading(false);
      return;
    }

    const data = await safeJson(res);
    setIsLoading(false);

    if (!res.ok || !data) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      return;
    }

    if (data.resetUrl) setDevResetUrl(data.resetUrl);
    setSubmitted(true);
  }

  return (
    <AuthScaffold
      eyebrow="Reset your password"
      title="Forgot your password?"
      subtitle="Enter the email on your account and we'll send you a reset link."
      footer={
        <Link
          href="/login"
          className="font-medium text-neutral-900 underline underline-offset-4 transition-colors hover:text-neutral-600 motion-reduce:transition-none"
        >
          ← Back to sign in
        </Link>
      }
    >
      {submitted ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-neutral-600">
            If an account exists for <span className="font-medium">{email}</span>, a reset
            link is on its way. Check your inbox — the link is valid for 3 hours.
          </p>
          <p className="text-sm text-neutral-500">
            Delivery can occasionally take a little while to arrive — if it's not there in a
            few minutes, check spam, then give it some time before requesting another.
          </p>
          {devResetUrl && (
            <p className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Dev mode (no email configured):{" "}
              <a href={devResetUrl} className="font-medium underline underline-offset-2">
                open your reset link
              </a>
            </p>
          )}
        </div>
      ) : (
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

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={isLoading}
            className="mt-1 inline-flex w-full items-center justify-center gap-2 bg-neutral-900 px-6 py-3.5 text-base font-medium text-white transition-colors hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
          >
            {isLoading ? "Sending..." : "Send reset link"}
          </button>
        </form>
      )}
    </AuthScaffold>
  );
}
