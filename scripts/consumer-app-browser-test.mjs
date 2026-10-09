// Smoke-test the consumer app's guest shopping flows in the Expo web preview.
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

const base = process.env.CONSUMER_PREVIEW_URL || "http://localhost:19006";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Consumer preview tests require a local Expo server.");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
try {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Explore as guest")).toBeVisible();
  await page.getByText("Explore as guest").click();
  await expect(page.getByText("Worth a closer look.")).toBeVisible();
  const liveSettings = await (await page.request.get("https://glamiastore.com/api/storefront-settings?cache=1")).json();
  const bannerText = String(liveSettings.announcement?.text || "").trim();
  if (liveSettings.announcement?.visible && bannerText) {
    const banner = page.getByText(bannerText, { exact: true });
    await expect(banner).toBeVisible();
    assert.equal(await banner.evaluate(element => Boolean(element.closest('a, [role="link"]'))), false, "Announcement banner must not be a link");
  }
  await expect(page.getByRole("button", { name: "View Baby Langots (reusable Diapers) Pack of 6" })).toHaveCount(1);

  await page.getByRole("tab", { name: "Explore" }).click();
  await expect(page.getByText("7 pieces")).toBeVisible();
  await page.getByRole("textbox", { name: "Search the collection" }).fill("Baby");
  await expect(page.getByText("SUGGESTED PIECES")).toBeVisible();
  await page.getByRole("button", { name: /View Baby Langots/ }).first().click();
  await expect(page.getByText("CHOOSE SIZE")).toBeVisible();
  if (liveSettings.announcement?.visible && bannerText) await expect(page.getByText(bannerText, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Go back" }).click();

  await page.getByRole("button", { name: "View Night Suit — Chocolate Brown" }).first().click();
  await expect(page.getByRole("button", { name: "Select Chocolate Brown colourway" })).toBeVisible();
  await page.getByRole("button", { name: "Select Chocolate Brown colourway" }).click();
  await expect(page.getByText("COLOUR · Chocolate Brown")).toBeVisible();
  await page.getByRole("button", { name: "Go back" }).click();

  await page.getByRole("button", { name: "Add Night Suit — Chocolate Brown to bag" }).first().click();
  await expect(page.getByText("Choose a size")).toBeVisible();
  await page.getByText("XL", { exact: true }).click();
  await page.getByText("Add to bag", { exact: true }).click();
  await expect(page.getByText("Size XL · ₹949")).toBeVisible();
  await expect(page.getByText("Continue to payment · ₹949")).toBeVisible();
  await page.getByText("Continue to payment · ₹949").click();
  await expect(page.getByText("Sign in to checkout").first()).toBeVisible();
  await page.getByText("Back to shopping").click();

  await page.getByRole("tab", { name: "Explore" }).click();
  await page.getByRole("button", { name: "Add Night Suit — Chocolate Brown to wishlist" }).first().click();
  await page.getByRole("button", { name: "Open categories menu" }).click();
  await page.getByRole("button", { name: "Wishlist", exact: true }).click();
  await expect(page.getByText("Wishlist", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "View Night Suit — Chocolate Brown" })).toHaveCount(1);
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
  await page.getByText("Explore as guest").click();
  await page.getByRole("tab", { name: "Bag" }).click();
  await expect(page.getByText("Size XL · ₹949")).toBeVisible();
  await page.getByRole("tab", { name: "Explore" }).click();
  await page.getByRole("button", { name: "Open categories menu" }).click();
  await page.getByRole("button", { name: "Wishlist", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove Night Suit — Chocolate Brown from wishlist" })).toHaveCount(1);
  assert.deepEqual(errors, [], `Unexpected app errors: ${errors.join("; ")}`);
  const customPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  let showBanner = true;
  const fullMessage = "ADMIN CUSTOM MESSAGE — This longer announcement must remain readable even when its preview is clipped on a narrow phone screen.";
  await customPage.route("**/api/storefront-settings?cache=1", async route => {
    const data = structuredClone(liveSettings);
    data.announcement = { visible: showBanner, text: fullMessage, items: [{ id: "test", text: "SECOND CUSTOM MESSAGE", ends_at: new Date(Date.now() + 60000).toISOString() }] };
    await route.fulfill({ json: data });
  });
  await customPage.goto(base, { waitUntil: "domcontentloaded" });
  await customPage.getByText("Explore as guest").click();
  await customPage.setViewportSize({ width: 320, height: 700 });
  const customBanner = customPage.getByTestId("announcement-banner");
  await expect(customBanner).toBeVisible();
  assert.equal(await customBanner.evaluate(element => Boolean(element.closest('a, [role="link"]'))), false, "Custom announcement must not navigate");
  const beforeTap = customPage.url();
  await customBanner.click();
  await expect(customPage.getByTestId("announcement-dialog").getByText(fullMessage, { exact: true })).toBeVisible();
  assert.equal(customPage.url(), beforeTap, "Reading an announcement must not navigate");
  await customPage.getByTestId("announcement-dialog").getByRole("button", { name: "Close announcement" }).click();
  await expect(customPage.getByTestId("announcement-dialog")).toHaveCount(0);
  await expect(customPage.getByText("SECOND CUSTOM MESSAGE")).toBeVisible({ timeout: 7500 });
  await customBanner.click();
  await expect(customPage.getByTestId("announcement-dialog").getByText("SECOND CUSTOM MESSAGE", { exact: true })).toBeVisible();
  await customPage.getByTestId("announcement-dialog").getByRole("button", { name: "Close announcement" }).click();
  showBanner = false;
  await customPage.reload({ waitUntil: "domcontentloaded" });
  await customPage.getByText("Explore as guest").click();
  await expect(customPage.getByText(fullMessage)).toHaveCount(0);
  await customPage.close();
  console.log("Consumer app guest shopping and admin-managed read-only announcement checks passed.");
} finally {
  await browser.close();
}
