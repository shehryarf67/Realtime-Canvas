"use client";
import { useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Toolbar from "@/components/Toolbar";
import CanvasEditor from "@/components/CanvasEditor";
import type { Tool } from "@/types/shape";

export default function Room() {
  const { roomId } = useParams<{ roomId: string }>();
  const [copied, setCopied] = useState(false);

  const [selectedTool, setSelectedTool] = useState<Tool | null>("select");
  const [selectedColour, setSelectedColour] = useState<string>("#ffffff");
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

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

    <div ref={toolbarRef} className="w-fit self-start">
      <Toolbar selectedTool={selectedTool} onSelectTool={setSelectedTool}
      selectedColour={selectedColour} onSelectedColourChange={setSelectedColour} />
    </div>
    <div ref={canvasRef}>
      {/* key={roomId} remounts the editor on room change, so state never leaks between rooms */}
      <CanvasEditor key={roomId} roomId={roomId} selectedTool={selectedTool} selectedColour={selectedColour} />
    </div>
  </main>;
}
