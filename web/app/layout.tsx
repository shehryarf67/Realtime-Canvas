import type { Metadata } from "next";
import { SocketProvider } from "@/contexts/SocketContext";
import { AuthProvider } from "@/contexts/AuthContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coboard",
  description: "Realtime collaborative canvas — sketch, annotate, and think together live.",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AuthProvider> <SocketProvider>{children}</SocketProvider> </AuthProvider>
      </body>
    </html>
  );
}
