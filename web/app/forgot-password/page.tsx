"use client";

import { useState, type SyntheticEvent } from "react";
import AuthScaffold, { AuthField } from "@/components/AuthScaffold";
import { isValidEmail } from "@/lib/validation";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setError(null);

    if (!isValidEmail(email)) {
      setError("Enter a valid email address");
      return;
    }

    setIsLoading(true);
    const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    setIsLoading(false);

    if (!res.ok) {
      setError(data.error);
      return;
    }

    setResetUrl(data.resetUrl ?? null);
    setSubmitted(true);
  }

  function handleCopy() {
    if (!resetUrl) return;
    navigator.clipboard.writeText(resetUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <AuthScaffold
      eyebrow="Reset your password"
      title="Forgot your password?"
      subtitle="Enter the email on your account and we'll send you a reset link."
      footer={<span />}
    >
      {submitted ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-neutral-600">
            If an account exists for <span className="font-medium">{email}</span>, a reset link has been sent.
          </p>

          {resetUrl && (
            <div className="flex flex-col gap-2 border border-neutral-300 bg-white p-4">
              <p className="font-mono text-xs text-neutral-500">
                Email isn&apos;t set up yet — here&apos;s your reset link:
              </p>
              <div className="flex items-stretch border border-neutral-300">
                <span className="w-full truncate bg-neutral-50 px-3 py-2.5 text-sm text-neutral-900">
                  {resetUrl}
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="shrink-0 border-l border-neutral-300 px-3.5 text-sm font-medium text-neutral-700 transition-colors hover:text-neutral-900 cursor-pointer motion-reduce:transition-none"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
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
