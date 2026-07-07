"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { generateRoomCode } from "@/lib/roomCode";
import { addBoard, type Board } from "@/lib/boards";
import { useAuth } from "@/contexts/AuthContext";

export default function Home() {
  const router = useRouter();
  const auth = useAuth();
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joinHint, setJoinHint] = useState(false);

  async function handleLogout() {
    await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    auth?.setUser(null);
    router.push("/");
  }

  const trimmed = code.trim();
  const canJoin = trimmed.length > 0;

  async function handleCreate() {
    if (creating) return;
    setCreating(true);
    try {
      const roomCode = generateRoomCode();
      const now = Date.now();
      const board: Board = {
        id: roomCode,
        name: "Untitled board",
        createdAt: now,
        lastEditedAt: now,
      };
      await addBoard(board);
      router.push(`/room/${roomCode}`);
    } catch {
      // Recover so the primary action can never get stuck disabled.
      setCreating(false);
    }
  }

  function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canJoin) {
      setJoinHint(true);
      return;
    }
    router.push(`/room/${encodeURIComponent(trimmed)}`);
  }

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#f4f6fb] text-neutral-900">
      {/* Dot-grid background — slate dots on a soft cool off-white read clearly without harsh contrast */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,_#94a3b8_1.3px,_transparent_1.4px)] bg-[length:24px_24px] opacity-50"
      />

      {/* Soft cool light wash so the page reads as lit, not flat */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle,_#dbeafe_0%,_transparent_70%)] opacity-70 blur-2xl"
      />

      {/* Ghosted, purely-atmospheric canvas elements — a small connected mini-canvas
          parked in the right margin. Non-interactive and hidden until there is room.
          Everything here is gently animated to suggest a live, collaborative board. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden select-none xl:block"
      >
        {/* Keyframes scoped to this atmospheric layer. All motion is paused under
            prefers-reduced-motion so the page stays calm for those who ask for it. */}
        <style>{`
          @keyframes co-maya-move {
            0%   { transform: translate(0, 0); }
            20%  { transform: translate(-46px, 34px); }
            45%  { transform: translate(34px, 96px); }
            70%  { transform: translate(78px, 40px); }
            100% { transform: translate(0, 0); }
          }
          @keyframes co-devin-move {
            0%   { transform: translate(0, 0); }
            25%  { transform: translate(58px, -38px); }
            55%  { transform: translate(-30px, -74px); }
            80%  { transform: translate(-66px, 18px); }
            100% { transform: translate(0, 0); }
          }
          @keyframes co-glow {
            0%, 100% { filter: drop-shadow(0 0 0 transparent); }
            50%      { filter: drop-shadow(0 0 7px var(--co-glow)); }
          }
          /* A click ripple that fires once per loop, timed to a path waypoint. */
          @keyframes co-click {
            0%, 42%   { transform: scale(0); opacity: 0; }
            46%       { transform: scale(0.35); opacity: 0.55; }
            60%, 100% { transform: scale(1.7); opacity: 0; }
          }
          @keyframes co-drag {
            0%   { transform: translate(0, 0) rotate(0deg); }
            30%  { transform: translate(44px, 64px) rotate(10deg); }
            55%  { transform: translate(150px, 30px) rotate(-6deg); }
            80%  { transform: translate(60px, -14px) rotate(4deg); }
            100% { transform: translate(0, 0) rotate(0deg); }
          }
          /* Shape being added then removed, over and over. */
          @keyframes co-pop {
            0%, 6%    { opacity: 0; transform: scale(0.6); }
            14%, 82%  { opacity: 1; transform: scale(1); }
            92%, 100% { opacity: 0; transform: scale(0.6); }
          }
          @keyframes co-ants { to { stroke-dashoffset: -20; } }

          .co-maya  { animation: co-maya-move 15s ease-in-out infinite; }
          .co-devin { animation: co-devin-move 18s ease-in-out infinite; }
          .co-cursor svg { animation: co-glow 15s ease-in-out infinite; }
          .co-ripple {
            position: absolute; top: -3px; left: -3px;
            height: 22px; width: 22px; border-radius: 9999px;
            border: 2px solid var(--co-glow);
            transform: scale(0); opacity: 0;
          }
          .co-maya  .co-ripple { animation: co-click 15s ease-in-out infinite; }
          .co-devin .co-ripple { animation: co-click 18s ease-in-out infinite; }
          .co-square { animation: co-drag 13s ease-in-out infinite; }
          .co-pop    { transform-box: fill-box; transform-origin: center; animation: co-pop 11s ease-in-out infinite; }
          .co-ants   { animation: co-ants 1.1s linear infinite; }

          @media (prefers-reduced-motion: reduce) {
            .co-maya, .co-devin, .co-cursor svg, .co-ripple,
            .co-square, .co-pop, .co-ants { animation: none; }
          }
        `}</style>

        {/* Outlined rectangle + ring joined by a dashed connector whose dots land on each shape */}
        <svg
          className="absolute right-[7rem] top-[7rem] h-72 w-80 opacity-60"
          viewBox="0 0 320 288"
          fill="none"
        >
          <rect x="20" y="24" width="150" height="96" stroke="#2563eb" strokeWidth="1.5" />
          <circle className="co-pop" cx="232" cy="196" r="62" stroke="#f43f5e" strokeWidth="1.5" />
          <path
            className="co-ants"
            d="M95 120 C 130 140, 160 146, 190 150"
            stroke="#94a3b8"
            strokeWidth="1.5"
            strokeDasharray="4 6"
            strokeLinecap="round"
          />
          <circle cx="95" cy="120" r="3.5" fill="#2563eb" />
          <circle cx="190" cy="150" r="3.5" fill="#f43f5e" />
        </svg>

        {/* Small amber square accent — being dragged around the board */}
        <div className="co-square absolute right-[24rem] top-[9rem] h-6 w-6 border border-[#f59e0b]/60 opacity-70" />

        {/* Slightly tilted sticky note with short handwritten-feeling text */}
        <div className="absolute right-[9rem] bottom-[8rem] w-44 -rotate-6 bg-[#fef3c7] px-4 py-3 opacity-90 shadow-[0_10px_28px_-14px_rgba(120,90,20,0.5)]">
          <p className="text-[15px] font-normal leading-snug text-amber-900/80 [font-family:'Comic_Sans_MS','Segoe_Print','Bradley_Hand',cursive]">
            let&apos;s map this out together →
          </p>
          <span className="mt-2 block text-[11px] text-amber-900/55 [font-family:'Comic_Sans_MS','Segoe_Print','Bradley_Hand',cursive]">
            - the team
          </span>
        </div>

        {/* Live presence cursors — wandering, clicking and glowing as if driven by a teammate */}
        <div
          className="co-cursor co-maya absolute right-[26rem] top-[19rem]"
          style={{ ["--co-glow" as string]: "rgba(20,184,166,0.7)" }}
        >
          <span className="co-ripple" />
          <svg className="h-4 w-4 text-[#14b8a6]" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 1 L1 12 L4.2 9 L6.4 14 L8.4 13.1 L6.2 8.2 L11 8 Z" />
          </svg>
          <span className="ml-3 inline-block bg-[#14b8a6] px-2 py-0.5 text-[11px] font-medium text-white">
            Maya
          </span>
        </div>
        <div
          className="co-cursor co-devin absolute right-[13rem] top-[24rem]"
          style={{ ["--co-glow" as string]: "rgba(139,92,246,0.7)" }}
        >
          <span className="co-ripple" />
          <svg className="h-4 w-4 text-[#8b5cf6]" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 1 L1 12 L4.2 9 L6.4 14 L8.4 13.1 L6.2 8.2 L11 8 Z" />
          </svg>
          <span className="ml-3 inline-block bg-[#8b5cf6] px-2 py-0.5 text-[11px] font-medium text-white">
            Devin
          </span>
        </div>
      </div>

      {/* Foreground — left-aligned column hung off a vertical rule (not a centered card) */}
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 sm:px-10">
        <div className="w-full max-w-2xl border-l border-neutral-200 pl-6 sm:pl-10">
          {/* Brand lockmark + wordmark + user actions */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8 shrink-0">
                <rect width="32" height="32" rx="5" fill="#111111"/>
                <path d="M4 4 L4 15 L7 12.5 L8.5 17 L10.5 16.2 L9 11.5 L13 11.5 Z" fill="#3b82f6"/>
                <path d="M17 13 L17 24 L20 21.5 L21.5 26 L23.5 25.2 L22 20.5 L26 20.5 Z" fill="#2dd4bf"/>
              </svg>
              <span className="text-lg font-medium tracking-tight text-neutral-900">
                coboard
              </span>
            </div>
            {auth?.user && (
              <div className="flex items-center gap-4">
                <span className="text-sm text-neutral-500">{auth.user.email}</span>
                <button
                  onClick={handleLogout}
                  className="text-sm font-medium text-neutral-600 underline underline-offset-4 transition-colors hover:text-neutral-900 cursor-pointer motion-reduce:transition-none"
                >
                  Log out
                </button>
              </div>
            )}
          </div>

          {/* Eyebrow + headline + subhead */}
          <p className="mt-12 font-mono text-xs font-normal tracking-tight text-neutral-500">
            Realtime collaborative canvas
          </p>
          <h1 className="mt-4 max-w-xl text-4xl font-medium leading-[1.05] tracking-tight text-neutral-900 sm:text-5xl lg:text-6xl">
            Think together on one live canvas.
          </h1>
          <p className="mt-5 max-w-md text-base font-normal leading-relaxed text-neutral-600">
            Sketch, drop sticky notes, and watch every cursor move in real time -
            no setup, no waiting.
          </p>

          {/* Actions — swap based on auth state */}
          {auth?.user ? (
            <div className="mt-10 flex flex-col gap-6 sm:flex-row sm:items-stretch sm:gap-8">
              {/* Loud primary action */}
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="group inline-flex items-center justify-center gap-2 bg-neutral-900 px-6 py-3.5 text-base font-medium text-white transition-colors hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 16 16"
                  className="h-4 w-4 transition-transform group-hover:rotate-90 motion-reduce:transition-none motion-reduce:group-hover:rotate-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                >
                  <path d="M8 3 L8 13 M3 8 L13 8" />
                </svg>
                {creating ? "Creating board…" : "New board"}
              </button>

              {/* Quieter — join an existing board */}
              <form
                onSubmit={handleJoin}
                noValidate
                className="flex flex-1 flex-col gap-2 sm:max-w-xs sm:border-l sm:border-neutral-200 sm:pl-8"
              >
                <label
                  htmlFor="board-code"
                  className="text-sm font-normal text-neutral-500"
                >
                  Have a code? Join a board
                </label>
                <div className="flex items-stretch border border-neutral-300 focus-within:border-neutral-900 focus-within:ring-2 focus-within:ring-neutral-900/15">
                  <input
                    id="board-code"
                    name="board-code"
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={code}
                    onChange={(event) => {
                      setCode(event.target.value);
                      if (joinHint) setJoinHint(false);
                    }}
                    placeholder="paste a board code"
                    aria-describedby={joinHint && !canJoin ? "join-hint" : undefined}
                    className="w-full bg-transparent px-3 py-2.5 text-sm font-normal text-neutral-900 placeholder:text-neutral-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!canJoin}
                    className="shrink-0 border-l border-neutral-300 px-4 text-sm font-medium text-neutral-700 transition-colors hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:text-neutral-300 motion-reduce:transition-none"
                  >
                    Join
                  </button>
                </div>
                <p
                  id="join-hint"
                  aria-live="polite"
                  className="min-h-[1rem] text-xs font-normal text-neutral-500"
                >
                  {joinHint && !canJoin ? "Enter a board code to join." : ""}
                </p>
              </form>
            </div>
          ) : (
            <div className="mt-10 flex items-center gap-4">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center bg-neutral-900 px-6 py-3.5 text-base font-medium text-white transition-colors hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 motion-reduce:transition-none"
              >
                Create an account
              </Link>
              <Link
                href="/login"
                className="text-base font-medium text-neutral-600 underline underline-offset-4 transition-colors hover:text-neutral-900 motion-reduce:transition-none"
              >
                Sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
