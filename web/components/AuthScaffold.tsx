"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

/**
 * Shared shell for the login / signup pages. Carries the same visual language as
 * the landing page (soft off-white base, visible dot grid, cool light wash, brand
 * lockmark, and the left-aligned column hung off a vertical rule). Purely
 * presentational — no auth logic lives here.
 */
type AuthScaffoldProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  /** The form. */
  children: ReactNode;
  /** Switch-page line shown beneath the form. */
  footer: ReactNode;
};

export default function AuthScaffold({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: AuthScaffoldProps) {
  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#f4f6fb] text-neutral-900">
      {/* Dot-grid background — same calm, eye-friendly base as the landing */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,_#94a3b8_1.3px,_transparent_1.4px)] bg-[length:24px_24px] opacity-50"
      />

      {/* Soft cool light wash so the page reads as lit, not flat */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle,_#dbeafe_0%,_transparent_70%)] opacity-70 blur-2xl"
      />

      {/* Quiet canvas atmosphere echoing the landing — kept static so the form stays
          the focus. Non-interactive and hidden until there is room. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden select-none xl:block"
      >
        <svg
          className="absolute right-[7rem] top-[8rem] h-72 w-80 opacity-50"
          viewBox="0 0 320 288"
          fill="none"
        >
          <rect x="20" y="24" width="150" height="96" stroke="#2563eb" strokeWidth="1.5" />
          <circle cx="232" cy="196" r="62" stroke="#f43f5e" strokeWidth="1.5" />
          <path
            d="M95 120 C 130 140, 160 146, 190 150"
            stroke="#94a3b8"
            strokeWidth="1.5"
            strokeDasharray="4 6"
            strokeLinecap="round"
          />
          <circle cx="95" cy="120" r="3.5" fill="#2563eb" />
          <circle cx="190" cy="150" r="3.5" fill="#f43f5e" />
        </svg>

        <div className="absolute right-[24rem] top-[10rem] h-6 w-6 border border-[#f59e0b]/60 opacity-60" />

        <div className="absolute right-[9rem] bottom-[8rem] w-44 -rotate-6 bg-[#fef3c7] px-4 py-3 opacity-90 shadow-[0_10px_28px_-14px_rgba(120,90,20,0.5)]">
          <p className="text-[15px] font-normal leading-snug text-amber-900/80 [font-family:'Comic_Sans_MS','Segoe_Print','Bradley_Hand',cursive]">
            welcome to the board →
          </p>
          <span className="mt-2 block text-[11px] text-amber-900/55 [font-family:'Comic_Sans_MS','Segoe_Print','Bradley_Hand',cursive]">
            - the team
          </span>
        </div>
      </div>

      {/* Foreground — left-aligned column hung off a vertical rule, matching the landing */}
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 sm:px-10">
        <div className="w-full max-w-md border-l border-neutral-200 pl-6 sm:pl-10">
          {/* Brand lockmark + wordmark — links home */}
          <Link
            href="/"
            className="inline-flex items-center gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
          >
            <span
              aria-hidden="true"
              className="grid h-8 w-8 place-items-center bg-neutral-900"
            >
              <span className="h-3 w-3 bg-[#2563eb]" />
            </span>
            <span className="text-lg font-medium tracking-tight text-neutral-900">
              coboard
            </span>
          </Link>

          {/* Eyebrow + headline + subhead */}
          <p className="mt-12 font-mono text-xs font-normal tracking-tight text-neutral-500">
            {eyebrow}
          </p>
          <h1 className="mt-4 text-3xl font-medium leading-[1.1] tracking-tight text-neutral-900 sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 max-w-sm text-base font-normal leading-relaxed text-neutral-600">
            {subtitle}
          </p>

          {/* Form */}
          <div className="mt-8">{children}</div>

          {/* Switch-page line */}
          <div className="mt-8 text-sm font-normal text-neutral-500">{footer}</div>
        </div>
      </div>
    </main>
  );
}

/** A labelled text/email field styled to match the landing's inputs. */
export function AuthField({
  id,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
  hint,
  required = true,
}: {
  id: string;
  label: string;
  type?: "text" | "email";
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-normal text-neutral-600">
        {label}
      </label>
      <div className="flex items-stretch border border-neutral-300 bg-white transition-colors focus-within:border-neutral-900 focus-within:ring-2 focus-within:ring-neutral-900/15">
        <input
          id={id}
          name={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          spellCheck={false}
          className="w-full bg-transparent px-3.5 py-3 text-sm font-normal text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
        />
      </div>
      {hint ? <p className="text-xs font-normal text-neutral-400">{hint}</p> : null}
    </div>
  );
}

/** A password field with a Show/Hide toggle nested in the input border. */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-normal text-neutral-600">
        {label}
      </label>
      <div className="flex items-stretch border border-neutral-300 bg-white transition-colors focus-within:border-neutral-900 focus-within:ring-2 focus-within:ring-neutral-900/15">
        <input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          spellCheck={false}
          className="w-full bg-transparent px-3.5 py-3 text-sm font-normal text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="shrink-0 border-l border-neutral-300 px-3.5 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neutral-900 motion-reduce:transition-none"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {hint ? <p className="text-xs font-normal text-neutral-400">{hint}</p> : null}
    </div>
  );
}
