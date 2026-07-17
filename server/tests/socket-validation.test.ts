import { describe, it, expect, beforeAll } from "vitest";

// Unit test for the shape-message validator. socket.ts pulls in config.ts
// (which validates env at import) and db.ts (which constructs a MongoClient),
// so set dummy env before importing. No real DB connection happens — we only
// call the pure validator, never connectToDatabase().
let isValidCanvasMessage: (message: unknown) => boolean;

beforeAll(async () => {
  process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/test";
  process.env.JWT_SECRET = "test-secret";
  ({ isValidCanvasMessage } = await import("../src/socket.js"));
});

describe("isValidCanvasMessage", () => {
  it("accepts well-formed add/update/delete messages", () => {
    expect(isValidCanvasMessage({ kind: "shape", action: "add", payload: { id: "abc" } })).toBe(true);
    expect(isValidCanvasMessage({ kind: "note", action: "update", payload: { id: 123 } })).toBe(true);
    expect(isValidCanvasMessage({ kind: "text", action: "delete", id: "xyz" })).toBe(true);
  });

  it("rejects an unknown kind", () => {
    expect(isValidCanvasMessage({ kind: "malware", action: "add", payload: { id: "a" } })).toBe(false);
  });

  it("rejects an unknown action", () => {
    expect(isValidCanvasMessage({ kind: "shape", action: "drop-table", payload: { id: "a" } })).toBe(false);
  });

  it("rejects add/update without a valid payload id", () => {
    expect(isValidCanvasMessage({ kind: "shape", action: "add", payload: {} })).toBe(false);
    expect(isValidCanvasMessage({ kind: "shape", action: "add", payload: { id: { $ne: null } } })).toBe(false);
    expect(isValidCanvasMessage({ kind: "shape", action: "add" })).toBe(false);
    expect(isValidCanvasMessage({ kind: "shape", action: "add", payload: null })).toBe(false);
  });

  it("rejects delete without a valid id", () => {
    expect(isValidCanvasMessage({ kind: "shape", action: "delete" })).toBe(false);
    expect(isValidCanvasMessage({ kind: "shape", action: "delete", id: { $gt: "" } })).toBe(false);
  });

  it("rejects non-object / empty payloads", () => {
    expect(isValidCanvasMessage(null)).toBe(false);
    expect(isValidCanvasMessage("shape")).toBe(false);
    expect(isValidCanvasMessage(undefined)).toBe(false);
    expect(isValidCanvasMessage({})).toBe(false);
  });
});
