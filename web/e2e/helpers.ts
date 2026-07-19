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
