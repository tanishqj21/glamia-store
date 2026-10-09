// Exercise both UIs with intercepted fixtures. No production request is permitted.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

const website = process.env.PASSWORD_WEBSITE_PREVIEW || "http://127.0.0.1:5189";
const app = process.env.PASSWORD_EMPLOYEE_PREVIEW || "http://127.0.0.1:8082";
for (const url of [website, app]) assert.ok(["127.0.0.1", "localhost"].includes(new URL(url).hostname));
const output = new URL("../glamia-packer-app/.expo/password-checks/", import.meta.url);
await mkdir(output, { recursive: true });
const permissions = { employees: true, packing: true };
const profile = { id: "tester", name: "Local tester", employee_code: "QA_ADMIN", position: "admin", active: true, permissions };
const initialPeople = [
  { id: "one", employee_code: "QA_ONE", name: "First fixture", position: "packing_staff", active: true, can_manage: true, permissions: { packing: true } },
  { id: "two", employee_code: "QA_TWO", name: "Second fixture", position: "packing_staff", active: true, can_manage: true, permissions: { packing: true } },
  { id: "protected", employee_code: "QA_PROTECTED", name: "Protected fixture", position: "admin", active: true, can_manage: false, permissions }
];
const browser = await chromium.launch();
const errors = [];

async function fixtureContext(base, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", error => errors.push(error.message));
  const state = { people: structuredClone(initialPeople), writes: [], failReset: false };
  await context.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return url.origin === new URL(base).origin ? route.continue() : route.abort();
    let data = { stats: {}, orders: [], products: [], categories: [], subcategories: [], slides: [], notifications: [], unread: 0, pagination: { has_more: false } };
    if (url.pathname === "/api/session") data = { user: { email: "local@example.com", name: "Local owner", role: "admin", is_owner: true }, needs_profile_completion: false };
    if (url.pathname.endsWith("/auth/login")) data = { token: "fixture-only-token", employee: profile };
    if (url.pathname === "/api/employee/session") data = { employee: profile };
    if (/\/admin\/employees$/.test(url.pathname)) {
      if (request.method() === "POST") {
        const body = request.postDataJSON();
        state.writes.push({ method: "POST", body });
        const { password: _password, ...publicFields } = body;
        const employee = { ...publicFields, id: "created", active: true, can_manage: false };
        state.people.push(employee);
        data = { employee };
      } else data = { employees: state.people, management: { positions: [{ id: "packing_staff", label: "Packing staff" }], permissions } };
    }
    if (/\/admin\/employees\/[^/]+$/.test(url.pathname) && request.method() === "PATCH") {
      const body = request.postDataJSON();
      state.writes.push({ method: "PATCH", body });
      if (state.failReset) { state.failReset = false; return route.fulfill({ status: 400, json: { error: "Local reset failure" } }); }
      const id = url.pathname.split("/").at(-1);
      data = { employee: state.people.find(person => person.id === id) };
    }
    await route.fulfill({ json: data });
  });
  return { context, page, state };
}

