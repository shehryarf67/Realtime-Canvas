"use client";

import { createContext, useContext, ReactNode, useState, useEffect } from "react";
import { Socket, io } from "socket.io-client";
import { useAuth } from "@/contexts/AuthContext";

type SocketContextValue = {
  socket: Socket | null;
  isConnected: boolean;
};

const SocketContext = createContext<SocketContextValue>({ socket: null, isConnected: false });

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const auth = useAuth();
  const user = auth?.user;

  useEffect(() => {
    if (!user) return;

    const sock = io(process.env.NEXT_PUBLIC_SERVER_URL!, {
      auth: {
        userId: user.userId,
        name: user.name
       },
    });

    sock.on("connect", () => setIsConnected(true));
    sock.on("disconnect", () => setIsConnected(false));

    setSocket(sock);

    return () => {
      sock.disconnect();
    }
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
