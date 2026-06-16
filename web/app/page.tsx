"use client";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import Toolbar from "../components/Toolbar";
import CanvasEditor from "../components/CanvasEditor";
import type { Tool } from "@/types/shape";

export default function Home() {
  const [selectedTool, setSelectedTool] = useState<Tool | null>("select");
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const socket = io("http://localhost:4000");
    socket.on("connect", () => console.log("connected:", socket.id));
    return () => { socket.disconnect(); };
  }, []);

  useEffect(() => {
    function handleDocumentPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      const clickedToolbar = toolbarRef.current?.contains(target);
      const clickedCanvas = canvasRef.current?.contains(target);

      if (!clickedToolbar && !clickedCanvas) {
        setSelectedTool(null);
      }
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown);

    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
    };
  }, []);

  return <main className="flex flex-col p-8 bg-white text-black">
    My Canvas App
    <div ref={toolbarRef} className="w-fit self-start">
      <Toolbar selectedTool={selectedTool} onSelectTool={setSelectedTool} />
    </div>
    <div ref={canvasRef}>
      <CanvasEditor selectedTool={selectedTool} />
    </div>
  </main>;
}
