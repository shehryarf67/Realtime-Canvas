"use client";
import { useEffect } from "react";
import { io } from "socket.io-client";

export default function Home() {
  useEffect(() => {
    const socket = io("http://localhost:4000");
    socket.on("connect", () => console.log("connected:", socket.id));
    return () => { socket.disconnect(); };
  }, []);
  return <main className="p-8">check the console</main>;
}