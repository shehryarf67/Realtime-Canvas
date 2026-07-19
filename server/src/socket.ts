import type { Server as HTTPServer } from "http";
import { Server } from "socket.io";
import { boards, items, type Id, type Kind } from "./db.js";
import { CLIENT_ORIGIN, AUTH_COOKIE_NAME } from "./config.js";
import { verifyToken } from "./lib/auth.js";
import { logger } from "./lib/logger.js";

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

type CanvasMessage =
  | { kind: Kind; action: "add" | "update"; payload: { id: Id } & Record<string, unknown> }
  | { kind: Kind; action: "delete"; id: Id };

const VALID_KINDS: readonly Kind[] = ["shape", "note", "text"];

// Caps the text content stored on a note/text box. The whole message is
// already bounded by maxHttpBufferSize (256KB); this is a tighter, per-field
// bound so a single item can't hold an absurd amount of text.
const MAX_TEXT_LENGTH = 20_000;

function isValidId(id: unknown): id is Id {
  return typeof id === "string" || typeof id === "number";
}

// Clients are authenticated and room-authorized, but still untrusted — a
// malformed message shouldn't reach the DB or get rebroadcast. Accept only the
// exact shapes we're willing to persist: a known kind, a valid action, and a
// primitive id in the right place.
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
    // Notes and text boxes carry a `text` field — reject oversized content.
    if ((m.kind === "note" || m.kind === "text") && typeof p.text === "string" && p.text.length > MAX_TEXT_LENGTH) {
      return false;
    }
    return true;
  }
  return false;
}

// roomId -> userId -> how many open sockets that user currently has in the
// room. A user open in two tabs should only ever produce one user-joined and
// one user-left broadcast, not one per socket.
const roomPresence = new Map<string, Map<string, { name: string; count: number }>>();

// Rooms whose board has been deleted. Checked before any write, so a
// shape-message already in flight when the delete happens can't resurrect an
// items document for a board that no longer exists. Entries are evicted after
// a grace period (see notifyBoardDeleted) so the set can't grow without bound
// over a long-running process.
const deletedRoomIds = new Set<string>();

// The guard only needs to outlast any shape-message in flight at delete time
// (milliseconds); a few minutes is a very safe margin before forgetting.
const DELETED_ROOM_TTL_MS = 5 * 60 * 1000;

let ioInstance: Server | null = null;

export function initSocketServer(httpServer: HTTPServer): Server {
  const io = new Server(httpServer, {
    // Cap a single inbound message. Default is 1MB; one canvas item (even a
    // long pen stroke) is far smaller, so 256KB is generous while stopping a
    // client from pushing oversized blobs into the DB / broadcast.
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

    // Same check as the REST middleware: signature + tokenVersion, so a socket
    // can't be opened with a token invalidated by a password reset.
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
      if (!isValidCanvasMessage(message)) return; // drop malformed messages

      try {
        const col = items();
        if (message.action === "delete"){
          // Scope by roomId as well as _id so a member of one board can't
          // delete an item belonging to another board by its id.
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

      // Name comes from the trusted, JWT-derived socket.data.name — NOT from
      // the client payload — so a user can't spoof another person's name on
      // their cursor. x/y are ephemeral and not persisted.
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

// Called from the REST DELETE /boards/:roomId route once a board and its
// items are actually gone, so this module never needs to import the Express
// router (which would create a circular import back to index.ts).
export function notifyBoardDeleted(roomId: string): void {
  deletedRoomIds.add(roomId);
  ioInstance?.to(roomId).emit("board-deleted");
  ioInstance?.socketsLeave(roomId);
  // Forget the room after the grace period. unref() so this timer never keeps
  // the process alive on shutdown.
  setTimeout(() => deletedRoomIds.delete(roomId), DELETED_ROOM_TTL_MS).unref();
}

// JWT revocation prevents new REST requests and socket handshakes, but a
// socket that is already connected has passed its handshake already. Close
// every live connection for the user when credentials change or the account
// is deleted so that access ends immediately rather than on the next refresh.
export function disconnectUserSockets(userId: string): void {
  if (!ioInstance) return;
  for (const socket of ioInstance.sockets.sockets.values()) {
    if (socket.data.userId === userId) socket.disconnect(true);
  }
}
