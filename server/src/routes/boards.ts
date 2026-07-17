import { Router, type Response } from "express";
import { boards, items, type Board, type Id } from "../db.js";
import requireAuth from "../middleware/requireAuth.js";
import { notifyBoardDeleted } from "../socket.js";

const router = Router();

// Object-level authorization the board routes previously lacked: requireAuth
// only proves WHO you are, not that you may touch THIS board. Loads the board
// and confirms the caller is a member; on failure it writes the right status
// (401/404/403) and returns null, so callers do:
//   const board = await requireMembership(roomId, req.userId, res);
//   if (!board) return;
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
    // 404 (not 403) so a non-member can't distinguish "board exists but you're
    // locked out" from "no such board" — no existence oracle.
    res.status(404).json({ error: "Board not found" });
    return null;
  }
  if (!board.memberIds.includes(userId)) {
    res.status(404).json({ error: "Board not found" });
    return null;
  }
  return board;
}

// Create a new board
router.post("/", requireAuth, async (req, res) => {
  const { roomId, name } = req.body;
  const ownerId = req.userId;
  if (!ownerId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const result = await boards().insertOne({
    roomId,
    name,
    ownerId,
    memberIds: [ownerId],
    createdAt: Date.now(),
    lastEditedAt: Date.now(),
  });

  res.status(201).json({ boardId: result.insertedId, roomId, name, ownerId });
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

// List the current user's boards, most recently edited first
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

// Fetch a single board by roomId — used to load the current name into a room
router.get("/:roomId", requireAuth, async (req, res) => {
  const { roomId } = req.params;
  if (typeof roomId !== "string") {
    return res.status(400).json({ error: "Invalid roomId" });
  }

  const board = await requireMembership(roomId, req.userId, res);
  if (!board) return;
  res.status(200).json(board);
});

// Rename a board (and bump lastEditedAt). Any member may rename — the name is
// shared collaborative state, edited from inside the room. No upsert: boards
// are only ever created through POST / (upserting here let any authenticated
// user squat an arbitrary roomId as owner).
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

// Delete a board and its canvas contents, so nothing is left orphaned.
// Only the board's owner can do this — any other member can collaborate on
// the canvas, but shouldn't be able to remove it entirely.
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

// Canvas contents of one room, grouped for thumbnail rendering
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
