import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createTestApp, getAuthCookie, type TestContext } from "./helpers.js";

let ctx: TestContext;
let ownerCookie: string;
let memberCookie: string;

const ROOM = "test-room-1";

beforeAll(async () => {
  ctx = await createTestApp();

  const owner = await request(ctx.app)
    .post("/auth/signup")
    .send({ name: "Owner", email: "owner@example.com", password: "valid-password" });
  ownerCookie = getAuthCookie(owner);

  const member = await request(ctx.app)
    .post("/auth/signup")
    .send({ name: "Member", email: "member@example.com", password: "valid-password" });
  memberCookie = getAuthCookie(member);
});

afterAll(async () => {
  await ctx.stop();
});

describe("authentication wall", () => {
  it.each([
    ["GET", "/boards"],
    ["POST", "/boards"],
    ["POST", `/boards/${ROOM}/join`],
    ["GET", `/boards/${ROOM}`],
    ["PATCH", `/boards/${ROOM}`],
    ["DELETE", `/boards/${ROOM}`],
    ["GET", `/boards/${ROOM}/items`],
  ])("%s %s returns 401 without a cookie", async (method, path) => {
    const res = await (request(ctx.app) as any)[method.toLowerCase()](path);
    expect(res.status).toBe(401);
  });
});

describe("board membership", () => {
  it("creates a board with the creator as owner and sole member", async () => {
    const res = await request(ctx.app)
      .post("/boards")
      .set("Cookie", ownerCookie)
      .send({ roomId: ROOM, name: "Test Board" });
    expect(res.status).toBe(201);

    const list = await request(ctx.app).get("/boards").set("Cookie", ownerCookie);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].roomId).toBe(ROOM);
  });

  it("does not list a board for a non-member", async () => {
    const list = await request(ctx.app).get("/boards").set("Cookie", memberCookie);
    expect(list.body).toHaveLength(0);
  });

  it("adds the joining user to memberIds, after which the board appears in their list", async () => {
    const join = await request(ctx.app)
      .post(`/boards/${ROOM}/join`)
      .set("Cookie", memberCookie);
    expect(join.status).toBe(200);

    const list = await request(ctx.app).get("/boards").set("Cookie", memberCookie);
    expect(list.body).toHaveLength(1);
  });

  it("joining twice doesn't duplicate the membership", async () => {
    await request(ctx.app).post(`/boards/${ROOM}/join`).set("Cookie", memberCookie);

    const board = await request(ctx.app).get(`/boards/${ROOM}`).set("Cookie", memberCookie);
    const memberIds: string[] = board.body.memberIds;
    expect(new Set(memberIds).size).toBe(memberIds.length);
    expect(memberIds).toHaveLength(2); // owner + member
  });

  it("returns 404 when joining a room that doesn't exist", async () => {
    const res = await request(ctx.app)
      .post("/boards/no-such-room/join")
      .set("Cookie", memberCookie);
    expect(res.status).toBe(404);
  });
});

describe("board deletion", () => {
  it("refuses deletion by a member who isn't the owner", async () => {
    const res = await request(ctx.app).delete(`/boards/${ROOM}`).set("Cookie", memberCookie);
    expect(res.status).toBe(403);

    // Board must still exist
    const board = await request(ctx.app).get(`/boards/${ROOM}`).set("Cookie", ownerCookie);
    expect(board.status).toBe(200);
  });

  it("lets the owner delete the board and wipes its canvas items", async () => {
    // Seed canvas items directly so the test can observe the cascade delete
    const { items } = await import("../src/db.js");
    await items().insertMany([
      { _id: "shape-1", roomId: ROOM, kind: "shape", data: { id: "shape-1" } },
      { _id: "note-1", roomId: ROOM, kind: "note", data: { id: "note-1" } },
    ]);

    const res = await request(ctx.app).delete(`/boards/${ROOM}`).set("Cookie", ownerCookie);
    expect(res.status).toBe(200);

    const board = await request(ctx.app).get(`/boards/${ROOM}`).set("Cookie", ownerCookie);
    expect(board.status).toBe(404);

    expect(await items().countDocuments({ roomId: ROOM })).toBe(0);
  });

  it("returns 404 for deleting a room that doesn't exist", async () => {
    const res = await request(ctx.app).delete("/boards/no-such-room").set("Cookie", ownerCookie);
    expect(res.status).toBe(404);
  });
});

