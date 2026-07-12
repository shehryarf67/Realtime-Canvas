import "dotenv/config";
import { createServer } from "http";
import { Server } from "socket.io";
import express from "express";
import cookieParser from "cookie-parser";
import authRouter from "./routes/auth.js";
import boardsRouter from "./routes/boards.js";
import { connectToDatabase, items, type Id, type Kind } from "./db.js";

const PORT = Number(process.env.PORT) || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:3000";

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
  const userId = socket.handshake.auth.userId;

  if (!userId) {
    next(new Error("userId is required in auth"));
    return;
  }
  socket.data.userId = userId;
  next();
})

io.on("connection", (socket) => {
  console.log(`client connected: ${socket.id}`);

  socket.on("join-room", async (roomID: string) => {
    socket.join(roomID);

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
    socket.to(Array.from(socket.rooms).filter((r) => r !== socket.id)).emit("cursor-leave", { userId: socket.data.userId });
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
