import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Load demo project", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Fictional demo loaded");
});
test("preview, apply, verify and restore", async ({ page }) => {
  await expect(page.getByText("SIMULATOR ONLY", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Kick ch:kick/ }),
  ).toContainText("-8.0 dB");
  await page.getByRole("button", { name: "Preview change" }).click();
  await expect(page.getByRole("status")).toContainText(
    "No values have changed",
  );
  await expect(
    page.getByRole("button", { name: /Kick ch:kick/ }),
  ).toContainText("-8.0 dB");
  await page.getByRole("button", { name: "Apply change" }).click();
  await expect(page.getByRole("status")).toContainText("readback verified");
  await expect(
    page.getByRole("button", { name: /Kick ch:kick/ }),
  ).toContainText("-9.0 dB");
  await page.getByRole("button", { name: "Restore original" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Original value restored",
  );
  await expect(
    page.getByRole("button", { name: /Kick ch:kick/ }),
  ).toContainText("-8.0 dB");
});
test("reject and pan preview", async ({ page }) => {
  await page.getByLabel("Parameter", { exact: true }).selectOption("pan");
  await page.getByLabel("Proposed value").fill("0.2");
  await page.getByRole("button", { name: "Preview change" }).click();
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("No values changed");
  await expect(
    page.getByRole("button", { name: "Apply change" }),
  ).toBeDisabled();
});
test("bounded values and automation errors", async ({ page }) => {
  await page.getByLabel("Proposed value").fill("-3");
  await page.getByRole("button", { name: "Preview change" }).click();
  await expect(page.getByRole("alert")).toContainText("Maximum change");
  await page.getByRole("button", { name: /Lead vocal ch:voice/ }).click();
  await page.getByRole("button", { name: "Preview change" }).click();
  await expect(page.getByRole("alert")).toContainText("Automation-active");
});
test("stale apply and disconnect", async ({ page }) => {
  await page.getByRole("button", { name: "Preview change" }).click();
  await page.getByText("Simulator fault controls", { exact: true }).click();
  await page.getByRole("button", { name: "Simulate user fader edit" }).click();
  await expect(page.getByRole("status")).toContainText("now stale");
  await page.getByRole("button", { name: "Apply change" }).click();
  await expect(page.getByRole("alert")).toContainText("changed since preview");
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Preview change" }),
  ).toBeDisabled();
});
test("restore refuses an intervening edit", async ({ page }) => {
  await page.getByRole("button", { name: "Preview change" }).click();
  await page.getByRole("button", { name: "Apply change" }).click();
  await expect(page.getByRole("status")).toContainText("readback verified");
  await page.getByText("Simulator fault controls", { exact: true }).click();
  await page.getByRole("button", { name: "Simulate user fader edit" }).click();
  await expect(page.getByRole("status")).toContainText("now stale");
  await page.getByRole("button", { name: "Restore original" }).click();
  await expect(page.getByRole("alert")).toContainText("changed since preview");
});
test("cancel pending operation", async ({ page }) => {
  await page.getByRole("button", { name: "Preview change" }).click();
  await page.getByText("Simulator fault controls", { exact: true }).click();
  await page.getByLabel("Slow bridge (timeout)").check();
  await page.getByRole("button", { name: "Apply change" }).click();
  await page.getByRole("button", { name: "Cancel operation" }).click();
  await expect(page.getByRole("alert")).toContainText("cancelled", {
    timeout: 10000,
  });
});
test("deadline surfaces a timeout", async ({ page }) => {
  await page.getByRole("button", { name: "Preview change" }).click();
  await page.getByText("Simulator fault controls", { exact: true }).click();
  await page.getByLabel("Slow bridge (timeout)").check();
  await page.getByRole("button", { name: "Apply change" }).click();
  await expect(page.getByRole("alert")).toContainText("timed out", {
    timeout: 10000,
  });
});
test("fits narrow windows without document overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
