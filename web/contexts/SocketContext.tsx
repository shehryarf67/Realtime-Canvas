"use client";

import { createContext, useContext, ReactNode, useState, useEffect } from "react";
import { Socket, io } from "socket.io-client";

const SocketContext = createContext<Socket | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  // TODO: open the socket connection and store it in state
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const sock = io(process.env.NEXT_PUBLIC_SERVER_URL!);
    setSocket(sock);

    return () => {
      sock.disconnect();
    }
  }, []);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
