import { MongoClient, type Collection } from "mongodb";

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
}

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("MONGODB_URI is not set. Add it to server/.env");
}

const client = new MongoClient(uri);

let itemsCollection: Collection<CanvasItemDoc> | null = null;
let usersCollection: Collection<User> | null = null;

export async function connectToDatabase(): Promise<void> {
  await client.connect();
  const db = client.db("realtime_canvas");
  itemsCollection = db.collection<CanvasItemDoc>("items");
  await itemsCollection.createIndex({ roomId: 1 });
  usersCollection = db.collection<User>("users");
  await usersCollection.createIndex({ email: 1 }, { unique: true });
  console.log("connected to MongoDB");
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