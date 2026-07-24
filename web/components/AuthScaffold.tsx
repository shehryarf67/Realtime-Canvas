"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

// Shared visual shell for auth pages. The actual auth logic stays in each form.
type AuthScaffoldProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
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
      {/* Same background as the landing page. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,_#94a3b8_1.3px,_transparent_1.4px)] bg-[length:24px_24px] opacity-50"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle,_#dbeafe_0%,_transparent_70%)] opacity-70 blur-2xl"
      />

      {/* Decorative canvas pieces stay hidden on smaller screens. */}
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

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 sm:px-10">
        <div className="w-full max-w-md border-l border-neutral-200 pl-6 sm:pl-10">
          <Link
            href="/"
            className="inline-flex items-center gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
          >
            <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8 shrink-0">
              <rect width="32" height="32" rx="5" fill="#111111" />
              <path d="M4 4 L4 15 L7 12.5 L8.5 17 L10.5 16.2 L9 11.5 L13 11.5 Z" fill="#3b82f6" />
              <path d="M17 13 L17 24 L20 21.5 L21.5 26 L23.5 25.2 L22 20.5 L26 20.5 Z" fill="#2dd4bf" />
            </svg>
            <span className="text-lg font-medium tracking-tight text-neutral-900">
              coboard
            </span>
          </Link>

          <p className="mt-12 font-mono text-sm font-normal tracking-wide text-neutral-600">
            {eyebrow}
          </p>
          <h1 className="mt-4 text-3xl font-medium leading-[1.1] tracking-tight text-neutral-900 sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 max-w-sm text-base font-normal leading-relaxed text-neutral-600">
            {subtitle}
          </p>

          <div className="mt-8">{children}</div>

          <div className="mt-8 text-sm font-normal text-neutral-500">{footer}</div>
        </div>
      </div>
    </main>
  );
}

// Reused fields keep login, signup and reset forms consistent.
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
