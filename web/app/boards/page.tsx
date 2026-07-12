"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { generateRoomCode } from "@/lib/roomCode";
import { addBoard, getRecentBoards, type Board } from "@/lib/boards";
import { relativeTime } from "@/lib/relativeTime";
import { useAuth } from "@/contexts/AuthContext";
import BoardThumbnail from "@/components/BoardThumbnail";

export default function Boards() {
  const router = useRouter();
  const auth = useAuth();
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getRecentBoards().then((b) => {
      if (cancelled) return;
      setBoards(b);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [auth?.user]);

  async function handleCreate() {
    if (creating) return;
    setCreating(true);
    try {
      const roomCode = generateRoomCode();
      const now = Date.now();
      await addBoard({
        id: roomCode,
        name: "Untitled Board",
        createdAt: now,
        lastEditedAt: now,
      });
      router.push(`/room/${roomCode}`);
    } catch {
      setCreating(false);
    }
  }

  return (
    <main className="relative min-h-screen w-full bg-[#f4f6fb] text-neutral-900">
      {/* Same dot-grid backdrop as the landing page, so the two feel continuous */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,_#94a3b8_1.3px,_transparent_1.4px)] bg-[length:24px_24px] opacity-50"
      />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 py-10 sm:px-10">
        {/* Top bar: back home + brand, create action on the right */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900 motion-reduce:transition-none"
            >
              ← Back
            </Link>
            <div className="flex items-center gap-3">
              <svg aria-hidden="true" viewBox="0 0 32 32" className="h-7 w-7 shrink-0">
                <rect width="32" height="32" rx="5" fill="#111111" />
                <path d="M4 4 L4 15 L7 12.5 L8.5 17 L10.5 16.2 L9 11.5 L13 11.5 Z" fill="#3b82f6" />
                <path d="M17 13 L17 24 L20 21.5 L21.5 26 L23.5 25.2 L22 20.5 L26 20.5 Z" fill="#2dd4bf" />
              </svg>
              <span className="text-lg font-medium tracking-tight">coboard</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="inline-flex items-center gap-2 bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
          >
            {creating ? "Creating…" : "+ New board"}
          </button>
        </div>

        {/* Heading */}
        <p className="mt-12 font-mono text-xs font-normal tracking-tight text-neutral-500">
          Your boards
        </p>
        <h1 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">
          Every board, in one place.
        </h1>
        {!loading && (
          <p className="mt-2 text-sm text-neutral-500">
            {boards.length} board{boards.length === 1 ? "" : "s"}
          </p>
        )}

        {/* Gallery */}
        {loading ? (
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="border border-neutral-200 bg-white">
                <div className="aspect-[16/10] animate-pulse bg-neutral-100" />
                <div className="px-4 py-3">
                  <div className="h-4 w-2/3 animate-pulse bg-neutral-100" />
                </div>
              </div>
            ))}
          </div>
        ) : boards.length === 0 ? (
          <div className="mt-10 border border-neutral-200 bg-white px-6 py-12">
            <p className="text-base font-medium">No boards yet.</p>
            <p className="mt-1 text-sm text-neutral-500">
              Create one and it will show up here with a live preview.
            </p>
          </div>
        ) : (
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {boards.map((board) => (
              <Link
                key={board.id}
                href={`/room/${board.id}`}
                className="group border border-neutral-200 bg-white transition-[border-color,box-shadow] hover:border-neutral-900 hover:shadow-[0_12px_32px_-16px_rgba(23,23,23,0.3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 motion-reduce:transition-none"
              >
                <div className="aspect-[16/10] overflow-hidden border-b border-neutral-200">
                  <BoardThumbnail roomId={board.id} />
                </div>
                <div className="flex items-baseline justify-between gap-3 px-4 py-3">
                  <span className="truncate text-sm font-medium">{board.name}</span>
                  <span className="shrink-0 font-mono text-xs text-neutral-500">
                    {relativeTime(board.lastEditedAt)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
