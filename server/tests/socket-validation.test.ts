import { describe, it, expect, beforeAll } from "vitest";

// socket.ts reads config during import, so dummy env must exist before loading it.
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

  it("rejects note/text with oversized text content but allows normal content", () => {
    const big = "a".repeat(20_001);
    expect(isValidCanvasMessage({ kind: "note", action: "add", payload: { id: "n1", text: big } })).toBe(false);
    expect(isValidCanvasMessage({ kind: "text", action: "update", payload: { id: "t1", text: big } })).toBe(false);
    expect(isValidCanvasMessage({ kind: "note", action: "add", payload: { id: "n1", text: "a".repeat(100) } })).toBe(true);
  });
});
