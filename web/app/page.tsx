"use client";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import Toolbar from "../components/Toolbar";
import CanvasEditor from "../components/CanvasEditor";
import type { Tool } from "@/types/shape";

export default function Home() {
  const [selectedTool, setSelectedTool] = useState<Tool | null>("select");
  const [selectedColour, setSelectedColour] = useState<string>("#ffffff");
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const socket = io("http://localhost:4000");
    socket.on("connect", () => console.log("connected:", socket.id));
    return () => { socket.disconnect(); };
  }, []);

  function handleRootPointerDownCapture(e: React.PointerEvent<HTMLElement>) {
    const target = e.target as Node;
    const clickedToolbar = toolbarRef.current?.contains(target);
    const clickedCanvas = canvasRef.current?.contains(target);

    if (!clickedToolbar && !clickedCanvas) {
      setSelectedTool(null);
    }
  }

  return <main
    className="flex flex-col p-8 bg-white text-black"
    onPointerDownCapture={handleRootPointerDownCapture}
  >
    My Canvas App
    <div ref={toolbarRef} className="w-fit self-start">
      <Toolbar selectedTool={selectedTool} onSelectTool={setSelectedTool} 
      selectedColour={selectedColour} onSelectedColourChange={setSelectedColour} />
    </div>
    <div ref={canvasRef}>
      <CanvasEditor selectedTool={selectedTool} selectedColour={selectedColour} />
    </div>
  </main>;
}
