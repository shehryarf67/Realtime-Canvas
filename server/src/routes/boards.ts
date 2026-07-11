import {Router} from "express";
import {boards} from "../db.js";
import requireAuth from "../middleware/requireAuth.js";

const router = Router();

// Create a new board
router.post("/", requireAuth, async (req, res) => {
  const {roomId, name} = req.body;
  const ownerId = req.userId;
  if (!ownerId) {
    return res.status(401).json({error: "Unauthorized"});
  }

  const result = await boards().insertOne({
    roomId,
    name,
    ownerId,
    createdAt: Date.now(),
    lastEditedAt: Date.now(),
  });

  res.status(201).json({ boardId: result.insertedId, roomId, name, ownerId });
});

// List the current user's boards, most recently edited first
router.get("/", requireAuth, async (req, res) => {
  const ownerId = req.userId;
  if (!ownerId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const userBoards = await boards()
    .find({ ownerId })
    .sort({ lastEditedAt: -1 })
    .toArray();

  res.status(200).json(userBoards);
});

export default router;