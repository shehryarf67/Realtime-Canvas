import "dotenv/config";
import { createServer } from "http";
import { Server } from "socket.io";
import { connectToDatabase, items, type Id, type Kind } from "./db.js";

const PORT = Number(process.env.PORT) || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:3000";

const httpServer = createServer();

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST"],
  },
});

type CanvasMessage =
  | { kind: Kind; action: "add" | "update"; payload: { id: Id } & Record<string, unknown> }
  | { kind: Kind; action: "delete"; id: Id };

io.on("connection", (socket) => {
  console.log(`client connected: ${socket.id}`);

  socket.on("join-room", async (roomId: string) => {
    socket.join(roomId);

    try {
      const docs = await items().find({ roomId }).toArray();
      const state: { shapes: unknown[]; notes: unknown[]; texts: unknown[] } = {
        shapes: [],
        notes: [],
        texts: [],
      };
      for (const doc of docs) {
        if (doc.kind === "shape") state.shapes.push(doc.data);
        else if (doc.kind === "note") state.notes.push(doc.data);
        else state.texts.push(doc.data);
      }
      socket.emit("canvas-state", state);
      console.log(`${socket.id} joined room ${roomId} (${docs.length} items)`);
    } catch (err) {
      console.error("Failed to load canvas state:", err);
    }
  });


  socket.on(
    "shape-message",
    async ({ roomId, message }: { roomId: string; message: CanvasMessage }) => {
      try {
        const col = items();
        if (message.action === "delete") {
          await col.deleteOne({ _id: message.id });
        } else {
          await col.updateOne(
            { _id: message.payload.id },
            { $set: { roomId, kind: message.kind, data: message.payload } },
            { upsert: true }
          );
        }
      } catch (err) {
        console.error("Failed to persist canvas change:", err);
      }

      // Relay to everyone else in the room (unchanged from before).
      socket.to(roomId).emit("shape-message", message);
    }
  );


  socket.on("disconnect", () => {
    console.log(`client disconnected: ${socket.id}`);
  });
});

// Connect to MongoDB before accepting connections. The `items()` helper in
// db.ts is ready for when you add snapshot persistence.
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
