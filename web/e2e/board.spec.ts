import { test, expect } from "@playwright/test";
import { signUp, createBoard } from "./helpers";

test.describe("boards", () => {
  test("creates a new board and opens the room editor", async ({ page }) => {
    await signUp(page);
    await createBoard(page);

    // Room chrome is present: the editable name and a toolbar tool.
    await expect(page.getByPlaceholder("Untitled Board")).toBeVisible();
    await expect(page.getByRole("button", { name: "Square" })).toBeVisible();
  });

  test("a created board shows up under Recent boards", async ({ page }) => {
    await signUp(page);
    await createBoard(page);

    await page.goto("/");
    await expect(page.getByText("Recent boards")).toBeVisible();
    await expect(page.getByRole("link", { name: "Untitled Board" })).toBeVisible();
  });

  test("renaming a board persists across a reload", async ({ page }) => {
    await signUp(page);
    await createBoard(page);

    const nameField = page.getByPlaceholder("Untitled Board");
    await nameField.fill("Sprint Planning");

    // Blur (Enter) triggers the PATCH; wait for it before reloading.
    const patch = page.waitForResponse(
      (r) => r.request().method() === "PATCH" && /\/boards\//.test(r.url())
    );
    await nameField.press("Enter");
    await patch;

    await page.reload();
    await expect(page.getByPlaceholder("Untitled Board")).toHaveValue("Sprint Planning");
  });

  test("a shape drawn on the canvas persists across a reload", async ({ page }) => {
    await signUp(page);
    await createBoard(page);

    // Select the square tool and drag out a rectangle on the canvas.
    await page.getByRole("button", { name: "Square" }).click();
    const canvas = page.getByTestId("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("canvas has no bounding box");

    await page.mouse.move(box.x + 200, box.y + 150);
    await page.mouse.down();
    await page.mouse.move(box.x + 420, box.y + 340, { steps: 8 });
    await page.mouse.up();

    // The square renders as a bordered box.
    const square = page.locator("div.border-2.border-black");
    await expect(square).toHaveCount(1);

    // Let the socket write land, then reload and confirm the shape came back
    // from the server (canvas-state) — proving the full save pipeline works.
    await page.waitForTimeout(1000);
    await page.reload();

    await expect(page.getByPlaceholder("Untitled Board")).toBeVisible();
    await expect(page.locator("div.border-2.border-black")).toHaveCount(1);
  });
});
