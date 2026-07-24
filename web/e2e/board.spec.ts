import { test, expect } from "@playwright/test";
import { signUp, createBoard, drawSquare } from "./helpers";

test.describe("boards", () => {
  test("creates a new board and opens the room editor", async ({ page }) => {
    await signUp(page);
    await createBoard(page);

    // The room is ready once its name and toolbar are visible.
    await expect(page.getByPlaceholder("Untitled Board")).toBeVisible();
    await expect(page.getByRole("button", { name: "Square" })).toBeVisible();
  });

  test("backspace works in the board-name field (not hijacked by canvas shortcuts)", async ({ page }) => {
    await signUp(page);
    await createBoard(page);

    const nameField = page.getByPlaceholder("Untitled Board");
    await nameField.fill("Hello");
    await nameField.press("Backspace");
    // Canvas shortcuts must not steal Backspace from the board name field.
    await expect(nameField).toHaveValue("Hell");
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

    // Enter blurs the field and sends the rename request.
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

    // Drawing stays blocked until the socket is connected.
    await expect(page.getByTestId("disconnected-overlay")).toHaveCount(0);

    // Draw one square through the real pointer controls.
    await page.getByRole("button", { name: "Square" }).click();
    const canvas = page.getByTestId("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("canvas has no bounding box");

    await page.mouse.move(box.x + 200, box.y + 150);
    await page.mouse.down();
    await page.mouse.move(box.x + 420, box.y + 340, { steps: 8 });
    await page.mouse.up();

    const square = page.locator("div.border-2.border-black");
    await expect(square).toHaveCount(1);

    // Reload after the socket write to prove the square was persisted.
    await page.waitForTimeout(1000);
    await page.reload();

    await expect(page.getByPlaceholder("Untitled Board")).toBeVisible();
    await expect(page.locator("div.border-2.border-black")).toHaveCount(1);
  });

  test("exports the board as SVG and PNG", async ({ page }) => {
    await signUp(page);
    await createBoard(page);
    await expect(page.getByTestId("disconnected-overlay")).toHaveCount(0);

    // Check both download formats.
    await page.getByRole("button", { name: "Export" }).click();
    const [svg] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: "Download SVG" }).click(),
    ]);
    expect(svg.suggestedFilename()).toMatch(/\.svg$/);

    await page.getByRole("button", { name: "Export" }).click();
    const [png] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: "Download PNG" }).click(),
    ]);
    expect(png.suggestedFilename()).toMatch(/\.png$/);
  });

  test("Ctrl+Shift+Z redoes an undone shape", async ({ page }) => {
    await signUp(page);
    await createBoard(page);
    await expect(page.getByTestId("disconnected-overlay")).toHaveCount(0);

    await drawSquare(page);
    const square = page.locator("div.border-2.border-black");
    await expect(square).toHaveCount(1);

    await page.keyboard.press("Control+z");
    await expect(square).toHaveCount(0);

    // Ctrl+Shift+Z (not just Ctrl+Y) should redo.
    await page.keyboard.press("Control+Shift+z");
    await expect(square).toHaveCount(1);
  });

  test("Ctrl+A selects everything and Delete clears the board", async ({ page }) => {
    await signUp(page);
    await createBoard(page);
    await expect(page.getByTestId("disconnected-overlay")).toHaveCount(0);

    await drawSquare(page, { x: 100, y: 100 }, { x: 240, y: 220 });
    await drawSquare(page, { x: 320, y: 120 }, { x: 460, y: 260 });
    const squares = page.locator("div.border-2.border-black");
    await expect(squares).toHaveCount(2);

    await page.keyboard.press("Control+a");
    await page.keyboard.press("Delete");
    await expect(squares).toHaveCount(0);
  });

  test("Ctrl+D duplicates the selected shape", async ({ page }) => {
    await signUp(page);
    await createBoard(page);
    await expect(page.getByTestId("disconnected-overlay")).toHaveCount(0);

    await drawSquare(page);
    const square = page.locator("div.border-2.border-black");
    await expect(square).toHaveCount(1);

    // Select it, then duplicate.
    await page.getByRole("button", { name: "Select" }).click();
    await square.first().click();
    await page.keyboard.press("Control+d");
    await expect(square).toHaveCount(2);
  });

  test("arrow keys nudge the selected shape", async ({ page }) => {
    await signUp(page);
    await createBoard(page);
    await expect(page.getByTestId("disconnected-overlay")).toHaveCount(0);

    await drawSquare(page);
    const square = page.locator("div.border-2.border-black");
    await page.getByRole("button", { name: "Select" }).click();
    await square.click();

    const before = await square.boundingBox();
    if (!before) throw new Error("square has no bounding box");
    for (let i = 0; i < 10; i++) await page.keyboard.press("Shift+ArrowRight");
    const after = await square.boundingBox();
    if (!after) throw new Error("square has no bounding box");

    expect(after.x).toBeGreaterThan(before.x);
  });

  test("Copy button puts an invite link on the clipboard", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await signUp(page);
    const code = await createBoard(page);

    await page.getByRole("button", { name: "Copy invite link" }).click();
    await expect(page.getByText("Copied!")).toBeVisible();

    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain(`/room/${code}`);
  });

  test("zoom controls change the zoom level and reset", async ({ page }) => {
    await signUp(page);
    await createBoard(page);
    await expect(page.getByTestId("disconnected-overlay")).toHaveCount(0);

    const zoomLabel = page.getByRole("button", { name: "Reset zoom" });
    await expect(zoomLabel).toHaveText("100%");

    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(zoomLabel).toHaveText("125%");

    await zoomLabel.click(); // reset
    await expect(zoomLabel).toHaveText("100%");

    // Fit-to-screen is the minimum zoom.
    await expect(page.getByRole("button", { name: "Zoom out" })).toBeDisabled();
  });
});
