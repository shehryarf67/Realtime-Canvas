import { MongoClient, type Collection } from "mongodb";
import { MONGODB_URI } from "./config.js";

export type Id = string | number;
export type Kind = "shape" | "note" | "text";

// One document per canvas item. `_id` is the item's own id, so add/update is an
// upsert keyed by _id and delete is a deleteOne by _id. `data` holds the full
// shape/note/text object exactly as the client sent it.
export type CanvasItemDoc = {
  _id: Id;
  roomId: string;
  kind: Kind;
  data: unknown;
};

export type User = {
  _id?: Id;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: number;
  resetTokenHash?: string;
  resetTokenExpiresAt?: number;
  // Bumped whenever every existing session must be invalidated (e.g. password
  // reset). A token is only accepted while its tokenVersion still matches the
  // user's current value, so old tokens stop working after a bump.
  tokenVersion?: number;
}

export type Board = {
  _id?: Id;
  roomId: string;
  name: string;
  ownerId: Id;
  memberIds: Id[];
  createdAt: number;
  lastEditedAt: number;
}

// Presence is validated (with a clear error) in config.ts at startup.
const client = new MongoClient(MONGODB_URI);

let itemsCollection: Collection<CanvasItemDoc> | null = null;
let usersCollection: Collection<User> | null = null;
let boardsCollection: Collection<Board> | null = null;

export async function connectToDatabase(): Promise<void> {
  await client.connect();
  const db = client.db("realtime_canvas");
  itemsCollection = db.collection<CanvasItemDoc>("items");
  await itemsCollection.createIndex({ roomId: 1 });
  usersCollection = db.collection<User>("users");
  await usersCollection.createIndex({ email: 1 }, { unique: true });
  boardsCollection = db.collection<Board>("boards");
  await boardsCollection.createIndex({ roomId: 1 }, { unique: true });
  console.log("connected to MongoDB");
}

// Used by the graceful-shutdown handler so in-flight writes finish cleanly
// when the host sends SIGTERM on redeploy/scale-down.
export async function closeDatabase(): Promise<void> {
  await client.close();
}

export function items(): Collection<CanvasItemDoc> {
  if (!itemsCollection) {
    throw new Error("Database not connected. Call connectToDatabase() first.");
  }
  return itemsCollection;
}

export function users(): Collection<User> {
  if (!usersCollection) {
    throw new Error("Database not connected. Call connectToDatabase() first.");
  }
  return usersCollection;
}

export function boards(): Collection<Board> {
  if (!boardsCollection) {
    throw new Error("Database not connected. Call connectToDatabase() first.");
  }
  return boardsCollection;
}