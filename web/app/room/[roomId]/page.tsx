"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Toolbar from "@/components/Toolbar";
import CanvasEditor from "@/components/CanvasEditor";
import { getBoard, renameBoard, joinBoard } from "@/lib/boards";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import type { Tool } from "@/types/shape";

type HistoryControls = {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

export default function Room() {
  const isAuthed = useRequireAuth();
  const { roomId } = useParams<{ roomId: string }>();
  const [copied, setCopied] = useState(false);

  const [selectedTool, setSelectedTool] = useState<Tool | null>("select");
  const [selectedColour, setSelectedColour] = useState<string>("#ffffff");
  const [history, setHistory] = useState<HistoryControls | null>(null);
  const [boardName, setBoardName] = useState("Untitled Board");
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBoard(roomId).then((board) => {
      if (cancelled || !board) return;
      setBoardName(board.name);
    });
    joinBoard(roomId).catch((err) => {
      console.error("Failed to join board:", err);
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

  if (!isAuthed) return null;

  return <main
    className="flex flex-col p-8 bg-white text-black"
    onPointerDownCapture={handleRootPointerDownCapture}
  >
    <div className="flex items-center justify-between mb-4">
      <Link
        href="/"
        className="flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors cursor-pointer motion-reduce:transition-none"
      >
        ← Back
      </Link>

      <button
        onClick={handleCopyCode}
        className="flex items-center gap-2 text-sm font-mono text-neutral-600 hover:text-neutral-900 transition-colors cursor-pointer motion-reduce:transition-none"
      >
        <span>{roomId}</span>
        <span className="text-xs text-neutral-400">{copied ? "Copied!" : "Copy"}</span>
      </button>
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
      <CanvasEditor key={roomId} roomId={roomId} selectedTool={selectedTool} selectedColour={selectedColour} onHistoryChange={setHistory} />
    </div>
  </main>;
}
