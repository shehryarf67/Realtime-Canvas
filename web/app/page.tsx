"use client";
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import Toolbar from "../components/Toolbar";
import CanvasEditor from "../components/CanvasEditor";

type Tool = "select" | "square" | "circle" | "triangle" | "line" | "text" | "note" | "eraser";

export default function Home() {
  const [selectedTool, setSelectedTool] = useState<Tool>("select");

  useEffect(() => {
    const socket = io("http://localhost:4000");
    socket.on("connect", () => console.log("connected:", socket.id));
    return () => { socket.disconnect(); };
  }, []);

  return <main className="flex flex-col p-8 bg-white text-black">
    My Canvas App
    <Toolbar selectedTool={selectedTool} onSelectTool={setSelectedTool} />
    <CanvasEditor selectedTool={selectedTool} />
  </main>;
}