describe("board items endpoint", () => {
  it("groups items by kind for thumbnails", async () => {
    const room2 = "test-room-2";
    await request(ctx.app)
      .post("/boards")
      .set("Cookie", ownerCookie)
      .send({ roomId: room2, name: "Board 2" });

    const { items } = await import("../src/db.js");
    await items().insertMany([
      { _id: "s1", roomId: room2, kind: "shape", data: { id: "s1", type: "square" } },
      { _id: "s2", roomId: room2, kind: "shape", data: { id: "s2", type: "circle" } },
      { _id: "n1", roomId: room2, kind: "note", data: { id: "n1" } },
      { _id: "t1", roomId: room2, kind: "text", data: { id: "t1" } },
    ]);

    const res = await request(ctx.app).get(`/boards/${room2}/items`).set("Cookie", ownerCookie);
    expect(res.status).toBe(200);
    expect(res.body.shapes).toHaveLength(2);
    expect(res.body.notes).toHaveLength(1);
    expect(res.body.texts).toHaveLength(1);
  });
});

// Regression tests for the object-level authorization fix: a logged-in user
// who is NOT a member of a board must not be able to read or mutate it, even
// though they hold a valid auth cookie and know the roomId.
describe("board object-level authorization (non-member)", () => {
  const AUTHZ_ROOM = "authz-room";
  let outsiderCookie: string;

  beforeAll(async () => {
    const outsider = await request(ctx.app)
      .post("/auth/signup")
      .send({ name: "Outsider", email: "outsider@example.com", password: "valid-password" });
    outsiderCookie = getAuthCookie(outsider);

    await request(ctx.app)
      .post("/boards")
      .set("Cookie", ownerCookie)
      .send({ roomId: AUTHZ_ROOM, name: "Private Board" });
  });

  it("hides a board's metadata from a non-member (404, no existence oracle)", async () => {
    const res = await request(ctx.app).get(`/boards/${AUTHZ_ROOM}`).set("Cookie", outsiderCookie);
    expect(res.status).toBe(404);
  });

  it("refuses to return canvas items to a non-member", async () => {
    const { items } = await import("../src/db.js");
    await items().insertOne({ _id: "secret-1", roomId: AUTHZ_ROOM, kind: "text", data: { id: "secret-1", text: "confidential" } });

    const res = await request(ctx.app).get(`/boards/${AUTHZ_ROOM}/items`).set("Cookie", outsiderCookie);
    expect(res.status).toBe(404);
    expect(res.body.texts).toBeUndefined();
  });

  it("refuses to let a non-member rename the board, and leaves the name unchanged", async () => {
    const res = await request(ctx.app)
      .patch(`/boards/${AUTHZ_ROOM}`)
      .set("Cookie", outsiderCookie)
      .send({ name: "defaced" });
    expect(res.status).toBe(404);

    const board = await request(ctx.app).get(`/boards/${AUTHZ_ROOM}`).set("Cookie", ownerCookie);
    expect(board.body.name).toBe("Private Board");
  });

  it("still lets a member (the owner) read and rename", async () => {
    const meta = await request(ctx.app).get(`/boards/${AUTHZ_ROOM}`).set("Cookie", ownerCookie);
    expect(meta.status).toBe(200);

    const itemsRes = await request(ctx.app).get(`/boards/${AUTHZ_ROOM}/items`).set("Cookie", ownerCookie);
    expect(itemsRes.status).toBe(200);

    const rename = await request(ctx.app)
      .patch(`/boards/${AUTHZ_ROOM}`)
      .set("Cookie", ownerCookie)
      .send({ name: "Renamed Board" });
    expect(rename.status).toBe(200);
    expect(rename.body.name).toBe("Renamed Board");
  });

  it("rejects an empty/blank rename with 400", async () => {
    const res = await request(ctx.app)
      .patch(`/boards/${AUTHZ_ROOM}`)
      .set("Cookie", ownerCookie)
      .send({ name: "   " });
    expect(res.status).toBe(400);
  });

  it("does not create (squat) a board when PATCHing a non-existent roomId", async () => {
    const res = await request(ctx.app)
      .patch("/boards/ghost-room")
      .set("Cookie", outsiderCookie)
      .send({ name: "squatted" });
    expect(res.status).toBe(404);

    const { boards } = await import("../src/db.js");
    expect(await boards().findOne({ roomId: "ghost-room" })).toBeNull();
  });
});
