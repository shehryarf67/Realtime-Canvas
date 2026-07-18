import { test, expect } from "@playwright/test";
import { signUp, logIn, uniqueUser } from "./helpers";

test.describe("authentication", () => {
  test("sign up lands on an authenticated landing page", async ({ page }) => {
    const user = await signUp(page);
    // Authenticated landing shows the user's name and the primary action.
    await expect(page.getByText(user.name)).toBeVisible();
    await expect(page.getByRole("button", { name: "New board" })).toBeVisible();
  });

  test("sign up rejects a too-short password client-side", async ({ page }) => {
    const user = uniqueUser();
    await page.goto("/signup");
    await page.getByLabel("Display name").fill(user.name);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill("short"); // < 8 chars
    await page.getByRole("button", { name: "Create account" }).click();

    // Scope to the red error paragraph — the field hint also says
    // "At least 8 characters.", so match the error specifically.
    await expect(page.locator("p.text-red-600")).toContainText(/at least 8 characters/i);
    // Still on the signup page — no account created.
    await expect(page).toHaveURL(/\/signup$/);
  });

  test("sign up rejects an invalid email client-side", async ({ page }) => {
    const user = uniqueUser();
    await page.goto("/signup");
    await page.getByLabel("Display name").fill(user.name);
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText(/valid email/i)).toBeVisible();
  });

  test("a signed-up user can log out and log back in", async ({ page }) => {
    const user = await signUp(page);

    await page.getByRole("button", { name: "Log out" }).click();
    // Logged-out landing offers account creation / sign in.
    await expect(page.getByRole("link", { name: "Create an account" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Log out" })).toHaveCount(0);

    await logIn(page, user);
    await expect(page.getByText(user.name)).toBeVisible();
  });

  test("login rejects wrong credentials with the server's error", async ({ page }) => {
    const user = await signUp(page);
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page.getByRole("link", { name: "Create an account" })).toBeVisible();

    await page.goto("/login");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("route protection", () => {
  test("logged-out user is redirected from /boards to /login", async ({ page }) => {
    await page.goto("/boards");
    await page.waitForURL(/\/login$/);
  });

  test("logged-out user is redirected from a room to /login", async ({ page }) => {
    await page.goto("/room/some-room-code");
    await page.waitForURL(/\/login$/);
  });
});
