import { MongoClient, type Collection } from "mongodb";
import { MONGODB_URI } from "./config.js";
import { logger } from "./lib/logger.js";

export type Id = string | number;
export type Kind = "shape" | "note" | "text";

// Each canvas item is its own document. I reuse the client item id as _id so
// updates can upsert and deletes can target the same value.
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
  // I bump this when all old sessions need to stop working.
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

// config.ts makes sure the URI exists before this client is created.
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
  logger.info("connected to MongoDB");
}

// Used during shutdown so Mongo can finish any current writes.
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
