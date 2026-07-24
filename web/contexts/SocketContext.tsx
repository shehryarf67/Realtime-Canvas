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

    // NEXT_PUBLIC_SERVER_URL is an absolute URL in local dev (talk to the API
    // directly) or a relative base like "/api" in production (same-origin proxy
    // so the auth cookie is first-party). The server reads identity from that
    // cookie on the handshake, so credentials must be sent either way.
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL ?? "";
    const usingProxy = !/^https?:\/\//i.test(serverUrl);
    const sock = usingProxy
      ? io({
          withCredentials: true,
          // Route the Socket.IO endpoint through the same /api proxy.
          path: `${serverUrl.replace(/\/$/, "")}/socket.io`,
          // Vercel proxies HTTP but not WebSocket upgrades to an external
          // origin, so pin to long-polling (still near-realtime) to avoid
          // repeated failed-upgrade churn.
          transports: ["polling"],
        })
      : io(serverUrl, { withCredentials: true });

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
