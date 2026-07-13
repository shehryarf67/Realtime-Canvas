import "dotenv/config";
import { createServer } from "http";
import { Server } from "socket.io";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import authRouter from "./routes/auth.js";
import boardsRouter from "./routes/boards.js";
import { boards, connectToDatabase, items, type Id, type Kind } from "./db.js";

const PORT = Number(process.env.PORT) || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:3000";
const JWT_SECRET = process.env.JWT_SECRET!;

// Socket.IO's handshake never passes through Express's cookie-parser
// middleware, so the "token" cookie has to be pulled out of the raw
// Cookie header by hand.
function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", CLIENT_ORIGIN);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  next();
});
app.use("/auth", authRouter);
app.use("/boards", boardsRouter);

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

type CanvasMessage =
  | { kind: Kind; action: "add" | "update"; payload: { id: Id } & Record<string, unknown> }
  | { kind: Kind; action: "delete"; id: Id };

io.use((socket, next) => {
  const token = readCookie(socket.handshake.headers.cookie, "token");
  if (!token) {
    next(new Error("Authentication required"));
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; name: string };
    socket.data.userId = decoded.userId;
    socket.data.name = decoded.name;
    next();
  } catch {
    next(new Error("Invalid or expired token"));
  }
})

// roomId -> userId -> how many open sockets that user currently has in the
// room. A user open in two tabs should only ever produce one user-joined and
// one user-left broadcast, not one per socket.
const roomPresence = new Map<string, Map<string, { name: string; count: number }>>();

io.on("connection", (socket) => {
  console.log(`client connected: ${socket.id}`);

  socket.on("join-room", async (roomID: string) => {
    socket.join(roomID);

    const userId = socket.data.userId as string;
    const name = socket.data.name as string;

    let presence = roomPresence.get(roomID);
    if (!presence) {
      presence = new Map();
      roomPresence.set(roomID, presence);
    }

    const existing = presence.get(userId);
    if (existing) {
      existing.count += 1;
    } else {
      presence.set(userId, { name, count: 1 });
      socket.to(roomID).emit("user-joined", { userId, name });
    }

    const presentUsers = Array.from(presence.entries())
      .filter(([id]) => id !== userId)
      .map(([id, info]) => ({ userId: id, name: info.name }));
    socket.emit("presence-state", presentUsers);

    try {
      const docs = await items().find({ roomId: roomID }).toArray();
      const state: { shapes: unknown[]; notes: unknown[], texts: unknown[] } = {
        shapes: [],
        notes: [],
        texts: []
      }
      for (const doc of docs) {
        if (doc.kind === "shape") state.shapes.push(doc.data);
        else if (doc.kind === "note") state.notes.push(doc.data);
        else if (doc.kind === "text") state.texts.push(doc.data);
      }
      socket.emit("canvas-state", state);
    } catch (err) {
      console.error("Failed to load canvas state:", err);
    }
  });

  socket.on("shape-message", async ({ roomId, message }: { roomId: string; message: CanvasMessage }) => {
    try {
      const col = items();
      if (message.action === "delete"){
        await col.deleteOne({_id: message.id});
      }
      else {
        await col.updateOne(
          { _id: message.payload.id},
          { $set: {roomId, kind: message.kind, data: message.payload}},
          {upsert: true}
        )
      }

      await boards().updateOne(
        { roomId },
        { $set: { lastEditedAt: Date.now() } }
      );
    } catch (err) {
      console.error("Failed to handle shape message:", err);
    }

    socket.to(roomId).emit("shape-message", message);
  })

  socket.on("cursor-move", ({ roomId, x, y, name }: { roomId: string; x: number; y: number; name: string }) => {
    socket.to(roomId).emit("cursor-move", { userId: socket.data.userId, x, y, name });
    // No need of a DB as this is ephemeral
    // The data of cursor needs to be sent to only other users
  })

  socket.on("disconnect", () => {
    console.log(`client disconnected: ${socket.id}`);
    const userId = socket.data.userId as string;
    const rooms = Array.from(socket.rooms).filter((r) => r !== socket.id);

    for (const roomID of rooms) {
      const presence = roomPresence.get(roomID);
      const entry = presence?.get(userId);
      if (!presence || !entry) continue;

      entry.count -= 1;
      if (entry.count <= 0) {
        presence.delete(userId);
        socket.to(roomID).emit("user-left", { userId });
      }
    }

    socket.to(rooms).emit("cursor-leave", { userId });
  });
});

connectToDatabase()
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`socket server listening on :${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
  });
