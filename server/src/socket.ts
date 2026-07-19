import type { Server as HTTPServer } from "http";
import { Server } from "socket.io";
import { boards, items, type Id, type Kind } from "./db.js";
import { CLIENT_ORIGIN, AUTH_COOKIE_NAME } from "./config.js";
import { verifyToken } from "./lib/auth.js";
import { logger } from "./lib/logger.js";

// Socket handshakes skip Express middleware, so I read the auth cookie here.
function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

type CanvasMessage =
  | { kind: Kind; action: "add" | "update"; payload: { id: Id } & Record<string, unknown> }
  | { kind: Kind; action: "delete"; id: Id };

const VALID_KINDS: readonly Kind[] = ["shape", "note", "text"];

// The socket has a total message limit, but text fields need their own cap too.
const MAX_TEXT_LENGTH = 20_000;

function isValidId(id: unknown): id is Id {
  return typeof id === "string" || typeof id === "number";
}

// Socket data is still untrusted after login, so I validate it before saving
// or broadcasting anything.
export function isValidCanvasMessage(message: unknown): message is CanvasMessage {
  if (typeof message !== "object" || message === null) return false;
  const m = message as Record<string, unknown>;
  if (!VALID_KINDS.includes(m.kind as Kind)) return false;

  if (m.action === "delete") {
    return isValidId(m.id);
  }
  if (m.action === "add" || m.action === "update") {
    if (typeof m.payload !== "object" || m.payload === null) return false;
    const p = m.payload as Record<string, unknown>;
    if (!isValidId(p.id)) return false;
    // Stop a single note or text box from storing too much text.
    if ((m.kind === "note" || m.kind === "text") && typeof p.text === "string" && p.text.length > MAX_TEXT_LENGTH) {
      return false;
    }
    return true;
  }
  return false;
}

// roomId -> userId -> open tab count. Presence should show a person once even
// when they have the same board open in several tabs.
const roomPresence = new Map<string, Map<string, { name: string; count: number }>>();

// Deleted rooms stay blocked briefly so a late socket write cannot recreate
// canvas data after the board is gone.
const deletedRoomIds = new Set<string>();

// Five minutes is much longer than any write that was already in flight.
const DELETED_ROOM_TTL_MS = 5 * 60 * 1000;

let ioInstance: Server | null = null;

export function initSocketServer(httpServer: HTTPServer): Server {
  const io = new Server(httpServer, {
    // A canvas item should never need more than 256 KB, including pen strokes.
    maxHttpBufferSize: 256 * 1024,
    cors: {
      origin: CLIENT_ORIGIN,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });
  ioInstance = io;

  io.use(async (socket, next) => {
    const token = readCookie(socket.handshake.headers.cookie, AUTH_COOKIE_NAME);
    if (!token) {
      next(new Error("Authentication required"));
      return;
    }

    // Sockets use the same signature and session-version checks as REST.
    const payload = await verifyToken(token);
    if (!payload) {
      next(new Error("Invalid or expired token"));
      return;
    }

    socket.data.userId = payload.userId;
    socket.data.name = payload.name;
    next();
  })

  io.on("connection", (socket) => {
    logger.info("client connected", { socketId: socket.id });

    socket.on("join-room", async (roomID: string) => {
      const userId = socket.data.userId as string;
      const name = socket.data.name as string;

      if (typeof roomID !== "string") {
        socket.emit("room-error", { message: "Invalid board" });
        return;
      }

      if (deletedRoomIds.has(roomID)) {
        socket.emit("board-deleted");
        return;
      }

      try {
        const board = await boards().findOne({ roomId: roomID, memberIds: userId });
        if (!board) {
          socket.emit("room-error", { message: "Board not found or access denied" });
          return;
        }
      } catch (err) {
        logger.error("Failed to authorize room join", { err });
        socket.emit("room-error", { message: "Unable to join board" });
        return;
      }

      await socket.join(roomID);
      const authorizedRooms = (socket.data.authorizedRooms as Set<string> | undefined) ?? new Set<string>();
      authorizedRooms.add(roomID);
      socket.data.authorizedRooms = authorizedRooms;

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
        logger.error("Failed to load canvas state", { err });
      }
    });

    socket.on("shape-message", async ({ roomId, message }: { roomId: string; message: CanvasMessage }) => {
      const authorizedRooms = socket.data.authorizedRooms as Set<string> | undefined;
      if (!authorizedRooms?.has(roomId)) return;
      if (deletedRoomIds.has(roomId)) return;
      if (!isValidCanvasMessage(message)) return; // Ignore malformed socket data.

      try {
        const col = items();
        if (message.action === "delete"){
          // Include roomId so an item id from another board cannot be deleted.
          await col.deleteOne({_id: message.id, roomId});
        }
        else {
          await col.updateOne(
            { _id: message.payload.id, roomId},
            { $set: {roomId, kind: message.kind, data: message.payload}},
            {upsert: true}
          )
        }

        await boards().updateOne(
          { roomId },
          { $set: { lastEditedAt: Date.now() } }
        );
      } catch (err) {
        logger.error("Failed to handle shape message", { err });
      }

      socket.to(roomId).emit("shape-message", message);
    })

    socket.on("cursor-move", ({ roomId, x, y }: { roomId: string; x: number; y: number }) => {
      const authorizedRooms = socket.data.authorizedRooms as Set<string> | undefined;
      if (!authorizedRooms?.has(roomId)) return;

      // Use the signed name, not a client value, so cursor names cannot be faked.
      socket.to(roomId).emit("cursor-move", { userId: socket.data.userId, x, y, name: socket.data.name });
    })

    socket.on("disconnect", () => {
      logger.info("client disconnected", { socketId: socket.id });
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

  return io;
}

// The board route calls this after deletion to clear the live room safely.
export function notifyBoardDeleted(roomId: string): void {
  deletedRoomIds.add(roomId);
  ioInstance?.to(roomId).emit("board-deleted");
  ioInstance?.socketsLeave(roomId);
  // unref keeps this cleanup timer from holding the server open on shutdown.
  setTimeout(() => deletedRoomIds.delete(roomId), DELETED_ROOM_TTL_MS).unref();
}

// Existing sockets already passed login, so I close them when sessions are
// cancelled or an account is deleted.
export function disconnectUserSockets(userId: string): void {
  if (!ioInstance) return;
  for (const socket of ioInstance.sockets.sockets.values()) {
    if (socket.data.userId === userId) socket.disconnect(true);
  }
}
