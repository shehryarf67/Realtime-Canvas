import { expect, type Page } from "@playwright/test";

export type TestUser = { name: string; email: string; password: string };

// A counter keeps test emails unique without relying on timing.
let counter = 0;
export function uniqueUser(): TestUser {
  counter += 1;
  const id = `${process.pid}-${counter}`;
  return {
    name: `E2E User ${id}`,
    email: `e2e-${id}@example.com`,
    password: "test-password-123",
  };
}

// Sign up through the UI and wait until auth is visible on the landing page.
export async function signUp(page: Page, user: TestUser = uniqueUser()): Promise<TestUser> {
  await page.goto("/signup");
  await page.getByLabel("Display name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  return user;
}

export async function logIn(page: Page, user: TestUser): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
}

// Create a board through the UI and return its room code after it loads.
export async function createBoard(page: Page): Promise<string> {
  await page.getByRole("button", { name: "New board" }).click();
  await page.waitForURL(/\/room\/.+/);
  await expect(page.getByPlaceholder("Untitled Board")).toBeVisible();
  const url = new URL(page.url());
  return decodeURIComponent(url.pathname.replace("/room/", ""));
}

// Draw one square by dragging with the Square tool. Offsets are relative to the
// canvas top-left, in screen px. The drag is large enough to clear the
// accidental-click minimum-size guard.
export async function drawSquare(
  page: Page,
  from: { x: number; y: number } = { x: 120, y: 120 },
  to: { x: number; y: number } = { x: 280, y: 260 }
): Promise<void> {
  await page.getByRole("button", { name: "Square" }).click();
  const box = await page.getByTestId("canvas").boundingBox();
  if (!box) throw new Error("canvas has no bounding box");
  await page.mouse.move(box.x + from.x, box.y + from.y);
  await page.mouse.down();
  await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 8 });
  await page.mouse.up();
}
