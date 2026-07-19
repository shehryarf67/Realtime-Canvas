import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createTestApp, getAuthCookie, type TestContext } from "./helpers.js";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(async () => {
  await ctx.stop();
});

describe("account management", () => {
  it("updates and trims the display name for both fresh and existing cookies", async () => {
    const signup = await request(ctx.app).post("/auth/signup").send({
      name: "Old Name",
      email: "profile@example.com",
      password: "profile-password",
    });
    const originalCookie = getAuthCookie(signup);

    const updated = await request(ctx.app)
      .patch("/auth/profile")
      .set("Cookie", originalCookie)
      .send({ name: "  New Name  " });

    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ name: "New Name", email: "profile@example.com" });
    expect(updated.body.passwordHash).toBeUndefined();
    expect(getAuthCookie(updated)).toMatch(/^token=/);

    // Even the original cookie should read the changed name from Mongo.
    const me = await request(ctx.app).get("/auth/me").set("Cookie", originalCookie);
    expect(me.status).toBe(200);
    expect(me.body.name).toBe("New Name");
  });

  it("requires the current password, revokes old sessions, and keeps this browser signed in", async () => {
    const signup = await request(ctx.app).post("/auth/signup").send({
      name: "Password User",
      email: "change-password@example.com",
      password: "first-password",
    });
    const oldCookie = getAuthCookie(signup);

    const wrong = await request(ctx.app)
      .post("/auth/change-password")
      .set("Cookie", oldCookie)
      .send({ currentPassword: "not-the-password", newPassword: "second-password" });
    expect(wrong.status).toBe(401);

    const changed = await request(ctx.app)
      .post("/auth/change-password")
      .set("Cookie", oldCookie)
      .send({ currentPassword: "first-password", newPassword: "second-password" });
    expect(changed.status).toBe(200);
    const freshCookie = getAuthCookie(changed);

    expect((await request(ctx.app).get("/auth/me").set("Cookie", oldCookie)).status).toBe(401);
    expect((await request(ctx.app).get("/auth/me").set("Cookie", freshCookie)).status).toBe(200);

    const oldLogin = await request(ctx.app)
      .post("/auth/login")
      .send({ email: "change-password@example.com", password: "first-password" });
    const newLogin = await request(ctx.app)
      .post("/auth/login")
      .send({ email: "change-password@example.com", password: "second-password" });
    expect(oldLogin.status).toBe(401);
    expect(newLogin.status).toBe(200);
  });

  it("requires explicit confirmation and removes owned data without deleting shared boards", async () => {
    const ownerSignup = await request(ctx.app).post("/auth/signup").send({
      name: "Owner",
      email: "delete-owner@example.com",
      password: "owner-password",
    });
    const ownerCookie = getAuthCookie(ownerSignup);
    const ownerId = String(ownerSignup.body.userId);

    await request(ctx.app)
      .post("/boards")
      .set("Cookie", ownerCookie)
      .send({ roomId: "owned-room", name: "Owned board" });

    const otherSignup = await request(ctx.app).post("/auth/signup").send({
      name: "Other Owner",
      email: "other-owner@example.com",
      password: "other-password",
    });
    const otherCookie = getAuthCookie(otherSignup);
    await request(ctx.app)
      .post("/boards")
      .set("Cookie", otherCookie)
      .send({ roomId: "shared-room", name: "Other owner's board" });
    await request(ctx.app)
      .post("/boards/shared-room/join")
      .set("Cookie", ownerCookie)
      .send({});

    const { items, boards } = await import("../src/db.js");
    await items().insertOne({
      _id: "owned-item",
      roomId: "owned-room",
      kind: "note",
      data: { id: "owned-item", text: "delete me" },
    });

    const unconfirmed = await request(ctx.app)
      .delete("/auth/account")
      .set("Cookie", ownerCookie)
      .send({ password: "owner-password", confirmation: "delete" });
    expect(unconfirmed.status).toBe(400);
    expect((await request(ctx.app).get("/auth/me").set("Cookie", ownerCookie)).status).toBe(200);

    const deleted = await request(ctx.app)
      .delete("/auth/account")
      .set("Cookie", ownerCookie)
      .send({ password: "owner-password", confirmation: "DELETE" });
    expect(deleted.status).toBe(200);
    expect(deleted.headers["set-cookie"]?.[0]).toMatch(/^token=;/);

    expect((await request(ctx.app).get("/auth/me").set("Cookie", ownerCookie)).status).toBe(401);
    expect((await request(ctx.app).post("/auth/login").send({
      email: "delete-owner@example.com",
      password: "owner-password",
    })).status).toBe(401);

    expect(await boards().findOne({ roomId: "owned-room" })).toBeNull();
    expect(await items().findOne({ roomId: "owned-room" })).toBeNull();

    const sharedBoard = await boards().findOne({ roomId: "shared-room" });
    expect(sharedBoard).not.toBeNull();
    expect(sharedBoard?.memberIds).not.toContain(ownerId);
    expect((await request(ctx.app).get("/boards/shared-room").set("Cookie", otherCookie)).status).toBe(200);
  });
});
