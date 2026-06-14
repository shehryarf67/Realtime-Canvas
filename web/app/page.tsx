"use client";
import { useEffect } from "react";
import { io } from "socket.io-client";
import Toolbar from "../components/Toolbar";
import CanvasEditor from "../components/CanvasEditor";

export default function Home() {
  useEffect(() => {
    const socket = io("http://localhost:4000");
    socket.on("connect", () => console.log("connected:", socket.id));
    return () => { socket.disconnect(); };
  }, []);
  return <main className="flex flex-col p-8 bg-white text-black">
    My Canvas App
    <Toolbar />
    <CanvasEditor />
  </main>;
}