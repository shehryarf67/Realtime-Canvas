import { Router, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { boards, items, type Board, type Id } from "../db.js";
import requireAuth from "../middleware/requireAuth.js";
import { notifyBoardDeleted } from "../socket.js";
import { isNonEmptyString } from "../lib/validation.js";

// These limits keep client input and Mongo lookup keys at a sensible size.
const MAX_ROOM_ID_LENGTH = 120;
const MAX_NAME_LENGTH = 200;

// Board creation is limited by account, not IP, so shared networks are fine.
const createBoardLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ?? "anonymous",
  message: { error: "Too many boards created. Try again later." },
});

const router = Router();

// Login alone is not enough for board access. Every board read or edit goes
// through this membership check.
async function requireMembership(
  roomId: string,
  userId: Id | undefined,
  res: Response
): Promise<Board | null> {
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const board = await boards().findOne({ roomId });
  if (!board) {
    // Use the same 404 for missing and private boards so ids cannot be probed.
    res.status(404).json({ error: "Board not found" });
    return null;
  }
  if (!board.memberIds.includes(userId)) {
    res.status(404).json({ error: "Board not found" });
    return null;
  }
  return board;
}

// Create a board owned by the current user.
router.post("/", requireAuth, createBoardLimiter, async (req, res) => {
  const { roomId, name } = req.body;
  const ownerId = req.userId;
  if (!ownerId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  // Validate before roomId becomes a lookup key stored across the app.
  if (!isNonEmptyString(roomId) || roomId.length > MAX_ROOM_ID_LENGTH) {
    return res.status(400).json({ error: "Invalid board code" });
  }
  if (typeof name !== "string" || name.length > MAX_NAME_LENGTH) {
    return res.status(400).json({ error: "Invalid board name" });
  }

  try {
    const result = await boards().insertOne({
      roomId,
      name,
      ownerId,
      memberIds: [ownerId],
      createdAt: Date.now(),
      lastEditedAt: Date.now(),
    });
    res.status(201).json({ boardId: result.insertedId, roomId, name, ownerId });
  } catch (err) {
    // Mongo code 11000 means the generated room code already exists.
    if (err && typeof err === "object" && (err as { code?: number }).code === 11000) {
      return res.status(409).json({ error: "Board code already in use" });
    }
    throw err;
  }
});

router.post("/:roomId/join", requireAuth, async (req, res) => {
  const { roomId } = req.params;
  const userId = req.userId;
  if (typeof roomId !== "string") {
    return res.status(400).json({ error: "Invalid roomId" });
  }
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const result = await boards().findOneAndUpdate(
    { roomId },
    {
      $addToSet: { memberIds: userId },
    },
    { returnDocument: "after" }
  );
  if (!result) {
    return res.status(404).json({ error: "Board not found" });
  }
  res.status(200).json(result);
});

// List boards the current user can access, newest activity first.
router.get("/", requireAuth, async (req, res) => {
  const ownerId = req.userId;
  if (!ownerId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const userBoards = await boards()
    .find({ memberIds: ownerId })
    .sort({ lastEditedAt: -1 })
    .toArray();

  res.status(200).json(userBoards);
});

// Load one board after checking membership.
router.get("/:roomId", requireAuth, async (req, res) => {
  const { roomId } = req.params;
  if (typeof roomId !== "string") {
    return res.status(400).json({ error: "Invalid roomId" });
  }

  const board = await requireMembership(roomId, req.userId, res);
  if (!board) return;
  res.status(200).json(board);
});

// Any member can rename shared state. I avoid upsert here so this route cannot
// be used to claim a new room id.
router.patch("/:roomId", requireAuth, async (req, res) => {
  const { roomId } = req.params;
  const { name } = req.body;
  if (typeof roomId !== "string") {
    return res.status(400).json({ error: "Invalid roomId" });
  }
  if (typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ error: "Name is required" });
  }

  const board = await requireMembership(roomId, req.userId, res);
  if (!board) return;

  const result = await boards().findOneAndUpdate(
    { roomId },
    { $set: { name, lastEditedAt: Date.now() } },
    { returnDocument: "after" }
  );

  res.status(200).json(result);
});

// Only the owner can remove a board. Its canvas items are deleted with it.
router.delete("/:roomId", requireAuth, async (req, res) => {
  const { roomId } = req.params;
  const userId = req.userId;
  if (typeof roomId !== "string" || !userId) {
    return res.status(400).json({ error: "Invalid request" });
  }

  const board = await boards().findOne({ roomId });
  if (!board) {
    return res.status(404).json({ error: "Board not found" });
  }
  if (board.ownerId !== userId) {
    return res.status(403).json({ error: "Only the board owner can delete it" });
  }

  await boards().deleteOne({ roomId });
  await items().deleteMany({ roomId });
  notifyBoardDeleted(roomId);

  res.status(200).json({ ok: true });
});

// Group stored items into the shape expected by board thumbnails.
router.get("/:roomId/items", requireAuth, async (req, res) => {
  const { roomId } = req.params;
  if (typeof roomId !== "string") {
    return res.status(400).json({ error: "Invalid roomId" });
  }

  const board = await requireMembership(roomId, req.userId, res);
  if (!board) return;

  const docs = await items().find({ roomId }).toArray();
  const state: { shapes: unknown[]; notes: unknown[]; texts: unknown[] } = {
    shapes: [],
    notes: [],
    texts: [],
  };
  for (const doc of docs) {
    if (doc.kind === "shape") state.shapes.push(doc.data);
    else if (doc.kind === "note") state.notes.push(doc.data);
    else if (doc.kind === "text") state.texts.push(doc.data);
  }

  res.status(200).json(state);
});

export default router;
