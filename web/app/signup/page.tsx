"use client";

import { useState, type SyntheticEvent } from "react";
import Link from "next/link";
import AuthScaffold, { AuthField, PasswordField } from "@/components/AuthScaffold";

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const canSubmit =
    name.trim().length > 0 && email.trim().length > 0 && password.length > 0;

  function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    // TODO: auth wiring goes here — create an account with { name, email,
    // password }, then redirect. Intentionally left unimplemented (no auth
    // routes / middleware yet).
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

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-1 inline-flex w-full items-center justify-center gap-2 bg-neutral-900 px-6 py-3.5 text-base font-medium text-white transition-colors hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
        >
          Create account
        </button>
      </form>
    </AuthScaffold>
  );
}
