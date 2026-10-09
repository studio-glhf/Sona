import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const canary = "sk-proj-SonaKeyVerificationUiFixtureNeverSentToOpenAI12345";
const verifyRoute = "**/api/settings/credentials/openai/verify";
type State = "unchecked" | "checking" | "verified" | "rejected" | "unavailable";
const status = (state: State, reason: string | null = null) => ({
  openai: {
    configured: true,
    source: "session",
    storage: "memory",
    verification: {
      state,
      reason,
      checkedAt: ["unchecked", "checking"].includes(state)
        ? null
        : "2026-10-09T07:00:00.000Z",
    },
  },
});
async function respond(
  route: Route,
  state: State,
  reason: string | null = null,
) {
  expect(route.request().method()).toBe("POST");
  expect(route.request().postData()).toBeNull();
  await route.fulfill({
    contentType: "application/json",
    json: status(state, reason),
  });
}
async function openSettings(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByText("No API key added", { exact: true }),
  ).toBeVisible();
  return page.locator(".settings-page");
}
async function saveKey(page: Page) {
  await page.getByLabel("OpenAI API key", { exact: true }).fill(canary);
  await page.getByRole("button", { name: "Save key", exact: true }).click();
}

// Only the credential save reaches the real local server. Verification replies
// are explicit transport fixtures. No test key or model call reaches OpenAI.
test.afterEach(async ({ page }) => {
  const bootstrap = await (await page.request.get("/api/bootstrap")).json();
  await page.request.delete("/api/settings/credentials/openai", {
    headers: { "X-Sona-Token": bootstrap.csrfToken },
  });
});

test("Save automatically checks once, shows progress, then shows verified access with its limits", async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route(verifyRoute, async (route) => {
    requests++;
    await held;
    await respond(route, "verified");
  });
  const settings = await openSettings(page);
  try {
    await saveKey(page);
    await expect(
      settings.getByText("Checking API key…", { exact: true }),
    ).toBeVisible();
    await expect(
      settings.getByRole("button", { name: "Checking…", exact: true }),
    ).toBeDisabled();
    await expect(
      settings.getByRole("button", { name: "Remove key", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByLabel("OpenAI API key", { exact: true }),
    ).toHaveValue("");
    release();
    await expect(
      settings.getByText("API key verified", { exact: true }),
    ).toBeVisible();
    await expect(
      settings.getByText(/Voice access and billing are checked separately/),
    ).toBeVisible();
    await expect(settings.locator(".credential-status .connected")).toHaveCount(
      1,
    );
    await expect(
      settings.getByRole("button", { name: "Check key", exact: true }),
    ).toBeEnabled();
    expect(requests).toBe(1);
    expect(await settings.innerText()).not.toContain(canary);
    const storage = await page.evaluate(() =>
      JSON.stringify({
        local: { ...localStorage },
        session: { ...sessionStorage },
      }),
    );
    expect(storage).not.toContain(canary);
    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await page.screenshot({
      path: "docs/verification/settings-key-verified-fixture-1440.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({
      path: "docs/verification/settings-key-verified-fixture-1280.png",
      fullPage: true,
    });
  } finally {
    release();
  }
});

test("an authentication rejection is visible and allows replacement", async ({
  page,
}) => {
  await page.route(verifyRoute, (route) =>
    respond(route, "rejected", "authentication"),
  );
  const settings = await openSettings(page);
  await saveKey(page);
  await expect(
    settings.getByText("API key rejected", { exact: true }),
  ).toBeVisible();
  await expect(settings.getByRole("alert")).toHaveText(
    "OpenAI rejected this key. Replace it with an active project API key.",
  );
  await expect(settings.locator(".credential-status .connected")).toHaveCount(
    0,
  );
  await expect(
    page.getByLabel("OpenAI API key", { exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: "docs/verification/settings-key-rejected-fixture-1440.png",
    fullPage: true,
  });
});

for (const [reason, guidance] of [
  [
    "permission",
    "This key cannot read the model list. Check its permissions; it may still have access to other APIs.",
  ],
  ["network", "Could not reach OpenAI. Check your connection and try again."],
  ["timeout", "OpenAI did not respond in time. Try again."],
  ["rate_limit", "OpenAI limited the check. Try again later."],
  ["service", "OpenAI could not complete the check. Try again later."],
  ["response", "OpenAI could not complete the check. Try again later."],
] as const) {
  test(`a ${reason} failure shows could-not-verify, never an invalid-key claim`, async ({
    page,
  }) => {
    await page.route(verifyRoute, (route) =>
      respond(route, "unavailable", reason),
    );
    const settings = await openSettings(page);
    await saveKey(page);
    await expect(
      settings.getByText("API key added · Could not verify", { exact: true }),
    ).toBeVisible();
    await expect(settings.getByText(guidance, { exact: true })).toBeVisible();
    await expect(
      settings.getByText("API key rejected", { exact: true }),
    ).toHaveCount(0);
    await expect(settings.locator(".credential-status .connected")).toHaveCount(
      0,
    );
    await expect(
      settings.getByRole("button", { name: "Check key", exact: true }),
    ).toBeEnabled();
  });
}

test("a local verification failure retains the saved key and never displays arbitrary error text", async ({
  page,
}) => {
  await page.route(verifyRoute, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      json: { error: `Private server diagnostic ${canary}` },
    }),
  );
  const settings = await openSettings(page);
  await saveKey(page);
  await expect(
    settings.getByText("API key added · Could not verify", { exact: true }),
  ).toBeVisible();
  await expect(settings.getByRole("alert")).toHaveText(
    "Could not complete the API key check. Try again.",
  );
  expect(await settings.innerText()).not.toContain(canary);
  const bootstrap = await (await page.request.get("/api/bootstrap")).json();
  expect(bootstrap.readiness.openaiConfigured).toBe(true);
  expect(bootstrap.readiness.modelsVerified).toEqual([]);
});

test("Check key retries without resending the secret or saving a replacement", async ({
  page,
}) => {
  let requests = 0;
  await page.route(verifyRoute, (route) =>
    respond(
      route,
      ++requests === 1 ? "unavailable" : "verified",
      requests === 1 ? "network" : null,
    ),
  );
  const settings = await openSettings(page);
  await saveKey(page);
  await expect(
    settings.getByText("API key added · Could not verify", { exact: true }),
  ).toBeVisible();
  await settings
    .getByRole("button", { name: "Check key", exact: true })
    .click();
  await expect(
    settings.getByText("API key verified", { exact: true }),
  ).toBeVisible();
  expect(requests).toBe(2);
  await expect(page.getByLabel("OpenAI API key", { exact: true })).toHaveValue(
    "",
  );
});

test("opening Settings during a running check polls to completion without another check", async ({
  page,
}) => {
  await page.route(verifyRoute, () => {
    throw new Error("A running check must not be started again.");
  });
  let reads = 0;
  await page.route("**/api/settings/credentials", (route) =>
    route.fulfill({
      contentType: "application/json",
      json: status(++reads < 3 ? "checking" : "verified"),
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.locator(".settings-page");
  await expect(
    settings.getByText("Checking API key…", { exact: true }),
  ).toBeVisible();
  await expect(
    settings.getByText("API key verified", { exact: true }),
  ).toBeVisible();
  expect(reads).toBeGreaterThanOrEqual(3);
});