async function toggle(page, input, show, hide, value) {
  await expect(input).toHaveAttribute("type", "password");
  await input.fill(value);
  await page.getByRole("button", { name: show, exact: true }).click();
  await expect(input).toHaveAttribute("type", "text");
  await expect(input).toHaveValue(value);
  await expect(page.getByRole("button", { name: hide, exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: hide, exact: true }).click();
  await expect(input).toHaveAttribute("type", "password");
  await expect(input).toHaveValue(value);
}

try {
  for (const width of [1440, 320]) {
    const { context, page, state } = await fixtureContext(website, width);
    await page.goto(`${website}/admin/employees`);
    const createPassword = page.locator("#employee-create-password");
    await toggle(page, createPassword, "Show password", "Hide password", "Fixture-create-123");
    const first = page.getByLabel("New password for QA_ONE", { exact: true });
    const second = page.getByLabel("New password for QA_TWO", { exact: true });
    await toggle(page, first, "Show new password for QA_ONE", "Hide new password for QA_ONE", "Fixture-reset-123");
    await page.getByRole("button", { name: "Show new password for QA_ONE", exact: true }).click();
    await expect(second).toHaveAttribute("type", "password");
    await expect(page.getByLabel("New password for QA_PROTECTED")).toHaveCount(0);
    assert.equal(state.writes.length, 0, "Visibility toggles never submit or fetch a password");
    const firstRow = page.locator("article.employee-row").filter({ hasText: "QA_ONE" });
    state.failReset = true;
    await firstRow.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(page.getByText("Local reset failure", { exact: true })).toBeVisible();
    await expect(first).toHaveValue("Fixture-reset-123");
    await firstRow.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(first).toHaveValue("");
    await expect(first).toHaveAttribute("type", "password");
    await expect(firstRow.getByRole("button", { name: "Reset password", exact: true })).toBeDisabled();
    await page.locator('input[name="employee_code"]').fill("QA_NEW");
    await page.locator('input[name="name"]').fill("New local fixture");
    await page.getByRole("button", { name: "Show password", exact: true }).click();
    await page.getByRole("button", { name: "Create employee", exact: true }).click();
    await expect(createPassword).toHaveValue("");
    await expect(createPassword).toHaveAttribute("type", "password");
    assert.equal(state.writes.at(-1).body.password, "Fixture-create-123");
    assert.equal(state.writes[1].body.password, "Fixture-reset-123");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await createPassword.scrollIntoViewIfNeeded();
    await page.screenshot({ path: fileURLToPath(new URL(`website-${width}.png`, output)) });
    await context.close();
    console.log(`PASS website password visibility, save/reset, protected accounts, layout width=${width}`);
  }

  const { context, page, state } = await fixtureContext(app, 320);
  await page.goto(app);
  await page.getByLabel("Employee ID", { exact: true }).fill("QA_ADMIN");
  await page.getByLabel("Password", { exact: true }).fill("Fixture-login-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByTestId("employee-more-open").click();
  await page.getByTestId("employee-more-screen").getByTestId("employee-workspace-employees").click();
  const createPassword = page.getByLabel("Password (at least 8 characters)", { exact: true });
  await toggle(page, createPassword, "Show password (at least 8 characters)", "Hide password (at least 8 characters)", "Fixture-create-123");
  const firstCard = page.getByText("QA_ONE · First fixture", { exact: true }).locator("../..").locator("..");
  await firstCard.getByRole("button", { name: "Edit access", exact: true }).click();
  const first = page.getByLabel("New password for QA_ONE", { exact: true });
  await toggle(page, first, "Show new password for qa_one", "Hide new password for qa_one", "Fixture-reset-123");
  await page.getByRole("button", { name: "Show new password for qa_one", exact: true }).click();
  assert.equal(state.writes.length, 0);
  await page.getByRole("button", { name: "Close access", exact: true }).click();
  await firstCard.getByRole("button", { name: "Edit access", exact: true }).click();
  await expect(first).toHaveAttribute("type", "password");
  await expect(first).toHaveValue("Fixture-reset-123");
  state.failReset = true;
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
  await expect(page.getByText("Local reset failure", { exact: true })).toBeAttached();
  await expect(first).toHaveValue("Fixture-reset-123");
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
  await expect(first).toHaveValue("");
  await expect(first).toHaveAttribute("type", "password");
  await page.getByLabel("Employee ID", { exact: true }).fill("QA_NEW");
  await page.getByLabel("Name", { exact: true }).first().fill("New local fixture");
  await page.getByRole("button", { name: "Show password (at least 8 characters)", exact: true }).click();
  await page.getByText("Create employee", { exact: true }).last().click();
  await expect(createPassword).toHaveValue("");
  await expect(createPassword).toHaveAttribute("type", "password");
  assert.equal(state.writes.at(-1).body.password, "Fixture-create-123");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await createPassword.scrollIntoViewIfNeeded();
  await page.screenshot({ path: fileURLToPath(new URL("employee-320.png", output)) });
  await context.close();
  assert.deepEqual(errors, []);
  console.log("PASS employee app password visibility, save/reset, editor remasking, mobile layout; zero runtime errors");
} finally { await browser.close(); }
