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

  // TODO: handle join-room
  socket.on("join-room", async (roomID: string) => {
    socket.join(roomID);

    try {
      const docs = await items().find({ roomID }).toArray();
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

  // TODO: handle shape-message
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

  socket.on("disconnect", () => {
    console.log(`client disconnected: ${socket.id}`);
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
