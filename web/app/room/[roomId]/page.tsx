"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Toolbar from "@/components/Toolbar";
import CanvasEditor, { getCursorColour, type PresentUser } from "@/components/CanvasEditor";
import { renameBoard, joinBoard } from "@/lib/boards";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useSocket } from "@/contexts/SocketContext";
import type { Tool } from "@/types/shape";

type HistoryControls = {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

export default function Room() {
  const isAuthed = useRequireAuth();
  const { isConnected } = useSocket();
  const { roomId } = useParams<{ roomId: string }>();
  const [copied, setCopied] = useState(false);
  const [roomStatus, setRoomStatus] = useState<"loading" | "ready" | "not-found" | "error">("loading");

  const [selectedTool, setSelectedTool] = useState<Tool | null>("select");
  const [selectedColour, setSelectedColour] = useState<string>("#ffffff");
  const [history, setHistory] = useState<HistoryControls | null>(null);
  const [presentUsers, setPresentUsers] = useState<PresentUser[]>([]);
  const [boardName, setBoardName] = useState("Untitled Board");
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRoomStatus("loading");
    joinBoard(roomId)
      .then((board) => {
        if (cancelled) return;
        if (!board) {
          setRoomStatus("not-found");
          return;
        }
        setBoardName(board.name);
        setRoomStatus("ready");
      })
      .catch((err) => {
        console.error("Failed to join board:", err);
        if (!cancelled) setRoomStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  function handleNameBlur() {
    const trimmed = boardName.trim();
    const finalName = trimmed.length > 0 ? trimmed : "Untitled Board";
    if (finalName !== boardName) setBoardName(finalName);
    renameBoard(roomId, finalName);
  }

  function handleRootPointerDownCapture(e: React.PointerEvent<HTMLElement>) {
    const target = e.target as Node;
    const clickedToolbar = toolbarRef.current?.contains(target);
    const clickedCanvas = canvasRef.current?.contains(target);

    if (!clickedToolbar && !clickedCanvas) {
      setSelectedTool(null);
    }
  }

  function handleCopyCode() {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!isAuthed || roomStatus === "loading") return null;

  if (roomStatus !== "ready") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6 text-black">
        <div className="text-center">
          <h1 className="text-2xl font-medium">
            {roomStatus === "not-found" ? "Board not found" : "Couldn't open this board"}
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            {roomStatus === "not-found"
              ? "Check the board code and try again."
              : "Please try again in a moment."}
          </p>
          <Link href="/" className="mt-5 inline-block text-sm font-medium underline underline-offset-4">
            Back to boards
          </Link>
        </div>
      </main>
    );
  }

  return <main
    className="flex flex-col p-4 sm:p-8 bg-white text-black"
    onPointerDownCapture={handleRootPointerDownCapture}
  >
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <Link
        href="/"
        className="flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors cursor-pointer motion-reduce:transition-none"
      >
        ← Back
      </Link>

      <div className="flex items-center gap-4">
        {presentUsers.length > 0 && (
          <div className="flex items-center -space-x-2">
            {presentUsers.map((user) => (
              <div
                key={user.userId}
                title={user.name}
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-xs font-medium text-white"
                style={{ backgroundColor: getCursorColour(user.userId) }}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
        )}

        {!isConnected && (
          <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Reconnecting…
          </div>
        )}

        <button
          onClick={handleCopyCode}
          className="flex items-center gap-2 text-sm font-mono text-neutral-600 hover:text-neutral-900 transition-colors cursor-pointer motion-reduce:transition-none"
        >
          <span>{roomId}</span>
          <span className="text-xs text-neutral-400">{copied ? "Copied!" : "Copy"}</span>
        </button>
      </div>
    </div>

    <input
      value={boardName}
      onChange={(e) => setBoardName(e.target.value)}
      onBlur={handleNameBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      placeholder="Untitled Board"
      className="mb-3 w-fit max-w-md border border-transparent bg-transparent px-1 py-0.5 text-xl font-medium text-neutral-900 outline-none transition-colors hover:border-neutral-200 focus:border-neutral-300 focus:bg-neutral-50"
    />

    <div ref={toolbarRef} className="w-fit self-start">
      <Toolbar selectedTool={selectedTool} onSelectTool={setSelectedTool}
        selectedColour={selectedColour} onSelectedColourChange={setSelectedColour}
        onUndo={history?.undo} onRedo={history?.redo}
        canUndo={history?.canUndo ?? false} canRedo={history?.canRedo ?? false} />
    </div>
    <div ref={canvasRef}>
      {/* key={roomId} remounts the editor on room change, so state never leaks between rooms */}
      <CanvasEditor key={roomId} roomId={roomId} selectedTool={selectedTool} selectedColour={selectedColour} onHistoryChange={setHistory} onPresenceChange={setPresentUsers} />
    </div>
  </main>;
}
