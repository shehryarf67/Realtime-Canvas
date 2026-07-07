"use client";

import { createContext, useContext, ReactNode, useState, useEffect } from "react";
import { Socket, io } from "socket.io-client";
import { useAuth } from "@/contexts/AuthContext";

const SocketContext = createContext<Socket | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const auth = useAuth();
  const user = auth?.user;

  useEffect(() => {
    if (!user) return;

    const sock = io(process.env.NEXT_PUBLIC_SERVER_URL!, {
      auth: { userId: user.userId },
    });
    setSocket(sock);

    return () => {
      sock.disconnect();
    }
  }, [user]);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
