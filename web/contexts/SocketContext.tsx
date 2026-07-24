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
    // directly, same-site cookie works) or a relative base like "/api" in
    // production (REST is same-origin-proxied so the cookie is first-party).
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL ?? "";
    const usingProxy = !/^https?:\/\//i.test(serverUrl);

    let sock: Socket;
    if (usingProxy) {
      // Production: connect the socket straight to the API over WebSocket
      // (Vercel can't proxy WS upgrades). The cross-origin auth cookie isn't
      // available there, so authenticate with a short-lived token fetched via
      // the first-party /api proxy. `auth` is a function, so a fresh token is
      // pulled on every (re)connect.
      const apiBase = serverUrl.replace(/\/$/, "");
      const socketTarget = process.env.NEXT_PUBLIC_SOCKET_URL || "";
      sock = io(socketTarget, {
        transports: ["websocket"],
        auth: (cb) => {
          fetch(`${apiBase}/auth/socket-token`, { credentials: "include" })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => cb({ token: data?.token }))
            .catch(() => cb({}));
        },
      });
    } else {
      // Local dev: same-site cookie is sent on the handshake.
      sock = io(serverUrl, { withCredentials: true });
    }

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
